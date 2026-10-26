using IIoT.Api.Data;

namespace IIoT.Tests;

public class ReportTests
{
    private static readonly DateTimeOffset Day = new(2026, 10, 20, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset LongAgo = Day.AddYears(-1);

    [Fact]
    public void Availability_is_hours_with_data_out_of_the_whole_period() =>
        Assert.Equal(0.75, ReportRepository.Availability(18, LongAgo, Day, Day.AddDays(1), Day.AddDays(3)));

    [Fact]
    public void A_sensor_added_during_the_period_is_counted_from_the_hour_it_was_added() =>
        // Added at 18:30: 18:00 – 24:00 is 6 hours
        Assert.Equal(0.5, ReportRepository.Availability(3, Day.AddHours(18.5), Day, Day.AddDays(1), Day.AddDays(3)));

    [Fact]
    public void A_period_still_running_is_counted_until_now() =>
        // Today at 10:20: 11 hours have started so far
        Assert.Equal(1, ReportRepository.Availability(11, LongAgo, Day, Day.AddDays(1), Day.AddHours(10).AddMinutes(20)));

    [Fact]
    public void There_is_no_availability_before_the_sensor_existed()
    {
        Assert.Null(ReportRepository.Availability(0, Day.AddDays(2), Day, Day.AddDays(1), Day.AddDays(3)));
        Assert.Null(ReportRepository.Availability(0, LongAgo, Day, Day.AddDays(1), Day.AddHours(-1)));
    }

    [Fact]
    public void Old_periods_are_read_from_the_hourly_aggregates()
    {
        Assert.Equal(HistorySource.Minute, ReportRepository.SourceFor(Day.AddDays(-30), Day));
        Assert.Equal(HistorySource.Hour, ReportRepository.SourceFor(Day.AddDays(-365), Day));
    }
}
