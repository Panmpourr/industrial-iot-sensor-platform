namespace IIoT.Api.Data;

/// <summary>Where history points are read from (see <c>sql/history.sql</c>).</summary>
public enum HistorySource
{
    /// <summary><c>sensor_data</c>, the raw readings.</summary>
    Raw,
    /// <summary><c>sensor_data_1m</c>, 1-minute aggregates.</summary>
    Minute,
    /// <summary><c>sensor_data_1h</c>, 1-hour aggregates.</summary>
    Hour,
}

public sealed record HistoryPlan(TimeSpan Bucket, HistorySource Source);

/// <summary>
/// Picks the bucket size for a time range so a chart always gets a few hundred points,
/// whether the range is 15 minutes or a year, and the coarsest table that can serve it.
/// </summary>
public static class HistoryResolution
{
    public const int TargetPoints = 500;

    /// <summary>Longest range that can be requested at once.</summary>
    public static readonly TimeSpan MaxSpan = TimeSpan.FromDays(5 * 366);

    private static readonly TimeSpan[] Buckets =
    [
        TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(30),
        TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(15), TimeSpan.FromMinutes(30),
        TimeSpan.FromHours(1), TimeSpan.FromHours(2), TimeSpan.FromHours(3),
        TimeSpan.FromHours(6), TimeSpan.FromHours(12),
        TimeSpan.FromDays(1), TimeSpan.FromDays(7),
    ];

    public static HistoryPlan Choose(TimeSpan span)
    {
        var ideal = span / TargetPoints;
        var bucket = Buckets.FirstOrDefault(b => b >= ideal, Buckets[^1]);

        // Every bucket size is a whole multiple of the aggregate it is built from
        var source = bucket >= TimeSpan.FromHours(1) ? HistorySource.Hour
            : bucket >= TimeSpan.FromMinutes(1) ? HistorySource.Minute
            : HistorySource.Raw;
        return new HistoryPlan(bucket, source);
    }
}
