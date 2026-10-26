using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

/// <summary>
/// One sensor over a report period. <c>Availability</c> is the share of hours with at least one
/// reading since the sensor was added (<c>null</c> if it did not exist yet); the warning and
/// critical times count the minutes (or hours, for old periods) whose worst reading had that status.
/// </summary>
public sealed record SensorStats(
    Guid SensorId, double? Min, double? Avg, double? Max, long Readings, double? Availability,
    long WarningSeconds, long CriticalSeconds);

/// <summary>Per-sensor statistics for reports, read from the 1-minute or 1-hour aggregates.</summary>
public sealed class ReportRepository(NpgsqlDataSource dataSource)
{
    /// <summary>Longest period one report can cover.</summary>
    public static readonly TimeSpan MaxSpan = TimeSpan.FromDays(366);

    /// <summary>1-minute aggregates are dropped after a year (see <c>002-history.sql</c>); older periods are read hourly.</summary>
    private static readonly TimeSpan MinuteRetention = TimeSpan.FromDays(364);

    public static HistorySource SourceFor(DateTimeOffset from, DateTimeOffset now) =>
        from >= now - MinuteRetention ? HistorySource.Minute : HistorySource.Hour;

    private sealed class StatsRow
    {
        public Guid SensorId { get; init; }
        public DateTime CreatedAt { get; init; }
        public double? Min { get; init; }
        public double? Avg { get; init; }
        public double? Max { get; init; }
        public long Readings { get; init; }
        public long HoursWithData { get; init; }
        public long WarningBuckets { get; init; }
        public long CriticalBuckets { get; init; }
    }

    /// <summary>Every sensor of the site, including those without data in [from, to).</summary>
    public async Task<IReadOnlyList<SensorStats>> GetSensorStatsAsync(
        Guid siteId, DateTimeOffset from, DateTimeOffset to, HistorySource source, DateTimeOffset now)
    {
        // Table name from the enum, never from the request
        var table = source == HistorySource.Minute ? "sensor_data_1m" : "sensor_data_1h";
        var bucketSeconds = source == HistorySource.Minute ? 60 : 3600;

        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<StatsRow>($"""
            WITH stats AS (
              SELECT sensor_id,
                     min(min_value) AS min, max(max_value) AS max,
                     (sum(sum_value) / NULLIF(sum(count_value), 0))::double precision AS avg,
                     sum(count_value)::bigint AS readings,
                     count(DISTINCT time_bucket(INTERVAL '1 hour', bucket))::bigint AS hours_with_data,
                     count(*) FILTER (WHERE worst_status = 1)::bigint AS warning_buckets,
                     count(*) FILTER (WHERE worst_status = 2)::bigint AS critical_buckets
              FROM {table}
              WHERE bucket >= @from AND bucket < @to
                AND sensor_id IN (SELECT id FROM sensors WHERE site_id = @siteId)
              GROUP BY sensor_id
            )
            SELECT s.id AS SensorId, s.created_at AS CreatedAt, st.min AS Min, st.avg AS Avg, st.max AS Max,
                   COALESCE(st.readings, 0) AS Readings, COALESCE(st.hours_with_data, 0) AS HoursWithData,
                   COALESCE(st.warning_buckets, 0) AS WarningBuckets, COALESCE(st.critical_buckets, 0) AS CriticalBuckets
            FROM sensors s
            LEFT JOIN stats st ON st.sensor_id = s.id
            WHERE s.site_id = @siteId
            """, new { siteId, from = from.UtcDateTime, to = to.UtcDateTime });

        return rows.Select(r => new SensorStats(
            r.SensorId, r.Min, r.Avg, r.Max, r.Readings,
            Availability(r.HoursWithData, new DateTimeOffset(DateTime.SpecifyKind(r.CreatedAt, DateTimeKind.Utc)), from, to, now),
            r.WarningBuckets * bucketSeconds, r.CriticalBuckets * bucketSeconds)).ToList();
    }

    /// <summary>
    /// Hours with data out of the hours the sensor could have reported in: from the hour it was
    /// added (or the period start) to the period end (or now, for a period still running).
    /// </summary>
    public static double? Availability(long hoursWithData, DateTimeOffset createdAt, DateTimeOffset from, DateTimeOffset to, DateTimeOffset now)
    {
        var start = createdAt > from ? createdAt : from;
        start = new DateTimeOffset(start.UtcTicks - start.UtcTicks % TimeSpan.TicksPerHour, TimeSpan.Zero);
        var end = to < now ? to : now;
        if (end <= start)
        {
            return null;
        }
        var expected = Math.Ceiling((end - start).TotalHours);
        return Math.Min(1, hoursWithData / expected);
    }
}
