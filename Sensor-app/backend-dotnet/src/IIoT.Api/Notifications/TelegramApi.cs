using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace IIoT.Api.Notifications;

/// <summary>Telegram settings from <c>.env</c>. Without a bot token, notifications are off.</summary>
public sealed record TelegramSettings(string? Token, string? AppUrl)
{
    public bool Enabled => !string.IsNullOrWhiteSpace(Token);

    public static TelegramSettings From(IConfiguration config) => new(
        config["TELEGRAM_BOT_TOKEN"]?.Trim(),
        config["APP_URL"] is { Length: > 0 } url ? url.TrimEnd('/') : null);
}

/// <summary>An inline button under a message: either sends <c>CallbackData</c> back to the bot or opens <c>Url</c>.</summary>
public sealed record TelegramButton(string Text, string? CallbackData = null, string? Url = null);

/// <summary>What the bot received: a chat message (<c>Text</c>) or a button press (<c>CallbackId</c>).</summary>
public sealed record TelegramUpdate(long UpdateId, long ChatId, string? Text, string? CallbackId, string? CallbackData);

public sealed class TelegramException(string message) : Exception(message);

/// <summary>The few Bot API calls the platform needs. Replaced by a fake in the integration tests.</summary>
public interface ITelegramApi
{
    Task<string> GetBotUsernameAsync(CancellationToken ct);
    /// <summary>Sends an HTML message and returns its message id.</summary>
    Task<long> SendMessageAsync(long chatId, string html, IReadOnlyList<TelegramButton>? buttons, CancellationToken ct);
    /// <summary>Replaces the text of a sent message and removes its buttons.</summary>
    Task EditMessageAsync(long chatId, long messageId, string html, CancellationToken ct);
    /// <summary>Long polling: waits up to <paramref name="timeoutSeconds"/> for updates after <paramref name="offset"/>.</summary>
    Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct);
    /// <summary>Confirms a button press with a short pop-up text.</summary>
    Task AnswerCallbackAsync(string callbackId, string text, CancellationToken ct);
}

/// <summary>
/// Telegram Bot API over HTTPS. Uses long polling (getUpdates), so the backend needs no public
/// address. Its own HttpClient on purpose: the token is part of every URL, and the shared
/// HttpClientFactory would write those URLs to the log.
/// </summary>
public sealed class TelegramApi(TelegramSettings settings) : ITelegramApi, IDisposable
{
    private readonly HttpClient _http = new()
    {
        BaseAddress = new Uri($"https://api.telegram.org/bot{settings.Token}/"),
        Timeout = TimeSpan.FromSeconds(60),
    };

    public async Task<string> GetBotUsernameAsync(CancellationToken ct) =>
        (await CallAsync("getMe", new JsonObject(), ct))["username"]?.GetValue<string>()
        ?? throw new TelegramException("getMe returned no username");

    public async Task<long> SendMessageAsync(long chatId, string html, IReadOnlyList<TelegramButton>? buttons, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["chat_id"] = chatId,
            ["text"] = html,
            ["parse_mode"] = "HTML",
            ["link_preview_options"] = new JsonObject { ["is_disabled"] = true },
        };
        if (buttons is { Count: > 0 })
        {
            var row = new JsonArray();
            foreach (var b in buttons)
            {
                var button = new JsonObject { ["text"] = b.Text };
                if (b.CallbackData is not null) button["callback_data"] = b.CallbackData;
                if (b.Url is not null) button["url"] = b.Url;
                row.Add(button);
            }
            body["reply_markup"] = new JsonObject { ["inline_keyboard"] = new JsonArray(row) };
        }
        return (await CallAsync("sendMessage", body, ct))["message_id"]!.GetValue<long>();
    }

    public async Task EditMessageAsync(long chatId, long messageId, string html, CancellationToken ct) =>
        await CallAsync("editMessageText", new JsonObject
        {
            ["chat_id"] = chatId,
            ["message_id"] = messageId,
            ["text"] = html,
            ["parse_mode"] = "HTML",
            ["link_preview_options"] = new JsonObject { ["is_disabled"] = true },
        }, ct);

    public async Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct)
    {
        var result = await CallAsync("getUpdates", new JsonObject
        {
            ["offset"] = offset,
            ["timeout"] = timeoutSeconds,
            ["allowed_updates"] = new JsonArray("message", "callback_query"),
        }, ct);

        var updates = new List<TelegramUpdate>();
        foreach (var u in result.AsArray())
        {
            var id = u!["update_id"]!.GetValue<long>();
            if (u["message"] is { } message && message["chat"]?["id"] is { } chat)
            {
                updates.Add(new TelegramUpdate(id, chat.GetValue<long>(), message["text"]?.GetValue<string>(), null, null));
            }
            else if (u["callback_query"] is { } callback && callback["message"]?["chat"]?["id"] is { } callbackChat)
            {
                updates.Add(new TelegramUpdate(id, callbackChat.GetValue<long>(), null,
                    callback["id"]!.GetValue<string>(), callback["data"]?.GetValue<string>()));
            }
            else
            {
                // Something else (an edited message, a user joining...): skip it, but move past it
                updates.Add(new TelegramUpdate(id, 0, null, null, null));
            }
        }
        return updates;
    }

    public async Task AnswerCallbackAsync(string callbackId, string text, CancellationToken ct) =>
        await CallAsync("answerCallbackQuery", new JsonObject { ["callback_query_id"] = callbackId, ["text"] = text }, ct);

    private async Task<JsonNode> CallAsync(string method, JsonObject body, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync(method, body, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new TelegramException($"Telegram not reachable: {ex.HttpRequestError}");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TelegramException("Telegram did not answer in time");
        }

        using (response)
        {
            JsonObject? json;
            try
            {
                json = await response.Content.ReadFromJsonAsync<JsonObject>(ct);
            }
            catch (System.Text.Json.JsonException)
            {
                json = null;
            }
            if (json?["ok"]?.GetValue<bool>() != true)
            {
                throw new TelegramException(json?["description"]?.GetValue<string>() ?? $"HTTP {(int)response.StatusCode}");
            }
            return json["result"]!;
        }
    }

    public void Dispose() => _http.Dispose();
}
