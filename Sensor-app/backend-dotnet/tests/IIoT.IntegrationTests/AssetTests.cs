using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace IIoT.IntegrationTests;

/// <summary>The plant hierarchy (areas, equipment, sensors on them): rules, roles and site isolation.</summary>
[Collection(nameof(ApiCollection))]
public sealed class AssetTests(ApiFixture api)
{
    private static async Task<HttpResponseMessage> PostAssetAsync(ApiClient client, string name, string kind, string? parentId = null) =>
        await client.Http.PostAsJsonAsync("/assets", new { name, kind, parentId });

    private static async Task<string> AddAssetAsync(ApiClient client, string name, string kind, string? parentId = null)
    {
        var response = await PostAssetAsync(client, name, kind, parentId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private static object EditedSensor(string name, string? assetId) => new
    {
        name,
        assetId,
        details = new { endpointUrl = "opc.tcp://127.0.0.1:1", nodeId = "ns=2;i=2", threshold = new { min = 0, max = 100, warning = 70, critical = 90 } },
    };

    private static string? AssetOf(JsonElement sensors, string sensorId) =>
        sensors.GetProperty("sensors").GetProperty(sensorId).GetProperty("assetId").GetString();

    [Fact]
    public async Task Engineers_build_the_plant_and_place_sensors_on_it()
    {
        var (admin, op, eng) = await api.SiteWithTeamAsync("plant");

        var hall = await AddAssetAsync(eng, "Hall A", "area");
        var line = await AddAssetAsync(eng, "Line 1", "area", hall);
        var oven = await AddAssetAsync(eng, "Oven", "equipment", line);
        var sensor = await ApiFixture.AddSensorAsync(eng, "Oven temperature", oven);

        // Everyone in the site sees the tree and where the sensor is
        var tree = (await op.GetJsonAsync("/assets")).EnumerateArray()
            .ToDictionary(a => a.GetProperty("name").GetString()!, a => a);
        Assert.Equal(["Hall A", "Line 1", "Oven"], tree.Keys.Order());
        Assert.Equal(line, tree["Oven"].GetProperty("parentId").GetString());
        Assert.Equal("equipment", tree["Oven"].GetProperty("kind").GetString());
        Assert.Equal(JsonValueKind.Null, tree["Hall A"].GetProperty("parentId").ValueKind);
        Assert.Equal(oven, AssetOf(await op.GetJsonAsync("/sensors/plant-op"), sensor));

        // Operators only look
        Assert.Equal(HttpStatusCode.Forbidden, (await PostAssetAsync(op, "Hall B", "area")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await op.Http.DeleteAsync($"/assets/{oven}")).StatusCode);

        // Move the oven straight under the hall, then take the sensor off it
        (await eng.Http.PutAsJsonAsync($"/assets/{oven}", new { name = "Oven 1", parentId = hall })).EnsureSuccessStatusCode();
        (await eng.Http.PutAsJsonAsync($"/update-sensor/plant-eng/{sensor}", EditedSensor("Oven temperature", null))).EnsureSuccessStatusCode();
        Assert.Null(AssetOf(await eng.GetJsonAsync("/sensors/plant-eng"), sensor));

        var log = (await admin.GetJsonAsync("/audit-log")).EnumerateArray().ToList();
        Assert.Equal(3, log.Count(e => e.GetProperty("action").GetString() == "asset.create"));
        var moved = Assert.Single(log, e => e.GetProperty("action").GetString() == "asset.update");
        Assert.Equal(["name: Oven -> Oven 1", "parent: Line 1 -> Hall A"], Changes(moved));
        var unassigned = Assert.Single(log, e => e.GetProperty("action").GetString() == "sensor.update");
        Assert.Equal(["asset: Oven 1 -> "], Changes(unassigned));
    }

    [Fact]
    public async Task The_tree_stays_consistent()
    {
        var eng = await api.RegisterAsync("rules-admin");
        var hall = await AddAssetAsync(eng, "Hall", "area");
        var line = await AddAssetAsync(eng, "Line", "area", hall);
        var pump = await AddAssetAsync(eng, "Pump", "equipment", line);

        // Equipment holds sensors, not other assets
        Assert.Equal(HttpStatusCode.BadRequest, (await PostAssetAsync(eng, "Motor", "equipment", pump)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PostAssetAsync(eng, "Zone", "building")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PostAssetAsync(eng, "  ", "area")).StatusCode);
        // Same name next to each other (case-insensitive), also at the top level
        Assert.Equal(HttpStatusCode.Conflict, (await PostAssetAsync(eng, "pump", "equipment", line)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await PostAssetAsync(eng, "HALL", "area")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostAssetAsync(eng, "Pump", "equipment", hall)).StatusCode);
        // No loops
        Assert.Equal(HttpStatusCode.BadRequest, (await eng.Http.PutAsJsonAsync($"/assets/{hall}", new { name = "Hall", parentId = line })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await eng.Http.PutAsJsonAsync($"/assets/{hall}", new { name = "Hall", parentId = hall })).StatusCode);
        // An area with something in it cannot be deleted
        Assert.Equal(HttpStatusCode.Conflict, (await eng.Http.DeleteAsync($"/assets/{line}")).StatusCode);

        // Deleting equipment keeps its sensors, unassigned
        var sensor = await ApiFixture.AddSensorAsync(eng, "Pressure", pump);
        (await eng.Http.DeleteAsync($"/assets/{pump}")).EnsureSuccessStatusCode();
        (await eng.Http.DeleteAsync($"/assets/{line}")).EnsureSuccessStatusCode();
        Assert.Null(AssetOf(await eng.GetJsonAsync("/sensors/rules-admin"), sensor));
    }

    [Fact]
    public async Task Another_site_cannot_see_use_change_or_delete_the_assets()
    {
        var owner = await api.RegisterAsync("asset-owner");
        var hall = await AddAssetAsync(owner, "Secret hall", "area");
        var intruder = await api.RegisterAsync("asset-intruder");
        var mySensor = await ApiFixture.AddSensorAsync(intruder, "Mine");

        Assert.Equal(0, (await intruder.GetJsonAsync("/assets")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.Http.PutAsJsonAsync($"/assets/{hall}", new { name = "hacked" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.Http.DeleteAsync($"/assets/{hall}")).StatusCode);
        // Nor hang their own assets or sensors under it
        Assert.Equal(HttpStatusCode.BadRequest, (await PostAssetAsync(intruder, "Spy", "equipment", hall)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await intruder.Http.PostAsJsonAsync("/register-sensor", ApiFixture.OpcUaSensor("Spy", "asset-intruder", assetId: hall))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await intruder.Http.PutAsJsonAsync($"/update-sensor/asset-intruder/{mySensor}", EditedSensor("Mine", hall))).StatusCode);

        Assert.Equal("Secret hall", await api.QueryOwnerAsync<string>("SELECT name FROM assets WHERE id = @id", new { id = Guid.Parse(hall) }));
    }

    [Fact]
    public async Task The_database_refuses_links_between_sites()
    {
        var owner = await api.RegisterAsync("fk-owner");
        var hall = Guid.Parse(await AddAssetAsync(owner, "Hall", "area"));
        var other = await api.RegisterAsync("fk-other");
        var sensor = Guid.Parse(await ApiFixture.AddSensorAsync(other, "Elsewhere"));

        // Even a bug in the API could not put another site's sensor or asset into this hall
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() =>
            api.ExecuteOwnerAsync("UPDATE sensors SET asset_id = @hall WHERE id = @sensor", new { hall, sensor }));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() =>
            api.ExecuteOwnerAsync(
                "INSERT INTO assets (site_id, parent_id, name, kind) SELECT site_id, @hall, 'Spy', 'area' FROM users WHERE id = 'fk-other'",
                new { hall }));
    }

    private static string[] Changes(JsonElement entry) => entry.GetProperty("details").GetProperty("changes").EnumerateArray()
        .Select(c => $"{c.GetProperty("field").GetString()}: {c.GetProperty("from").GetString()} -> {c.GetProperty("to").GetString()}")
        .ToArray();
}
