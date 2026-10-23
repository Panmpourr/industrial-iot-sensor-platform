using Dapper;
using IIoT.Api.Auth;
using Npgsql;

namespace IIoT.Api.Data;

public sealed record SiteUser(string Id, string Role, bool MustChangePassword, DateTime CreatedAt);

public sealed class UserRepository(NpgsqlDataSource dataSource)
{
    public async Task<string?> GetPasswordHashAsync(string id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<string>("SELECT password FROM users WHERE id = @id", new { id });
    }

    public async Task<Member?> GetMemberAsync(string id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<Member>(
            """
            SELECT u.id AS UserId, u.site_id AS SiteId, s.name AS SiteName, u.role, u.must_change_password AS MustChangePassword
            FROM users u JOIN sites s ON s.id = u.site_id
            WHERE u.id = @id
            """, new { id });
    }

    public async Task<bool> AnyAsync()
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM users)");
    }

    /// <summary>Creates a new site with this user as its admin (self-registration, or the first admin from the settings).</summary>
    /// <returns><c>false</c> if the user id is already taken.</returns>
    public async Task<bool> CreateWithSiteAsync(string id, string passwordHash, string siteName, bool mustChangePassword = false)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        if (await conn.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id = @id)", new { id }, tx))
        {
            return false;
        }

        var siteId = await conn.ExecuteScalarAsync<Guid>("INSERT INTO sites (name) VALUES (@siteName) RETURNING id", new { siteName }, tx);
        var affected = await conn.ExecuteAsync(
            """
            INSERT INTO users (id, password, site_id, role, must_change_password)
            VALUES (@id, @passwordHash, @siteId, @role, @mustChangePassword)
            ON CONFLICT (id) DO NOTHING
            """, new { id, passwordHash, siteId, role = Roles.Admin, mustChangePassword }, tx);
        if (affected == 0)
        {
            return false; // taken by a concurrent registration; the transaction (and the new site) is rolled back
        }

        await tx.CommitAsync();
        return true;
    }

    /// <summary>Added by an admin: the user must replace the temporary password at the first sign-in.</summary>
    /// <returns><c>false</c> if the user id is already taken.</returns>
    public async Task<bool> CreateMemberAsync(Guid siteId, string id, string passwordHash, string role)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            """
            INSERT INTO users (id, password, site_id, role, must_change_password)
            VALUES (@id, @passwordHash, @siteId, @role, true)
            ON CONFLICT (id) DO NOTHING
            """, new { id, passwordHash, siteId, role });
        return affected > 0;
    }

    /// <summary>Also ends the "must change password" state.</summary>
    public async Task UpdatePasswordHashAsync(string id, string passwordHash)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            "UPDATE users SET password = @passwordHash, must_change_password = false WHERE id = @id", new { id, passwordHash });
    }

    /// <summary>Re-hashes a legacy password without touching anything else.</summary>
    public async Task UpgradePasswordHashAsync(string id, string passwordHash)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE users SET password = @passwordHash WHERE id = @id", new { id, passwordHash });
    }

    /// <summary>An admin sets a new temporary password; the user must change it at the next sign-in.</summary>
    public async Task<bool> ResetPasswordAsync(Guid siteId, string id, string passwordHash)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync(
            "UPDATE users SET password = @passwordHash, must_change_password = true WHERE id = @id AND site_id = @siteId",
            new { siteId, id, passwordHash }) > 0;
    }

    public async Task<IReadOnlyList<SiteUser>> GetSiteUsersAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<SiteUser>(
            "SELECT id, role, must_change_password AS MustChangePassword, created_at AS CreatedAt FROM users WHERE site_id = @siteId ORDER BY id",
            new { siteId });
        return rows.ToList();
    }

    /// <returns>The previous role, or <c>null</c> if the user is not in this site.</returns>
    public async Task<string?> UpdateRoleAsync(Guid siteId, string id, string role)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<string>(
            """
            UPDATE users u SET role = @role
            FROM (SELECT id, role FROM users WHERE id = @id AND site_id = @siteId) old
            WHERE u.id = old.id
            RETURNING old.role
            """, new { siteId, id, role });
    }

    public async Task<bool> DeleteAsync(Guid siteId, string id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("DELETE FROM users WHERE id = @id AND site_id = @siteId", new { siteId, id }) > 0;
    }

    public async Task RenameSiteAsync(Guid siteId, string name)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE sites SET name = @name WHERE id = @siteId", new { siteId, name });
    }
}
