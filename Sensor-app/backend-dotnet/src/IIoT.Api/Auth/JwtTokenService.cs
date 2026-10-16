using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace IIoT.Api.Auth;

public sealed class JwtTokenService(SymmetricSecurityKey signingKey)
{
    public const string Issuer = "iiot-platform";
    public const string Audience = "iiot-platform";
    public const string UserIdClaim = JwtRegisteredClaimNames.Sub;
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(12);

    public static SymmetricSecurityKey CreateKey(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public string CreateToken(string userId) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            Subject = new ClaimsIdentity([new Claim(UserIdClaim, userId)]),
            Expires = DateTime.UtcNow.Add(Lifetime),
            SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256),
        });

    public static TokenValidationParameters ValidationParameters(SymmetricSecurityKey signingKey) => new()
    {
        ValidIssuer = Issuer,
        ValidAudience = Audience,
        IssuerSigningKey = signingKey,
        NameClaimType = UserIdClaim,
        ClockSkew = TimeSpan.FromMinutes(1),
    };
}

public static class ClaimsPrincipalExtensions
{
    public static string? UserId(this ClaimsPrincipal user) => user.FindFirst(JwtTokenService.UserIdClaim)?.Value;
}
