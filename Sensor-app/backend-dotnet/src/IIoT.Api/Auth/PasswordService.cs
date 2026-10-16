using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace IIoT.Api.Auth;

public enum PasswordCheck
{
    Failed,
    Success,
    /// <summary>Correct, but stored in an old format (plain text or weaker hash) and should be re-hashed.</summary>
    SuccessRehashNeeded,
}

/// <summary>
/// PBKDF2 password hashing (same algorithm as ASP.NET Core Identity).
/// Plain-text passwords from the old Node.js backend are still accepted once and then upgraded.
/// </summary>
public sealed class PasswordService
{
    // Identity V3 hashes are base64 and always start with 0x01 (format marker) followed by the PRF id.
    private const string IdentityV3Prefix = "AQAAAA";

    private sealed class User;
    private static readonly User HashUser = new();
    private readonly PasswordHasher<User> _hasher = new();

    public string Hash(string password) => _hasher.HashPassword(HashUser, password);

    public PasswordCheck Verify(string storedPassword, string providedPassword)
    {
        if (!storedPassword.StartsWith(IdentityV3Prefix, StringComparison.Ordinal))
        {
            var matches = CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(storedPassword), Encoding.UTF8.GetBytes(providedPassword));
            return matches ? PasswordCheck.SuccessRehashNeeded : PasswordCheck.Failed;
        }

        return _hasher.VerifyHashedPassword(HashUser, storedPassword, providedPassword) switch
        {
            PasswordVerificationResult.Success => PasswordCheck.Success,
            PasswordVerificationResult.SuccessRehashNeeded => PasswordCheck.SuccessRehashNeeded,
            _ => PasswordCheck.Failed,
        };
    }
}
