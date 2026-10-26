using System.Collections.Concurrent;
using System.Threading.Channels;
using IIoT.Api.Notifications;

namespace IIoT.IntegrationTests;

/// <summary>
/// Stands in for the Telegram Bot API: records what the backend sends and lets a test act as a
/// user who writes to the bot or presses a button.
/// </summary>
public sealed class FakeTelegram : ITelegramApi
{
    public const string BotUsername = "test_alarm_bot";

    public sealed record Message(long ChatId, long MessageId, string Text, IReadOnlyList<TelegramButton>? Buttons);

    private readonly Channel<TelegramUpdate> _updates = Channel.CreateUnbounded<TelegramUpdate>();
    private long _lastUpdate;
    private long _lastMessage;

    public ConcurrentQueue<Message> Sent { get; } = new();
    public ConcurrentQueue<Message> Edited { get; } = new();
    public ConcurrentDictionary<string, string> Answers { get; } = new();

    public IEnumerable<Message> SentTo(long chatId) => Sent.Where(m => m.ChatId == chatId);

    public void UserSends(long chatId, string text) =>
        _updates.Writer.TryWrite(new TelegramUpdate(Interlocked.Increment(ref _lastUpdate), chatId, text, null, null));

    /// <summary>Presses a button; the bot's answer appears in <see cref="Answers"/> under the returned id.</summary>
    public string UserPresses(long chatId, string callbackData)
    {
        var callbackId = Guid.NewGuid().ToString();
        _updates.Writer.TryWrite(new TelegramUpdate(Interlocked.Increment(ref _lastUpdate), chatId, null, callbackId, callbackData));
        return callbackId;
    }

    public Task<string> GetBotUsernameAsync(CancellationToken ct) => Task.FromResult(BotUsername);

    public Task<long> SendMessageAsync(long chatId, string html, IReadOnlyList<TelegramButton>? buttons, CancellationToken ct)
    {
        var id = Interlocked.Increment(ref _lastMessage);
        Sent.Enqueue(new Message(chatId, id, html, buttons));
        return Task.FromResult(id);
    }

    public Task EditMessageAsync(long chatId, long messageId, string html, CancellationToken ct)
    {
        Edited.Enqueue(new Message(chatId, messageId, html, null));
        return Task.CompletedTask;
    }

    public async Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct)
    {
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(ct);
        wait.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        var updates = new List<TelegramUpdate>();
        try
        {
            updates.Add(await _updates.Reader.ReadAsync(wait.Token));
            while (_updates.Reader.TryRead(out var more))
            {
                updates.Add(more);
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
        }
        return updates;
    }

    public Task AnswerCallbackAsync(string callbackId, string text, CancellationToken ct)
    {
        Answers[callbackId] = text;
        return Task.CompletedTask;
    }
}
