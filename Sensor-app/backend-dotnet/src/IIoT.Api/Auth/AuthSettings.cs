using IIoT.Api.Controllers;
using IIoT.Api.Data;

namespace IIoT.Api.Auth;

/// <summary>
/// How people get an account. With <c>REGISTRATION_ENABLED=false</c> (recommended for a real plant)
/// nobody can sign up: the first admin comes from <c>ADMIN_USER</c> / <c>ADMIN_PASSWORD</c> and
/// adds everyone else. With registration on (the default, handy for a demo) every sign-up
/// creates a new, empty site.
/// </summary>
public sealed record AuthSettings(bool RegistrationEnabled, string? AdminUser, string? AdminPassword, string SiteName)
{
    public const int MinAdminPasswordLength = 8;

    public static AuthSettings From(IConfiguration config) => new(
        RegistrationEnabled: !bool.TryParse(config["REGISTRATION_ENABLED"], out var enabled) || enabled,
        AdminUser: config["ADMIN_USER"] is { Length: > 0 } user ? user.Trim() : null,
        AdminPassword: config["ADMIN_PASSWORD"] is { Length: > 0 } password ? password : null,
        SiteName: config["SITE_NAME"] is { Length: > 0 } name ? name.Trim() : "Main site");

    /// <summary>
    /// On an empty database, creates the site and its first admin from ADMIN_USER / ADMIN_PASSWORD.
    /// The admin must change this password at the first sign-in. Does nothing once any user exists.
    /// </summary>
    public async Task CreateFirstAdminAsync(UserRepository users, PasswordService passwords, ILogger logger)
    {
        if (await users.AnyAsync())
        {
            return;
        }
        if (AdminUser is null || AdminPassword is null)
        {
            if (!RegistrationEnabled)
            {
                logger.LogWarning("Registration is disabled and there are no users: set ADMIN_USER and ADMIN_PASSWORD to create the first admin");
            }
            return;
        }
        if (AdminUser.Length > AuthController.MaxUserIdLength || AdminPassword.Length < MinAdminPasswordLength)
        {
            throw new InvalidOperationException(
                $"ADMIN_USER must be at most {AuthController.MaxUserIdLength} characters and ADMIN_PASSWORD at least {MinAdminPasswordLength}");
        }

        if (await users.CreateWithSiteAsync(AdminUser, passwords.Hash(AdminPassword), SiteName, mustChangePassword: true))
        {
            logger.LogInformation("Created the first admin {User} of site {Site}", AdminUser, SiteName);
        }
    }
}
