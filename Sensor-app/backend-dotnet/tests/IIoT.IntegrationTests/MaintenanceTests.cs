using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace IIoT.IntegrationTests;

/// <summary>Maintenance tasks and the work log: who may do what, due dates, history and site isolation.</summary>
[Collection(nameof(ApiCollection))]
public sealed class MaintenanceTests(ApiFixture api)
{
    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    private static async Task<string> IdOf(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private static Task<string> AddEquipmentAsync(ApiClient client, string name) =>
        client.Http.PostAsJsonAsync("/assets", new { name, kind = "equipment" }).ContinueWith(t => IdOf(t.Result)).Unwrap();

    private static Task<HttpResponseMessage> AddTaskAsync(ApiClient client, string? assetId, string name = "Replace air filter", int interval = 30, string nextDue = "2026-11-01") =>
        client.Http.PostAsJsonAsync("/maintenance/tasks", new { assetId, name, intervalDays = interval, nextDue, notes = "Filter type F7" });

    private static Task<HttpResponseMessage> LogWorkAsync(ApiClient client, string? assetId, string description = "Replaced the bearing",
        string kind = "repair", string? performedOn = null, string? alarmId = null) =>
        client.Http.PostAsJsonAsync("/maintenance/log", new { assetId, kind, performedOn = performedOn ?? Today, description, durationMinutes = 45, alarmId });

    [Fact]
    public async Task Engineers_plan_tasks_and_everyone_logs_the_work()
    {
        var (admin, op, eng) = await api.SiteWithTeamAsync("maint");
        var press = await AddEquipmentAsync(eng, "Press 1");

        Assert.Equal(HttpStatusCode.Forbidden, (await AddTaskAsync(op, press)).StatusCode);
        var task = await IdOf(await AddTaskAsync(eng, press));

        // The operator does the job on 20 October: next due is 30 days later
        var done = await op.Http.PostAsJsonAsync($"/maintenance/tasks/{task}/complete", new { performedOn = "2026-10-20", description = "Done, old filter was dirty", durationMinutes = 15 });
        done.EnsureSuccessStatusCode();
        Assert.Equal("2026-11-19", (await done.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("nextDue").GetString());

        var saved = (await op.GetJsonAsync("/maintenance/tasks")).EnumerateArray().Single();
        Assert.Equal("2026-11-19", saved.GetProperty("nextDue").GetString());
        Assert.Equal("2026-10-20", saved.GetProperty("lastDone").GetString());
        Assert.Equal("Filter type F7", saved.GetProperty("notes").GetString());

        // A repair after an alarm of a sensor on the press
        var sensor = await ApiFixture.AddSensorAsync(eng, "Press temperature", press);
        var alarm = await api.QueryOwnerAsync<Guid>(
            "INSERT INTO alarms (sensor_id, condition, priority, raised_at) VALUES (@id, 'HIHI', 'critical', now()) RETURNING id", new { id = Guid.Parse(sensor) });
        await IdOf(await LogWorkAsync(op, press, alarmId: alarm.ToString()));

        var log = (await eng.GetJsonAsync("/maintenance/log")).EnumerateArray().ToList();
        Assert.Equal(2, log.Count);
        var repair = log.Single(e => e.GetProperty("kind").GetString() == "repair");
        Assert.Equal("maint-op", repair.GetProperty("performedBy").GetString());
        Assert.Equal(alarm.ToString(), repair.GetProperty("alarmId").GetString());
        var preventive = log.Single(e => e.GetProperty("kind").GetString() == "preventive");
        Assert.Equal("Replace air filter", preventive.GetProperty("taskName").GetString());
        Assert.Equal("Press 1", preventive.GetProperty("assetName").GetString());
        Assert.Equal(15, preventive.GetProperty("durationMinutes").GetInt32());

        // Changes to the plan are audited
        (await eng.Http.PutAsJsonAsync($"/maintenance/tasks/{task}", new { name = "Replace air filter", intervalDays = 60, nextDue = "2026-12-01" })).EnsureSuccessStatusCode();
        var audit = (await admin.GetJsonAsync("/audit-log")).EnumerateArray().ToList();
        Assert.Contains(audit, e => e.GetProperty("action").GetString() == "maintenance-task.create");
        var update = audit.Single(e => e.GetProperty("action").GetString() == "maintenance-task.update");
        Assert.Contains(update.GetProperty("details").GetProperty("changes").EnumerateArray(), c => c.GetProperty("field").GetString() == "interval");
    }

    [Fact]
    public async Task Refuses_bad_input()
    {
        var (_, _, eng) = await api.SiteWithTeamAsync("maint-input");
        var pump = await AddEquipmentAsync(eng, "Pump");
        var other = await api.RegisterAsync("maint-input-other");
        var theirs = await AddEquipmentAsync(other, "Their pump");
        var theirSensor = await ApiFixture.AddSensorAsync(other, "Their sensor", theirs);
        var theirAlarm = await api.QueryOwnerAsync<Guid>(
            "INSERT INTO alarms (sensor_id, condition, priority, raised_at) VALUES (@id, 'HI', 'warning', now()) RETURNING id", new { id = Guid.Parse(theirSensor) });

        Assert.Equal(HttpStatusCode.BadRequest, (await AddTaskAsync(eng, theirs)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddTaskAsync(eng, pump, interval: 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddTaskAsync(eng, pump, name: " ")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddTaskAsync(eng, pump, nextDue: "1 Nov")).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await LogWorkAsync(eng, pump, performedOn: DateTime.UtcNow.AddDays(5).ToString("yyyy-MM-dd"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await LogWorkAsync(eng, pump, description: "")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await LogWorkAsync(eng, pump, kind: "magic")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await LogWorkAsync(eng, pump, alarmId: theirAlarm.ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await LogWorkAsync(eng, theirs)).StatusCode);
    }

    [Fact]
    public async Task Another_site_cannot_see_or_change_the_maintenance()
    {
        var (_, _, eng) = await api.SiteWithTeamAsync("maint-a");
        var mixer = await AddEquipmentAsync(eng, "Mixer");
        var task = await IdOf(await AddTaskAsync(eng, mixer));
        var entry = await IdOf(await LogWorkAsync(eng, mixer));
        var stranger = await api.RegisterAsync("maint-stranger");

        Assert.Empty((await stranger.GetJsonAsync("/maintenance/tasks")).EnumerateArray());
        Assert.Empty((await stranger.GetJsonAsync("/maintenance/log")).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.PostAsJsonAsync($"/maintenance/tasks/{task}/complete", new { performedOn = Today })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.Http.PutAsJsonAsync($"/maintenance/tasks/{task}", new { name = "x", intervalDays = 1, nextDue = Today })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.DeleteAsync($"/maintenance/tasks/{task}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.DeleteAsync($"/maintenance/log/{entry}")).StatusCode);
        Assert.Single((await eng.GetJsonAsync("/maintenance/tasks")).EnumerateArray());
    }

    [Fact]
    public async Task The_history_outlives_the_equipment()
    {
        var (admin, op, eng) = await api.SiteWithTeamAsync("maint-history");
        var oven = await AddEquipmentAsync(eng, "Old oven");
        await IdOf(await AddTaskAsync(eng, oven));
        var entry = await IdOf(await LogWorkAsync(op, oven, description: "Cleaned the burner"));

        (await eng.Http.DeleteAsync($"/assets/{oven}")).EnsureSuccessStatusCode();

        Assert.Empty((await eng.GetJsonAsync("/maintenance/tasks")).EnumerateArray());
        var kept = (await eng.GetJsonAsync("/maintenance/log")).EnumerateArray().Single();
        Assert.Equal("Old oven", kept.GetProperty("assetName").GetString());
        Assert.Equal(JsonValueKind.Null, kept.GetProperty("assetId").ValueKind);

        // Only engineers remove entries, and the removal is audited with what the entry said
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.DeleteAsync($"/maintenance/log/{entry}")).StatusCode);
        (await eng.Http.DeleteAsync($"/maintenance/log/{entry}")).EnsureSuccessStatusCode();
        var removed = (await admin.GetJsonAsync("/audit-log")).EnumerateArray().Single(e => e.GetProperty("action").GetString() == "maintenance-log.delete");
        Assert.Equal("Cleaned the burner", removed.GetProperty("details").GetProperty("description").GetString());
    }
}
