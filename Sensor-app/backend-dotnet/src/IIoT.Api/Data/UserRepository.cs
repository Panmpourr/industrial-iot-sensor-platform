using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

public sealed class UserRepository(NpgsqlDataSource dataSource)
{
    public async Task<string?> GetPasswordHashAsync(string id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<string>("SELECT password FROM users WHERE id = @id", new { id });
    }

    public async Task<bool> ExistsAsync(string id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id = @id)", new { id });
    }

    /// <returns><c>false</c> if the user id is already taken.</returns>
    public async Task<bool> CreateAsync(string id, string passwordHash)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "INSERT INTO users (id, password) VALUES (@id, @passwordHash) ON CONFLICT (id) DO NOTHING",
            new { id, passwordHash });
        return affected > 0;
    }

    public async Task UpdatePasswordHashAsync(string id, string passwordHash)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE users SET password = @passwordHash WHERE id = @id", new { id, passwordHash });
    }
}
