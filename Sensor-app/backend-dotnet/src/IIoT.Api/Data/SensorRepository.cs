using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using IIoT.Api.Sensors;
using Npgsql;

namespace IIoT.Api.Data;

/// <param name="CreatedBy">User who added the sensor; <c>null</c> once that user has been removed.</param>
/// <param name="AssetId">Area or equipment the sensor belongs to, if any.</param>
public sealed record SensorRecord(Guid Id, Guid SiteId, string? CreatedBy, string Name, string Type, JsonElement Details, Guid? AssetId);

/// <summary>
/// Sensor configurations and their time-series readings (TimescaleDB hypertable <c>sensor_data</c>).
/// </summary>
public sealed class SensorRepository(NpgsqlDataSource dataSource)
{
    private sealed class SensorRow
    {
        public Guid Id { get; init; }
        public Guid SiteId { get; init; }
        public string? CreatedBy { get; init; }
        public string Name { get; init; } = "";
        public string Type { get; init; } = "";
        public string DetailsJson { get; init; } = "{}";
        public Guid? AssetId { get; init; }

        public SensorRecord ToRecord() =>
            new(Id, SiteId, CreatedBy, Name, Type, JsonDocument.Parse(DetailsJson).RootElement.Clone(), AssetId);
    }

    private const string SelectSensor =
        "SELECT id, site_id AS SiteId, user_id AS CreatedBy, name, type, details::text AS DetailsJson, asset_id AS AssetId FROM sensors";

    public async Task<Guid> CreateAsync(Guid siteId, string createdBy, string name, string type, JsonElement details, Guid? assetId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<Guid>(
            "INSERT INTO sensors (site_id, user_id, name, type, details, asset_id) " +
            "VALUES (@siteId, @createdBy, @name, @type, CAST(@details AS jsonb), @assetId) RETURNING id",
            new { siteId, createdBy, name, type, details = details.ValueKind == JsonValueKind.Object ? details.GetRawText() : "{}", assetId });
    }

    public async Task<IReadOnlyList<SensorRecord>> GetBySiteAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<SensorRow>($"{SelectSensor} WHERE site_id = @siteId ORDER BY created_at", new { siteId });
        return rows.Select(r => r.ToRecord()).ToList();
    }

    public async Task<IReadOnlyList<SensorRecord>> GetAllAsync()
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<SensorRow>($"{SelectSensor} ORDER BY created_at");
        return rows.Select(r => r.ToRecord()).ToList();
    }

    public async Task<SensorRecord?> GetAsync(Guid siteId, Guid sensorId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var row = await conn.QuerySingleOrDefaultAsync<SensorRow>(
            $"{SelectSensor} WHERE id = @sensorId AND site_id = @siteId", new { sensorId, siteId });
        return row?.ToRecord();
    }

    /// <summary>Changes name, settings and asset; the sensor type cannot change.</summary>
    public async Task<bool> UpdateAsync(Guid siteId, Guid sensorId, string name, JsonElement details, Guid? assetId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "UPDATE sensors SET name = @name, details = CAST(@details AS jsonb), asset_id = @assetId WHERE id = @sensorId AND site_id = @siteId",
            new { sensorId, siteId, name, details = details.ValueKind == JsonValueKind.Object ? details.GetRawText() : "{}", assetId });
        return affected > 0;
    }

    public async Task<bool> InSiteAsync(Guid siteId, Guid sensorId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>(
            "SELECT EXISTS (SELECT 1 FROM sensors WHERE id = @sensorId AND site_id = @siteId)",
            new { sensorId, siteId });
    }

    /// <summary>Readings are removed automatically via ON DELETE CASCADE.</summary>
    public async Task<bool> DeleteAsync(Guid siteId, Guid sensorId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "DELETE FROM sensors WHERE id = @sensorId AND site_id = @siteId", new { sensorId, siteId });
        return affected > 0;
    }

    /// <summary>
    /// Stores one reading. The full object is kept as <c>payload</c>; numeric <c>value</c> and
    /// <c>status</c> are also extracted into their own columns for fast queries.
    /// </summary>
    public async Task InsertReadingAsync(Guid sensorId, JsonObject reading)
    {
        var timestamp = reading["timestamp"] is JsonValue t && t.TryGetValue(out long ms)
            ? ms
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        reading["timestamp"] = timestamp;

        // Weather readings carry their main value as "temp" / "tempStatus"
        double? value = Readings.PrimaryValue(reading);
        string? status = TextOf(reading["status"]) ?? TextOf(reading["tempStatus"]);

        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            "INSERT INTO sensor_data (sensor_id, time, value, status, payload) " +
            "VALUES (@sensorId, to_timestamp(@timestamp / 1000.0), @value, @status, CAST(@payload AS jsonb))",
            new { sensorId, timestamp, value, status, payload = reading.ToJsonString() });
    }

    /// <summary>
    /// Returns the latest <paramref name="limit"/> readings as raw JSON, oldest first.
    /// <c>null</c> returns the full history.
    /// </summary>
    public async Task<IReadOnlyList<string>> GetReadingsJsonAsync(Guid siteId, Guid sensorId, int? limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<string>(
            """
            SELECT payload::text FROM (
                SELECT d.payload, d.time
                FROM sensor_data d
                JOIN sensors s ON s.id = d.sensor_id
                WHERE d.sensor_id = @sensorId AND s.site_id = @siteId
                ORDER BY d.time DESC
                LIMIT @limit
            ) latest
            ORDER BY time ASC
            """,
            new { sensorId, siteId, limit });
        return rows.ToList();
    }

    private sealed class HistoryRow
    {
        public DateTime Time { get; init; }
        public double Min { get; init; }
        public double Max { get; init; }
        public double Avg { get; init; }
        public long Count { get; init; }
        public int WorstStatus { get; init; }
    }

    /// <summary>
    /// Min / average / max per time bucket between <paramref name="from"/> and <paramref name="to"/>,
    /// read from the raw table or a continuous aggregate as chosen by <see cref="HistoryResolution"/>.
    /// Ownership must be checked by the caller.
    /// </summary>
    public async Task<IReadOnlyList<HistoryPoint>> GetHistoryAsync(Guid sensorId, DateTimeOffset from, DateTimeOffset to, HistoryPlan plan)
    {
        // Table names come from the enum, never from the request
        var sql = plan.Source == HistorySource.Raw
            ? """
              SELECT time_bucket(@bucket, time) AS Time,
                     min(value) AS Min, max(value) AS Max, avg(value) AS Avg,
                     count(value) AS Count, max(status_rank(status))::int AS WorstStatus
              FROM sensor_data
              WHERE sensor_id = @sensorId AND value IS NOT NULL
                AND time >= time_bucket(@bucket, @from) AND time < @to
              GROUP BY 1 ORDER BY 1
              """
            : $"""
              SELECT time_bucket(@bucket, bucket) AS Time,
                     min(min_value) AS Min, max(max_value) AS Max,
                     (sum(sum_value) / sum(count_value))::double precision AS Avg,
                     sum(count_value)::bigint AS Count, max(worst_status)::int AS WorstStatus
              FROM {(plan.Source == HistorySource.Hour ? "sensor_data_1h" : "sensor_data_1m")}
              WHERE sensor_id = @sensorId
                AND bucket >= time_bucket(@bucket, @from) AND bucket < @to
              GROUP BY 1 ORDER BY 1
              """;

        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<HistoryRow>(sql, new
        {
            sensorId,
            bucket = plan.Bucket,
            from = from.UtcDateTime,
            to = to.UtcDateTime,
        });
        return rows.Select(r => new HistoryPoint(
            new DateTimeOffset(DateTime.SpecifyKind(r.Time, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
            r.Min, r.Avg, r.Max, r.Count, HistoryPoint.StatusName(r.WorstStatus))).ToList();
    }

    private static string? TextOf(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue(out string? text) ? text : null;
}

/// <summary>One time bucket of history. <c>T</c> is the bucket start in Unix milliseconds.</summary>
public sealed record HistoryPoint(long T, double Min, double Avg, double Max, long Count, string Status)
{
    /// <summary>Inverse of the <c>status_rank()</c> SQL function.</summary>
    public static string StatusName(int rank) => rank switch
    {
        2 => "critical",
        1 => "warning",
        _ => "normal",
    };
}
