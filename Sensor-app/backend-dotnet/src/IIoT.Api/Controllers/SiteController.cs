using System.Text.Json.Nodes;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record CreateUserRequest(string? Id, string? Password, string? Role);
public sealed record UpdateRoleRequest(string? Role);
public sealed record RenameSiteRequest(string? Name);

/// <summary>
/// The site's users and name (admin only). An admin cannot change
/// their own role or remove themselves, so a site always keeps at least one admin.
/// </summary>
[ApiController]
[Authorize]
[RequireRole(Roles.Admin)]
public sealed class SiteController(UserRepository users, PasswordService passwords, AuditRepository audit) : ControllerBase
{
    private const int MinPasswordLength = 8;
    private const int MaxSiteNameLength = 100;

    [HttpGet("/site-users")]
    public async Task<IActionResult> GetUsers()
    {
        var list = await users.GetSiteUsersAsync(this.Member().SiteId);
        return Ok(list.Select(u => new
        {
            id = u.Id,
            role = u.Role,
            mustChangePassword = u.MustChangePassword,
            createdAt = new DateTimeOffset(DateTime.SpecifyKind(u.CreatedAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
        }));
    }

    /// <summary>Adds a user with a temporary password, which they must change at the first sign-in.</summary>
    [HttpPost("/site-users")]
    public async Task<IActionResult> CreateUser(CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || request.Id.Trim().Length > AuthController.MaxUserIdLength)
        {
            return BadRequest(new { success = false, error = $"ID is required (at most {AuthController.MaxUserIdLength} characters)" });
        }
        if (request.Password is not { Length: >= MinPasswordLength })
        {
            return BadRequest(new { success = false, error = $"The temporary password needs at least {MinPasswordLength} characters" });
        }
        if (!Roles.IsValid(request.Role))
        {
            return BadRequest(new { success = false, error = "Unknown role" });
        }

        var me = this.Member();
        var id = request.Id.Trim();
        if (!await users.CreateMemberAsync(me.SiteId, id, passwords.Hash(request.Password), request.Role!))
        {
            return Conflict(new { success = false, error = "This ID is already taken" });
        }

        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
            AuditActions.UserCreate, "user", id, id, new JsonObject { ["role"] = request.Role }));
        return Ok(new { success = true });
    }

    [HttpPut("/site-users/{memberId}")]
    public async Task<IActionResult> UpdateRole(string memberId, UpdateRoleRequest request)
    {
        var me = this.Member();
        if (!Roles.IsValid(request.Role))
        {
            return BadRequest(new { success = false, error = "Unknown role" });
        }
        if (memberId == me.UserId)
        {
            return BadRequest(new { success = false, error = "You cannot change your own role" });
        }
        if (await users.UpdateRoleAsync(me.SiteId, memberId, request.Role!) is not { } previous)
        {
            return NotFound(new { success = false, error = "User not found" });
        }

        if (previous != request.Role)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.UserRole, "user", memberId, memberId,
                new JsonObject { ["changes"] = new JsonArray(AuditDiff.Change("role", previous, request.Role)) }));
        }
        return Ok(new { success = true });
    }

    /// <summary>Removes the user. Their sensors stay in the site; their audit entries are kept.</summary>
    [HttpDelete("/site-users/{memberId}")]
    public async Task<IActionResult> DeleteUser(string memberId)
    {
        var me = this.Member();
        if (memberId == me.UserId)
        {
            return BadRequest(new { success = false, error = "You cannot remove yourself" });
        }
        if (!await users.DeleteAsync(me.SiteId, memberId))
        {
            return NotFound(new { success = false, error = "User not found" });
        }

        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.UserDelete, "user", memberId, memberId));
        return Ok(new { success = true });
    }

    [HttpPut("/site")]
    public async Task<IActionResult> RenameSite(RenameSiteRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > MaxSiteNameLength)
        {
            return BadRequest(new { success = false, error = $"Site name is required (at most {MaxSiteNameLength} characters)" });
        }

        var me = this.Member();
        await users.RenameSiteAsync(me.SiteId, name);
        if (name != me.SiteName)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.SiteRename, "site", me.SiteId.ToString(), name,
                new JsonObject { ["changes"] = new JsonArray(AuditDiff.Change("name", me.SiteName, name)) }));
        }
        return Ok(new { success = true });
    }
}
