using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using IIoT.Api.Sensors;
using IIoT.Api.Sensors.Connectors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record RegisterSensorRequest(string? Name, string? Type, JsonElement Details, string? UserId, Guid? AssetId);
public sealed record UpdateSensorRequest(string? Name, JsonElement Details, Guid? AssetId);
public sealed record TestOpcUaRequest(string? EndpointUrl);

/// <summary>
/// Sensor management and data access for the signed-in user's site. Every role can read;
/// adding, changing and deleting sensors needs the engineer role and is written to the audit trail.
/// </summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class SensorsController(
    SensorRepository sensors,
    AssetRepository assets,
    SensorManager manager,
    OpcUaClient opcUa,
    AuditRepository audit,
    ILogger<SensorsController> logger) : ControllerBase
{
    private const int DefaultReadingLimit = 1000;
    private const int MaxReadingLimit = 10_000;

    [RequireRole(Roles.Engineer)]
    [HttpPost("/register-sensor")]
    public async Task<IActionResult> RegisterSensor(RegisterSensorRequest request, CancellationToken ct)
    {
        var me = this.Member();
        if (request.UserId != me.UserId)
        {
            return Forbid();
        }
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Type))
        {
            return BadRequest(new { success = false, error = "Sensor name and type are required" });
        }
        if (SensorTypes.Known(request.Type) is not { } type)
        {
            return BadRequest(new { success = false, error = "Unknown sensor type" });
        }
        if (await AssetError(me.SiteId, request.AssetId) is { } assetError)
        {
            return assetError;
        }

        var id = await sensors.CreateAsync(me.SiteId, me.UserId, request.Name, type, request.Details, request.AssetId);
        var sensor = new SensorRecord(id, me.SiteId, me.UserId, request.Name, type, request.Details, request.AssetId);

        try
        {
            await manager.StartSensorAsync(sensor, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Sensor registration failed for {Type}: {Message}", sensor.Type, ex.Message);
            await sensors.DeleteAsync(sensor.SiteId, sensor.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                error = ex.Message,
                details = sensor.Type == SensorTypes.Ttn ? "Please verify your TTN credentials and configuration" : null,
            });
        }

        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
            AuditActions.SensorCreate, "sensor", id.ToString(), sensor.Name, new JsonObject { ["type"] = type }));
        return Ok(new { success = true, sensorId = id, webhookUrl = (string?)null });
    }

    /// <summary>
    /// Renames a sensor and/or changes its settings (connection, limits, location). The connector
    /// is restarted with the new settings first; if they are invalid, nothing is saved and the old
    /// connector keeps running. A device that is only unreachable is accepted, like on registration:
    /// the connector keeps retrying until it comes back.
    /// </summary>
    [RequireRole(Roles.Engineer)]
    [HttpPut("/update-sensor/{userId}/{sensorId}")]
    public async Task<IActionResult> UpdateSensor(string userId, string sensorId, UpdateSensorRequest request, CancellationToken ct)
    {
        var me = this.Member();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Details.ValueKind != JsonValueKind.Object)
        {
            return BadRequest(new { success = false, error = "Sensor name and details are required" });
        }
        if (!Guid.TryParse(sensorId, out var id) || await sensors.GetAsync(me.SiteId, id) is not { } existing)
        {
            return NotFound(new { success = false, error = "Sensor not found" });
        }
        if (await AssetError(me.SiteId, request.AssetId) is { } assetError)
        {
            return assetError;
        }

        var updated = existing with { Name = request.Name.Trim(), Details = request.Details, AssetId = request.AssetId };
        try
        {
            await manager.StartSensorAsync(updated, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Sensor update failed for {Type}: {Message}", existing.Type, ex.Message);
            return StatusCode(StatusCodes.Status500InternalServerError, new { success = false, error = ex.Message });
        }

        try
        {
            await sensors.UpdateAsync(me.SiteId, id, updated.Name, updated.Details, updated.AssetId);
        }
        catch
        {
            // Keep what is running in line with what is stored
            await manager.StartSensorAsync(existing, CancellationToken.None);
            throw;
        }

        var changes = AuditDiff.Changes(existing.Details, updated.Details);
        if (existing.Name != updated.Name)
        {
            changes.Insert(0, AuditDiff.Change("name", existing.Name, updated.Name));
        }
        if (existing.AssetId != updated.AssetId)
        {
            changes.Insert(0, AuditDiff.Change("asset",
                await AssetName(me.SiteId, existing.AssetId), await AssetName(me.SiteId, updated.AssetId)));
        }
        if (changes.Count > 0)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
                AuditActions.SensorUpdate, "sensor", id.ToString(), updated.Name, new JsonObject { ["changes"] = changes }));
        }
        return Ok(new { success = true });
    }

    [RequireRole(Roles.Engineer)]
    [HttpDelete("/delete-sensor/{userId}/{sensorId}")]
    public async Task<IActionResult> DeleteSensor(string userId, string sensorId)
    {
        var me = this.Member();
        if (Guid.TryParse(sensorId, out var id) && await sensors.GetAsync(me.SiteId, id) is { } sensor)
        {
            await manager.StopSensorAsync(id);
            await sensors.DeleteAsync(me.SiteId, id);
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
                AuditActions.SensorDelete, "sensor", id.ToString(), sensor.Name, new JsonObject { ["type"] = sensor.Type }));
        }
        return Ok(new { success = true });
    }

    [HttpGet("/sensors/{userId}")]
    public async Task<IActionResult> GetSensors(string userId)
    {
        var me = this.Member();
        // Operators cannot edit sensors, so they never need the API keys
        var showSecrets = Roles.AtLeast(me.Role, Roles.Engineer);
        var list = await sensors.GetBySiteAsync(me.SiteId);
        var map = list.ToDictionary(
            s => s.Id.ToString(),
            s => new { name = s.Name, type = s.Type, details = showSecrets ? s.Details : WithoutSecrets(s.Details), userId = s.CreatedBy, assetId = s.AssetId });
        return Ok(new { success = true, sensors = map });
    }

    [HttpGet("/sensor-data/{userId}/{sensorId}")]
    public async Task<IActionResult> GetSensorData(string userId, string sensorId, [FromQuery] int? limit)
    {
        if (!Guid.TryParse(sensorId, out var id))
        {
            return JsonArray([]);
        }

        var take = Math.Clamp(limit ?? DefaultReadingLimit, 1, MaxReadingLimit);
        return JsonArray(await sensors.GetReadingsJsonAsync(this.Member().SiteId, id, take));
    }

    /// <summary>
    /// Min / average / max per time bucket for a chart. The bucket size follows the range
    /// (e.g. 10 s for one hour, 2 h for a month), so the response stays a few hundred points.
    /// Defaults to the last hour.
    /// </summary>
    [HttpGet("/sensor-history/{userId}/{sensorId}")]
    public async Task<IActionResult> GetSensorHistory(
        string userId, string sensorId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to)
    {
        if (!Guid.TryParse(sensorId, out var id) || !await sensors.InSiteAsync(this.Member().SiteId, id))
        {
            return NotFound(new { error = "Sensor not found" });
        }

        var end = to ?? DateTimeOffset.UtcNow;
        var start = from ?? end.AddHours(-1);
        if (start >= end || end - start > HistoryResolution.MaxSpan)
        {
            return BadRequest(new { error = "'from' must be before 'to' and the range at most 5 years" });
        }

        var plan = HistoryResolution.Choose(end - start);
        var points = await sensors.GetHistoryAsync(id, start, end, plan);
        return Ok(new
        {
            from = start.ToUnixTimeMilliseconds(),
            to = end.ToUnixTimeMilliseconds(),
            bucketSeconds = (int)plan.Bucket.TotalSeconds,
            source = plan.Source.ToString().ToLowerInvariant(),
            points,
        });
    }

    [HttpGet("/export-sensor-data/{userId}/{sensorId}")]
    public async Task<IActionResult> ExportSensorData(string userId, string sensorId)
    {
        var readings = Guid.TryParse(sensorId, out var id)
            ? await sensors.GetReadingsJsonAsync(this.Member().SiteId, id, limit: null)
            : [];
        if (readings.Count == 0)
        {
            return NotFound(new { error = "No data found for this sensor" });
        }

        var csv = new StringBuilder();
        foreach (var json in readings)
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            var time = r.TryGetProperty("timestamp", out var t) && t.TryGetInt64(out var ms)
                ? DateTimeOffset.FromUnixTimeMilliseconds(ms).ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture)
                : "";
            var value = r.TryGetProperty("value", out var v) && v.ValueKind != JsonValueKind.Null ? CsvValue(v) : "";
            var status = r.TryGetProperty("status", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : "";
            csv.Append(time).Append(',').Append(value).Append(',').Append(status).Append('\n');
        }

        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"sensor_{id}_data.csv");
    }

    [RequireRole(Roles.Engineer)]
    [HttpPost("/test-opcua-connection")]
    public async Task<IActionResult> TestOpcUaConnection(TestOpcUaRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.EndpointUrl))
        {
            return BadRequest(new { success = false, error = "endpointUrl is required" });
        }

        try
        {
            var endpoints = await opcUa.GetEndpointsAsync(request.EndpointUrl, ct);
            return Ok(new
            {
                success = true,
                message = "Connection successful",
                endpoints = endpoints.Select(e => new
                {
                    endpointUrl = e.EndpointUrl,
                    securityMode = e.SecurityMode.ToString(),
                    securityPolicy = e.SecurityPolicyUri,
                }),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { success = false, error = ex.Message });
        }
    }

    /// <summary>A sensor can only be placed on an asset of its own site; <c>null</c> means unassigned.</summary>
    private async Task<IActionResult?> AssetError(Guid siteId, Guid? assetId) =>
        assetId is { } id && await assets.GetAsync(siteId, id) is null
            ? BadRequest(new { success = false, error = "Asset not found" })
            : null;

    private async Task<string?> AssetName(Guid siteId, Guid? assetId) =>
        assetId is { } id ? (await assets.GetAsync(siteId, id))?.Name : null;

    private static readonly string[] SecretSettings = ["apiKey"];

    private static JsonElement WithoutSecrets(JsonElement details)
    {
        if (details.ValueKind != JsonValueKind.Object || !SecretSettings.Any(n => details.TryGetProperty(n, out _)))
        {
            return details;
        }
        var copy = JsonNode.Parse(details.GetRawText())!.AsObject();
        foreach (var name in SecretSettings)
        {
            copy.Remove(name);
        }
        return JsonSerializer.SerializeToElement(copy);
    }

    /// <summary>Returns stored JSON payloads unchanged, as a JSON array.</summary>
    private ContentResult JsonArray(IReadOnlyList<string> items) =>
        Content($"[{string.Join(',', items)}]", "application/json", Encoding.UTF8);

    private static string CsvValue(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString()!.Replace(",", " "),
        _ => v.GetRawText(),
    };
}
