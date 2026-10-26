import { describe, expect, it } from 'vitest';
import { UNASSIGNED, assetFilter, assetPath, childrenOf, flattenTree, groupByAsset, pathText, subtreeIds, worstStatus } from './assets';
import type { Asset } from './types';

const asset = (id: string, parentId: string | null, kind: Asset['kind'] = 'area', name = id): Asset => ({ id, parentId, name, kind });

// Deliberately out of order: children before their parents
const plant: Asset[] = [
    asset('oven', 'line1', 'equipment', 'Oven'),
    asset('line10', 'hall', 'area', 'Line 10'),
    asset('line1', 'hall', 'area', 'Line 1'),
    asset('press', 'hall', 'equipment', 'Press'),
    asset('hall', null, 'area', 'Hall A'),
    asset('yard', null, 'area', 'Yard'),
];

describe('childrenOf', () => {
    it('lists areas before equipment, in natural name order', () => {
        expect(childrenOf(plant, 'hall').map(a => a.id)).toEqual(['line1', 'line10', 'press']);
        expect(childrenOf(plant, null).map(a => a.id)).toEqual(['hall', 'yard']);
    });
});

describe('flattenTree', () => {
    it('puts every parent before its children, with the depth', () => {
        expect(flattenTree(plant).map(r => `${r.depth}:${r.asset.id}`))
            .toEqual(['0:hall', '1:line1', '2:oven', '1:line10', '1:press', '0:yard']);
    });
});

describe('assetPath', () => {
    it('goes from the top level down to the asset', () => {
        expect(assetPath(plant, 'oven').map(a => a.id)).toEqual(['hall', 'line1', 'oven']);
        expect(pathText(plant, 'oven')).toBe('Hall A / Line 1 / Oven');
    });

    it('is empty for no or an unknown asset', () => {
        expect(assetPath(plant, null)).toEqual([]);
        expect(pathText(plant, 'deleted')).toBe('');
    });
});

describe('subtreeIds', () => {
    it('contains the asset and everything below it', () => {
        expect([...subtreeIds(plant, 'hall')].sort()).toEqual(['hall', 'line1', 'line10', 'oven', 'press']);
        expect([...subtreeIds(plant, 'oven')]).toEqual(['oven']);
    });
});

describe('assetFilter', () => {
    it('keeps everything, only unassigned sensors, or one branch of the plant', () => {
        const sensorsOn = [null, 'oven', 'press', 'yard'];

        expect(sensorsOn.filter(assetFilter(plant, ''))).toEqual(sensorsOn);
        expect(sensorsOn.filter(assetFilter(plant, UNASSIGNED))).toEqual([null]);
        expect(sensorsOn.filter(assetFilter(plant, 'hall'))).toEqual(['oven', 'press']);
        expect(sensorsOn.filter(assetFilter(plant, 'line1'))).toEqual(['oven']);
    });
});

describe('worstStatus', () => {
    it('picks the most severe status', () => {
        expect(worstStatus(['normal', 'stale', 'warning', 'normal'])).toBe('warning');
        expect(worstStatus(['normal', 'critical'])).toBe('critical');
        expect(worstStatus([])).toBe('nodata');
    });
});

const placed = (id: string, assetId: string | null) => ({ id, assetId });

describe('groupByAsset', () => {
    const tree: Asset[] = [
        { id: 'hall', parentId: null, name: 'Hall A', kind: 'area' },
        { id: 'oven', parentId: 'hall', name: 'Oven 1', kind: 'equipment' },
        { id: 'press', parentId: 'hall', name: 'Press', kind: 'equipment' },
        { id: 'yard', parentId: null, name: 'Yard', kind: 'area' },
    ];
    const names = (groups: { asset: Asset | null; rows: { id: string }[]; children: unknown[] }[]): unknown =>
        groups.map(g => [g.asset?.name ?? 'unplaced', g.rows.map(r => r.id), names(g.children as typeof groups)]);

    it('follows the plant tree, leaves out empty branches and puts unplaced sensors last', () => {
        const groups = groupByAsset(tree, [placed('temp', 'oven'), placed('hum', null), placed('hallTemp', 'hall'), placed('old', 'deleted')],
            s => s.assetId);

        expect(names(groups)).toEqual([
            ['Hall A', ['hallTemp'], [['Oven 1', ['temp'], []]]],
            ['unplaced', ['hum', 'old'], []],
        ]);
        expect(groups[0].all.map(s => s.id)).toEqual(['hallTemp', 'temp']);
        expect(groups[0].children[0].depth).toBe(1);
    });

    it('is empty without items', () => {
        expect(groupByAsset(tree, [], () => null)).toEqual([]);
    });
});
