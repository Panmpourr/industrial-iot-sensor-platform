import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import {
    Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Paper, Stack, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, DeleteOutline, EditOutlined, SendToMobileOutlined } from '@mui/icons-material';
import * as api from '../api';
import { conditionLabels } from '../alarms';
import { pathText } from '../assets';
import { apiErrorMessage } from '../auth';
import { useMe } from '../data/MeContext';
import { useSensorData } from '../data/SensorDataContext';
import { delayLabel, delayOptions, deliveryStatus } from '../notifications';
import { roleLabels } from '../roles';
import { statusColors } from '../theme';
import type { NotificationLogEntry, NotificationRecipient, NotificationRule, Status, TelegramStatus } from '../types';
import AssetSelect from '../ui/AssetSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

const LOG_REFRESH_MS = 15_000;

const priorityLabels: Record<Status, string> = {
    critical: 'Critical only',
    warning: 'Warning and critical',
    normal: 'All',
};

type Editing = { rule: NotificationRule | null } | null;

const RuleDialog = ({ editing, users, onClose, onSaved }: {
    editing: Editing; users: NotificationRecipient[]; onClose: () => void; onSaved: () => void;
}) => {
    const { assets } = useSensorData();
    const [userId, setUserId] = useState('');
    const [assetId, setAssetId] = useState('');
    const [minPriority, setMinPriority] = useState<Status>('critical');
    const [delay, setDelay] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!editing) return;
        setUserId(editing.rule?.userId ?? '');
        setAssetId(editing.rule?.assetId ?? '');
        setMinPriority(editing.rule?.minPriority ?? 'critical');
        setDelay(editing.rule?.delayMinutes ?? 0);
        setError(null);
    }, [editing]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const input = { userId, assetId: assetId || null, minPriority, delayMinutes: delay };
        try {
            if (editing?.rule) await api.updateNotificationRule(editing.rule.id, input);
            else await api.createNotificationRule(input);
            onSaved();
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not save the rule. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const recipient = users.find(u => u.id === userId);
    // A delay saved earlier that is not in the list still shows
    const delays = delayOptions.includes(delay) ? delayOptions : [...delayOptions, delay].sort((a, b) => a - b);

    return (
        <Dialog open={editing !== null} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <form onSubmit={submit}>
                <DialogTitle>{editing?.rule ? 'Change rule' : 'Add notification rule'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField select label="Send to" value={userId} onChange={e => setUserId(e.target.value)} required
                            helperText={recipient && !recipient.telegramConnected
                                ? 'Has not connected Telegram yet (on their Account page); until then nothing reaches them.' : ' '}>
                            {users.map(u => (
                                <MenuItem key={u.id} value={u.id}>
                                    {u.id} · {roleLabels[u.role]}{u.telegramConnected ? '' : ' (no Telegram)'}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select label="Alarms" value={minPriority} onChange={e => setMinPriority(e.target.value as Status)}>
                            <MenuItem value="critical">{priorityLabels.critical}</MenuItem>
                            <MenuItem value="warning">{priorityLabels.warning}</MenuItem>
                        </TextField>
                        <AssetSelect assets={assets} label="From" value={assetId} onChange={setAssetId} emptyLabel="Whole plant" fullWidth
                            helperText="An area includes everything in it" />
                        <TextField select label="When" value={delay} onChange={e => setDelay(Number(e.target.value))}
                            helperText={delay > 0 ? 'Escalation: only alarms still active and not acknowledged by then' : 'As soon as the alarm is raised'}>
                            {delays.map(d => <MenuItem key={d} value={d}>{delayLabel(d)}</MenuItem>)}
                        </TextField>
                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
                    <Button type="submit" variant="contained" disabled={busy || !userId}>{editing?.rule ? 'Save' : 'Add'}</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

const DeliveryCell = ({ entry }: { entry: NotificationLogEntry }) => {
    const status = deliveryStatus(entry);
    if (status === 'sent') return <Typography variant="body2" sx={{ color: statusColors.normal }}>Sent</Typography>;
    if (status === 'sending') return <Typography variant="body2" color="text.secondary">Sending…</Typography>;
    return (
        <Tooltip title={entry.error ?? ''}>
            <Typography variant="body2" sx={{ color: statusColors.critical }}>Failed: {entry.error}</Typography>
        </Tooltip>
    );
};

/** Who gets which alarms on their phone (Telegram) and when, plus what was sent recently. */
const NotificationsPage = () => {
    const { assets, sensors } = useSensorData();
    const { me, can } = useMe();
    const canEdit = can('engineer');
    const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
    const [rules, setRules] = useState<NotificationRule[] | null>(null);
    const [users, setUsers] = useState<NotificationRecipient[]>([]);
    const [log, setLog] = useState<NotificationLogEntry[]>([]);
    const [editing, setEditing] = useState<Editing>(null);
    const [toDelete, setToDelete] = useState<NotificationRule | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const loadRules = useCallback(async () => {
        try {
            const result = await api.getNotificationRules();
            setRules(result.rules);
            setUsers(result.users);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        loadRules();
        api.getTelegram().then(setTelegram).catch(() => undefined);
    }, [loadRules]);

    useEffect(() => {
        let cancelled = false;
        const load = () => api.getNotificationLog().then(entries => { if (!cancelled) setLog(entries); }).catch(() => undefined);
        load();
        const timer = setInterval(load, LOG_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    const doDelete = async () => {
        if (!toDelete) return;
        setBusy(true);
        try {
            await api.deleteNotificationRule(toDelete.id);
            await loadRules();
        } finally {
            setBusy(false);
            setToDelete(null);
        }
    };

    const userById = new Map(users.map(u => [u.id, u]));

    return (
        <>
            <PageHeader
                title="Notifications"
                subtitle="Who gets which alarms on their phone, and when"
                actions={canEdit && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ rule: null })} disabled={!rules}>Add rule</Button>
                )}
            />

            {telegram && !telegram.enabled && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Telegram is not set up on this server, so nothing is sent yet. Add a bot token (TELEGRAM_BOT_TOKEN in .env) and restart; see the README.
                </Alert>
            )}
            {telegram?.enabled && !telegram.connected && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    To receive alarms yourself, connect Telegram on your <Link component={RouterLink} to="/profile">Account</Link> page.
                </Alert>
            )}
            {failed && <Alert severity="error" sx={{ mb: 2 }}>Could not load the rules.</Alert>}

            {rules && rules.length === 0 ? (
                <EmptyState
                    icon={<SendToMobileOutlined sx={{ fontSize: 40, color: 'text.secondary' }} />}
                    title="No one is notified yet"
                    message={canEdit
                        ? 'Add a rule, e.g. critical alarms of Hall A to the operator at once, and to the supervisor if nobody acknowledges them within 10 minutes.'
                        : 'An engineer of your site decides who receives which alarms.'}
                    action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ rule: null })}>Add rule</Button>}
                />
            ) : rules && (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Send to</TableCell>
                                <TableCell>Alarms</TableCell>
                                <TableCell>From</TableCell>
                                <TableCell>When</TableCell>
                                {canEdit && <TableCell align="right" />}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.map(rule => {
                                const user = userById.get(rule.userId);
                                return (
                                    <TableRow key={rule.id}>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.userId}</Typography>
                                                {user && <Typography variant="caption" color="text.secondary">{roleLabels[user.role]}</Typography>}
                                                {user && !user.telegramConnected && (
                                                    <Tooltip title="Has not connected Telegram on their Account page; nothing reaches them until then">
                                                        <Chip size="small" label="no Telegram" variant="outlined" sx={{ color: statusColors.warning, borderColor: statusColors.warning }} />
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>{priorityLabels[rule.minPriority]}</TableCell>
                                        <TableCell>{rule.assetId ? pathText(assets, rule.assetId) || 'Unknown area' : 'Whole plant'}</TableCell>
                                        <TableCell>{delayLabel(rule.delayMinutes)}</TableCell>
                                        {canEdit && (
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                <Tooltip title="Change">
                                                    <IconButton size="small" onClick={() => setEditing({ rule })}><EditOutlined fontSize="small" /></IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton size="small" onClick={() => setToDelete(rule)}><DeleteOutline fontSize="small" /></IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recently sent</Typography>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Time</TableCell>
                            <TableCell>Alarm</TableCell>
                            <TableCell>To</TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Why</TableCell>
                            <TableCell>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {log.length === 0 && (
                            <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>Nothing sent yet.</TableCell></TableRow>
                        )}
                        {log.map(entry => (
                            <TableRow key={entry.id}>
                                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <StatusChip status={entry.priority} />
                                        <span>
                                            {sensors[entry.sensorId]
                                                ? <Link component={RouterLink} to={`/sensors/${entry.sensorId}`} underline="hover" color="inherit">{entry.sensorName}</Link>
                                                : entry.sensorName}
                                            {' · '}{conditionLabels[entry.condition]}
                                        </span>
                                    </Stack>
                                </TableCell>
                                <TableCell>{entry.userId}{entry.userId === me?.id && ' (you)'}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                                    {entry.delayMinutes === 0 ? 'At once' : `Escalation after ${entry.delayMinutes} min`}
                                </TableCell>
                                <TableCell><DeliveryCell entry={entry} /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <RuleDialog editing={editing} users={users} onClose={() => setEditing(null)}
                onSaved={async () => { setEditing(null); await loadRules(); }} />
            <ConfirmDialog
                open={toDelete !== null}
                title="Delete rule?"
                message={toDelete ? `${toDelete.userId} will no longer receive these alarms.` : ''}
                confirmLabel="Delete"
                busy={busy}
                onConfirm={doDelete}
                onClose={() => setToDelete(null)}
            />
        </>
    );
};

export default NotificationsPage;
