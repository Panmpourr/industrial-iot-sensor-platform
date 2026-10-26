using System.Security.Cryptography;
using System.Text.Json.Nodes;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using IIoT.Api.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record NotificationRuleRequest(string? UserId, Guid? AssetId, string? MinPriority, int? DelayMinutes);

/// <summary>
/// Telegram connection of the signed-in user, and the site's notification rules (who is told about
/// which alarms, and when). Every role can read the rules; changing them needs the engineer role.
/// </summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class NotificationsController(
    NotificationRepository notifications, AssetRepository assets, TelegramSettings settings, TelegramBotService bot,
    ITelegramApi telegram, AuditRepository audit) : ControllerBase
{
    private static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(10);
    private const int MaxDelayMinutes = 1440;
    private const int MaxLog = 200;

    // ---------------- Telegram connection ----------------

    [HttpGet("/telegram")]
    public async Task<IActionResult> GetTelegram() => Ok(new
    {
        enabled = settings.Enabled,
        botUsername = bot.Username,
        connected = await notifications.GetChatIdAsync(this.Member().UserId) is not null,
    });

    /// <summary>A one-time t.me link: opening it and pressing Start connects that chat to the caller.</summary>
    [HttpPost("/telegram/link")]
    public async Task<IActionResult> CreateLink()
    {
        if (!settings.Enabled || bot.Username is not { } username)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { success = false, error = "Telegram notifications are not set up on this server" });
        }

        // 128 random bits in the characters Telegram allows for a start parameter
        var code = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var expiresAt = DateTimeOffset.UtcNow + LinkLifetime;
        await notifications.CreateLinkCodeAsync(this.Member().UserId, code, expiresAt);
        return Ok(new { success = true, url = $"https://t.me/{username}?start={code}", expiresAt = expiresAt.ToUnixTimeMilliseconds() });
    }

    [HttpDelete("/telegram/link")]
    public async Task<IActionResult> Disconnect()
    {
        var me = this.Member();
        if (await notifications.GetChatIdAsync(me.UserId) is not null)
        {
            await notifications.UnlinkUserAsync(me.UserId);
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.TelegramDisconnect, "user", me.UserId, me.UserId));
        }
        return Ok(new { success = true });
    }

    [HttpPost("/telegram/test")]
    public async Task<IActionResult> SendTest(CancellationToken ct)
    {
        var me = this.Member();
        if (!settings.Enabled || await notifications.GetChatIdAsync(me.UserId) is not { } chatId)
        {
            return Conflict(new { success = false, error = "Connect Telegram first" });
        }
        try
        {
            await telegram.SendMessageAsync(chatId,
                $"👋 Test message. Alarms of <b>{NotificationMessages.Html(me.SiteName)}</b> that your notification rules select will arrive here.",
                null, ct);
        }
        catch (TelegramException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { success = false, error = $"Telegram: {ex.Message}" });
        }
        return Ok(new { success = true });
    }

    // ---------------- Rules ----------------

    [HttpGet("/notification-rules")]
    public async Task<IActionResult> GetRules()
    {
        var siteId = this.Member().SiteId;
        var recipients = await notifications.GetRecipientsAsync(siteId);
        return Ok(new
        {
            rules = await notifications.GetRulesAsync(siteId),
            users = recipients.Select(u => new { id = u.Id, role = u.Role, telegramConnected = u.Connected }),
        });
    }

    [RequireRole(Roles.Engineer)]
    [HttpPost("/notification-rules")]
    public async Task<IActionResult> CreateRule(NotificationRuleRequest request)
    {
        var me = this.Member();
        if (await Validate(me.SiteId, request) is { } error)
        {
            return error;
        }

        var id = await notifications.CreateRuleAsync(me.SiteId, request.UserId!, request.AssetId, request.MinPriority!, request.DelayMinutes ?? 0);
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.NotificationRuleCreate, "notification-rule", id.ToString(),
            request.UserId, await Describe(me.SiteId, request.AssetId, request.MinPriority!, request.DelayMinutes ?? 0)));
        return Ok(new { success = true, id });
    }

    [RequireRole(Roles.Engineer)]
    [HttpPut("/notification-rules/{ruleId:guid}")]
    public async Task<IActionResult> UpdateRule(Guid ruleId, NotificationRuleRequest request)
    {
        var me = this.Member();
        if (await notifications.GetRuleAsync(me.SiteId, ruleId) is not { } existing)
        {
            return NotFound(new { success = false, error = "Rule not found" });
        }
        if (await Validate(me.SiteId, request) is { } error)
        {
            return error;
        }

        var delay = request.DelayMinutes ?? 0;
        await notifications.UpdateRuleAsync(me.SiteId, ruleId, request.UserId!, request.AssetId, request.MinPriority!, delay);

        var changes = new JsonArray();
        if (existing.UserId != request.UserId) changes.Add(AuditDiff.Change("recipient", existing.UserId, request.UserId));
        if (existing.AssetId != request.AssetId)
        {
            changes.Add(AuditDiff.Change("area", await AreaName(me.SiteId, existing.AssetId), await AreaName(me.SiteId, request.AssetId)));
        }
        if (existing.MinPriority != request.MinPriority) changes.Add(AuditDiff.Change("priority", existing.MinPriority, request.MinPriority));
        if (existing.DelayMinutes != delay) changes.Add(AuditDiff.Change("delay", $"{existing.DelayMinutes} min", $"{delay} min"));
        if (changes.Count > 0)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.NotificationRuleUpdate, "notification-rule",
                ruleId.ToString(), request.UserId, new JsonObject { ["changes"] = changes }));
        }
        return Ok(new { success = true });
    }

    [RequireRole(Roles.Engineer)]
    [HttpDelete("/notification-rules/{ruleId:guid}")]
    public async Task<IActionResult> DeleteRule(Guid ruleId)
    {
        var me = this.Member();
        if (await notifications.GetRuleAsync(me.SiteId, ruleId) is not { } rule || !await notifications.DeleteRuleAsync(me.SiteId, ruleId))
        {
            return NotFound(new { success = false, error = "Rule not found" });
        }
        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.NotificationRuleDelete, "notification-rule", ruleId.ToString(),
            rule.UserId, await Describe(me.SiteId, rule.AssetId, rule.MinPriority, rule.DelayMinutes)));
        return Ok(new { success = true });
    }

    /// <summary>The latest notifications of the site: who was told about which alarm, and whether it worked.</summary>
    [HttpGet("/notifications")]
    public async Task<IActionResult> GetLog([FromQuery] int? limit) =>
        Ok(await notifications.GetLogAsync(this.Member().SiteId, Math.Clamp(limit ?? 50, 1, MaxLog)));

    private async Task<IActionResult?> Validate(Guid siteId, NotificationRuleRequest request)
    {
        if (request.UserId is null || !(await notifications.GetRecipientsAsync(siteId)).Any(u => u.Id == request.UserId))
        {
            return BadRequest(new { success = false, error = "Choose a user of this site" });
        }
        if (!NotificationRepository.Priorities.Contains(request.MinPriority))
        {
            return BadRequest(new { success = false, error = "Priority must be 'warning' or 'critical'" });
        }
        if (request.DelayMinutes is < 0 or > MaxDelayMinutes)
        {
            return BadRequest(new { success = false, error = $"The delay must be between 0 and {MaxDelayMinutes} minutes" });
        }
        if (request.AssetId is { } assetId && await assets.GetAsync(siteId, assetId) is null)
        {
            return BadRequest(new { success = false, error = "Area not found" });
        }
        return null;
    }

    private async Task<JsonObject> Describe(Guid siteId, Guid? assetId, string minPriority, int delayMinutes) => new()
    {
        ["area"] = await AreaName(siteId, assetId) ?? "whole plant",
        ["priority"] = minPriority,
        ["delayMinutes"] = delayMinutes,
    };

    private async Task<string?> AreaName(Guid siteId, Guid? assetId) =>
        assetId is { } id ? (await assets.GetAsync(siteId, id))?.Name : null;
}
