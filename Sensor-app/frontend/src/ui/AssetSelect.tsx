import { useMemo } from 'react';
import { Box, MenuItem, TextField, type SxProps, type Theme } from '@mui/material';
import { AccountTreeOutlined, PrecisionManufacturingOutlined } from '@mui/icons-material';
import { flattenTree, UNASSIGNED } from '../assets';
import type { Asset, AssetKind } from '../types';

export const AssetIcon = ({ kind, fontSize = 'small' }: { kind: AssetKind; fontSize?: 'small' | 'inherit' }) =>
    kind === 'area' ? <AccountTreeOutlined fontSize={fontSize} /> : <PrecisionManufacturingOutlined fontSize={fontSize} />;

interface AssetSelectProps {
    assets: Asset[];
    label: string;
    /** Asset id, '' for the first option, or {@link UNASSIGNED} */
    value: string;
    onChange: (value: string) => void;
    /** Text of the '' option, e.g. "Not assigned" in a form or "Whole plant" in a filter. */
    emptyLabel: string;
    /** Adds a "Not assigned" option (value {@link UNASSIGNED}) for filters. */
    unassignedOption?: boolean;
    /** Only these kinds can be chosen (others are shown, disabled, to keep the tree readable). */
    selectable?: AssetKind[];
    /** Ids that cannot be chosen, e.g. an area and its sub-areas when moving it. */
    disabledIds?: Set<string>;
    helperText?: string;
    sx?: SxProps<Theme>;
    fullWidth?: boolean;
}

/** Drop-down of the plant hierarchy, indented by level. */
const AssetSelect = ({
    assets, label, value, onChange, emptyLabel, unassignedOption, selectable, disabledIds, helperText, sx, fullWidth,
}: AssetSelectProps) => {
    const rows = useMemo(() => flattenTree(assets), [assets]);
    // A deleted asset would leave MUI with a value it has no option for
    const known = value === '' || value === UNASSIGNED || rows.some(r => r.asset.id === value);

    return (
        <TextField select size="small" label={label} value={known ? value : ''} onChange={(e) => onChange(e.target.value)}
            helperText={helperText} sx={sx} fullWidth={fullWidth}>
            <MenuItem value="">{emptyLabel}</MenuItem>
            {unassignedOption && <MenuItem value={UNASSIGNED}>Not assigned</MenuItem>}
            {rows.map(({ asset, depth }) => (
                <MenuItem key={asset.id} value={asset.id}
                    disabled={(selectable && !selectable.includes(asset.kind)) || disabledIds?.has(asset.id)}>
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, pl: depth * 2, color: 'inherit' }}>
                        <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}><AssetIcon kind={asset.kind} /></Box>
                        {asset.name}
                    </Box>
                </MenuItem>
            ))}
        </TextField>
    );
};

export default AssetSelect;
