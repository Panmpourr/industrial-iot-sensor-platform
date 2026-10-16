using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

public sealed record SensorRecord(Guid Id, string UserId, string Name, string Type, JsonElement Details);

/// <summary>
/// Sensor configurations and their time-series readings (TimescaleDB hypertable <c>sensor_data</c>).
/// </summary>
public sealed class SensorRepository(NpgsqlDataSource dataSource)
{
    private sealed class SensorRow
    {
        public Guid Id { get; init; }
        public string UserId { get; init; } = "";
        public string Name { get; init; } = "";
        public string Type { get; init; } = "";
        public string DetailsJson { get; init; } = "{}";

        public SensorRecord ToRecord() =>
            new(Id, UserId, Name, Type, JsonDocument.Parse(DetailsJson).RootElement.Clone());
    }

    private const string SelectSensor =
        "SELECT id, user_id AS UserId, name, type, details::text AS DetailsJson FROM sensors";

    public async Task<Guid> CreateAsync(string userId, string name, string type, JsonElement details)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<Guid>(
            "INSERT INTO sensors (user_id, name, type, details) VALUES (@userId, @name, @type, CAST(@details AS jsonb)) RETURNING id",
            new { userId, name, type, details = details.ValueKind == JsonValueKind.Object ? details.GetRawText() : "{}" });
    }

    public async Task<IReadOnlyList<SensorRecord>> GetByUserAsync(string userId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<SensorRow>($"{SelectSensor} WHERE user_id = @userId ORDER BY created_at", new { userId });
        return rows.Select(r => r.ToRecord()).ToList();
    }

    public async Task<IReadOnlyList<SensorRecord>> GetAllAsync()
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<SensorRow>($"{SelectSensor} ORDER BY created_at");
        return rows.Select(r => r.ToRecord()).ToList();
    }

    public async Task<bool> IsOwnerAsync(string userId, Guid sensorId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>(
            "SELECT EXISTS (SELECT 1 FROM sensors WHERE id = @sensorId AND user_id = @userId)",
            new { sensorId, userId });
    }

    /// <summary>Readings are removed automatically via ON DELETE CASCADE.</summary>
    public async Task<bool> DeleteAsync(string userId, Guid sensorId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "DELETE FROM sensors WHERE id = @sensorId AND user_id = @userId", new { sensorId, userId });
        return affected > 0;
    }

    /// <summary>
    /// Stores one reading. The full object is kept as <c>payload</c>; numeric <c>value</c> and
    /// <c>status</c> are also extracted into their own columns for fast queries.
    /// </summary>
    public async Task InsertReadingAsync(Guid sensorId, JsonObject reading)
    {
        var timestamp = reading["timestamp"] is JsonValue t && t.TryGetValue(out long ms)
            ? ms
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        reading["timestamp"] = timestamp;

        double? value = null;
        if (reading["value"] is JsonValue v && v.TryGetValue(out double d) && double.IsFinite(d))
        {
            value = d;
        }

        string? status = reading["status"] is JsonValue s && s.TryGetValue(out string? text) ? text : null;

        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            "INSERT INTO sensor_data (sensor_id, time, value, status, payload) " +
            "VALUES (@sensorId, to_timestamp(@timestamp / 1000.0), @value, @status, CAST(@payload AS jsonb))",
            new { sensorId, timestamp, value, status, payload = reading.ToJsonString() });
    }

    /// <summary>
    /// Returns the latest <paramref name="limit"/> readings as raw JSON, oldest first.
    /// <c>null</c> returns the full history.
    /// </summary>
    public async Task<IReadOnlyList<string>> GetReadingsJsonAsync(string userId, Guid sensorId, int? limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<string>(
            """
            SELECT payload::text FROM (
                SELECT d.payload, d.time
                FROM sensor_data d
                JOIN sensors s ON s.id = d.sensor_id
                WHERE d.sensor_id = @sensorId AND s.user_id = @userId
                ORDER BY d.time DESC
                LIMIT @limit
            ) latest
            ORDER BY time ASC
            """,
            new { sensorId, userId, limit });
        return rows.ToList();
    }
}
