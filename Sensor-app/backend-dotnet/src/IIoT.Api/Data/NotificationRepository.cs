using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

/// <param name="AssetId">Area or equipment whose alarms (including everything below it) are sent; null = the whole plant.</param>
/// <param name="DelayMinutes">0 = when raised; otherwise only if still active and unacknowledged after this long.</param>
public sealed record NotificationRule(Guid Id, string UserId, Guid? AssetId, string MinPriority, int DelayMinutes);

/// <summary>A notification claimed for sending; <c>ChatId</c> is null when the user has not connected Telegram.</summary>
public sealed record DueNotification(Guid Id, Guid AlarmId, string UserId, long? ChatId, int DelayMinutes);

/// <summary>What a notification message says about its alarm.</summary>
public sealed record AlarmContext(
    Guid AlarmId, Guid SiteId, string Condition, string Priority, double? LimitValue, double? Value,
    DateTime RaisedAt, DateTime? ClearedAt, DateTime? AckedAt, string? AckedBy,
    Guid SensorId, string SensorName, Guid? AssetId, string? Unit);

public sealed record SentMessage(Guid Id, long ChatId, long MessageId, string Text);

public sealed record NotificationLogEntry(
    Guid Id, Guid AlarmId, string UserId, int DelayMinutes, DateTime CreatedAt, DateTime? SentAt, string? Error,
    Guid SensorId, string SensorName, string Condition, string Priority);

/// <summary>Notification rules, Telegram chat links and the delivery log (see <c>005-notifications.sql</c>).</summary>
public sealed class NotificationRepository(NpgsqlDataSource dataSource)
{
    public static readonly string[] Priorities = ["warning", "critical"];

    private const string RuleColumns =
        "id, user_id AS UserId, asset_id AS AssetId, min_priority AS MinPriority, delay_minutes AS DelayMinutes";

    // ---------------- Rules ----------------

    public async Task<IReadOnlyList<NotificationRule>> GetRulesAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<NotificationRule>(
            $"SELECT {RuleColumns} FROM notification_rules WHERE site_id = @siteId ORDER BY delay_minutes, user_id, created_at",
            new { siteId })).ToList();
    }

    public async Task<NotificationRule?> GetRuleAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<NotificationRule>(
            $"SELECT {RuleColumns} FROM notification_rules WHERE site_id = @siteId AND id = @id", new { siteId, id });
    }

    /// <summary>The user and asset must belong to the site (checked by the caller, enforced by foreign keys).</summary>
    public async Task<Guid> CreateRuleAsync(Guid siteId, string userId, Guid? assetId, string minPriority, int delayMinutes)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<Guid>("""
            INSERT INTO notification_rules (site_id, user_id, asset_id, min_priority, delay_minutes)
            VALUES (@siteId, @userId, @assetId, @minPriority, @delayMinutes) RETURNING id
            """, new { siteId, userId, assetId, minPriority, delayMinutes });
    }

    public async Task<bool> UpdateRuleAsync(Guid siteId, Guid id, string userId, Guid? assetId, string minPriority, int delayMinutes)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("""
            UPDATE notification_rules
            SET user_id = @userId, asset_id = @assetId, min_priority = @minPriority, delay_minutes = @delayMinutes
            WHERE site_id = @siteId AND id = @id
            """, new { siteId, id, userId, assetId, minPriority, delayMinutes }) == 1;
    }

    public async Task<bool> DeleteRuleAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("DELETE FROM notification_rules WHERE site_id = @siteId AND id = @id", new { siteId, id }) == 1;
    }

    // ---------------- Telegram links ----------------

    public async Task CreateLinkCodeAsync(string userId, string code, DateTimeOffset expiresAt)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        // One open code per user; expired codes of everyone are cleaned up on the way
        await conn.ExecuteAsync("""
            DELETE FROM telegram_link_codes WHERE user_id = @userId OR expires_at <= now();
            INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (@code, @userId, @expiresAt);
            """, new { userId, code, expiresAt = expiresAt.UtcDateTime });
    }

    /// <summary>Links the chat to the user of a valid code (used once). A chat belongs to one user at a time.</summary>
    public async Task<string?> ConsumeLinkCodeAsync(string code, long chatId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        var userId = await conn.ExecuteScalarAsync<string?>(
            "DELETE FROM telegram_link_codes WHERE code = @code AND expires_at > now() RETURNING user_id", new { code }, tx);
        if (userId is not null)
        {
            await conn.ExecuteAsync("""
                UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = @chatId AND id <> @userId;
                UPDATE users SET telegram_chat_id = @chatId WHERE id = @userId;
                """, new { chatId, userId }, tx);
        }
        await tx.CommitAsync();
        return userId;
    }

    public async Task UnlinkUserAsync(string userId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE users SET telegram_chat_id = NULL WHERE id = @userId", new { userId });
    }

    public async Task<bool> UnlinkChatAsync(long chatId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = @chatId", new { chatId }) > 0;
    }

    public async Task<string?> GetUserByChatAsync(long chatId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<string?>("SELECT id FROM users WHERE telegram_chat_id = @chatId", new { chatId });
    }

    public async Task<long?> GetChatIdAsync(string userId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<long?>("SELECT telegram_chat_id FROM users WHERE id = @userId", new { userId });
    }

    /// <summary>The site's users and whether each has connected Telegram, for picking recipients.</summary>
    public async Task<IReadOnlyList<(string Id, string Role, bool Connected)>> GetRecipientsAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<(string, string, bool)>(
            "SELECT id, role, telegram_chat_id IS NOT NULL FROM users WHERE site_id = @siteId ORDER BY id", new { siteId })).ToList();
    }

    // ---------------- Delivery ----------------

    /// <summary>
    /// Claims every notification that is due now: an unacknowledged alarm raised after the rule was
    /// created (and within the last day), matching the rule's priority and area, whose delay has
    /// passed (a delayed rule only for alarms still active). Each (alarm, rule) is claimed once.
    /// </summary>
    public async Task<IReadOnlyList<DueNotification>> ClaimDueAsync()
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<DueNotification>("""
            WITH RECURSIVE tree AS (
              SELECT id AS root, id FROM assets
              UNION ALL
              SELECT t.root, c.id FROM tree t JOIN assets c ON c.parent_id = t.id
            ), due AS (
              SELECT r.site_id, a.id AS alarm_id, r.id AS rule_id, r.user_id, r.delay_minutes, u.telegram_chat_id
              FROM alarms a
              JOIN sensors s ON s.id = a.sensor_id
              JOIN notification_rules r ON r.site_id = s.site_id
              JOIN users u ON u.id = r.user_id
              WHERE a.acked_at IS NULL
                AND a.raised_at >= r.created_at
                AND a.raised_at > now() - INTERVAL '1 day'
                AND a.raised_at + make_interval(mins => r.delay_minutes) <= now()
                AND (r.delay_minutes = 0 OR a.cleared_at IS NULL)
                AND (r.min_priority = 'warning' OR a.priority = 'critical')
                AND (r.asset_id IS NULL OR EXISTS (SELECT 1 FROM tree WHERE tree.root = r.asset_id AND tree.id = s.asset_id))
                AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.alarm_id = a.id AND n.rule_id = r.id)
            )
            INSERT INTO notifications (site_id, alarm_id, rule_id, user_id, delay_minutes, telegram_chat_id)
            SELECT site_id, alarm_id, rule_id, user_id, delay_minutes, telegram_chat_id FROM due
            ON CONFLICT (alarm_id, rule_id) DO NOTHING
            RETURNING id, alarm_id AS AlarmId, user_id AS UserId, telegram_chat_id AS ChatId, delay_minutes AS DelayMinutes
            """)).ToList();
    }

    public async Task<AlarmContext?> GetAlarmContextAsync(Guid alarmId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<AlarmContext>("""
            SELECT a.id AS AlarmId, s.site_id AS SiteId, a.condition, a.priority, a.limit_value AS LimitValue, a.value,
                   a.raised_at AS RaisedAt, a.cleared_at AS ClearedAt, a.acked_at AS AckedAt, a.acked_by AS AckedBy,
                   s.id AS SensorId, s.name AS SensorName, s.asset_id AS AssetId, s.details->'threshold'->>'unit' AS Unit
            FROM alarms a JOIN sensors s ON s.id = a.sensor_id
            WHERE a.id = @alarmId
            """, new { alarmId });
    }

    public async Task MarkSentAsync(Guid id, long chatId, long messageId, string text)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            UPDATE notifications SET sent_at = now(), error = NULL, telegram_chat_id = @chatId,
                   telegram_message_id = @messageId, message_text = @text
            WHERE id = @id
            """, new { id, chatId, messageId, text });
    }

    public async Task MarkFailedAsync(Guid id, string error)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE notifications SET error = @error WHERE id = @id", new { id, error });
    }

    /// <summary>Messages already sent about an alarm, so they can be updated once it is acknowledged.</summary>
    public async Task<IReadOnlyList<SentMessage>> GetSentMessagesAsync(Guid alarmId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<SentMessage>("""
            SELECT id, telegram_chat_id AS ChatId, telegram_message_id AS MessageId, message_text AS Text
            FROM notifications
            WHERE alarm_id = @alarmId AND telegram_message_id IS NOT NULL AND message_text IS NOT NULL
            """, new { alarmId })).ToList();
    }

    public async Task<IReadOnlyList<NotificationLogEntry>> GetLogAsync(Guid siteId, int limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<NotificationLogEntry>("""
            SELECT n.id, n.alarm_id AS AlarmId, n.user_id AS UserId, n.delay_minutes AS DelayMinutes,
                   n.created_at AS CreatedAt, n.sent_at AS SentAt, n.error,
                   s.id AS SensorId, s.name AS SensorName, a.condition, a.priority
            FROM notifications n
            JOIN alarms a ON a.id = n.alarm_id
            JOIN sensors s ON s.id = a.sensor_id
            WHERE n.site_id = @siteId
            ORDER BY n.created_at DESC
            LIMIT @limit
            """, new { siteId, limit })).ToList();
    }
}
