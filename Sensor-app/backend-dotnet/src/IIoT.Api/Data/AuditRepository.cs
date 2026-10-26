using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

/// <summary>Audit actions, named <c>target.verb</c>.</summary>
public static class AuditActions
{
    public const string Login = "user.login";
    public const string PasswordChange = "user.password";
    public const string PasswordReset = "user.password-reset";
    public const string UserCreate = "user.create";
    public const string UserRole = "user.role";
    public const string UserDelete = "user.delete";
    public const string SiteRename = "site.rename";
    public const string SensorCreate = "sensor.create";
    public const string SensorUpdate = "sensor.update";
    public const string SensorDelete = "sensor.delete";
    public const string AssetCreate = "asset.create";
    public const string AssetUpdate = "asset.update";
    public const string AssetDelete = "asset.delete";
    public const string AlarmAcknowledge = "alarm.acknowledge";
    public const string TelegramConnect = "user.telegram-connect";
    public const string TelegramDisconnect = "user.telegram-disconnect";
    public const string NotificationRuleCreate = "notification-rule.create";
    public const string NotificationRuleUpdate = "notification-rule.update";
    public const string NotificationRuleDelete = "notification-rule.delete";
    public const string MaintenanceTaskCreate = "maintenance-task.create";
    public const string MaintenanceTaskUpdate = "maintenance-task.update";
    public const string MaintenanceTaskDelete = "maintenance-task.delete";
    public const string MaintenanceLogDelete = "maintenance-log.delete";
}

public sealed record AuditEntry(
    string Action, string TargetType, string? TargetId, string? TargetName, JsonObject? Details = null);

public sealed record AuditView(
    Guid Id, long Time, string UserId, string Action, string TargetType, string? TargetId, string? TargetName, JsonNode? Details);

/// <summary>The audit trail (table <c>audit_log</c>): who changed what, and when.</summary>
public sealed class AuditRepository(NpgsqlDataSource dataSource)
{
    private sealed class Row
    {
        public Guid Id { get; init; }
        public DateTime Time { get; init; }
        public string UserId { get; init; } = "";
        public string Action { get; init; } = "";
        public string TargetType { get; init; } = "";
        public string? TargetId { get; init; }
        public string? TargetName { get; init; }
        public string? Details { get; init; }

        public AuditView ToView() => new(
            Id, new DateTimeOffset(DateTime.SpecifyKind(Time, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
            UserId, Action, TargetType, TargetId, TargetName, Details is null ? null : JsonNode.Parse(Details));
    }

    public Task LogAsync(Guid siteId, string userId, AuditEntry entry) => LogAsync(siteId, userId, [entry]);

    public async Task LogAsync(Guid siteId, string userId, IReadOnlyCollection<AuditEntry> entries)
    {
        if (entries.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            INSERT INTO audit_log (site_id, user_id, action, target_type, target_id, target_name, details)
            VALUES (@siteId, @userId, @Action, @TargetType, @TargetId, @TargetName, CAST(@Details AS jsonb))
            """,
            entries.Select(e => new
            {
                siteId, userId, e.Action, e.TargetType, e.TargetId, e.TargetName,
                Details = e.Details?.ToJsonString(),
            }));
    }

    /// <summary>Entries in [from, to), newest first.</summary>
    public async Task<IReadOnlyList<AuditView>> GetAsync(Guid siteId, DateTimeOffset from, DateTimeOffset to, int limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<Row>(
            """
            SELECT id, time, user_id AS UserId, action, target_type AS TargetType, target_id AS TargetId,
                   target_name AS TargetName, details::text AS Details
            FROM audit_log
            WHERE site_id = @siteId AND time >= @from AND time < @to
            ORDER BY time DESC
            LIMIT @limit
            """, new { siteId, from = from.UtcDateTime, to = to.UtcDateTime, limit });
        return rows.Select(r => r.ToView()).ToList();
    }
}

/// <summary>Builds the <c>changes</c> list of an audit entry from two versions of a sensor's settings.</summary>
public static class AuditDiff
{
    /// <summary>Values of these settings are never written to the audit trail.</summary>
    private static readonly string[] SecretNames = ["apiKey", "password"];

    /// <returns>
    /// <c>[{ field, from, to }]</c> for every changed value. Nested objects (like <c>threshold</c>)
    /// are compared field by field, e.g. <c>threshold.critical</c>; secrets are shown as "changed".
    /// </returns>
    public static JsonArray Changes(JsonElement before, JsonElement after)
    {
        var changes = new JsonArray();
        Compare("", before, after, changes);
        return changes;
    }

    public static JsonObject Change(string field, string? from, string? to) =>
        new() { ["field"] = field, ["from"] = from, ["to"] = to };

    private static void Compare(string prefix, JsonElement before, JsonElement after, JsonArray changes)
    {
        var names = Properties(before).Concat(Properties(after)).Distinct().Order(StringComparer.Ordinal);
        foreach (var name in names)
        {
            var field = prefix + name;
            var hasOld = TryGet(before, name, out var oldValue);
            var hasNew = TryGet(after, name, out var newValue);

            if (oldValue.ValueKind == JsonValueKind.Object && newValue.ValueKind == JsonValueKind.Object)
            {
                Compare(field + ".", oldValue, newValue, changes);
                continue;
            }

            var from = hasOld ? Text(oldValue) : null;
            var to = hasNew ? Text(newValue) : null;
            if (from == to)
            {
                continue;
            }

            changes.Add(SecretNames.Contains(name, StringComparer.OrdinalIgnoreCase)
                ? Change(field, from is null ? null : "•••", to is null ? null : "••• (changed)")
                : Change(field, from, to));
        }
    }

    private static IEnumerable<string> Properties(JsonElement e) =>
        e.ValueKind == JsonValueKind.Object ? e.EnumerateObject().Select(p => p.Name) : [];

    private static bool TryGet(JsonElement e, string name, out JsonElement value)
    {
        value = default;
        return e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out value);
    }

    /// <summary>Numbers sent as strings (e.g. "70" vs 70) and empty values compare equal.</summary>
    private static string? Text(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.String => string.IsNullOrEmpty(e.GetString()) ? null : e.GetString(),
        _ => e.GetRawText(),
    };
}
