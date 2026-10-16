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
    JwtTokenService tokens) : ControllerBase
{
    private const int MaxUserIdLength = 50;

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

        var created = await users.CreateAsync(request.Id, passwords.Hash(request.Password));
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

        if (!await CheckPasswordAsync(request.Id, request.Password))
        {
            return Ok(new { success = false });
        }

        return Ok(new { success = true, token = tokens.CreateToken(request.Id) });
    }

    [Authorize]
    [HttpPost("/change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var userId = User.UserId()!;
        if (request.Id != userId)
        {
            return Forbid();
        }
        if (string.IsNullOrEmpty(request.OldPassword) || string.IsNullOrEmpty(request.NewPassword))
        {
            return Ok(new { success = false });
        }
        if (!await CheckPasswordAsync(userId, request.OldPassword))
        {
            return Ok(new { success = false });
        }

        await users.UpdatePasswordHashAsync(userId, passwords.Hash(request.NewPassword));
        return Ok(new { success = true });
    }

    [Authorize]
    [HttpGet("/profile")]
    public async Task<IActionResult> Profile([FromQuery] string? id)
    {
        var userId = User.UserId()!;
        if (id != userId)
        {
            return Forbid();
        }

        return await users.ExistsAsync(userId)
            ? Ok(new { id = userId })
            : NotFound("User not found");
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
            await users.UpdatePasswordHashAsync(userId, passwords.Hash(password));
        }

        return result != PasswordCheck.Failed;
    }
}
