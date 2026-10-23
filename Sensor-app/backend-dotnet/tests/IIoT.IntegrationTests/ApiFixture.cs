using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Testcontainers.PostgreSql;

namespace IIoT.IntegrationTests;

/// <summary>
/// The real backend against a real, empty TimescaleDB in Docker, set up exactly like production:
/// <c>sql/migrate.sh</c> runs as the database owner, and the API connects with the limited
/// <c>iiot_app</c> account. One database for all tests; each test uses its own users and sites.
/// </summary>
public sealed class ApiFixture : IAsyncLifetime
{
    public const string AppUser = "iiot_app";
    private const string AppPassword = "app-password";

    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        .WithImage("timescale/timescaledb:latest-pg16")
        .WithDatabase("appdb")
        .WithUsername("owner")
        .WithPassword("owner-password")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public WebApplicationFactory<Program> Factory => _factory ?? throw new InvalidOperationException("Not started");

    /// <summary>Connection as the database owner, for test setup and checks the API does not offer.</summary>
    public string OwnerConnectionString => _db.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _db.StartAsync();
        await _db.CopyAsync(new DirectoryInfo(SqlDirectory()), "/sql");
        var result = await RunMigrationsAsync();
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException($"Migrations failed: {result.Stderr}");
        }

        // Program reads its settings from environment variables before the host is built
        var settings = new Dictionary<string, string>
        {
            ["DB_HOST"] = _db.Hostname,
            ["DB_PORT"] = _db.GetMappedPublicPort(PostgreSqlBuilder.PostgreSqlPort).ToString(),
            ["DB_USER"] = AppUser,
            ["DB_PASSWORD"] = AppPassword,
            ["DB_NAME"] = "appdb",
            ["JWT_SECRET"] = "integration-tests-secret-integration-tests-secret",
            ["REGISTRATION_ENABLED"] = "true",
        };
        foreach (var (key, value) in settings)
        {
            Environment.SetEnvironmentVariable(key, value);
        }

        _factory = new WebApplicationFactory<Program>();
        _ = _factory.Server; // start now, so a startup error fails the fixture clearly
    }

    /// <summary>Runs <c>sql/migrate.sh</c> inside the database container, as the owner.</summary>
    public Task<DotNet.Testcontainers.Containers.ExecResult> RunMigrationsAsync() =>
        _db.ExecAsync(["sh", "-c",
            $"PGHOST=localhost PGUSER=owner PGPASSWORD=owner-password PGDATABASE=appdb " +
            $"DB_APP_USER={AppUser} DB_APP_PASSWORD={AppPassword} sh /sql/migrate.sh"]);

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }
        await _db.DisposeAsync();
    }

    /// <summary>A signed-up user (admin of a new site), signed in.</summary>
    public async Task<ApiClient> RegisterAsync(string id, string password = "password-1")
    {
        var client = new ApiClient(Factory.CreateClient(), id);
        var response = await client.Http.PostAsJsonAsync("/register", new { id, password });
        response.EnsureSuccessStatusCode();
        await client.LoginAsync(password);
        return client;
    }

    /// <summary>Signs in a user an admin created and replaces the temporary password.</summary>
    public async Task<ApiClient> FirstSignInAsync(string id, string temporaryPassword, string newPassword = "new-password-1")
    {
        var client = new ApiClient(Factory.CreateClient(), id);
        await client.LoginAsync(temporaryPassword);
        var changed = await client.Http.PostAsJsonAsync("/change-password", new { id, oldPassword = temporaryPassword, newPassword });
        changed.EnsureSuccessStatusCode();
        return client;
    }

    public async Task<T> QueryOwnerAsync<T>(string sql, object? args = null)
    {
        await using var conn = new NpgsqlConnection(OwnerConnectionString);
        return await conn.ExecuteScalarAsync<T>(sql, args) ?? throw new InvalidOperationException("No result");
    }

    public async Task ExecuteOwnerAsync(string sql, object? args = null)
    {
        await using var conn = new NpgsqlConnection(OwnerConnectionString);
        await conn.ExecuteAsync(sql, args);
    }

    private static string SqlDirectory()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "sql", "migrate.sh")))
            {
                return Path.Combine(dir.FullName, "sql");
            }
        }
        throw new DirectoryNotFoundException("sql/migrate.sh not found above the test output folder");
    }
}

/// <summary>An HTTP client signed in as one user.</summary>
public sealed class ApiClient(HttpClient http, string userId)
{
    public HttpClient Http { get; } = http;
    public string UserId { get; } = userId;

    public async Task LoginAsync(string password)
    {
        var response = await Http.PostAsJsonAsync("/login", new { id = UserId, password });
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        if (!body.GetProperty("success").GetBoolean())
        {
            throw new InvalidOperationException($"Login failed for {UserId}");
        }
        Http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("token").GetString());
    }

    public async Task<JsonElement> GetJsonAsync(string url)
    {
        var response = await Http.GetAsync(url);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}

[CollectionDefinition(nameof(ApiCollection))]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;
