using System.Text.Json.Nodes;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record MaintenanceTaskRequest(Guid? AssetId, string? Name, int? IntervalDays, string? NextDue, string? Notes);
public sealed record CompleteTaskRequest(string? PerformedOn, string? Description, int? DurationMinutes);
public sealed record LogWorkRequest(Guid? AssetId, string? Kind, string? PerformedOn, string? Description, int? DurationMinutes, Guid? AlarmId);

/// <summary>
/// Maintenance of the site's areas and equipment. Engineers plan recurring tasks; everyone can
/// mark a task done and log work (the log itself records who did what and when). Changes to the
/// plan and removed log entries are audited.
/// </summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class MaintenanceController(MaintenanceRepository maintenance, AssetRepository assets, AuditRepository audit) : ControllerBase
{
    public const int MaxNameLength = 200;
    public const int MaxTextLength = 2000;
    private const int MaxIntervalDays = 3650;
    private const int MaxDurationMinutes = 100_000;
    private const int MaxLog = 500;

    /// <summary>Work cannot be logged this far ahead (the server's date may be a day behind the plant's).</summary>
    private static DateOnly LatestPerformedOn => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);

    [HttpGet("/maintenance/tasks")]
    public async Task<IActionResult> GetTasks() => Ok(await maintenance.GetTasksAsync(this.Member().SiteId));

    [RequireRole(Roles.Engineer)]
    [HttpPost("/maintenance/tasks")]
    public async Task<IActionResult> CreateTask(MaintenanceTaskRequest request)
    {
        var me = this.Member();
        if (await TaskError(me.SiteId, request, requireAsset: true) is { } error)
        {
            return error;
        }

        var name = request.Name!.Trim();
        var id = await maintenance.CreateTaskAsync(me.SiteId, request.AssetId!.Value, name, request.IntervalDays!.Value,
            PlantDate.Parse(request.NextDue)!.Value, Notes(request.Notes));
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.MaintenanceTaskCreate, "maintenance-task", id.ToString(), name,
            new JsonObject { ["asset"] = await AssetName(me.SiteId, request.AssetId), ["intervalDays"] = request.IntervalDays, ["nextDue"] = request.NextDue }));
        return Ok(new { success = true, id });
    }

    [RequireRole(Roles.Engineer)]
    [HttpPut("/maintenance/tasks/{taskId:guid}")]
    public async Task<IActionResult> UpdateTask(Guid taskId, MaintenanceTaskRequest request)
    {
        var me = this.Member();
        if (await maintenance.GetTaskAsync(me.SiteId, taskId) is not { } existing)
        {
            return TaskNotFound();
        }
        if (await TaskError(me.SiteId, request, requireAsset: false) is { } error)
        {
            return error;
        }

        var name = request.Name!.Trim();
        var notes = Notes(request.Notes);
        await maintenance.UpdateTaskAsync(me.SiteId, taskId, name, request.IntervalDays!.Value, PlantDate.Parse(request.NextDue)!.Value, notes);

        var changes = new JsonArray();
        if (existing.Name != name) changes.Add(AuditDiff.Change("name", existing.Name, name));
        if (existing.IntervalDays != request.IntervalDays) changes.Add(AuditDiff.Change("interval", $"{existing.IntervalDays} days", $"{request.IntervalDays} days"));
        if (existing.NextDue != request.NextDue) changes.Add(AuditDiff.Change("next due", existing.NextDue, request.NextDue));
        if (existing.Notes != notes) changes.Add(AuditDiff.Change("notes", existing.Notes, notes));
        if (changes.Count > 0)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.MaintenanceTaskUpdate, "maintenance-task", taskId.ToString(), name,
                new JsonObject { ["changes"] = changes }));
        }
        return Ok(new { success = true });
    }

    [RequireRole(Roles.Engineer)]
    [HttpDelete("/maintenance/tasks/{taskId:guid}")]
    public async Task<IActionResult> DeleteTask(Guid taskId)
    {
        var me = this.Member();
        if (await maintenance.GetTaskAsync(me.SiteId, taskId) is not { } task || !await maintenance.DeleteTaskAsync(me.SiteId, taskId))
        {
            return TaskNotFound();
        }
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.MaintenanceTaskDelete, "maintenance-task", taskId.ToString(), task.Name,
            new JsonObject { ["asset"] = await AssetName(me.SiteId, task.AssetId) }));
        return Ok(new { success = true });
    }

    /// <summary>Marks a task done on a day: it is logged, and the next due date becomes that day plus the interval.</summary>
    [HttpPost("/maintenance/tasks/{taskId:guid}/complete")]
    public async Task<IActionResult> CompleteTask(Guid taskId, CompleteTaskRequest request)
    {
        var me = this.Member();
        if (PerformedOnError(request.PerformedOn) is { } dateError)
        {
            return dateError;
        }
        if (TextError(request.Description, required: false, MaxTextLength, "Notes") is { } textError)
        {
            return textError;
        }
        if (request.DurationMinutes is < 0 or > MaxDurationMinutes)
        {
            return BadRequest(new { success = false, error = "Duration must be between 0 and 100000 minutes" });
        }

        var nextDue = await maintenance.CompleteTaskAsync(me.SiteId, taskId, me.UserId, PlantDate.Parse(request.PerformedOn)!.Value,
            request.Description?.Trim() ?? "", request.DurationMinutes);
        return nextDue is { } due ? Ok(new { success = true, nextDue = PlantDate.Text(due) }) : TaskNotFound();
    }

    [HttpGet("/maintenance/log")]
    public async Task<IActionResult> GetLog([FromQuery] int? limit) =>
        Ok(await maintenance.GetLogAsync(this.Member().SiteId, Math.Clamp(limit ?? 100, 1, MaxLog)));

    /// <summary>Logs work that was not a scheduled task, e.g. a repair, optionally for an alarm.</summary>
    [HttpPost("/maintenance/log")]
    public async Task<IActionResult> LogWork(LogWorkRequest request)
    {
        var me = this.Member();
        if (request.AssetId is not { } assetId || await assets.GetAsync(me.SiteId, assetId) is null)
        {
            return BadRequest(new { success = false, error = "Choose an area or equipment of this site" });
        }
        if (!MaintenanceKinds.IsValid(request.Kind))
        {
            return BadRequest(new { success = false, error = $"Kind must be one of: {string.Join(", ", MaintenanceKinds.All)}" });
        }
        if (PerformedOnError(request.PerformedOn) is { } dateError)
        {
            return dateError;
        }
        if (TextError(request.Description, required: true, MaxTextLength, "Description") is { } textError)
        {
            return textError;
        }
        if (request.DurationMinutes is < 0 or > MaxDurationMinutes)
        {
            return BadRequest(new { success = false, error = "Duration must be between 0 and 100000 minutes" });
        }
        if (request.AlarmId is { } alarmId && !await maintenance.AlarmInSiteAsync(me.SiteId, alarmId))
        {
            return BadRequest(new { success = false, error = "Alarm not found" });
        }

        var id = await maintenance.LogWorkAsync(me.SiteId, assetId, me.UserId, request.Kind!, PlantDate.Parse(request.PerformedOn)!.Value,
            request.Description!.Trim(), request.DurationMinutes, request.AlarmId);
        return Ok(new { success = true, id });
    }

    /// <summary>Removes a log entry written by mistake (engineers only; audited with what it said).</summary>
    [RequireRole(Roles.Engineer)]
    [HttpDelete("/maintenance/log/{entryId:guid}")]
    public async Task<IActionResult> DeleteEntry(Guid entryId)
    {
        var me = this.Member();
        if (await maintenance.GetEntryAsync(me.SiteId, entryId) is not { } entry || !await maintenance.DeleteEntryAsync(me.SiteId, entryId))
        {
            return NotFound(new { success = false, error = "Log entry not found" });
        }
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.MaintenanceLogDelete, "maintenance-log", entryId.ToString(), entry.AssetName,
            new JsonObject
            {
                ["kind"] = entry.Kind, ["performedOn"] = entry.PerformedOn, ["performedBy"] = entry.PerformedBy, ["description"] = entry.Description,
            }));
        return Ok(new { success = true });
    }

    private async Task<IActionResult?> TaskError(Guid siteId, MaintenanceTaskRequest request, bool requireAsset)
    {
        if (requireAsset && (request.AssetId is not { } assetId || await assets.GetAsync(siteId, assetId) is null))
        {
            return BadRequest(new { success = false, error = "Choose an area or equipment of this site" });
        }
        if (TextError(request.Name, required: true, MaxNameLength, "Name") is { } nameError)
        {
            return nameError;
        }
        if (request.IntervalDays is not (>= 1 and <= MaxIntervalDays))
        {
            return BadRequest(new { success = false, error = $"The interval must be between 1 and {MaxIntervalDays} days" });
        }
        if (PlantDate.Parse(request.NextDue) is null)
        {
            return BadRequest(new { success = false, error = "Next due must be a date (yyyy-MM-dd)" });
        }
        return TextError(request.Notes, required: false, MaxTextLength, "Notes");
    }

    private BadRequestObjectResult? PerformedOnError(string? performedOn) =>
        PlantDate.Parse(performedOn) is { } date && date <= LatestPerformedOn
            ? null
            : BadRequest(new { success = false, error = "The date must be a day (yyyy-MM-dd), not in the future" });

    private BadRequestObjectResult? TextError(string? text, bool required, int maxLength, string field) =>
        (text?.Trim().Length ?? 0) switch
        {
            0 when required => BadRequest(new { success = false, error = $"{field} is required" }),
            var length when length > maxLength => BadRequest(new { success = false, error = $"{field} can be at most {maxLength} characters" }),
            _ => null,
        };

    private static string? Notes(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();

    private NotFoundObjectResult TaskNotFound() => NotFound(new { success = false, error = "Task not found" });

    private async Task<string?> AssetName(Guid siteId, Guid? assetId) =>
        assetId is { } id ? (await assets.GetAsync(siteId, id))?.Name : null;
}
