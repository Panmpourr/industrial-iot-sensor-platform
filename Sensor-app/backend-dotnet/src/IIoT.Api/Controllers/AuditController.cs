using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

/// <summary>The site's audit trail (engineer and admin).</summary>
[ApiController]
[Authorize]
[RequireRole(Roles.Engineer)]
public sealed class AuditController(AuditRepository audit) : ControllerBase
{
    private const int MaxEntries = 5000;

    /// <summary>Entries in [from, to) (default: the last 7 days), newest first.</summary>
    [HttpGet("/audit-log")]
    public async Task<IActionResult> GetAuditLog([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int? limit)
    {
        var end = to ?? DateTimeOffset.UtcNow;
        var start = from ?? end.AddDays(-7);
        if (start >= end)
        {
            return BadRequest(new { error = "'from' must be before 'to'" });
        }

        return Ok(await audit.GetAsync(this.Member().SiteId, start, end, Math.Clamp(limit ?? MaxEntries, 1, MaxEntries)));
    }
}
