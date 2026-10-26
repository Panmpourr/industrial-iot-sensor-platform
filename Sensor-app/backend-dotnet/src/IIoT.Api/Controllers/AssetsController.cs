using System.Text.Json.Nodes;
using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IIoT.Api.Controllers;

public sealed record CreateAssetRequest(string? Name, string? Kind, Guid? ParentId);
public sealed record UpdateAssetRequest(string? Name, Guid? ParentId);

/// <summary>
/// The site's plant hierarchy: areas, which contain areas and equipment, and equipment, which
/// contains sensors. Every role can read it; changing it needs the engineer role and is audited.
/// </summary>
[ApiController]
[Authorize]
[RequireRole]
public sealed class AssetsController(AssetRepository assets, AuditRepository audit) : ControllerBase
{
    public const int MaxNameLength = 100;

    [HttpGet("/assets")]
    public async Task<IActionResult> GetAssets() => Ok(await assets.GetBySiteAsync(this.Member().SiteId));

    [RequireRole(Roles.Engineer)]
    [HttpPost("/assets")]
    public async Task<IActionResult> CreateAsset(CreateAssetRequest request)
    {
        var me = this.Member();
        if (ValidName(request.Name) is not { } name)
        {
            return NameRequired();
        }
        if (!AssetKinds.IsValid(request.Kind))
        {
            return BadRequest(new { success = false, error = "Kind must be 'area' or 'equipment'" });
        }
        if (await ParentError(me.SiteId, request.ParentId) is { } error)
        {
            return error;
        }

        var (result, id) = await assets.CreateAsync(me.SiteId, request.ParentId, name, request.Kind!);
        if (result == AssetSaveResult.DuplicateName)
        {
            return DuplicateName(name);
        }

        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
            AuditActions.AssetCreate, "asset", id.ToString(), name, new JsonObject { ["kind"] = request.Kind }));
        return Ok(new { success = true, id });
    }

    /// <summary>Renames an asset and/or moves it under another area (or to the top level).</summary>
    [RequireRole(Roles.Engineer)]
    [HttpPut("/assets/{assetId:guid}")]
    public async Task<IActionResult> UpdateAsset(Guid assetId, UpdateAssetRequest request)
    {
        var me = this.Member();
        if (ValidName(request.Name) is not { } name)
        {
            return NameRequired();
        }
        if (await assets.GetAsync(me.SiteId, assetId) is not { } existing)
        {
            return NotFound(new { success = false, error = "Asset not found" });
        }
        if (await ParentError(me.SiteId, request.ParentId) is { } error)
        {
            return error;
        }
        // Moving an area into itself or one of its own sub-areas would cut it off from the tree
        if (request.ParentId is { } parentId && await assets.IsInSubtreeAsync(me.SiteId, assetId, parentId))
        {
            return BadRequest(new { success = false, error = "An area cannot be moved into itself or one of its sub-areas" });
        }

        if (await assets.UpdateAsync(me.SiteId, assetId, request.ParentId, name) == AssetSaveResult.DuplicateName)
        {
            return DuplicateName(name);
        }

        var changes = new JsonArray();
        if (existing.Name != name)
        {
            changes.Add(AuditDiff.Change("name", existing.Name, name));
        }
        if (existing.ParentId != request.ParentId)
        {
            changes.Add(AuditDiff.Change("parent",
                await AssetName(me.SiteId, existing.ParentId), await AssetName(me.SiteId, request.ParentId)));
        }
        if (changes.Count > 0)
        {
            await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(
                AuditActions.AssetUpdate, "asset", assetId.ToString(), name, new JsonObject { ["changes"] = changes }));
        }
        return Ok(new { success = true });
    }

    /// <summary>Deletes an asset without child assets. Its sensors keep running, unassigned.</summary>
    [RequireRole(Roles.Engineer)]
    [HttpDelete("/assets/{assetId:guid}")]
    public async Task<IActionResult> DeleteAsset(Guid assetId)
    {
        var me = this.Member();
        if (await assets.GetAsync(me.SiteId, assetId) is not { } asset)
        {
            return NotFound(new { success = false, error = "Asset not found" });
        }

        var sensorCount = await assets.CountSensorsAsync(me.SiteId, assetId);
        switch (await assets.DeleteAsync(me.SiteId, assetId))
        {
            case AssetDeleteResult.HasChildren:
                return Conflict(new { success = false, error = $"“{asset.Name}” still contains areas or equipment. Move or delete them first." });
            case AssetDeleteResult.NotFound:
                return NotFound(new { success = false, error = "Asset not found" });
        }

        await audit.LogAsync(me.SiteId, me.UserId, new AuditEntry(AuditActions.AssetDelete, "asset", assetId.ToString(), asset.Name,
            new JsonObject { ["kind"] = asset.Kind, ["sensorsUnassigned"] = sensorCount }));
        return Ok(new { success = true });
    }

    private static string? ValidName(string? name) =>
        name?.Trim() is { Length: > 0 and <= MaxNameLength } trimmed ? trimmed : null;

    private BadRequestObjectResult NameRequired() =>
        BadRequest(new { success = false, error = $"Name is required (at most {MaxNameLength} characters)" });

    private ConflictObjectResult DuplicateName(string name) =>
        Conflict(new { success = false, error = $"There is already an asset called “{name}” here" });

    /// <summary>A parent must be an area of the caller's site; <c>null</c> means the top level.</summary>
    private async Task<IActionResult?> ParentError(Guid siteId, Guid? parentId)
    {
        if (parentId is not { } id)
        {
            return null;
        }
        return await assets.GetAsync(siteId, id) switch
        {
            null => BadRequest(new { success = false, error = "Parent not found" }),
            { Kind: not AssetKinds.Area } => BadRequest(new { success = false, error = "Only areas can contain other assets" }),
            _ => null,
        };
    }

    private async Task<string?> AssetName(Guid siteId, Guid? assetId) =>
        assetId is { } id ? (await assets.GetAsync(siteId, id))?.Name : null;
}
