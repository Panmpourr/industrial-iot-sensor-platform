using System.Net;
using System.Text.Json;

namespace IIoT.IntegrationTests;

/// <summary>Report figures computed by the database from real readings.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ReportTests(ApiFixture api)
{
    private static string Query(DateTimeOffset from, DateTimeOffset to) =>
        $"/sensor-stats?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}";

    private static JsonElement StatsOf(JsonElement report, string sensorId) =>
        report.GetProperty("sensors").EnumerateArray().Single(s => s.GetProperty("sensorId").GetString() == sensorId);

    [Fact]
    public async Task Stats_summarize_the_readings_of_the_period()
    {
        var (_, op, eng) = await api.SiteWithTeamAsync("report");
        var oven = await ApiFixture.AddSensorAsync(eng, "Oven temperature");
        var idle = await ApiFixture.AddSensorAsync(eng, "Spare probe");

        // A six-hour period that has already ended, with the sensors existing for all of it
        var now = DateTimeOffset.UtcNow;
        var from = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero).AddHours(-7);
        var to = from.AddHours(6);
        await api.ExecuteOwnerAsync("UPDATE sensors SET created_at = @created WHERE id = ANY(@ids)",
            new { created = from.AddDays(-1).UtcDateTime, ids = new[] { Guid.Parse(oven), Guid.Parse(idle) } });
        // Readings in two different hours: one normal, one warning minute, one critical minute,
        // and one just after the period that must not count
        await api.ExecuteOwnerAsync("""
            INSERT INTO sensor_data (sensor_id, time, value, status) VALUES
              (@id, @t1, 10, 'normal'), (@id, @t2, 80, 'warning'), (@id, @t3, 95, 'critical'), (@id, @after, 500, 'critical')
            """, new
        {
            id = Guid.Parse(oven),
            t1 = from.AddMinutes(30).UtcDateTime,
            t2 = from.AddMinutes(90).UtcDateTime,
            t3 = from.AddMinutes(91).UtcDateTime,
            after = to.AddMinutes(1).UtcDateTime,
        });

        // Every role can read reports
        var report = await op.GetJsonAsync(Query(from, to));
        Assert.Equal("minute", report.GetProperty("source").GetString());

        var stats = StatsOf(report, oven);
        Assert.Equal(10, stats.GetProperty("min").GetDouble());
        Assert.Equal(95, stats.GetProperty("max").GetDouble());
        Assert.Equal(185 / 3.0, stats.GetProperty("avg").GetDouble(), 6);
        Assert.Equal(3, stats.GetProperty("readings").GetInt64());
        Assert.Equal(2 / 6.0, stats.GetProperty("availability").GetDouble(), 6);
        Assert.Equal(60, stats.GetProperty("warningSeconds").GetInt64());
        Assert.Equal(60, stats.GetProperty("criticalSeconds").GetInt64());

        // A sensor without readings is still listed, as fully unavailable
        var empty = StatsOf(report, idle);
        Assert.Equal(0, empty.GetProperty("readings").GetInt64());
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("min").ValueKind);
        Assert.Equal(0, empty.GetProperty("availability").GetDouble());
    }

    [Fact]
    public async Task Another_site_does_not_see_the_stats()
    {
        var (_, _, eng) = await api.SiteWithTeamAsync("report-a");
        var sensor = await ApiFixture.AddSensorAsync(eng, "Private sensor");
        var stranger = await api.RegisterAsync("report-stranger");

        var report = await stranger.GetJsonAsync("/sensor-stats");

        Assert.DoesNotContain(report.GetProperty("sensors").EnumerateArray(), s => s.GetProperty("sensorId").GetString() == sensor);
    }

    [Fact]
    public async Task Refuses_reversed_or_too_long_periods()
    {
        var user = await api.RegisterAsync("report-range");
        var now = DateTimeOffset.UtcNow;

        Assert.Equal(HttpStatusCode.BadRequest, (await user.Http.GetAsync(Query(now, now.AddHours(-1)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.Http.GetAsync(Query(now.AddDays(-400), now))).StatusCode);
    }
}
