import { severityOrder, type SensorStatus } from './status';
import type { Asset, AssetKind } from './types';

// Helpers for the plant hierarchy: areas contain areas and equipment, equipment contains sensors.

export const kindLabels: Record<AssetKind, string> = {
    area: 'Area',
    equipment: 'Equipment',
};

/** Filter value for sensors that are not placed anywhere in the plant. */
export const UNASSIGNED = 'unassigned';

const byName = (a: Asset, b: Asset) => a.name.localeCompare(b.name, undefined, { numeric: true });

/** Direct children of `parentId` (null = top level): areas first, then by name. */
export const childrenOf = (assets: Asset[], parentId: string | null): Asset[] =>
    assets
        .filter(a => a.parentId === parentId)
        .sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === 'area' ? -1 : 1));

export interface TreeRow {
    asset: Asset;
    depth: number;
}

/** Every asset in tree order (parents before their children), with its depth, e.g. for a picker. */
export const flattenTree = (assets: Asset[]): TreeRow[] => {
    const rows: TreeRow[] = [];
    const visit = (parentId: string | null, depth: number) => {
        for (const asset of childrenOf(assets, parentId)) {
            rows.push({ asset, depth });
            visit(asset.id, depth + 1);
        }
    };
    visit(null, 0);
    return rows;
};

/** The asset and its ancestors, top level first. Empty for an unknown id. */
export const assetPath = (assets: Asset[], id: string | null): Asset[] => {
    const byId = new Map(assets.map(a => [a.id, a]));
    const path: Asset[] = [];
    for (let current = id ? byId.get(id) : undefined; current && !path.includes(current); current = current.parentId ? byId.get(current.parentId) : undefined) {
        path.unshift(current);
    }
    return path;
};

/** "Hall A / Line 1 / Oven" */
export const pathText = (assets: Asset[], id: string | null): string =>
    assetPath(assets, id).map(a => a.name).join(' / ');

/** Ids of the asset and everything below it. */
export const subtreeIds = (assets: Asset[], id: string): Set<string> => {
    const ids = new Set([id]);
    // Assets arrive in no particular order, so repeat until nothing new is added
    for (let grew = true; grew;) {
        grew = false;
        for (const a of assets) {
            if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) {
                ids.add(a.id);
                grew = true;
            }
        }
    }
    return ids;
};

/**
 * Whether a sensor on `assetId` passes the filter: `''` = everything, {@link UNASSIGNED} = not
 * placed, otherwise the selected asset or anything below it.
 */
export const assetFilter = (assets: Asset[], filter: string): ((assetId: string | null) => boolean) => {
    if (!filter) return () => true;
    if (filter === UNASSIGNED) return assetId => assetId === null;
    const ids = subtreeIds(assets, filter);
    return assetId => assetId !== null && ids.has(assetId);
};

/** The most severe of the given statuses, e.g. for an area with many sensors; "nodata" when empty. */
export const worstStatus = (statuses: SensorStatus[]): SensorStatus =>
    statuses.reduce<SensorStatus>((worst, s) => (severityOrder[s] < severityOrder[worst] ? s : worst), 'nodata');
