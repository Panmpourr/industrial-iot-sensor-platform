using IIoT.Api;
using IIoT.Api.Alarms;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using IIoT.Api.Hubs;
using IIoT.Api.Notifications;
using IIoT.Api.Sensors;
using IIoT.Api.Sensors.Connectors;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Npgsql;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ================= CONFIGURATION =================
string Require(string key) =>
    config[key] is { Length: > 0 } value
        ? value
        : throw new InvalidOperationException($"Missing required setting {key} (set it in .env)");

var jwtSecret = Require("JWT_SECRET");
if (jwtSecret.Length < 32)
{
    throw new InvalidOperationException("JWT_SECRET must be at least 32 characters long");
}

var connectionString = new NpgsqlConnectionStringBuilder
{
    Host = Require("DB_HOST"),
    Port = int.TryParse(config["DB_PORT"], out var dbPort) ? dbPort : 5432,
    Username = Require("DB_USER"),
    Password = Require("DB_PASSWORD"),
    Database = config["DB_NAME"] ?? "appdb",
    // Kerberos/GSS is not used; disabling it avoids probing for libgssapi in the container
    GssEncryptionMode = GssEncryptionMode.Disable,
}.ConnectionString;

// In Docker the port comes from ASPNETCORE_HTTP_PORTS (see Dockerfile); locally from PORT (default 5000).
if (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") is null)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{config["PORT"] ?? "5000"}");
}

// ================= SERVICES =================
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<UserRepository>();
var authSettings = AuthSettings.From(config);
builder.Services.AddSingleton(authSettings);
builder.Services.AddSingleton<SensorRepository>();
builder.Services.AddSingleton<AlarmRepository>();
builder.Services.AddSingleton<AuditRepository>();
builder.Services.AddSingleton<AssetRepository>();
builder.Services.AddSingleton<ReportRepository>();
builder.Services.AddSingleton<NotificationRepository>();
builder.Services.AddSingleton<MaintenanceRepository>();

var signingKey = JwtTokenService.CreateKey(jwtSecret);
builder.Services.AddSingleton(new JwtTokenService(signingKey));
builder.Services.AddSingleton<PasswordService>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = JwtTokenService.ValidationParameters(signingKey);
        // Browsers cannot set headers on WebSockets, so the SignalR client sends the token in the query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.HttpContext.Request.Path.StartsWithSegments(SensorHub.Path)
                    && context.Request.Query["access_token"] is { Count: > 0 } token)
                {
                    context.Token = token;
                }
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddSignalR();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<OpcUaClient>();
builder.Services.AddSingleton<SensorConnectorFactory>();
builder.Services.AddSingleton(TelegramSettings.From(config));
builder.Services.AddSingleton<ITelegramApi, TelegramApi>();
builder.Services.AddSingleton<NotificationSignals>();
builder.Services.AddSingleton<NotificationService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<NotificationService>());
builder.Services.AddSingleton<TelegramBotService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelegramBotService>());
builder.Services.AddSingleton<AlarmService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AlarmService>());
builder.Services.AddSingleton<SensorManager>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SensorManager>());

builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(config["CORS_ORIGIN"] ?? "http://localhost:8080")
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .WithHeaders("Content-Type", "Authorization", "X-Requested-With", "X-SignalR-User-Agent")
    .AllowCredentials()));

builder.Services.AddControllers();

var app = builder.Build();

// ================= DATABASE CHECK =================
try
{
    await using var connection = await app.Services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync();
    app.Logger.LogInformation("PostgreSQL connected...");
}
catch (Exception ex)
{
    app.Logger.LogCritical(ex, "PostgreSQL connection error");
    return 1;
}

await authSettings.CreateFirstAdminAsync(
    app.Services.GetRequiredService<UserRepository>(), app.Services.GetRequiredService<PasswordService>(), app.Logger);

// ================= PIPELINE =================
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<SensorHub>(SensorHub.Path);
app.MapFallback(() => Results.NotFound(new { error = "Endpoint not found" }));

await app.RunAsync();
return 0;

/// <summary>Visible to the integration tests (WebApplicationFactory needs the entry point type).</summary>
public partial class Program;
