using Dapper;
using Npgsql;

namespace IIoT.Api.Data;

/// <summary>Kinds of assets in the plant hierarchy.</summary>
public static class AssetKinds
{
    /// <summary>A hall, line or zone; contains areas and equipment.</summary>
    public const string Area = "area";
    /// <summary>A machine; contains only sensors.</summary>
    public const string Equipment = "equipment";

    public static bool IsValid(string? kind) => kind is Area or Equipment;
}

public sealed record AssetRecord(Guid Id, Guid? ParentId, string Name, string Kind);

public enum AssetSaveResult
{
    Saved,
    /// <summary>Another asset with the same parent already has this name.</summary>
    DuplicateName,
}

public enum AssetDeleteResult
{
    Deleted,
    NotFound,
    HasChildren,
}

/// <summary>
/// The site's areas and equipment (table <c>assets</c>). Every query is scoped to one site;
/// the database also refuses links between sites.
/// </summary>
public sealed class AssetRepository(NpgsqlDataSource dataSource)
{
    private const string UniqueViolation = "23505";
    private const string ForeignKeyViolation = "23503";

    private const string SelectAsset = "SELECT id, parent_id AS ParentId, name, kind FROM assets";

    public async Task<IReadOnlyList<AssetRecord>> GetBySiteAsync(Guid siteId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        var rows = await conn.QueryAsync<AssetRecord>($"{SelectAsset} WHERE site_id = @siteId ORDER BY lower(name)", new { siteId });
        return rows.ToList();
    }

    public async Task<AssetRecord?> GetAsync(Guid siteId, Guid assetId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<AssetRecord>(
            $"{SelectAsset} WHERE id = @assetId AND site_id = @siteId", new { assetId, siteId });
    }

    public async Task<(AssetSaveResult Result, Guid Id)> CreateAsync(Guid siteId, Guid? parentId, string name, string kind)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        try
        {
            var id = await conn.ExecuteScalarAsync<Guid>(
                "INSERT INTO assets (site_id, parent_id, name, kind) VALUES (@siteId, @parentId, @name, @kind) RETURNING id",
                new { siteId, parentId, name, kind });
            return (AssetSaveResult.Saved, id);
        }
        catch (PostgresException ex) when (ex.SqlState == UniqueViolation)
        {
            return (AssetSaveResult.DuplicateName, Guid.Empty);
        }
    }

    /// <summary>Renames and/or moves an asset. The caller checks that the new parent is valid.</summary>
    public async Task<AssetSaveResult> UpdateAsync(Guid siteId, Guid assetId, Guid? parentId, string name)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        try
        {
            await conn.ExecuteAsync(
                "UPDATE assets SET parent_id = @parentId, name = @name WHERE id = @assetId AND site_id = @siteId",
                new { siteId, assetId, parentId, name });
            return AssetSaveResult.Saved;
        }
        catch (PostgresException ex) when (ex.SqlState == UniqueViolation)
        {
            return AssetSaveResult.DuplicateName;
        }
    }

    /// <summary>
    /// Deletes an asset that has no child assets. Its sensors stay in the site, unassigned.
    /// </summary>
    public async Task<AssetDeleteResult> DeleteAsync(Guid siteId, Guid assetId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        try
        {
            var affected = await conn.ExecuteAsync(
                "DELETE FROM assets WHERE id = @assetId AND site_id = @siteId", new { assetId, siteId });
            return affected > 0 ? AssetDeleteResult.Deleted : AssetDeleteResult.NotFound;
        }
        catch (PostgresException ex) when (ex.SqlState == ForeignKeyViolation)
        {
            return AssetDeleteResult.HasChildren;
        }
    }

    /// <summary>Whether <paramref name="candidateId"/> is <paramref name="assetId"/> itself or one of its descendants.</summary>
    public async Task<bool> IsInSubtreeAsync(Guid siteId, Guid assetId, Guid candidateId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>(
            """
            WITH RECURSIVE subtree AS (
                SELECT id FROM assets WHERE id = @assetId AND site_id = @siteId
                UNION
                SELECT a.id FROM assets a JOIN subtree s ON a.parent_id = s.id
            )
            SELECT EXISTS (SELECT 1 FROM subtree WHERE id = @candidateId)
            """, new { siteId, assetId, candidateId });
    }

    public async Task<int> CountSensorsAsync(Guid siteId, Guid assetId)
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT count(*) FROM sensors WHERE asset_id = @assetId AND site_id = @siteId", new { assetId, siteId });
    }
}
