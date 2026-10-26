using System.Globalization;
using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

/// <summary>Kinds of work in the maintenance log.</summary>
public static class MaintenanceKinds
{
    public const string Preventive = "preventive";
    public static readonly string[] All = [Preventive, "repair", "inspection", "calibration", "other"];

    public static bool IsValid(string? kind) => kind is not null && All.Contains(kind);
}

/// <summary>Plant calendar dates travel as "yyyy-MM-dd" (no time zone involved).</summary>
public static class PlantDate
{
    public const string Format = "yyyy-MM-dd";

    public static DateOnly? Parse(string? text) =>
        DateOnly.TryParseExact(text, Format, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;

    public static string Text(DateOnly date) => date.ToString(Format, CultureInfo.InvariantCulture);
}

/// <param name="NextDue">yyyy-MM-dd</param>
/// <param name="LastDone">yyyy-MM-dd of the latest log entry for this task, if any.</param>
public sealed record MaintenanceTask(
    Guid Id, Guid AssetId, string Name, int IntervalDays, string NextDue, string? Notes, string? LastDone);

/// <param name="AssetId">null once the equipment was deleted; <c>AssetName</c> still tells which it was.</param>
public sealed record MaintenanceEntry(
    Guid Id, Guid? AssetId, string AssetName, Guid? TaskId, string? TaskName, string Kind, string PerformedOn,
    string PerformedBy, string Description, int? DurationMinutes, Guid? AlarmId, DateTime CreatedAt);

/// <summary>Scheduled maintenance tasks and the work log (see <c>006-maintenance.sql</c>).</summary>
public sealed class MaintenanceRepository(NpgsqlDataSource dataSource)
{
    private const string TaskColumns = """
        t.id, t.asset_id AS AssetId, t.name, t.interval_days AS IntervalDays,
        to_char(t.next_due, 'YYYY-MM-DD') AS NextDue, t.notes,
        (SELECT to_char(max(l.performed_on), 'YYYY-MM-DD') FROM maintenance_log l WHERE l.task_id = t.id) AS LastDone
        """;

    private const string EntryColumns = """
        l.id, l.asset_id AS AssetId, l.asset_name AS AssetName, l.task_id AS TaskId, t.name AS TaskName, l.kind,
        to_char(l.performed_on, 'YYYY-MM-DD') AS PerformedOn, l.performed_by AS PerformedBy, l.description,
        l.duration_minutes AS DurationMinutes, l.alarm_id AS AlarmId, l.created_at AS CreatedAt
        """;

    public async Task<IReadOnlyList<MaintenanceTask>> GetTasksAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<MaintenanceTask>(
            $"SELECT {TaskColumns} FROM maintenance_tasks t WHERE t.site_id = @siteId ORDER BY t.next_due, t.name", new { siteId })).ToList();
    }

    public async Task<MaintenanceTask?> GetTaskAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<MaintenanceTask>(
            $"SELECT {TaskColumns} FROM maintenance_tasks t WHERE t.site_id = @siteId AND t.id = @id", new { siteId, id });
    }

    /// <summary>The asset must belong to the site (checked by the caller, enforced by a foreign key).</summary>
    public async Task<Guid> CreateTaskAsync(Guid siteId, Guid assetId, string name, int intervalDays, DateOnly firstDue, string? notes)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<Guid>("""
            INSERT INTO maintenance_tasks (site_id, asset_id, name, interval_days, next_due, notes)
            VALUES (@siteId, @assetId, @name, @intervalDays, CAST(@nextDue AS date), @notes) RETURNING id
            """, new { siteId, assetId, name, intervalDays, nextDue = PlantDate.Text(firstDue), notes });
    }

    public async Task<bool> UpdateTaskAsync(Guid siteId, Guid id, string name, int intervalDays, DateOnly nextDue, string? notes)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("""
            UPDATE maintenance_tasks
            SET name = @name, interval_days = @intervalDays, next_due = CAST(@nextDue AS date), notes = @notes
            WHERE site_id = @siteId AND id = @id
            """, new { siteId, id, name, intervalDays, nextDue = PlantDate.Text(nextDue), notes }) == 1;
    }

    public async Task<bool> DeleteTaskAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("DELETE FROM maintenance_tasks WHERE site_id = @siteId AND id = @id", new { siteId, id }) == 1;
    }

    /// <summary>
    /// Logs a completed task and moves its due date to the day it was done plus the interval,
    /// in one transaction. Returns the new due date, or null if the task does not exist.
    /// </summary>
    public async Task<DateOnly?> CompleteTaskAsync(
        Guid siteId, Guid taskId, string userId, DateOnly performedOn, string description, int? durationMinutes)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        var nextDue = await conn.ExecuteScalarAsync<string?>("""
            UPDATE maintenance_tasks SET next_due = CAST(@performedOn AS date) + interval_days
            WHERE site_id = @siteId AND id = @taskId
            RETURNING to_char(next_due, 'YYYY-MM-DD')
            """, new { siteId, taskId, performedOn = PlantDate.Text(performedOn) }, tx);
        if (nextDue is null)
        {
            return null;
        }

        await conn.ExecuteAsync("""
            INSERT INTO maintenance_log (site_id, asset_id, asset_name, task_id, kind, performed_on, performed_by, description, duration_minutes)
            SELECT t.site_id, t.asset_id, a.name, t.id, @kind, CAST(@performedOn AS date), @userId, @description, @durationMinutes
            FROM maintenance_tasks t JOIN assets a ON a.id = t.asset_id
            WHERE t.id = @taskId
            """, new { taskId, kind = MaintenanceKinds.Preventive, performedOn = PlantDate.Text(performedOn), userId, description, durationMinutes }, tx);
        await tx.CommitAsync();
        return PlantDate.Parse(nextDue);
    }

    /// <summary>Work that was not a scheduled task (a repair, an inspection...). Asset and alarm are checked by the caller.</summary>
    public async Task<Guid> LogWorkAsync(
        Guid siteId, Guid assetId, string userId, string kind, DateOnly performedOn, string description, int? durationMinutes, Guid? alarmId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<Guid>("""
            INSERT INTO maintenance_log (site_id, asset_id, asset_name, kind, performed_on, performed_by, description, duration_minutes, alarm_id)
            SELECT @siteId, a.id, a.name, @kind, CAST(@performedOn AS date), @userId, @description, @durationMinutes, @alarmId
            FROM assets a WHERE a.id = @assetId AND a.site_id = @siteId
            RETURNING id
            """, new { siteId, assetId, userId, kind, performedOn = PlantDate.Text(performedOn), description, durationMinutes, alarmId });
    }

    /// <summary>Latest entries first.</summary>
    public async Task<IReadOnlyList<MaintenanceEntry>> GetLogAsync(Guid siteId, int limit)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return (await conn.QueryAsync<MaintenanceEntry>($"""
            SELECT {EntryColumns}
            FROM maintenance_log l LEFT JOIN maintenance_tasks t ON t.id = l.task_id
            WHERE l.site_id = @siteId
            ORDER BY l.performed_on DESC, l.created_at DESC
            LIMIT @limit
            """, new { siteId, limit })).ToList();
    }

    public async Task<MaintenanceEntry?> GetEntryAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<MaintenanceEntry>($"""
            SELECT {EntryColumns}
            FROM maintenance_log l LEFT JOIN maintenance_tasks t ON t.id = l.task_id
            WHERE l.site_id = @siteId AND l.id = @id
            """, new { siteId, id });
    }

    public async Task<bool> DeleteEntryAsync(Guid siteId, Guid id)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteAsync("DELETE FROM maintenance_log WHERE site_id = @siteId AND id = @id", new { siteId, id }) == 1;
    }

    /// <summary>Whether the alarm belongs to a sensor of the site, so a log entry can refer to it.</summary>
    public async Task<bool> AlarmInSiteAsync(Guid siteId, Guid alarmId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>("""
            SELECT EXISTS (SELECT 1 FROM alarms a JOIN sensors s ON s.id = a.sensor_id WHERE a.id = @alarmId AND s.site_id = @siteId)
            """, new { siteId, alarmId });
    }
}
