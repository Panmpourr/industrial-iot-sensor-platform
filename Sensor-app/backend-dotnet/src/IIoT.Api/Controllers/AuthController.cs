using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record CredentialsRequest(string? Id, string? Password);
public sealed record ChangePasswordRequest(string? Id, string? OldPassword, string? NewPassword);

[ApiController]
public sealed class AuthController(
    UserRepository users,
    PasswordService passwords,
    JwtTokenService tokens,
    AuditRepository audit) : ControllerBase
{
    public const int MaxUserIdLength = 50;

    /// <summary>Creates a new site with the new user as its admin. Members of an existing site are added by its admin.</summary>
    [HttpPost("/register")]
    public async Task<IActionResult> Register(CredentialsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest(new { success = false, error = "ID and password are required" });
        }
        if (request.Id.Length > MaxUserIdLength)
        {
            return BadRequest(new { success = false, error = $"ID must be at most {MaxUserIdLength} characters" });
        }

        var created = await users.CreateWithSiteAsync(request.Id, passwords.Hash(request.Password), $"{request.Id}'s site");
        return created
            ? Ok(new { success = true })
            : Conflict(new { success = false, error = "This ID is already taken" });
    }

    [HttpPost("/login")]
    public async Task<IActionResult> Login(CredentialsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrEmpty(request.Password))
        {
            return Ok(new { success = false });
        }

        if (!await CheckPasswordAsync(request.Id, request.Password) || await users.GetMemberAsync(request.Id) is not { } member)
        {
            return Ok(new { success = false });
        }

        await audit.LogAsync(member.SiteId, member.UserId, new AuditEntry(AuditActions.Login, "user", member.UserId, member.UserId));
        return Ok(new { success = true, token = tokens.CreateToken(request.Id), mustChangePassword = member.MustChangePassword });
    }

    [Authorize]
    [RequireRole(AllowPendingPasswordChange = true)]
    [HttpPost("/change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var me = this.Member();
        if (request.Id != me.UserId)
        {
            return Forbid();
        }
        if (string.IsNullOrEmpty(request.OldPassword) || string.IsNullOrEmpty(request.NewPassword))
        {
            return Ok(new { success = false });
        }
        if (!await CheckPasswordAsync(me.UserId, request.OldPassword))
        {
            return Ok(new { success = false });
        }

        await users.UpdatePasswordHashAsync(me.UserId, passwords.Hash(request.NewPassword));
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.PasswordChange, "user", me.UserId, me.UserId));
        return Ok(new { success = true });
    }

    /// <summary>The signed-in user, their site and role (the dashboard shows or hides actions by role).</summary>
    [Authorize]
    [RequireRole(AllowPendingPasswordChange = true)]
    [HttpGet("/profile")]
    public IActionResult Profile([FromQuery] string? id)
    {
        var me = this.Member();
        if (id != me.UserId)
        {
            return Forbid();
        }

        return Ok(new
        {
            id = me.UserId,
            role = me.Role,
            siteId = me.SiteId,
            siteName = me.SiteName,
            mustChangePassword = me.MustChangePassword,
        });
    }

    /// <summary>Verifies the password and transparently upgrades legacy (plain-text) passwords.</summary>
    private async Task<bool> CheckPasswordAsync(string userId, string password)
    {
        var stored = await users.GetPasswordHashAsync(userId);
        if (stored is null)
        {
            return false;
        }

        var result = passwords.Verify(stored, password);
        if (result == PasswordCheck.SuccessRehashNeeded)
        {
            await users.UpgradePasswordHashAsync(userId, passwords.Hash(password));
        }

        return result != PasswordCheck.Failed;
    }
}
