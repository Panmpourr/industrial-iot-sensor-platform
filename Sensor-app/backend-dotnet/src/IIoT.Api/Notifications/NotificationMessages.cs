using System.Globalization;
using IIoT.Api.Alarms;
using IIoT.Api.Data;
using IIoT.Api.Sensors;

namespace IIoT.Api.Notifications;

/// <summary>Texts of the Telegram messages (Telegram's HTML subset; every name from the database is escaped).</summary>
public static class NotificationMessages
{
    private const string AckPrefix = "ack:";

    private static readonly Dictionary<string, string> ConditionLabels = new()
    {
        [AlarmConditions.HiHi] = "High-high",
        [AlarmConditions.Hi] = "High",
        [AlarmConditions.Lo] = "Low",
        [AlarmConditions.LoLo] = "Low-low",
        [AlarmConditions.Comm] = "Communication lost",
    };

    /// <summary>Escapes text for Telegram's HTML (only these three characters are special there).</summary>
    public static string Html(string text) => text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    private static string Number(double value, string? unit) =>
        value.ToString("0.##", CultureInfo.InvariantCulture) + (string.IsNullOrEmpty(unit) ? "" : $" {unit}");

    /// <summary>
    /// "🔴 CRITICAL · High-high", the sensor and where it is, the value against its limit, and for
    /// an escalation how long the alarm has gone unacknowledged.
    /// </summary>
    public static string Alarm(AlarmContext alarm, string? location, int delayMinutes)
    {
        var critical = alarm.Priority == ThresholdEvaluator.Critical;
        var lines = new List<string>
        {
            $"{(critical ? "🔴" : "🟠")} <b>{(critical ? "CRITICAL" : "WARNING")}</b> · {Html(ConditionLabels.GetValueOrDefault(alarm.Condition, alarm.Condition))}",
            $"<b>{Html(alarm.SensorName)}</b>",
        };
        if (!string.IsNullOrEmpty(location))
        {
            lines.Add(Html(location));
        }

        if (alarm.Condition == AlarmConditions.Comm || alarm.Value is null)
        {
            lines.Add("No data received");
        }
        else
        {
            var high = alarm.Condition is AlarmConditions.Hi or AlarmConditions.HiHi;
            var limit = alarm.LimitValue is { } l ? $" ({(high ? "above" : "below")} {Html(Number(l, alarm.Unit))})" : "";
            lines.Add($"Value {Html(Number(alarm.Value.Value, alarm.Unit))}{limit}");
        }

        if (delayMinutes > 0)
        {
            lines.Add("");
            lines.Add($"⏰ Not acknowledged for {delayMinutes} min");
        }
        return string.Join('\n', lines);
    }

    /// <summary>The sent message once someone acknowledged the alarm (its buttons are removed with the edit).</summary>
    public static string Acknowledged(string original, string ackedBy) =>
        $"{original}\n\n✅ Acknowledged by <b>{Html(ackedBy)}</b>";

    /// <summary>"Acknowledge", plus "Open" when the platform's public address is configured.</summary>
    public static IReadOnlyList<TelegramButton> Buttons(Guid alarmId, Guid sensorId, string? appUrl)
    {
        var buttons = new List<TelegramButton> { new("✅ Acknowledge", CallbackData: AckPrefix + alarmId) };
        if (appUrl is not null)
        {
            buttons.Add(new TelegramButton("Open", Url: $"{appUrl}/sensors/{sensorId}"));
        }
        return buttons;
    }

    public static Guid? ParseAck(string? callbackData) =>
        callbackData is not null && callbackData.StartsWith(AckPrefix, StringComparison.Ordinal)
        && Guid.TryParse(callbackData[AckPrefix.Length..], out var id) ? id : null;

    /// <summary>"Hall A / Line 1 / Oven" from the site's assets.</summary>
    public static string? Location(IReadOnlyList<AssetRecord> assets, Guid? assetId)
    {
        var byId = assets.ToDictionary(a => a.Id);
        var names = new List<string>();
        for (var id = assetId; id is { } current && byId.TryGetValue(current, out var asset) && names.Count < 32; id = asset.ParentId)
        {
            names.Insert(0, asset.Name);
        }
        return names.Count > 0 ? string.Join(" / ", names) : null;
    }
}
