using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IIoT.Api.Notifications;
using Microsoft.Extensions.DependencyInjection;

namespace IIoT.IntegrationTests;

/// <summary>Telegram notifications end to end, with <see cref="FakeTelegram"/> in place of the real API.</summary>
[Collection(nameof(ApiCollection))]
public sealed class NotificationTests(ApiFixture api)
{
    private FakeTelegram Telegram => api.Telegram;

    private static async Task Eventually(Func<Task<bool>> condition, string what)
    {
        for (var deadline = DateTime.UtcNow.AddSeconds(15); DateTime.UtcNow < deadline; await Task.Delay(100))
        {
            if (await condition())
            {
                return;
            }
        }
        throw new TimeoutException($"Timed out waiting for: {what}");
    }

    private static Task Eventually(Func<bool> condition, string what) => Eventually(() => Task.FromResult(condition()), what);

    private static async Task<bool> ConnectedAsync(ApiClient client) =>
        (await client.GetJsonAsync("/telegram")).GetProperty("connected").GetBoolean();

    /// <summary>The bot is ready once it has its username (needed for the link).</summary>
    private static Task WaitForBotAsync(ApiClient client) => Eventually(async () =>
        (await client.GetJsonAsync("/telegram")).GetProperty("botUsername").ValueKind == JsonValueKind.String, "bot ready");

    private static async Task<string> LinkCodeAsync(ApiClient client)
    {
        await WaitForBotAsync(client);
        var response = await client.Http.PostAsync("/telegram/link", null);
        response.EnsureSuccessStatusCode();
        var url = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
        Assert.StartsWith($"https://t.me/{FakeTelegram.BotUsername}?start=", url);
        return url[(url.IndexOf("start=", StringComparison.Ordinal) + "start=".Length)..];
    }

    private async Task ConnectAsync(ApiClient client, long chatId)
    {
        Telegram.UserSends(chatId, $"/start {await LinkCodeAsync(client)}");
        await Eventually(() => ConnectedAsync(client), $"{client.UserId} connected");
    }

    private async Task<string> RaiseAsync(string sensorId, string condition = "HIHI", string priority = "critical") =>
        (await api.QueryOwnerAsync<Guid>("""
            INSERT INTO alarms (sensor_id, condition, priority, limit_value, value, raised_at)
            VALUES (@sensorId, @condition, @priority, 90, 95.5, now()) RETURNING id
            """, new { sensorId = Guid.Parse(sensorId), condition, priority })).ToString();

    private Task DeliverAsync() => api.Factory.Services.GetRequiredService<NotificationService>().DeliverDueAsync();

    private static async Task<HttpResponseMessage> AddRuleAsync(ApiClient client, string userId, string? assetId, string priority, int delay) =>
        await client.Http.PostAsJsonAsync("/notification-rules", new { userId, assetId, minPriority = priority, delayMinutes = delay });

    [Fact]
    public async Task Users_connect_their_chat_with_a_one_time_link()
    {
        var user = await api.RegisterAsync("tg-user");
        Assert.True((await user.GetJsonAsync("/telegram")).GetProperty("enabled").GetBoolean());
        Assert.False(await ConnectedAsync(user));

        var code = await LinkCodeAsync(user);
        Telegram.UserSends(1001, $"/start {code}");
        await Eventually(() => ConnectedAsync(user), "connected");
        await Eventually(() => Telegram.SentTo(1001).Any(m => m.Text.Contains("Connected as <b>tg-user</b>")), "welcome message");

        // The link works once
        Telegram.UserSends(1002, $"/start {code}");
        await Eventually(() => Telegram.SentTo(1002).Any(m => m.Text.Contains("invalid or has expired")), "used link refused");

        (await user.Http.PostAsync("/telegram/test", null)).EnsureSuccessStatusCode();
        Assert.Contains(Telegram.SentTo(1001), m => m.Text.Contains("Test message"));

        // Disconnecting from the app; the audit log has both
        (await user.Http.DeleteAsync("/telegram/link")).EnsureSuccessStatusCode();
        Assert.False(await ConnectedAsync(user));
        Assert.Equal(HttpStatusCode.Conflict, (await user.Http.PostAsync("/telegram/test", null)).StatusCode);
        var actions = (await user.GetJsonAsync("/audit-log")).EnumerateArray().Select(e => e.GetProperty("action").GetString()).ToList();
        Assert.Contains("user.telegram-connect", actions);
        Assert.Contains("user.telegram-disconnect", actions);
    }

    [Fact]
    public async Task Alarms_reach_the_right_people_escalate_and_can_be_acknowledged_from_the_phone()
    {
        var (admin, op, eng) = await api.SiteWithTeamAsync("notify");
        await ConnectAsync(op, 2001);
        await ConnectAsync(admin, 2002);

        var hall = (await (await eng.Http.PostAsJsonAsync("/assets", new { name = "Hall A", kind = "area" }))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        var oven = await ApiFixture.AddSensorAsync(eng, "Oven temperature", hall);
        var elsewhere = await ApiFixture.AddSensorAsync(eng, "Yard pump");

        // The operator is told at once about critical alarms in the hall; the admin only if nobody acknowledges within 10 minutes
        Assert.Equal(HttpStatusCode.Forbidden, (await AddRuleAsync(op, "notify-op", hall, "critical", 0)).StatusCode);
        (await AddRuleAsync(eng, "notify-op", hall, "critical", 0)).EnsureSuccessStatusCode();
        (await AddRuleAsync(eng, "notify-admin", null, "critical", 10)).EnsureSuccessStatusCode();

        var ovenAlarm = await RaiseAsync(oven);
        await RaiseAsync(elsewhere);
        await DeliverAsync();

        await Eventually(() => Telegram.SentTo(2001).Any(m => m.Text.Contains("Oven temperature")), "operator notified");
        var toOperator = Telegram.SentTo(2001).Single(m => m.Text.Contains("CRITICAL"));
        Assert.Contains("Hall A", toOperator.Text);
        Assert.DoesNotContain(Telegram.SentTo(2001), m => m.Text.Contains("Yard pump"));
        Assert.DoesNotContain(Telegram.SentTo(2002), m => m.Text.Contains("CRITICAL"));

        // Eleven minutes later, still unacknowledged
        await api.ExecuteOwnerAsync("UPDATE notification_rules SET created_at = now() - INTERVAL '1 hour' WHERE user_id LIKE 'notify-%'");
        await api.ExecuteOwnerAsync("UPDATE alarms SET raised_at = now() - INTERVAL '11 minutes' WHERE id = @id", new { id = Guid.Parse(ovenAlarm) });
        await DeliverAsync();
        await Eventually(() => Telegram.SentTo(2002).Any(m => m.Text.Contains("Oven temperature") && m.Text.Contains("Not acknowledged for 10 min")), "escalated");
        Assert.Single(Telegram.SentTo(2001), m => m.Text.Contains("CRITICAL"));

        // Someone of another site cannot acknowledge it
        var stranger = await api.RegisterAsync("notify-stranger");
        await ConnectAsync(stranger, 2003);
        var ackData = toOperator.Buttons!.Single(b => b.CallbackData is not null).CallbackData!;
        var refused = Telegram.UserPresses(2003, ackData);
        await Eventually(() => Telegram.Answers.ContainsKey(refused), "stranger answered");
        Assert.Equal("Already acknowledged", Telegram.Answers[refused]);
        Assert.Equal("", await api.QueryOwnerAsync<string>("SELECT COALESCE(acked_by, '') FROM alarms WHERE id = @id", new { id = Guid.Parse(ovenAlarm) }));

        // The operator acknowledges from the phone: every message about it says so
        var pressed = Telegram.UserPresses(2001, ackData);
        await Eventually(() => Telegram.Answers.ContainsKey(pressed), "operator answered");
        Assert.Equal("✅ Acknowledged", Telegram.Answers[pressed]);
        Assert.Equal("notify-op", await api.QueryOwnerAsync<string>("SELECT acked_by FROM alarms WHERE id = @id", new { id = Guid.Parse(ovenAlarm) }));
        await Eventually(() => Telegram.Edited.Count(m => (m.ChatId == 2001 || m.ChatId == 2002) && m.Text.Contains("Acknowledged by <b>notify-op</b>")) == 2,
            "both messages updated");

        var ack = (await admin.GetJsonAsync("/audit-log")).EnumerateArray().First(e => e.GetProperty("action").GetString() == "alarm.acknowledge");
        Assert.Equal("telegram", ack.GetProperty("details").GetProperty("via").GetString());

        var log = (await op.GetJsonAsync("/notifications")).EnumerateArray().ToList();
        Assert.Equal(2, log.Count(n => n.GetProperty("alarmId").GetString() == ovenAlarm && n.GetProperty("sentAt").ValueKind == JsonValueKind.String));
    }

    [Fact]
    public async Task A_recipient_without_Telegram_shows_up_as_failed()
    {
        var (_, _, eng) = await api.SiteWithTeamAsync("notify-off");
        var sensor = await ApiFixture.AddSensorAsync(eng, "Boiler");
        (await AddRuleAsync(eng, "notify-off-op", null, "critical", 0)).EnsureSuccessStatusCode();

        var alarm = await RaiseAsync(sensor);
        await DeliverAsync();

        var entry = (await eng.GetJsonAsync("/notifications")).EnumerateArray().Single(n => n.GetProperty("alarmId").GetString() == alarm);
        Assert.Equal("Telegram is not connected for this user", entry.GetProperty("error").GetString());
        Assert.Equal(JsonValueKind.Null, entry.GetProperty("sentAt").ValueKind);
    }

    [Fact]
    public async Task Rules_only_name_users_and_areas_of_the_own_site()
    {
        var (_, _, eng) = await api.SiteWithTeamAsync("notify-scope");
        var other = await api.RegisterAsync("notify-scope-other");
        var otherArea = (await (await other.Http.PostAsJsonAsync("/assets", new { name = "Their hall", kind = "area" }))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.BadRequest, (await AddRuleAsync(eng, "notify-scope-other", null, "critical", 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddRuleAsync(eng, "notify-scope-op", otherArea, "critical", 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddRuleAsync(eng, "notify-scope-op", null, "info", 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddRuleAsync(eng, "notify-scope-op", null, "warning", 5000)).StatusCode);

        var created = await AddRuleAsync(eng, "notify-scope-op", null, "warning", 5);
        created.EnsureSuccessStatusCode();
        var ruleId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

        // The other site neither sees nor changes it
        Assert.Empty((await other.GetJsonAsync("/notification-rules")).GetProperty("rules").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await other.Http.DeleteAsync($"/notification-rules/{ruleId}")).StatusCode);
        var mine = (await eng.GetJsonAsync("/notification-rules")).GetProperty("rules").EnumerateArray().Single();
        Assert.Equal(5, mine.GetProperty("delayMinutes").GetInt32());
    }
}
