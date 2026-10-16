using System.Text.Json;
using IIoT.Api.Sensors;

namespace IIoT.Tests;

public class ReadingsTests
{
    private static SensorDetails Details(string json) => new(JsonDocument.Parse(json).RootElement);

    [Fact]
    public void Numeric_reading_has_the_shape_the_dashboard_expects()
    {
        var reading = Readings.Numeric(85, Details("""{ "threshold": { "warning": 70, "critical": 90 } }"""), timestamp: 1000);

        Assert.Equal("""{"value":85,"timestamp":1000,"status":"warning"}""", reading.ToJsonString());
    }

    [Fact]
    public void Numeric_reading_without_threshold_has_no_status()
    {
        var reading = Readings.Numeric(5, Details("{}"), timestamp: 1000);

        Assert.Equal("""{"value":5,"timestamp":1000}""", reading.ToJsonString());
    }

    [Fact]
    public void Details_read_numbers_sent_as_strings()
    {
        var details = Details("""{ "port": "502", "registerAddress": 3, "ipAddress": " 10.0.0.5 " }""");

        Assert.Equal(502, details.GetInt("port"));
        Assert.Equal(3, details.GetInt("registerAddress"));
        Assert.Equal("10.0.0.5", details.GetString("ipAddress"));
        Assert.Throws<InvalidOperationException>(() => details.RequireString("missing"));
    }
}
