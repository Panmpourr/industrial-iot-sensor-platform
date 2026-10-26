import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import {
    Alert, Badge, Box, Breadcrumbs, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton,
    Link, List, ListItemButton, ListItemIcon, ListItemText, Paper, Snackbar, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, AssessmentOutlined, DeleteOutline, EditOutlined, FactoryOutlined, HelpOutline, ShowChartOutlined } from '@mui/icons-material';
import { trendsLink } from '../trends';
import * as api from '../api';
import { isActive, isUnacked } from '../alarms';
import { apiErrorMessage } from '../auth';
import { assetFilter, assetPath, childrenOf, kindLabels, subtreeIds, UNASSIGNED, worstStatus } from '../assets';
import { useMe } from '../data/MeContext';
import { useSensorData } from '../data/SensorDataContext';
import { useSensorRows, type SensorRow } from '../data/useSensorRows';
import type { Asset, AssetKind } from '../types';
import AssetSelect, { AssetIcon } from '../ui/AssetSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { SensorKpis, SensorTable } from '../ui/SensorTable';
import { StatusDot } from '../ui/StatusIndicator';
import { ActiveAlarms } from './OverviewPage';

/** Live roll-up of one branch of the plant: its sensors, their worst status and open alarms. */
interface Summary {
    rows: SensorRow[];
    unacked: number;
}

const useSummaries = () => {
    const { assets, alarms } = useSensorData();
    const rows = useSensorRows();

    return useMemo(() => {
        const summarize = (matches: (assetId: string | null) => boolean): Summary => {
            const inside = rows.filter(r => matches(r.sensor.assetId));
            const ids = new Set(inside.map(r => r.id));
            return { rows: inside, unacked: alarms.filter(a => isUnacked(a) && ids.has(a.sensorId)).length };
        };
        const byAsset = new Map(assets.map(a => [a.id, summarize(assetFilter(assets, a.id))]));
        return { byAsset, unassigned: summarize(assetFilter(assets, UNASSIGNED)), site: summarize(() => true) };
    }, [assets, alarms, rows]);
};

const statusOf = (summary: Summary | undefined) => worstStatus(summary?.rows.map(r => r.status) ?? []);

// ---------------- Tree ----------------

interface TreeProps {
    selected: string;
    summaries: ReturnType<typeof useSummaries>;
}

const TreeNode = ({ asset, depth, selected, summaries }: TreeProps & { asset: Asset; depth: number }) => {
    const { assets } = useSensorData();
    const summary = summaries.byAsset.get(asset.id);
    return (
        <>
            <TreeItem to={`/plant/${asset.id}`} label={asset.name} icon={<AssetIcon kind={asset.kind} />} depth={depth}
                selected={selected === asset.id} summary={summary} />
            {childrenOf(assets, asset.id).map(child => (
                <TreeNode key={child.id} asset={child} depth={depth + 1} selected={selected} summaries={summaries} />
            ))}
        </>
    );
};

const TreeItem = ({ to, label, icon, depth, selected, summary }: {
    to: string; label: string; icon: ReactNode; depth: number; selected: boolean; summary: Summary | undefined;
}) => (
    <ListItemButton component={RouterLink} to={to} selected={selected} dense
        sx={{ pl: 1.5 + depth * 2, borderRadius: 1, mx: 0.5, '&.Mui-selected': { bgcolor: 'rgba(122, 162, 200, 0.14)' } }}>
        <ListItemIcon sx={{ minWidth: 30, color: selected ? 'primary.main' : 'text.secondary' }}>{icon}</ListItemIcon>
        <ListItemText primary={label} primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem', fontWeight: selected ? 600 : 400 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
            {!!summary?.unacked && (
                <Tooltip title={`${summary.unacked} alarm(s) to acknowledge`}>
                    <Badge badgeContent={summary.unacked} color="error" max={99} sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }} />
                </Tooltip>
            )}
            {!!summary?.rows.length && <StatusDot status={statusOf(summary)} />}
        </Stack>
    </ListItemButton>
);

const PlantTree = ({ selected, summaries }: TreeProps) => {
    const { assets } = useSensorData();
    const { me } = useMe();
    return (
        <Paper variant="outlined" sx={{ py: 1 }}>
            <List dense disablePadding>
                <TreeItem to="/plant" label={me?.siteName ?? 'Site'} icon={<FactoryOutlined fontSize="small" />} depth={0}
                    selected={selected === ''} summary={summaries.site} />
                {childrenOf(assets, null).map(asset => (
                    <TreeNode key={asset.id} asset={asset} depth={1} selected={selected} summaries={summaries} />
                ))}
                {summaries.unassigned.rows.length > 0 && (
                    <TreeItem to={`/plant/${UNASSIGNED}`} label="Not assigned" icon={<HelpOutline fontSize="small" />} depth={1}
                        selected={selected === UNASSIGNED} summary={summaries.unassigned} />
                )}
            </List>
        </Paper>
    );
};

// ---------------- Create / edit ----------------

type Editing =
    | { mode: 'create'; kind: AssetKind; parentId: string | null }
    | { mode: 'edit'; asset: Asset };

const AssetDialog = ({ editing, onClose, onSaved }: {
    editing: Editing | null;
    onClose: () => void;
    onSaved: (assetId: string) => void;
}) => {
    const { assets } = useSensorData();
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!editing) return;
        setName(editing.mode === 'edit' ? editing.asset.name : '');
        setParentId((editing.mode === 'edit' ? editing.asset.parentId : editing.parentId) ?? '');
        setError(null);
        setBusy(false);
    }, [editing]);

    const kind = editing?.mode === 'edit' ? editing.asset.kind : editing?.kind ?? 'area';
    // An area cannot move into itself or below itself
    const blocked = useMemo(
        () => (editing?.mode === 'edit' ? subtreeIds(assets, editing.asset.id) : undefined), [assets, editing]);

    const save = async () => {
        if (!editing) return;
        setBusy(true);
        setError(null);
        try {
            const changes = { name: name.trim(), parentId: parentId || null };
            if (editing.mode === 'edit') {
                await api.updateAsset(editing.asset.id, changes);
                onSaved(editing.asset.id);
            } else {
                onSaved(await api.createAsset({ ...changes, kind }));
            }
        } catch (e) {
            setError(apiErrorMessage(e) ?? 'Could not save.');
            setBusy(false);
        }
    };

    const title = editing?.mode === 'edit' ? `Edit ${kindLabels[kind].toLowerCase()}` : `Add ${kindLabels[kind].toLowerCase()}`;
    return (
        <Dialog open={!!editing} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5}>
                    <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth autoFocus
                        placeholder={kind === 'area' ? 'e.g. Hall A, Packaging line' : 'e.g. Oven 1, Compressor'}
                        inputProps={{ maxLength: 100 }}
                        onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && save()} />
                    <AssetSelect assets={assets} label="Inside" value={parentId} onChange={setParentId}
                        emptyLabel="Top level of the site" selectable={['area']} disabledIds={blocked} fullWidth
                        helperText={kind === 'area' ? 'Areas can contain areas and equipment' : 'Equipment sits in an area and holds sensors'} />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} color="inherit" disabled={busy}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={!name.trim() || busy}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                    {editing?.mode === 'edit' ? 'Save' : 'Add'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// ---------------- Page ----------------

/** Child areas and equipment as tiles with their live status. */
const ChildTiles = ({ items, summaries }: { items: Asset[]; summaries: ReturnType<typeof useSummaries> }) => (
    <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {items.map(child => {
            const summary = summaries.byAsset.get(child.id);
            const count = summary?.rows.length ?? 0;
            return (
                <Grid item xs={12} sm={6} lg={4} xl={3} key={child.id}>
                    <Paper variant="outlined" component={RouterLink} to={`/plant/${child.id}`}
                        sx={{ p: 1.75, display: 'flex', gap: 1.5, alignItems: 'center', color: 'inherit', textDecoration: 'none', '&:hover': { borderColor: 'primary.main' } }}>
                        <Box sx={{ color: 'text.secondary', display: 'flex' }}><AssetIcon kind={child.kind} /></Box>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{child.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {kindLabels[child.kind]} · {count === 1 ? '1 sensor' : `${count} sensors`}
                                {!!summary?.unacked && ` · ${summary.unacked} to acknowledge`}
                            </Typography>
                        </Box>
                        {count > 0 && <StatusDot status={statusOf(summary)} size={10} />}
                    </Paper>
                </Grid>
            );
        })}
    </Grid>
);

const PlantPage = () => {
    const { assetId = '' } = useParams();
    const navigate = useNavigate();
    const { assets, sensorsLoaded, alarms, refreshAssets, refreshSensors } = useSensorData();
    const { me, can } = useMe();
    const canEdit = can('engineer');
    const summaries = useSummaries();
    const [editing, setEditing] = useState<Editing | null>(null);
    const [toDelete, setToDelete] = useState<Asset | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

    // Others may have changed the plant since the app was opened
    useEffect(() => {
        refreshAssets();
    }, [refreshAssets]);

    const asset = assets.find(a => a.id === assetId);
    const unassigned = assetId === UNASSIGNED;
    const isSite = assetId === '';
    const summary = isSite ? summaries.site : unassigned ? summaries.unassigned : summaries.byAsset.get(assetId);
    const children = isSite ? childrenOf(assets, null) : asset ? childrenOf(assets, asset.id) : [];
    const sensorMatches = useMemo(() => {
        const ids = new Set(summary?.rows.map(r => r.id));
        return (sensorId: string) => ids.has(sensorId);
    }, [summary]);
    const openAlarms = summary ? alarms.filter(a => isActive(a) && sensorMatches(a.sensorId)).length : 0;

    const confirmDelete = async () => {
        if (!toDelete) return;
        setBusy(true);
        try {
            await api.deleteAsset(toDelete.id);
            await Promise.all([refreshAssets(), refreshSensors()]);
            setNotice({ severity: 'success', text: `${toDelete.name} deleted` });
            navigate(toDelete.parentId ? `/plant/${toDelete.parentId}` : '/plant');
        } catch (e) {
            setNotice({ severity: 'error', text: apiErrorMessage(e) ?? `Could not delete ${toDelete.name}` });
        } finally {
            setBusy(false);
            setToDelete(null);
        }
    };

    const onSaved = async (savedId: string) => {
        const created = editing?.mode === 'create';
        setEditing(null);
        await refreshAssets();
        setNotice({ severity: 'success', text: created ? 'Added' : 'Saved' });
        if (created) navigate(`/plant/${savedId}`);
    };

    // A link to an asset that was deleted (or belongs to another site)
    if (!isSite && !unassigned && !asset && assets.length > 0) {
        return <EmptyState title="Not found" message="This area or equipment does not exist (any more)."
            action={<Button component={RouterLink} to="/plant">Back to the plant</Button>} />;
    }

    const title = isSite ? me?.siteName ?? 'Plant' : unassigned ? 'Not assigned' : asset?.name ?? '';
    const subtitle = isSite
        ? 'Areas, equipment and their sensors'
        : unassigned ? 'Sensors that are not placed in the plant yet' : asset && kindLabels[asset.kind];
    const canHoldAssets = isSite || asset?.kind === 'area';

    return (
        <>
            {asset && (
                <Breadcrumbs sx={{ mb: 1, fontSize: '0.8rem' }}>
                    <Link component={RouterLink} to="/plant" underline="hover" color="text.secondary">{me?.siteName ?? 'Plant'}</Link>
                    {assetPath(assets, asset.id).slice(0, -1).map(a => (
                        <Link key={a.id} component={RouterLink} to={`/plant/${a.id}`} underline="hover" color="text.secondary">{a.name}</Link>
                    ))}
                </Breadcrumbs>
            )}
            <PageHeader
                title={(
                    <Stack direction="row" spacing={1} alignItems="center" component="span">
                        <span>{title}</span>
                        {canEdit && asset && (
                            <>
                                <Tooltip title="Rename or move">
                                    <IconButton size="small" onClick={() => setEditing({ mode: 'edit', asset })}><EditOutlined fontSize="small" /></IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                    <IconButton size="small" onClick={() => setToDelete(asset)}><DeleteOutline fontSize="small" /></IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Stack>
                )}
                subtitle={subtitle}
                actions={(
                    <>
                        {summary && summary.rows.some(r => r.sensor.type !== 'TTN') && (
                            <Button variant="outlined" startIcon={<ShowChartOutlined />} component={RouterLink}
                                to={trendsLink(summary.rows.filter(r => r.sensor.type !== 'TTN').map(r => r.id))}>Compare trends</Button>
                        )}
                        <Button variant="outlined" startIcon={<AssessmentOutlined />} component={RouterLink}
                            to={assetId ? `/reports?asset=${assetId}` : '/reports'}>Report</Button>
                        {canEdit && !unassigned && (<>
                            {canHoldAssets && (
                                <>
                                    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({ mode: 'create', kind: 'area', parentId: asset?.id ?? null })}>Area</Button>
                                    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({ mode: 'create', kind: 'equipment', parentId: asset?.id ?? null })}>Equipment</Button>
                                </>
                            )}
                            {asset && (
                                <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to={`/sensors?add=1&asset=${asset.id}`}>Sensor</Button>
                            )}
                        </>)}
                    </>
                )}
            />

            <Grid container spacing={2}>
                <Grid item xs={12} md={4} lg={3}>
                    <PlantTree selected={assetId} summaries={summaries} />
                </Grid>
                <Grid item xs={12} md={8} lg={9}>
                    {isSite && assets.length === 0 ? (
                        <EmptyState
                            icon={<FactoryOutlined sx={{ fontSize: 40, color: 'text.secondary' }} />}
                            title="Describe your plant"
                            message={canEdit
                                ? 'Add areas (halls, lines) and the equipment in them, then place sensors on the equipment. Overviews and alarms can then be filtered by area.'
                                : 'An engineer of your site can set up the areas and equipment.'}
                            action={canEdit && (
                                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ mode: 'create', kind: 'area', parentId: null })}>Add area</Button>
                            )}
                        />
                    ) : (
                        <>
                            {summary && summary.rows.length > 0 && <SensorKpis rows={summary.rows} />}
                            {children.length > 0 && <ChildTiles items={children} summaries={summaries} />}
                            <Grid container spacing={2}>
                                <Grid item xs={12} xl={openAlarms ? 8 : 12}>
                                    {summary && summary.rows.length > 0 ? (
                                        <SensorTable rows={summary.rows} showLocation={!asset || asset.kind === 'area'} />
                                    ) : sensorsLoaded && (
                                        <EmptyState title="No sensors here yet"
                                            message={canEdit && asset
                                                ? 'Add a new sensor here, or move an existing one by editing it on the Sensors page.'
                                                : 'Sensors placed here will show their live values.'} />
                                    )}
                                </Grid>
                                {openAlarms > 0 && (
                                    <Grid item xs={12} xl={4}>
                                        <ActiveAlarms sensorMatches={sensorMatches} viewAllLink={isSite ? '/alarms' : `/alarms?asset=${assetId}`} />
                                    </Grid>
                                )}
                            </Grid>
                        </>
                    )}
                </Grid>
            </Grid>

            <AssetDialog editing={editing} onClose={() => setEditing(null)} onSaved={onSaved} />

            <ConfirmDialog
                open={!!toDelete}
                title={`Delete ${toDelete ? kindLabels[toDelete.kind].toLowerCase() : ''}?`}
                message={`“${toDelete?.name}” will be removed from the plant. ${
                    toDelete && summaries.byAsset.get(toDelete.id)?.rows.length
                        ? 'Its sensors keep running and their data is kept; they just become unassigned.'
                        : ''}`}
                confirmLabel="Delete"
                busy={busy}
                onConfirm={confirmDelete}
                onClose={() => setToDelete(null)}
            />

            <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                {notice ? <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>{notice.text}</Alert> : undefined}
            </Snackbar>
        </>
    );
};

export default PlantPage;
