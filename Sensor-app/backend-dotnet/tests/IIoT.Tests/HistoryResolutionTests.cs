using IIoT.Api.Data;

namespace IIoT.Tests;

public class HistoryResolutionTests
{
    [Theory]
    [InlineData(15 * 60, 2, HistorySource.Raw)]                 // 15 min → 2 s
    [InlineData(60 * 60, 10, HistorySource.Raw)]                // 1 h → 10 s
    [InlineData(24 * 3600, 5 * 60, HistorySource.Minute)]       // 24 h → 5 min
    [InlineData(7 * 86400, 30 * 60, HistorySource.Minute)]      // 7 d → 30 min
    [InlineData(30 * 86400, 2 * 3600, HistorySource.Hour)]      // 30 d → 2 h
    [InlineData(365 * 86400, 86400, HistorySource.Hour)]        // 1 y → 1 d
    public void Picks_bucket_and_source_for_common_ranges(int spanSeconds, int bucketSeconds, HistorySource source)
    {
        var plan = HistoryResolution.Choose(TimeSpan.FromSeconds(spanSeconds));

        Assert.Equal(TimeSpan.FromSeconds(bucketSeconds), plan.Bucket);
        Assert.Equal(source, plan.Source);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(3600)]
    [InlineData(86400)]
    [InlineData(90 * 86400)]
    [InlineData(366 * 86400)]
    public void Keeps_charts_at_most_target_points(int spanSeconds)
    {
        var span = TimeSpan.FromSeconds(spanSeconds);

        var plan = HistoryResolution.Choose(span);

        Assert.True(span / plan.Bucket <= HistoryResolution.TargetPoints);
    }

    [Fact]
    public void Aggregate_buckets_are_whole_multiples_of_their_source()
    {
        for (var hours = 1; hours <= 5 * 366 * 24; hours *= 2)
        {
            var plan = HistoryResolution.Choose(TimeSpan.FromHours(hours));
            var unit = plan.Source switch
            {
                HistorySource.Hour => TimeSpan.FromHours(1),
                HistorySource.Minute => TimeSpan.FromMinutes(1),
                _ => TimeSpan.FromSeconds(1),
            };

            Assert.Equal(0, plan.Bucket.Ticks % unit.Ticks);
        }
    }

    [Theory]
    [InlineData(0, "normal")]
    [InlineData(1, "warning")]
    [InlineData(2, "critical")]
    public void Maps_status_rank_back_to_name(int rank, string name) =>
        Assert.Equal(name, HistoryPoint.StatusName(rank));
}
