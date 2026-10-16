using System.Text.Json;

namespace IIoT.Api.Sensors;

/// <summary>
/// Classifies a reading using the sensor's <c>threshold</c> settings:
/// value &lt;= warning → normal, value &lt;= critical → warning, otherwise critical.
/// </summary>
public static class ThresholdEvaluator
{
    public const string Normal = "normal";
    public const string Warning = "warning";
    public const string Critical = "critical";

    /// <returns>The status, or <c>null</c> when no usable threshold is configured.</returns>
    public static string? Evaluate(double value, JsonElement? threshold)
    {
        if (threshold is not { ValueKind: JsonValueKind.Object } t)
        {
            return null;
        }

        var warning = t.TryGetProperty("warning", out var w) ? SensorDetails.ToDouble(w) : null;
        var critical = t.TryGetProperty("critical", out var c) ? SensorDetails.ToDouble(c) : null;
        if (warning is null || critical is null)
        {
            return null;
        }

        if (value <= warning) return Normal;
        if (value <= critical) return Warning;
        return Critical;
    }
}
