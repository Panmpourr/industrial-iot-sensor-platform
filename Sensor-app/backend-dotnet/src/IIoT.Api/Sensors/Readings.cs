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

    /// <summary>The main numeric value of a reading (weather readings carry it as <c>temp</c>).</summary>
    public static double? PrimaryValue(JsonObject reading) => NumberOf(reading["value"]) ?? NumberOf(reading["temp"]);

    public static double? NumberOf(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue(out double d) && double.IsFinite(d) ? d : null;
}
