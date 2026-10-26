import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import {
    Box, Grid, IconButton, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { ChevronRight, ExpandMore, HelpOutline } from '@mui/icons-material';
import { groupByAsset, pathText, worstStatus, type AssetGroup } from '../assets';
import { useSensorData } from '../data/SensorDataContext';
import type { SensorRow } from '../data/useSensorRows';
import { formatAge, formatValue, sensorTypeLabels } from '../status';
import { statusColors } from '../theme';
import KpiTile from './KpiTile';
import Sparkline from './Sparkline';
import { AssetIcon } from './AssetSelect';
import { StatusChip, StatusDot } from './StatusIndicator';

interface SensorTableProps {
    rows: SensorRow[];
    /** Also show where each sensor is in the plant. */
    showLocation?: boolean;
}

const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } };
const hideOnTablet = { display: { xs: 'none', md: 'table-cell' } };
const COLUMNS = 5;

const SensorHead = () => (
    <TableHead>
        <TableRow>
            <TableCell>Sensor</TableCell>
            <TableCell align="right">Value</TableCell>
            <TableCell>Status</TableCell>
            <TableCell sx={hideOnTablet}>Trend</TableCell>
            <TableCell sx={hideOnPhone}>Last update</TableCell>
        </TableRow>
    </TableHead>
);

/** One sensor with its live value; the row opens the sensor's page. `indent` is the level in a grouped table. */
const SensorLine = ({ row, location, indent = 0 }: { row: SensorRow; location?: string; indent?: number }) => {
    const navigate = useNavigate();
    const { now } = useSensorData();
    return (
        <TableRow hover onClick={() => navigate(`/sensors/${row.id}`)} sx={{ cursor: 'pointer' }}>
            <TableCell sx={{ pl: 2 + indent * 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.sensor.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {sensorTypeLabels[row.sensor.type]}{location && ` · ${location}`}
                </Typography>
            </TableCell>
            <TableCell align="right">
                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatValue(row.value, row.unit)}</Typography>
            </TableCell>
            <TableCell><StatusChip status={row.status} /></TableCell>
            <TableCell sx={{ ...hideOnTablet, py: 0.5 }}>
                <Sparkline values={row.trend} />
            </TableCell>
            <TableCell sx={{ ...hideOnPhone, color: 'text.secondary' }}>
                {row.latest ? formatAge(row.latest.timestamp, now) : '—'}
            </TableCell>
        </TableRow>
    );
};

/** Live values of the given sensors; a row opens the sensor's page. */
export const SensorTable = ({ rows, showLocation }: SensorTableProps) => {
    const { assets } = useSensorData();
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
                <SensorHead />
                <TableBody>
                    {rows.map(row => (
                        <SensorLine key={row.id} row={row} location={showLocation ? pathText(assets, row.sensor.assetId) : ''} />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const COLLAPSED_KEY = 'overviewCollapsed';
const UNPLACED_KEY = 'unplaced';

const loadCollapsed = (): Set<string> => {
    try {
        return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
    } catch {
        return new Set();
    }
};

/** "2 sensors · 1 critical · 1 warning" */
const GroupSummary = ({ rows }: { rows: SensorRow[] }) => {
    const critical = rows.filter(r => r.status === 'critical').length;
    const warning = rows.filter(r => r.status === 'warning').length;
    const stale = rows.filter(r => r.status === 'stale').length;
    return (
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {rows.length} sensor{rows.length === 1 ? '' : 's'}
            {critical > 0 && <Box component="span" sx={{ color: statusColors.critical, fontWeight: 600 }}> · {critical} critical</Box>}
            {warning > 0 && <Box component="span" sx={{ color: statusColors.warning, fontWeight: 600 }}> · {warning} warning</Box>}
            {stale > 0 && <Box component="span" sx={{ color: statusColors.stale }}> · {stale} without data</Box>}
        </Typography>
    );
};

/**
 * The sensors arranged like the plant tree: a header row per area and machine (worst status,
 * counts, link to its plant page), which can be folded away. Folding is remembered per browser.
 */
export const GroupedSensorTable = ({ rows }: { rows: SensorRow[] }) => {
    const { assets } = useSensorData();
    const groups = useMemo(() => groupByAsset(assets, rows, r => r.sensor.assetId), [assets, rows]);
    const [collapsed, setCollapsed] = useState(loadCollapsed);

    const toggle = (key: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try {
                localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
            } catch {
                // Not remembered; folding still works for this visit
            }
            return next;
        });
    };

    const renderGroup = (group: AssetGroup<SensorRow>): ReactNode => {
        const key = group.asset?.id ?? UNPLACED_KEY;
        const open = !collapsed.has(key);
        return (
            <Fragment key={key}>
                <TableRow sx={{ bgcolor: 'rgba(255, 255, 255, 0.025)' }}>
                    <TableCell colSpan={COLUMNS} sx={{ py: 0.5, pl: 0.5 + group.depth * 2.5 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <IconButton size="small" onClick={() => toggle(key)} aria-label={open ? 'Fold' : 'Unfold'} aria-expanded={open}>
                                {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
                            </IconButton>
                            <StatusDot status={worstStatus(group.all.map(r => r.status))} />
                            <Box sx={{ display: 'flex', color: 'text.secondary' }}>
                                {group.asset ? <AssetIcon kind={group.asset.kind} /> : <HelpOutline fontSize="small" />}
                            </Box>
                            {group.asset ? (
                                <Link component={RouterLink} to={`/plant/${group.asset.id}`} underline="hover" color="inherit"
                                    sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{group.asset.name}</Link>
                            ) : (
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>Not assigned</Typography>
                            )}
                            <Box sx={{ flexGrow: 1 }} />
                            <GroupSummary rows={group.all} />
                        </Stack>
                    </TableCell>
                </TableRow>
                {open && group.rows.map(row => <SensorLine key={row.id} row={row} indent={group.depth + 1} />)}
                {open && group.children.map(renderGroup)}
            </Fragment>
        );
    };

    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
                <SensorHead />
                <TableBody>{groups.map(renderGroup)}</TableBody>
            </Table>
        </TableContainer>
    );
};

/** Sensors / reporting / warnings / critical counts for the given sensors. */
export const SensorKpis = ({ rows }: { rows: SensorRow[] }) => {
    const count = (status: SensorRow['status']) => rows.filter(r => r.status === status).length;
    const reporting = rows.filter(r => r.status !== 'stale' && r.status !== 'nodata').length;
    const warnings = count('warning');
    const criticals = count('critical');

    return (
        <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
                <KpiTile label="Sensors" value={rows.length} caption="configured" />
            </Grid>
            <Grid item xs={6} md={3}>
                <KpiTile label="Reporting" value={`${reporting}/${rows.length}`}
                    accent={reporting < rows.length ? statusColors.stale : undefined}
                    caption={reporting < rows.length ? `${rows.length - reporting} without recent data` : 'all sending data'} />
            </Grid>
            <Grid item xs={6} md={3}>
                <KpiTile label="Warnings" value={warnings} accent={warnings ? statusColors.warning : undefined} caption="outside a warning limit" />
            </Grid>
            <Grid item xs={6} md={3}>
                <KpiTile label="Critical" value={criticals} accent={criticals ? statusColors.critical : undefined} caption="outside a critical limit" />
            </Grid>
        </Grid>
    );
};
