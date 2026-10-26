import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import {
    Box, Button, Chip, IconButton, Link, Paper, Snackbar, Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, CheckCircleOutline, DeleteOutline, EditOutlined, NotificationsActiveOutlined } from '@mui/icons-material';
import * as api from '../api';
import { pathText } from '../assets';
import { useMe } from '../data/MeContext';
import { useSensorData } from '../data/SensorDataContext';
import { byDue, dueStatus, dueText, formatDay, formatMinutes, intervalText, kindLabels, todayText, type DueStatus } from '../maintenance';
import { statusColors } from '../theme';
import type { MaintenanceEntry, MaintenanceTask } from '../types';
import ConfirmDialog from '../ui/ConfirmDialog';
import { CompleteDialog, LogWorkDialog, TaskDialog, type TaskEditing } from './MaintenanceDialogs';
import type { useMaintenance } from './useMaintenance';

const dueColors: Record<DueStatus, string | undefined> = {
    overdue: statusColors.critical,
    soon: statusColors.warning,
    ok: undefined,
};

export const DueChip = ({ nextDue, today }: { nextDue: string; today: string }) => {
    const status = dueStatus(nextDue, today);
    const color = dueColors[status];
    return (
        <Chip size="small" variant="outlined" label={dueText(nextDue, today)}
            sx={{ color: color ?? 'text.secondary', borderColor: color ?? 'divider', fontWeight: status === 'ok' ? 400 : 600 }} />
    );
};

const AssetLink = ({ assetId, fallback }: { assetId: string | null; fallback: string }) => {
    const { assets } = useSensorData();
    const path = assetId ? pathText(assets, assetId) : '';
    return assetId && path
        ? <Link component={RouterLink} to={`/plant/${assetId}`} underline="hover" color="inherit">{path}</Link>
        : <Typography variant="body2" component="span" color="text.secondary">{fallback} (deleted)</Typography>;
};

interface SectionProps {
    data: ReturnType<typeof useMaintenance>;
    /** Which assets to show (e.g. one machine, an area with everything in it, or the whole plant). */
    matches: (assetId: string | null) => boolean;
    /** Preselected in the forms, e.g. the machine whose page this is. */
    defaultAssetId?: string | null;
    /** Show the equipment column (not needed on a machine's own page). */
    showAsset?: boolean;
    logLimit?: number;
}

/** Tasks (most urgent first) and the work log, with the actions each role may take. */
const MaintenanceSection = ({ data, matches, defaultAssetId = null, showAsset = true, logLimit = 50 }: SectionProps) => {
    const { now } = useSensorData();
    const canEdit = useMe().can('engineer');
    const today = todayText(now);
    const [editing, setEditing] = useState<TaskEditing>(null);
    const [completing, setCompleting] = useState<MaintenanceTask | null>(null);
    const [logging, setLogging] = useState(false);
    const [toDelete, setToDelete] = useState<{ kind: 'task'; task: MaintenanceTask } | { kind: 'entry'; entry: MaintenanceEntry } | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const tasks = (data.tasks ?? []).filter(t => matches(t.assetId)).sort(byDue);
    // Entries of deleted equipment have no asset any more; they show where unplaced things do
    const entries = data.log.filter(e => matches(e.assetId)).slice(0, logLimit);

    const doDelete = async () => {
        if (!toDelete) return;
        setBusy(true);
        try {
            if (toDelete.kind === 'task') await api.deleteMaintenanceTask(toDelete.task.id);
            else await api.deleteMaintenanceEntry(toDelete.entry.id);
            await data.refresh();
        } finally {
            setBusy(false);
            setToDelete(null);
        }
    };

    return (
        <>
            <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Maintenance tasks</Typography>
                <Button size="small" variant="outlined" onClick={() => setLogging(true)}>Log work</Button>
                {canEdit && (
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({ assetId: defaultAssetId })}>Task</Button>
                )}
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Task</TableCell>
                            {showAsset && <TableCell>Where</TableCell>}
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Repeat</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Last done</TableCell>
                            <TableCell>Next due</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tasks.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} sx={{ color: 'text.secondary' }}>
                                    {data.tasks === null ? 'Loading…' : canEdit
                                        ? 'No recurring tasks yet. Add one, e.g. “Replace air filter, every month”.'
                                        : 'No recurring tasks yet. An engineer can plan them.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {tasks.map(task => (
                            <TableRow key={task.id}>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{task.name}</Typography>
                                    {task.notes && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{task.notes}</Typography>}
                                </TableCell>
                                {showAsset && <TableCell><AssetLink assetId={task.assetId} fallback="" /></TableCell>}
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{intervalText(task.intervalDays)}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                                    {task.lastDone ? formatDay(task.lastDone) : 'Never'}
                                </TableCell>
                                <TableCell>
                                    <Stack spacing={0.5} alignItems="flex-start">
                                        <DueChip nextDue={task.nextDue} today={today} />
                                        <Typography variant="caption" color="text.secondary">{formatDay(task.nextDue)}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    <Button size="small" startIcon={<CheckCircleOutline />} onClick={() => setCompleting(task)}>Done</Button>
                                    {canEdit && (
                                        <>
                                            <Tooltip title="Change">
                                                <IconButton size="small" onClick={() => setEditing({ task })}><EditOutlined fontSize="small" /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" onClick={() => setToDelete({ kind: 'task', task })}><DeleteOutline fontSize="small" /></IconButton>
                                            </Tooltip>
                                        </>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Work log</Typography>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            {showAsset && <TableCell>Where</TableCell>}
                            <TableCell>Work</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>By</TableCell>
                            <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Time</TableCell>
                            {canEdit && <TableCell align="right" />}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {entries.length === 0 && (
                            <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary' }}>Nothing logged yet.</TableCell></TableRow>
                        )}
                        {entries.map(entry => (
                            <TableRow key={entry.id}>
                                <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{formatDay(entry.performedOn)}</TableCell>
                                {showAsset && <TableCell sx={{ verticalAlign: 'top' }}><AssetLink assetId={entry.assetId} fallback={entry.assetName} /></TableCell>}
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.taskName ?? kindLabels[entry.kind]}</Typography>
                                        {entry.taskName && <Typography variant="caption" color="text.secondary">{kindLabels[entry.kind]}</Typography>}
                                        {entry.alarmId && (
                                            <Tooltip title="Logged for an alarm">
                                                <NotificationsActiveOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
                                            </Tooltip>
                                        )}
                                    </Stack>
                                    {entry.description && (
                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{entry.description}</Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, verticalAlign: 'top' }}>{entry.performedBy}</TableCell>
                                <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' }, verticalAlign: 'top', color: 'text.secondary' }}>
                                    {formatMinutes(entry.durationMinutes)}
                                </TableCell>
                                {canEdit && (
                                    <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                                        <Tooltip title="Remove (if logged by mistake)">
                                            <IconButton size="small" onClick={() => setToDelete({ kind: 'entry', entry })}><DeleteOutline fontSize="small" /></IconButton>
                                        </Tooltip>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {data.log.length > 0 && entries.length === logLimit && (
                <Box sx={{ mt: 1 }}><Typography variant="caption" color="text.secondary">Showing the latest {logLimit} entries.</Typography></Box>
            )}

            <TaskDialog editing={editing} onClose={() => setEditing(null)}
                onSaved={async () => { setEditing(null); setNotice('Saved'); await data.refresh(); }} />
            <CompleteDialog task={completing} onClose={() => setCompleting(null)}
                onDone={async nextDue => { setCompleting(null); setNotice(`Logged. Next due ${formatDay(nextDue)}`); await data.refresh(); }} />
            <LogWorkDialog open={logging} assetId={defaultAssetId} onClose={() => setLogging(false)}
                onSaved={async () => { setLogging(false); setNotice('Work logged'); await data.refresh(); }} />
            <ConfirmDialog
                open={toDelete !== null}
                title={toDelete?.kind === 'task' ? 'Delete task?' : 'Remove log entry?'}
                message={toDelete?.kind === 'task'
                    ? `“${toDelete.task.name}” will no longer be planned. Work already logged for it stays in the log.`
                    : 'Only for entries logged by mistake. The removal is recorded in the audit log.'}
                confirmLabel={toDelete?.kind === 'task' ? 'Delete' : 'Remove'}
                busy={busy}
                onConfirm={doDelete}
                onClose={() => setToDelete(null)}
            />
            <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity="success" onClose={() => setNotice(null)} variant="filled">{notice}</Alert>
            </Snackbar>
        </>
    );
};

export default MaintenanceSection;
