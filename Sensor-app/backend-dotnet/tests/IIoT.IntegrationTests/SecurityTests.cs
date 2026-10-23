using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace IIoT.IntegrationTests;

/// <summary>Roles, site isolation, the audit trail and the migrations, end to end.</summary>
[Collection(nameof(ApiCollection))]
public sealed class SecurityTests(ApiFixture api)
{
    private static object OpcUaSensor(string name, string userId, double critical = 90) => new
    {
        name,
        type = "Plc-Opcua",
        userId,
        // Unreachable on purpose: the connector keeps retrying in the background
        details = new { endpointUrl = "opc.tcp://127.0.0.1:1", nodeId = "ns=2;i=2", threshold = new { min = 0, max = 100, warning = 70, critical } },
    };

    private static async Task<string> AddSensorAsync(ApiClient client, string name)
    {
        var response = await client.Http.PostAsJsonAsync("/register-sensor", OpcUaSensor(name, client.UserId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sensorId").GetString()!;
    }

    /// <summary>An admin with an operator and an engineer in the same site (passwords already changed).</summary>
    private async Task<(ApiClient Admin, ApiClient Operator, ApiClient Engineer)> SiteWithTeamAsync(string prefix)
    {
        var admin = await api.RegisterAsync($"{prefix}-admin");
        (await admin.Http.PostAsJsonAsync("/site-users", new { id = $"{prefix}-op", password = "temporary-1", role = "operator" })).EnsureSuccessStatusCode();
        (await admin.Http.PostAsJsonAsync("/site-users", new { id = $"{prefix}-eng", password = "temporary-2", role = "engineer" })).EnsureSuccessStatusCode();
        var op = await api.FirstSignInAsync($"{prefix}-op", "temporary-1");
        var eng = await api.FirstSignInAsync($"{prefix}-eng", "temporary-2");
        return (admin, op, eng);
    }

    [Fact]
    public async Task Sign_up_creates_a_site_with_the_user_as_admin()
    {
        var admin = await api.RegisterAsync("signup-admin");

        var profile = await admin.GetJsonAsync("/profile?id=signup-admin");

        Assert.Equal("admin", profile.GetProperty("role").GetString());
        Assert.Equal("signup-admin's site", profile.GetProperty("siteName").GetString());
    }

    [Fact]
    public async Task A_new_user_must_replace_the_temporary_password_first()
    {
        var admin = await api.RegisterAsync("temp-admin");
        await admin.Http.PostAsJsonAsync("/site-users", new { id = "temp-op", password = "temporary-1", role = "operator" });
        var op = new ApiClient(api.Factory.CreateClient(), "temp-op");
        await op.LoginAsync("temporary-1");

        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.GetAsync("/sensors/temp-op")).StatusCode);
        Assert.True((await op.GetJsonAsync("/profile?id=temp-op")).GetProperty("mustChangePassword").GetBoolean());

        await op.Http.PostAsJsonAsync("/change-password", new { id = "temp-op", oldPassword = "temporary-1", newPassword = "my-own-pass" });

        Assert.Equal(HttpStatusCode.OK, (await op.Http.GetAsync("/sensors/temp-op")).StatusCode);
    }

    [Fact]
    public async Task Operators_can_view_and_acknowledge_but_not_change_anything()
    {
        var (_, op, _) = await SiteWithTeamAsync("roles");

        Assert.Equal(HttpStatusCode.OK, (await op.Http.GetAsync("/sensors/roles-op")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await op.Http.GetAsync("/alarms/roles-op")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.PostAsJsonAsync("/register-sensor", OpcUaSensor("x", "roles-op"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.GetAsync("/site-users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.GetAsync("/audit-log")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.PostAsJsonAsync("/site-users", new { id = "x", password = "temporary-9", role = "admin" })).StatusCode);
    }

    [Fact]
    public async Task Routes_with_a_user_id_only_work_for_that_user()
    {
        var (_, op, _) = await SiteWithTeamAsync("route");

        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.GetAsync("/sensors/route-admin")).StatusCode);
    }

    [Fact]
    public async Task Engineers_manage_sensors_and_every_change_is_audited()
    {
        var (admin, op, eng) = await SiteWithTeamAsync("audit");

        var id = await AddSensorAsync(eng, "Oven");
        var edited = await eng.Http.PutAsJsonAsync($"/update-sensor/audit-eng/{id}", new
        {
            name = "Oven 1",
            details = new { endpointUrl = "opc.tcp://127.0.0.1:1", nodeId = "ns=2;i=2", threshold = new { min = 0, max = 100, warning = 70, critical = 95 } },
        });
        edited.EnsureSuccessStatusCode();

        // The whole site sees the sensor
        Assert.Contains(id, (await op.GetJsonAsync("/sensors/audit-op")).GetProperty("sensors").EnumerateObject().Select(p => p.Name));

        Assert.Equal(HttpStatusCode.OK, (await eng.Http.DeleteAsync($"/delete-sensor/audit-eng/{id}")).StatusCode);

        var log = (await admin.GetJsonAsync("/audit-log")).EnumerateArray().ToList();
        Assert.Contains(log, e => e.GetProperty("action").GetString() == "sensor.create" && e.GetProperty("userId").GetString() == "audit-eng");
        Assert.Contains(log, e => e.GetProperty("action").GetString() == "sensor.delete");
        var update = Assert.Single(log, e => e.GetProperty("action").GetString() == "sensor.update");
        var changes = update.GetProperty("details").GetProperty("changes").EnumerateArray()
            .Select(c => $"{c.GetProperty("field").GetString()}: {c.GetProperty("from").GetString()} -> {c.GetProperty("to").GetString()}");
        Assert.Equal(["name: Oven -> Oven 1", "threshold.critical: 90 -> 95"], changes);
    }

    [Fact]
    public async Task Another_site_cannot_read_change_or_delete_the_sensors()
    {
        var owner = await api.RegisterAsync("iso-owner");
        var id = await AddSensorAsync(owner, "Secret line");
        var intruder = await api.RegisterAsync("iso-intruder");

        Assert.Empty((await intruder.GetJsonAsync("/sensors/iso-intruder")).GetProperty("sensors").EnumerateObject());
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.Http.GetAsync($"/sensor-history/iso-intruder/{id}")).StatusCode);
        Assert.Equal(0, (await intruder.GetJsonAsync($"/sensor-data/iso-intruder/{id}")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound,
            (await intruder.Http.PutAsJsonAsync($"/update-sensor/iso-intruder/{id}", new { name = "hacked", details = new { } })).StatusCode);
        await intruder.Http.DeleteAsync($"/delete-sensor/iso-intruder/{id}");

        Assert.Equal("Secret line", await api.QueryOwnerAsync<string>("SELECT name FROM sensors WHERE id = @id", new { id = Guid.Parse(id) }));
    }

    [Fact]
    public async Task Alarms_of_another_site_cannot_be_seen_or_acknowledged()
    {
        var owner = await api.RegisterAsync("alarm-owner");
        var sensorId = Guid.Parse(await AddSensorAsync(owner, "Pump"));
        var alarmId = await api.QueryOwnerAsync<Guid>(
            "INSERT INTO alarms (sensor_id, condition, priority, limit_value, value, raised_at) VALUES (@sensorId, 'HI', 'warning', 70, 75, now()) RETURNING id",
            new { sensorId });
        var intruder = await api.RegisterAsync("alarm-intruder");

        Assert.Equal(0, (await intruder.GetJsonAsync("/alarms/alarm-intruder")).GetArrayLength());
        var ack = await intruder.Http.PostAsJsonAsync("/acknowledge-alarms/alarm-intruder", new { alarmIds = new[] { alarmId } });
        Assert.Equal(0, (await ack.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("alarms").GetArrayLength());

        var mine = await owner.Http.PostAsJsonAsync("/acknowledge-alarms/alarm-owner", new { alarmIds = new[] { alarmId } });
        var acked = Assert.Single((await mine.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("alarms").EnumerateArray());
        Assert.Equal("active-acked", acked.GetProperty("state").GetString());
        Assert.Equal("alarm-owner", acked.GetProperty("ackedBy").GetString());
    }

    [Fact]
    public async Task Operators_do_not_receive_api_keys()
    {
        var (admin, op, eng) = await SiteWithTeamAsync("secret");
        var siteId = await api.QueryOwnerAsync<Guid>("SELECT site_id FROM users WHERE id = 'secret-admin'");
        await api.ExecuteOwnerAsync(
            "INSERT INTO sensors (site_id, user_id, name, type, details) VALUES (@siteId, 'secret-admin', 'Yard', 'WeatherApi', '{\"location\": \"Athens\", \"apiKey\": \"top-secret\"}')",
            new { siteId });

        Assert.DoesNotContain("top-secret", (await op.GetJsonAsync("/sensors/secret-op")).GetRawText());
        Assert.Contains("top-secret", (await eng.GetJsonAsync("/sensors/secret-eng")).GetRawText());
        Assert.Contains("top-secret", (await admin.GetJsonAsync("/sensors/secret-admin")).GetRawText());
    }

    [Fact]
    public async Task Removed_users_and_role_changes_apply_immediately()
    {
        var (admin, op, eng) = await SiteWithTeamAsync("revoke");

        (await admin.Http.PutAsJsonAsync("/site-users/revoke-eng", new { role = "operator" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await eng.Http.PostAsJsonAsync("/register-sensor", OpcUaSensor("x", "revoke-eng"))).StatusCode);

        (await admin.Http.DeleteAsync("/site-users/revoke-op")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await op.Http.GetAsync("/sensors/revoke-op")).StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_lock_themselves_out()
    {
        var admin = await api.RegisterAsync("self-admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Http.PutAsJsonAsync("/site-users/self-admin", new { role = "operator" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Http.DeleteAsync("/site-users/self-admin")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.Http.PostAsJsonAsync("/site-users/self-admin/reset-password", new { password = "whatever-123" })).StatusCode);
    }

    [Fact]
    public async Task Password_reset_gives_a_new_temporary_password()
    {
        var (admin, _, _) = await SiteWithTeamAsync("reset");

        (await admin.Http.PostAsJsonAsync("/site-users/reset-op/reset-password", new { password = "second-temp" })).EnsureSuccessStatusCode();

        var again = new ApiClient(api.Factory.CreateClient(), "reset-op");
        await Assert.ThrowsAsync<InvalidOperationException>(() => again.LoginAsync("new-password-1"));
        await again.LoginAsync("second-temp");
        Assert.True((await again.GetJsonAsync("/profile?id=reset-op")).GetProperty("mustChangePassword").GetBoolean());
    }

    [Fact]
    public async Task Migrations_run_once_and_the_backend_account_cannot_change_the_schema()
    {
        var second = await api.RunMigrationsAsync();

        Assert.Equal(0, second.ExitCode);
        Assert.DoesNotContain("Applying", second.Stdout);
        Assert.Equal(3L, await api.QueryOwnerAsync<long>("SELECT count(*) FROM schema_migrations"));

        var appConnection = new Npgsql.NpgsqlConnectionStringBuilder(api.OwnerConnectionString) { Username = ApiFixture.AppUser, Password = "app-password" };
        await using var conn = new Npgsql.NpgsqlConnection(appConnection.ConnectionString);
        await conn.OpenAsync();
        await using var create = new Npgsql.NpgsqlCommand("CREATE TABLE hack (x int)", conn);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => create.ExecuteNonQueryAsync());
    }
}
