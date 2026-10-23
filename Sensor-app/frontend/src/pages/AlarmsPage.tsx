import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    Box, Button, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircleOutline, DoneAll, Refresh, VolumeOff, VolumeUp } from '@mui/icons-material';
import * as api from '../api';
import { alarmCondition, compareAlarms, conditionLabels, formatDuration, isActive, isUnacked, stateLabels } from '../alarms';
import { useSensorData } from '../data/SensorDataContext';
import { formatAge, formatValue, unitOf } from '../status';
import { statusColors } from '../theme';
import type { Alarm, SensorMap } from '../types';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

const sensorName = (sensors: SensorMap, id: string) => sensors[id]?.name ?? 'Deleted sensor';
const unit = (sensors: SensorMap, id: string) => (sensors[id] ? unitOf(sensors[id]) : '');
const time = (ms: number) => new Date(ms).toLocaleString();

/** ISA-101: unacknowledged active alarms flash, acknowledged ones are steady. */
const flashing = {
    animation: 'alarm-flash 1s steps(2, start) infinite',
    '@keyframes alarm-flash': { to: { visibility: 'hidden' } },
};

const AlarmSummary = () => {
    const navigate = useNavigate();
    const { alarms, sensors, now, acknowledge } = useSensorData();
    const [busy, setBusy] = useState(false);
    const sorted = useMemo(() => [...alarms].sort(compareAlarms), [alarms]);
    const unacked = sorted.filter(isUnacked);

    const ack = async (ids: string[]) => {
        setBusy(true);
        try {
            await acknowledge(ids);
        } catch (error) {
            console.error('Could not acknowledge alarms', error);
        } finally {
            setBusy(false);
        }
    };

    if (sorted.length === 0) {
        return (
            <EmptyState
                icon={<CheckCircleOutline sx={{ fontSize: 40, color: statusColors.normal }} />}
                title="No active alarms"
                message="All sensors are reporting and within their configured limits."
            />
        );
    }

    return (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                    {sorted.filter(isActive).length} active · {unacked.length} to acknowledge
                </Typography>
                <Button size="small" variant="outlined" startIcon={<DoneAll />} disabled={busy || unacked.length === 0}
                    onClick={() => ack(unacked.map(a => a.id))}>
                    Acknowledge all
                </Button>
            </Stack>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Priority</TableCell>
                            <TableCell>Sensor</TableCell>
                            <TableCell>Condition</TableCell>
                            <TableCell align="right">Value</TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Raised</TableCell>
                            <TableCell>State</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sorted.map(alarm => {
                            const color = statusColors[alarm.priority];
                            const active = isActive(alarm);
                            return (
                                <TableRow key={alarm.id} hover onClick={() => navigate(`/sensors/${alarm.sensorId}`)}
                                    sx={{ cursor: 'pointer', opacity: active ? 1 : 0.7, position: 'relative' }}>
                                    <TableCell sx={{ position: 'relative' }}>
                                        <Box sx={{
                                            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: color,
                                            ...(alarm.state === 'active-unacked' ? flashing : {}),
                                        }} />
                                        <StatusChip status={alarm.priority} />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sensorName(sensors, alarm.sensorId)}</Typography>
                                        <Typography variant="caption" color="text.secondary">{conditionLabels[alarm.condition]}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>{alarmCondition(alarm, unit(sensors, alarm.sensorId))}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color }}>
                                        {alarm.value === null ? '—' : formatValue(alarm.value, unit(sensors, alarm.sensorId))}
                                    </TableCell>
                                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                                        {new Date(alarm.raisedAt).toLocaleTimeString()} ({formatAge(alarm.raisedAt, now)})
                                    </TableCell>
                                    <TableCell sx={{ color: isUnacked(alarm) ? 'text.primary' : 'text.secondary', fontWeight: isUnacked(alarm) ? 600 : 400 }}>
                                        {stateLabels[alarm.state]}
                                    </TableCell>
                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                        {isUnacked(alarm) && (
                                            <Button size="small" variant="contained" color="inherit" disabled={busy} onClick={() => ack([alarm.id])}
                                                sx={{ bgcolor: 'rgba(255,255,255,0.08)', boxShadow: 'none' }}>
                                                Ack
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
};

const ranges = [
    { label: 'Last 24 hours', ms: 24 * 3600_000 },
    { label: 'Last 7 days', ms: 7 * 24 * 3600_000 },
    { label: 'Last 30 days', ms: 30 * 24 * 3600_000 },
];

const AlarmHistory = () => {
    const navigate = useNavigate();
    const { sensors } = useSensorData();
    const [range, setRange] = useState(ranges[0].ms);
    const [sensorId, setSensorId] = useState('');
    const [rows, setRows] = useState<Alarm[] | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const to = new Date();
            setRows(await api.getAlarmHistory(new Date(to.getTime() - range), to, sensorId || undefined));
        } catch (error) {
            console.error('Could not load the alarm history', error);
            setFailed(true);
        }
    }, [range, sensorId]);

    useEffect(() => {
        setRows(null);
        load();
    }, [load]);

    return (
        <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
                <TextField select size="small" label="Period" value={range} onChange={(e) => setRange(Number(e.target.value))} sx={{ minWidth: 160 }}>
                    {ranges.map(r => <MenuItem key={r.ms} value={r.ms}>{r.label}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Sensor" value={sensorId} onChange={(e) => setSensorId(e.target.value)} sx={{ minWidth: 200 }}>
                    <MenuItem value="">All sensors</MenuItem>
                    {Object.entries(sensors).map(([id, s]) => <MenuItem key={id} value={id}>{s.name}</MenuItem>)}
                </TextField>
                <Tooltip title="Refresh">
                    <IconButton onClick={load} aria-label="Refresh"><Refresh /></IconButton>
                </Tooltip>
                <Box sx={{ flexGrow: 1 }} />
                {rows && <Typography variant="body2" color="text.secondary">{rows.length} alarm(s)</Typography>}
            </Stack>

            {failed && <Typography color="error.main">Could not load the alarm history.</Typography>}
            {rows?.length === 0 && (
                <EmptyState icon={<CheckCircleOutline sx={{ fontSize: 40, color: statusColors.normal }} />}
                    title="No alarms in this period" message="Try a longer period or another sensor." />
            )}
            {rows && rows.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Raised</TableCell>
                                <TableCell>Sensor</TableCell>
                                <TableCell>Priority</TableCell>
                                <TableCell>Condition</TableCell>
                                <TableCell align="right">Value</TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Duration</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Acknowledged</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(alarm => (
                                <TableRow key={alarm.id} hover onClick={() => sensors[alarm.sensorId] && navigate(`/sensors/${alarm.sensorId}`)}
                                    sx={{ cursor: 'pointer' }}>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{time(alarm.raisedAt)}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{sensorName(sensors, alarm.sensorId)}</TableCell>
                                    <TableCell><StatusChip status={alarm.priority} /></TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>
                                        {conditionLabels[alarm.condition]} {alarm.condition !== 'COMM' && alarmCondition(alarm, unit(sensors, alarm.sensorId))}
                                    </TableCell>
                                    <TableCell align="right">
                                        {alarm.value === null ? '—' : formatValue(alarm.value, unit(sensors, alarm.sensorId))}
                                    </TableCell>
                                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                                        {alarm.clearedAt === null ? 'Still active' : formatDuration(alarm.clearedAt - alarm.raisedAt)}
                                    </TableCell>
                                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                                        {alarm.ackedAt === null ? '—' : `${alarm.ackedBy} · ${new Date(alarm.ackedAt).toLocaleTimeString()}`}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
};

const AlarmsPage = () => {
    const { alarms, soundMuted, setSoundMuted } = useSensorData();
    const [tab, setTab] = useState<'summary' | 'history'>('summary');

    return (
        <>
            <PageHeader
                title="Alarms"
                subtitle="Raised when a limit is exceeded or a sensor stops reporting; acknowledge them to confirm you have seen them"
                actions={
                    <Tooltip title={soundMuted ? 'Turn on the sound for new critical alarms' : 'Mute the sound for new critical alarms'}>
                        <IconButton onClick={() => setSoundMuted(!soundMuted)} aria-label={soundMuted ? 'Unmute alarm sound' : 'Mute alarm sound'}>
                            {soundMuted ? <VolumeOff /> : <VolumeUp />}
                        </IconButton>
                    </Tooltip>
                }
            />
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="summary" label={`Alarm summary (${alarms.length})`} />
                <Tab value="history" label="History" />
            </Tabs>
            {tab === 'summary' ? <AlarmSummary /> : <AlarmHistory />}
        </>
    );
};

export default AlarmsPage;
