using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

public sealed record AlarmRecord(
    Guid Id, Guid SensorId, string Condition, string Priority, double? LimitValue, double? Value,
    DateTime RaisedAt, DateTime? ClearedAt, DateTime? AckedAt, string? AckedBy)
{
    /// <summary>ISA-18.2 state: active-unacked, active-acked, cleared-unacked or closed.</summary>
    public string State => (ClearedAt, AckedAt) switch
    {
        (null, null) => "active-unacked",
        (null, _) => "active-acked",
        (_, null) => "cleared-unacked",
        _ => "closed",
    };
}

/// <summary>The alarm journal (table <c>alarms</c>).</summary>
public sealed class AlarmRepository(NpgsqlDataSource dataSource)
{
    private const string Columns =
        "id, sensor_id AS SensorId, condition, priority, limit_value AS LimitValue, value, " +
        "raised_at AS RaisedAt, cleared_at AS ClearedAt, acked_at AS AckedAt, acked_by AS AckedBy";

    /// <summary>
    /// Raises an alarm. If this condition is already active (e.g. after a restart) the existing
    /// alarm is returned instead of creating a second one.
    /// </summary>
    public async Task<AlarmRecord> RaiseAsync(Guid sensorId, string condition, string priority, double? limitValue, double? value)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleAsync<AlarmRecord>($"""
            WITH inserted AS (
              INSERT INTO alarms (sensor_id, condition, priority, limit_value, value, raised_at)
              VALUES (@sensorId, @condition, @priority, @limitValue, @value, now())
              ON CONFLICT (sensor_id, condition) WHERE cleared_at IS NULL DO NOTHING
              RETURNING {Columns}
            )
            SELECT * FROM inserted
            UNION ALL
            SELECT {Columns} FROM alarms WHERE sensor_id = @sensorId AND condition = @condition AND cleared_at IS NULL
            LIMIT 1
            """, new { sensorId, condition, priority, limitValue, value });
    }

    public async Task<AlarmRecord?> ClearAsync(Guid sensorId, string condition)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<AlarmRecord>(
            $"UPDATE alarms SET cleared_at = now() WHERE sensor_id = @sensorId AND condition = @condition AND cleared_at IS NULL RETURNING {Columns}",
            new { sensorId, condition });
    }

    /// <summary>Acknowledges the given alarms of the site's sensors; returns the ones that changed.</summary>
    public async Task<IReadOnlyList<AlarmRecord>> AcknowledgeAsync(Guid siteId, string userId, Guid[] alarmIds)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<AlarmRecord>($"""
            UPDATE alarms SET acked_at = now(), acked_by = @userId
            WHERE id = ANY(@alarmIds) AND acked_at IS NULL
              AND sensor_id IN (SELECT id FROM sensors WHERE site_id = @siteId)
            RETURNING {Columns}
            """, new { siteId, userId, alarmIds });
        return rows.ToList();
    }

    /// <summary>Active alarms of all sensors (to restore the alarm states on startup).</summary>
    public async Task<IReadOnlyList<AlarmRecord>> GetActiveAsync()
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<AlarmRecord>($"SELECT {Columns} FROM alarms WHERE cleared_at IS NULL");
        return rows.ToList();
    }

    /// <summary>The alarm summary: alarms that are still active or not yet acknowledged.</summary>
    public async Task<IReadOnlyList<AlarmRecord>> GetOpenAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<AlarmRecord>($"""
            SELECT {Columns} FROM alarms
            WHERE (cleared_at IS NULL OR acked_at IS NULL)
              AND sensor_id IN (SELECT id FROM sensors WHERE site_id = @siteId)
            ORDER BY raised_at DESC
            """, new { siteId });
        return rows.ToList();
    }

    /// <summary>Alarms raised in [from, to), newest first, optionally for one sensor.</summary>
    public async Task<IReadOnlyList<AlarmRecord>> GetHistoryAsync(Guid siteId, DateTimeOffset from, DateTimeOffset to, Guid? sensorId, int limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<AlarmRecord>($"""
            SELECT {Columns} FROM alarms
            WHERE raised_at >= @from AND raised_at < @to
              AND (@sensorId::uuid IS NULL OR sensor_id = @sensorId)
              AND sensor_id IN (SELECT id FROM sensors WHERE site_id = @siteId)
            ORDER BY raised_at DESC
            LIMIT @limit
            """, new { siteId, from = from.UtcDateTime, to = to.UtcDateTime, sensorId, limit });
        return rows.ToList();
    }
}
