using System.Text.Json;
using IIoT.Api.Alarms;

namespace IIoT.Api.Sensors;

/// <summary>
/// Classifies a reading using the sensor's <c>threshold</c> settings: above <c>critical</c> or
/// below <c>lowCritical</c> → critical, above <c>warning</c> or below <c>lowWarning</c> → warning,
/// otherwise normal. The low limits are optional.
/// </summary>
public static class ThresholdEvaluator
{
    public const string Normal = "normal";
    public const string Warning = "warning";
    public const string Critical = "critical";

    /// <returns>The status, or <c>null</c> when no usable threshold is configured.</returns>
    public static string? Evaluate(double value, JsonElement? threshold)
    {
        if (AlarmLimits.From(threshold) is not { } limits)
        {
            return null;
        }

        var exceeded = limits.All().Where(l => l.Exceeded(value)).ToList();
        if (exceeded.Any(l => l.Priority == Critical)) return Critical;
        if (exceeded.Count > 0) return Warning;
        return Normal;
    }
}
