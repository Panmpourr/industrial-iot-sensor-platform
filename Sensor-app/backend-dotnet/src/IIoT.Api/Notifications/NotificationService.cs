using System.Threading.Channels;
using IIoT.Api.Data;

namespace IIoT.Api.Notifications;

/// <summary>
/// Hand-over from the alarm service, so raising or acknowledging an alarm never waits for Telegram.
/// Does nothing while notifications are off.
/// </summary>
public sealed class NotificationSignals(TelegramSettings settings)
{
    private readonly Channel<bool> _raised = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly Channel<Guid> _acknowledged = Channel.CreateUnbounded<Guid>();

    /// <summary>Wakes the sender, so an alarm with an immediate rule goes out at once.</summary>
    public void AlarmRaised()
    {
        if (settings.Enabled) _raised.Writer.TryWrite(true);
    }

    public void AlarmsAcknowledged(IEnumerable<Guid> alarmIds)
    {
        if (!settings.Enabled) return;
        foreach (var id in alarmIds) _acknowledged.Writer.TryWrite(id);
    }

    /// <summary>Returns when an alarm was raised or after <paramref name="timeout"/>.</summary>
    public async Task WaitForRaiseAsync(TimeSpan timeout, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        try
        {
            await _raised.Reader.ReadAsync(cts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
        }
    }

    public ChannelReader<Guid> Acknowledged => _acknowledged.Reader;
}

/// <summary>
/// Sends alarm notifications by Telegram according to the sites' rules, and once an alarm is
/// acknowledged (in the app or from the phone) updates every message about it, so the others
/// see it is being handled. Rules with a delay are checked every few seconds (escalation).
/// </summary>
public sealed class NotificationService(
    NotificationRepository notifications, AssetRepository assets, ITelegramApi telegram, TelegramSettings settings,
    NotificationSignals signals, ILogger<NotificationService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!settings.Enabled)
        {
            logger.LogInformation("Telegram notifications are off (TELEGRAM_BOT_TOKEN is not set)");
            return;
        }

        var acknowledgements = UpdateAcknowledgedAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DeliverDueAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Sending notifications failed");
            }
            await signals.WaitForRaiseAsync(PollInterval, stoppingToken);
        }
        await acknowledgements;
    }

    /// <summary>Sends every notification that is due now (also called by the integration tests).</summary>
    public async Task DeliverDueAsync(CancellationToken ct = default)
    {
        foreach (var due in await notifications.ClaimDueAsync())
        {
            await SendAsync(due, ct);
        }
    }

    private async Task SendAsync(DueNotification due, CancellationToken ct)
    {
        if (due.ChatId is not { } chatId)
        {
            await notifications.MarkFailedAsync(due.Id, "Telegram is not connected for this user");
            return;
        }
        if (await notifications.GetAlarmContextAsync(due.AlarmId) is not { } alarm)
        {
            await notifications.MarkFailedAsync(due.Id, "The alarm no longer exists");
            return;
        }

        var location = NotificationMessages.Location(await assets.GetBySiteAsync(alarm.SiteId), alarm.AssetId);
        var text = NotificationMessages.Alarm(alarm, location, due.DelayMinutes);
        try
        {
            var messageId = await telegram.SendMessageAsync(chatId, text,
                NotificationMessages.Buttons(alarm.AlarmId, alarm.SensorId, settings.AppUrl), ct);
            await notifications.MarkSentAsync(due.Id, chatId, messageId, text);
        }
        catch (TelegramException ex)
        {
            await notifications.MarkFailedAsync(due.Id, ex.Message);
            logger.LogWarning("Notification {NotificationId} could not be sent: {Error}", due.Id, ex.Message);
        }
    }

    private async Task UpdateAcknowledgedAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var alarmId in signals.Acknowledged.ReadAllAsync(ct))
            {
                try
                {
                    await UpdateMessagesAsync(alarmId, ct);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    logger.LogError(ex, "Updating the messages of alarm {AlarmId} failed", alarmId);
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task UpdateMessagesAsync(Guid alarmId, CancellationToken ct)
    {
        if ((await notifications.GetAlarmContextAsync(alarmId))?.AckedBy is not { } ackedBy)
        {
            return;
        }
        foreach (var message in await notifications.GetSentMessagesAsync(alarmId))
        {
            try
            {
                await telegram.EditMessageAsync(message.ChatId, message.MessageId, NotificationMessages.Acknowledged(message.Text, ackedBy), ct);
            }
            catch (TelegramException ex)
            {
                // E.g. the user deleted the message; nothing else to do
                logger.LogWarning("Message of notification {NotificationId} could not be updated: {Error}", message.Id, ex.Message);
            }
        }
    }
}
