using System.Text.Json.Nodes;

namespace IIoT.Api.Sensors;

/// <summary>Builds reading objects in the shape the dashboard expects.</summary>
public static class Readings
{
    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary><c>{ value, timestamp, status? }</c></summary>
    public static JsonObject Numeric(double value, SensorDetails details, long? timestamp = null)
    {
        var reading = new JsonObject
        {
            ["value"] = value,
            ["timestamp"] = timestamp ?? Now(),
        };

        if (ThresholdEvaluator.Evaluate(value, details.GetObject("threshold")) is { } status)
        {
            reading["status"] = status;
        }

        return reading;
    }
}
