using IIoT.Api.Alarms;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record AcknowledgeRequest(Guid[]? AlarmIds);

/// <summary>Alarm summary, alarm journal and acknowledgement. Only the user's own sensors.</summary>
[ApiController]
[Authorize]
public sealed class AlarmsController(AlarmRepository alarms, AlarmService service) : ControllerBase
{
    private const int MaxHistory = 5000;
    private const int MaxAckBatch = 1000;

    /// <summary>Alarms that are active or not yet acknowledged, newest first.</summary>
    [HttpGet("/alarms/{userId}")]
    public async Task<IActionResult> GetOpen(string userId)
    {
        if (userId != User.UserId())
        {
            return Forbid();
        }

        var open = await alarms.GetOpenAsync(userId);
        return Ok(open.Select(AlarmView.From));
    }

    /// <summary>Alarms raised in [from, to) (default: the last 24 hours), optionally for one sensor.</summary>
    [HttpGet("/alarm-history/{userId}")]
    public async Task<IActionResult> GetHistory(string userId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? sensorId, [FromQuery] int? limit)
    {
        if (userId != User.UserId())
        {
            return Forbid();
        }

        var end = to ?? DateTimeOffset.UtcNow;
        var start = from ?? end.AddDays(-1);
        if (start >= end)
        {
            return BadRequest(new { error = "'from' must be before 'to'" });
        }

        var rows = await alarms.GetHistoryAsync(userId, start, end, sensorId, Math.Clamp(limit ?? MaxHistory, 1, MaxHistory));
        return Ok(rows.Select(AlarmView.From));
    }

    [HttpPost("/acknowledge-alarms/{userId}")]
    public async Task<IActionResult> Acknowledge(string userId, AcknowledgeRequest request)
    {
        if (userId != User.UserId())
        {
            return Forbid();
        }
        if (request.AlarmIds is not { Length: > 0 and <= MaxAckBatch } ids)
        {
            return BadRequest(new { success = false, error = $"Send between 1 and {MaxAckBatch} alarm ids" });
        }

        var acknowledged = await service.AcknowledgeAsync(userId, ids);
        return Ok(new { success = true, alarms = acknowledged });
    }
}
