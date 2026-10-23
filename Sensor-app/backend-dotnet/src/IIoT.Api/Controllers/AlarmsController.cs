using System.Text.Json.Nodes;
using IIoT.Api.Alarms;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record AcknowledgeRequest(Guid[]? AlarmIds);

/// <summary>Alarm summary, alarm journal and acknowledgement for the signed-in user's site. Every role may acknowledge.</summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class AlarmsController(AlarmRepository alarms, AlarmService service, SensorRepository sensors, AuditRepository audit)
    : ControllerBase
{
    private const int MaxHistory = 5000;
    private const int MaxAckBatch = 1000;

    /// <summary>Alarms that are active or not yet acknowledged, newest first.</summary>
    [HttpGet("/alarms/{userId}")]
    public async Task<IActionResult> GetOpen(string userId)
    {
        var open = await alarms.GetOpenAsync(this.Member().SiteId);
        return Ok(open.Select(AlarmView.From));
    }

    /// <summary>Alarms raised in [from, to) (default: the last 24 hours), optionally for one sensor.</summary>
    [HttpGet("/alarm-history/{userId}")]
    public async Task<IActionResult> GetHistory(string userId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? sensorId, [FromQuery] int? limit)
    {
        var end = to ?? DateTimeOffset.UtcNow;
        var start = from ?? end.AddDays(-1);
        if (start >= end)
        {
            return BadRequest(new { error = "'from' must be before 'to'" });
        }

        var rows = await alarms.GetHistoryAsync(this.Member().SiteId, start, end, sensorId, Math.Clamp(limit ?? MaxHistory, 1, MaxHistory));
        return Ok(rows.Select(AlarmView.From));
    }

    [HttpPost("/acknowledge-alarms/{userId}")]
    public async Task<IActionResult> Acknowledge(string userId, AcknowledgeRequest request)
    {
        if (request.AlarmIds is not { Length: > 0 and <= MaxAckBatch } ids)
        {
            return BadRequest(new { success = false, error = $"Send between 1 and {MaxAckBatch} alarm ids" });
        }

        var me = this.Member();
        var acknowledged = await service.AcknowledgeAsync(me.SiteId, me.UserId, ids);

        var names = (await sensors.GetBySiteAsync(me.SiteId)).ToDictionary(s => s.Id, s => s.Name);
        await audit.LogAsync(me.SiteId, me.UserId, acknowledged.Select(a => new AuditEntry(
            AuditActions.AlarmAcknowledge, "alarm", a.Id.ToString(), names.GetValueOrDefault(a.SensorId),
            new JsonObject { ["condition"] = a.Condition, ["priority"] = a.Priority })).ToList());

        return Ok(new { success = true, alarms = acknowledged });
    }
}
