using System.Globalization;
using System.Text.Json;

namespace IIoT.Api.Sensors;

/// <summary>
/// Typed access to a sensor's <c>details</c> JSON. The frontend sends some numbers as strings
/// (e.g. <c>"port": "502"</c>), so numeric getters accept both.
/// </summary>
public sealed class SensorDetails(JsonElement details)
{
    public JsonElement Raw => details;

    public string? GetString(string name) =>
        TryGet(name, out var e) && e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString())
            ? e.GetString()!.Trim()
            : null;

    public string RequireString(string name) =>
        GetString(name) ?? throw new InvalidOperationException($"Missing required setting '{name}'");

    public double? GetDouble(string name) =>
        TryGet(name, out var e) ? ToDouble(e) : null;

    public int? GetInt(string name) =>
        GetDouble(name) is { } d ? (int)d : null;

    public JsonElement? GetObject(string name) =>
        TryGet(name, out var e) && e.ValueKind == JsonValueKind.Object ? e : null;

    public static double? ToDouble(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Number => e.GetDouble(),
        JsonValueKind.String when double.TryParse(e.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    private bool TryGet(string name, out JsonElement value)
    {
        value = default;
        return details.ValueKind == JsonValueKind.Object && details.TryGetProperty(name, out value);
    }
}
