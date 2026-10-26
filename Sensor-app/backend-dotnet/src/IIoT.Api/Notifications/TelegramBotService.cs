using System.Text.Json.Nodes;
using IIoT.Api.Alarms;
using IIoT.Api.Data;

namespace IIoT.Api.Notifications;

/// <summary>
/// Reads what people send to the bot (long polling): <c>/start &lt;code&gt;</c> from the link on
/// the account page connects their chat, <c>/stop</c> disconnects it, and the Acknowledge button
/// under an alarm acknowledges it in their name (audited like an acknowledgement in the app).
/// </summary>
public sealed class TelegramBotService(
    ITelegramApi telegram, TelegramSettings settings, NotificationRepository notifications, UserRepository users,
    AlarmService alarms, SensorRepository sensors, AuditRepository audit, ILogger<TelegramBotService> logger) : BackgroundService
{
    private const int PollSeconds = 25;

    private const string NotConnected =
        "I send the alarms of the IIoT platform. To receive them here, open your <b>Account</b> page there and press <b>Connect Telegram</b>.";

    /// <summary>The bot's @username, once Telegram has confirmed the token; needed for the connect link.</summary>
    public string? Username { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!settings.Enabled)
        {
            return;
        }

        while (Username is null)
        {
            try
            {
                Username = await telegram.GetBotUsernameAsync(stoppingToken);
                logger.LogInformation("Telegram bot @{Bot} is ready", Username);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning("Telegram bot not available, retrying in a minute: {Error}", ex.Message);
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }

        long offset = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            IReadOnlyList<TelegramUpdate> updates;
            try
            {
                updates = await telegram.GetUpdatesAsync(offset, PollSeconds, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning("Reading Telegram updates failed, retrying: {Error}", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                continue;
            }

            foreach (var update in updates)
            {
                offset = update.UpdateId + 1;
                try
                {
                    await HandleAsync(update, stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Handling Telegram update {UpdateId} failed", update.UpdateId);
                }
            }
        }
    }

    private async Task HandleAsync(TelegramUpdate update, CancellationToken ct)
    {
        if (update.ChatId == 0)
        {
            return;
        }
        if (update.CallbackId is { } callbackId)
        {
            await telegram.AnswerCallbackAsync(callbackId, await AcknowledgeAsync(update.ChatId, update.CallbackData), ct);
            return;
        }

        var text = update.Text?.Trim() ?? "";
        if (text.StartsWith("/start", StringComparison.Ordinal))
        {
            var code = text["/start".Length..].Trim();
            await Reply(update.ChatId, code.Length > 0 ? await ConnectAsync(code, update.ChatId) : NotConnected, ct);
        }
        else if (text == "/stop")
        {
            await Reply(update.ChatId, await DisconnectAsync(update.ChatId), ct);
        }
        else
        {
            var connected = await notifications.GetUserByChatAsync(update.ChatId) is not null;
            await Reply(update.ChatId, connected
                ? "Alarms for you arrive here. Use the <b>Acknowledge</b> button under an alarm to acknowledge it, or send /stop to disconnect."
                : NotConnected, ct);
        }
    }

    private Task Reply(long chatId, string html, CancellationToken ct) => telegram.SendMessageAsync(chatId, html, null, ct);

    private async Task<string> ConnectAsync(string code, long chatId)
    {
        if (await notifications.ConsumeLinkCodeAsync(code, chatId) is not { } userId
            || await users.GetMemberAsync(userId) is not { } member)
        {
            return "This link is invalid or has expired. Open your <b>Account</b> page in the IIoT platform and press <b>Connect Telegram</b> again.";
        }
        await audit.LogAsync(member.SiteId, member.UserId, new AuditEntry(AuditActions.TelegramConnect, "user", member.UserId, member.UserId));
        return $"✅ Connected as <b>{NotificationMessages.Html(member.UserId)}</b> ({NotificationMessages.Html(member.SiteName)}).\n" +
            "Alarms for you will arrive here. Send /stop to disconnect.";
    }

    private async Task<string> DisconnectAsync(long chatId)
    {
        var userId = await notifications.GetUserByChatAsync(chatId);
        if (userId is null || !await notifications.UnlinkChatAsync(chatId))
        {
            return "This chat is not connected.";
        }
        if (await users.GetMemberAsync(userId) is { } member)
        {
            await audit.LogAsync(member.SiteId, member.UserId, new AuditEntry(AuditActions.TelegramDisconnect, "user", member.UserId, member.UserId));
        }
        return "Disconnected. You will no longer receive alarms here.";
    }

    /// <summary>Acknowledges in the name of the chat's user; only alarms of that user's site.</summary>
    private async Task<string> AcknowledgeAsync(long chatId, string? callbackData)
    {
        if (NotificationMessages.ParseAck(callbackData) is not { } alarmId)
        {
            return "Unknown action";
        }
        var userId = await notifications.GetUserByChatAsync(chatId);
        if (userId is null || await users.GetMemberAsync(userId) is not { MustChangePassword: false } member)
        {
            return "This chat is not connected to an account";
        }

        var acknowledged = await alarms.AcknowledgeAsync(member.SiteId, member.UserId, [alarmId]);
        if (acknowledged.Count == 0)
        {
            return "Already acknowledged";
        }

        var names = (await sensors.GetBySiteAsync(member.SiteId)).ToDictionary(s => s.Id, s => s.Name);
        await audit.LogAsync(member.SiteId, member.UserId, acknowledged.Select(a => new AuditEntry(
            AuditActions.AlarmAcknowledge, "alarm", a.Id.ToString(), names.GetValueOrDefault(a.SensorId),
            new JsonObject { ["condition"] = a.Condition, ["priority"] = a.Priority, ["via"] = "telegram" })).ToList());
        return "✅ Acknowledged";
    }
}
