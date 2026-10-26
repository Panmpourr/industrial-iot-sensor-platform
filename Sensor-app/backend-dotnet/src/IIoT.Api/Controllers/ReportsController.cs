using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

/// <summary>Figures for the daily / weekly / monthly reports of the signed-in user's site.</summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class ReportsController(ReportRepository reports) : ControllerBase
{
    /// <summary>Min / average / max, availability and time outside limits of every sensor in [from, to) (default: the last 24 hours).</summary>
    [HttpGet("/sensor-stats")]
    public async Task<IActionResult> GetSensorStats([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to)
    {
        var now = DateTimeOffset.UtcNow;
        var end = to ?? now;
        var start = from ?? end.AddDays(-1);
        if (start >= end || end - start > ReportRepository.MaxSpan)
        {
            return BadRequest(new { error = "'from' must be before 'to' and the period at most 366 days" });
        }

        var source = ReportRepository.SourceFor(start, now);
        var sensors = await reports.GetSensorStatsAsync(this.Member().SiteId, start, end, source, now);
        return Ok(new
        {
            from = start.ToUnixTimeMilliseconds(),
            to = end.ToUnixTimeMilliseconds(),
            source = source.ToString().ToLowerInvariant(),
            sensors,
        });
    }
}
