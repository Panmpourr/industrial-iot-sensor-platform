import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import {
    Box, Button, Grid, IconButton, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, FileDownloadOutlined, PrintOutlined } from '@mui/icons-material';
import * as api from '../api';
import { conditionLabels, formatDuration } from '../alarms';
import { pathText } from '../assets';
import { useSensorData } from '../data/SensorDataContext';
import { useAssetFilter } from '../data/useAssetFilter';
import {
    ACCEPTABLE_PER_HOUR, alarmLoad, FLOOD_PER_10_MIN, isPeriodKind, parseDateParam, periodKinds, periodLabel, periodOf,
    shiftPeriod, toCsv, toDateParam, type PeriodKind,
} from '../reports';
import { formatValue, unitOf } from '../status';
import { statusColors } from '../theme';
import type { Alarm, SensorStatsReport } from '../types';
import AssetSelect from '../ui/AssetSelect';
import KpiTile from '../ui/KpiTile';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

/** Alarm history is capped by the API; a period with this many alarms may have more. */
const ALARM_LIMIT = 5000;

/** Availability below this is highlighted. */
const AVAILABILITY_TARGET = 0.95;

const toggleSx = { '& .MuiToggleButton-root': { py: 0.25, px: 1.25, fontSize: '0.75rem', textTransform: 'none' } };

const percent = (share: number | null) => (share === null ? '—' : `${(share * 100).toFixed(share < 0.995 && share > 0.9 ? 1 : 0)} %`);

const round = (v: number | null) => (v === null ? null : Number(v.toFixed(3)));

const downloadText = (text: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

/** One figure of the alarm load panel, with the ISA-18.2 benchmark it is compared to. */
const Figure = ({ label, value, note, accent }: { label: string; value: string; note: string; accent?: string }) => (
    <Box>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 600, lineHeight: 1.2, color: accent ?? 'text.primary' }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{note}</Typography>
    </Box>
);

/** Daily, weekly or monthly summary of the plant (or one area): values, availability, time outside limits and alarms. */
const ReportsPage = () => {
    const { sensors, sensorsLoaded, assets, now } = useSensorData();
    const { filter, setFilter, sensorMatches } = useAssetFilter();
    const [params, setParams] = useSearchParams();
    const kindParam = params.get('period');
    const kind: PeriodKind = isPeriodKind(kindParam) ? kindParam : 'day';
    const anchor = parseDateParam(params.get('date')) ?? new Date(now);
    const period = periodOf(kind, anchor);
    const fromMs = period.from.getTime();
    const toMs = period.to.getTime();
    const running = toMs > now;
    const inFuture = fromMs > now;

    const [stats, setStats] = useState<SensorStatsReport | null>(null);
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (fromMs > Date.now()) {
            setStats(null);
            setAlarms([]);
            return;
        }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            setLoading(true);
            const from = new Date(fromMs), to = new Date(toMs);
            try {
                const [report, history] = await Promise.all([api.getSensorStats(from, to), api.getAlarmHistory(from, to)]);
                if (cancelled) return;
                setStats(report);
                setAlarms(history);
                setFailed(false);
                // A period that is still running keeps filling in
                if (toMs > Date.now()) timer = setTimeout(load, 60_000);
            } catch {
                if (cancelled) return;
                setFailed(true);
                timer = setTimeout(load, 30_000);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [fromMs, toMs]);

    const update = (changes: Record<string, string | null>) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [key, value] of Object.entries(changes)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            return next;
        }, { replace: true });
    };
    const goTo = (date: Date) => update({ date: periodOf(kind, date).from.getTime() === periodOf(kind, new Date(now)).from.getTime() ? null : toDateParam(date) });

    const rows = useMemo(() => (stats?.sensors ?? [])
        .filter(s => sensors[s.sensorId] && sensorMatches(s.sensorId))
        .map(s => ({ ...s, sensor: sensors[s.sensorId], location: pathText(assets, sensors[s.sensorId].assetId) }))
        .sort((a, b) => (a.location || '￿').localeCompare(b.location || '￿')
            || a.sensor.name.localeCompare(b.sensor.name, undefined, { numeric: true })),
    [stats, sensors, assets, sensorMatches]);

    const periodAlarms = useMemo(() => alarms.filter(a => sensorMatches(a.sensorId)), [alarms, sensorMatches]);
    const hoursSoFar = Math.max(0, (Math.min(toMs, now) - fromMs) / 3_600_000);
    const load = useMemo(() => alarmLoad(periodAlarms, hoursSoFar), [periodAlarms, hoursSoFar]);
    const alarmsBySensor = useMemo(() => {
        const counts = new Map<string, number>();
        for (const a of periodAlarms) counts.set(a.sensorId, (counts.get(a.sensorId) ?? 0) + 1);
        return counts;
    }, [periodAlarms]);

    const available = rows.filter(r => r.availability !== null);
    const availability = available.length ? available.reduce((sum, r) => sum + r.availability!, 0) / available.length : null;
    const warningSeconds = rows.reduce((sum, r) => sum + r.warningSeconds, 0);
    const criticalSeconds = rows.reduce((sum, r) => sum + r.criticalSeconds, 0);
    const reporting = rows.filter(r => r.readings > 0).length;
    const label = periodLabel(kind, period);
    const capped = alarms.length >= ALARM_LIMIT;
    // While another period loads, the previous one stays on screen but must not be exported under the new name
    const current = stats?.from === fromMs;

    const exportCsv = () => {
        const header = ['Sensor', 'Location', 'Unit', 'Min', 'Average', 'Max', 'Readings', 'Availability %', 'Warning minutes', 'Critical minutes', 'Alarms'];
        const csv = toCsv([header, ...rows.map(r => [
            r.sensor.name, r.location, unitOf(r.sensor), round(r.min), round(r.avg), round(r.max), r.readings,
            r.availability === null ? null : Number((r.availability * 100).toFixed(1)),
            Math.round(r.warningSeconds / 60), Math.round(r.criticalSeconds / 60), alarmsBySensor.get(r.sensorId) ?? 0,
        ])]);
        downloadText(csv, `report_${kind}_${toDateParam(period.from)}.csv`);
    };

    if (!sensorsLoaded) return null;

    return (
        <>
            <PageHeader
                title="Reports"
                subtitle={`${label}${running && !inFuture ? ' (so far)' : ''}${filter ? ` · ${filter === 'unassigned' ? 'sensors not assigned' : pathText(assets, filter)}` : ''}`}
                actions={<Box className="no-print" sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={exportCsv} disabled={!current || rows.length === 0}>CSV</Button>
                    <Button variant="outlined" startIcon={<PrintOutlined />} onClick={() => window.print()} disabled={!current}>Print / PDF</Button>
                </Box>}
            />

            <Stack className="no-print" direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 3 }}>
                <ToggleButtonGroup size="small" exclusive value={kind} aria-label="Report period" sx={toggleSx}
                    onChange={(_, value: PeriodKind | null) => value && update({ period: value === 'day' ? null : value })}>
                    {periodKinds.map(p => <ToggleButton key={p.key} value={p.key}>{p.label}</ToggleButton>)}
                </ToggleButtonGroup>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Tooltip title="Previous">
                        <IconButton size="small" onClick={() => goTo(shiftPeriod(kind, anchor, -1))} aria-label="Previous period"><ChevronLeft /></IconButton>
                    </Tooltip>
                    <Typography sx={{ fontWeight: 600, minWidth: 170, textAlign: 'center' }}>{label}</Typography>
                    <Tooltip title="Next">
                        <span>
                            <IconButton size="small" onClick={() => goTo(shiftPeriod(kind, anchor, 1))} disabled={running} aria-label="Next period"><ChevronRight /></IconButton>
                        </span>
                    </Tooltip>
                    {!running && <Button size="small" onClick={() => goTo(new Date(now))}>{kind === 'day' ? 'Today' : kind === 'week' ? 'This week' : 'This month'}</Button>}
                </Stack>
                <Box sx={{ flexGrow: 1 }} />
                {assets.length > 0 && (
                    <AssetSelect assets={assets} label="Area" value={filter} onChange={setFilter}
                        emptyLabel="Whole plant" unassignedOption sx={{ minWidth: 220 }} />
                )}
            </Stack>

            {failed && <Typography color="error" variant="body2" sx={{ mb: 2 }}>Could not load the report. Retrying…</Typography>}
            {!stats && !failed && <Typography color="text.secondary" variant="body2">Loading report…</Typography>}

            {stats && (
                <Box sx={{ opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6} md={3}>
                            <KpiTile label="Sensors" value={rows.length} caption={`${reporting} sent data in the period`} />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <KpiTile label="Availability" value={percent(availability)}
                                accent={availability !== null && availability < AVAILABILITY_TARGET ? statusColors.stale : undefined}
                                caption="hours with data, average of the sensors" />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <KpiTile label="Outside limits" value={warningSeconds + criticalSeconds ? formatDuration((warningSeconds + criticalSeconds) * 1000) : 'Never'}
                                accent={criticalSeconds ? statusColors.critical : warningSeconds ? statusColors.warning : undefined}
                                caption={criticalSeconds ? `${formatDuration(criticalSeconds * 1000)} of it critical` : 'summed over the sensors'} />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <KpiTile label="Alarms" value={`${load.total}${capped ? '+' : ''}`}
                                accent={load.critical ? statusColors.critical : undefined}
                                caption={`${load.critical} critical`} />
                        </Grid>
                    </Grid>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} lg={5}>
                            <Paper variant="outlined" sx={{ height: '100%' }}>
                                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="subtitle2">Alarm load</Typography>
                                    <Typography variant="caption" color="text.secondary">Compared with the ISA-18.2 guidance for one operator</Typography>
                                </Box>
                                <Grid container spacing={2} sx={{ p: 2 }}>
                                    <Grid item xs={6}>
                                        <Figure label="Per hour" value={load.perHour.toFixed(1)} note={`acceptable: up to ~${ACCEPTABLE_PER_HOUR}`}
                                            accent={load.perHour > ACCEPTABLE_PER_HOUR ? statusColors.warning : undefined} />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Figure label="Peak in 10 min" value={String(load.peak10Min)} note={`flood: more than ${FLOOD_PER_10_MIN}`}
                                            accent={load.peak10Min > FLOOD_PER_10_MIN ? statusColors.critical : undefined} />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Figure label="Time to acknowledge" value={load.avgAckSeconds === null ? '—' : formatDuration(load.avgAckSeconds * 1000)}
                                            note="average, raised → acknowledged" />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Figure label="Not acknowledged" value={String(load.unacked)} note="of the alarms in the period"
                                            accent={load.unacked ? statusColors.warning : undefined} />
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} lg={7}>
                            <TableContainer component={Paper} variant="outlined" sx={{ height: '100%' }}>
                                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="subtitle2">Most frequent alarms</Typography>
                                    <Typography variant="caption" color="text.secondary">A few sources usually cause most alarms; fixing them first helps most</Typography>
                                </Box>
                                {load.badActors.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No alarms in this period.</Typography>
                                ) : (
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Sensor</TableCell>
                                                <TableCell>Condition</TableCell>
                                                <TableCell>Priority</TableCell>
                                                <TableCell align="right">Count</TableCell>
                                                <TableCell align="right">Share</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {load.badActors.map(a => (
                                                <TableRow key={`${a.sensorId}|${a.condition}`}>
                                                    <TableCell>
                                                        {sensors[a.sensorId]
                                                            ? <Link component={RouterLink} to={`/sensors/${a.sensorId}`} underline="hover" color="inherit">{sensors[a.sensorId].name}</Link>
                                                            : 'Deleted sensor'}
                                                    </TableCell>
                                                    <TableCell>{conditionLabels[a.condition]}</TableCell>
                                                    <TableCell><StatusChip status={a.priority} /></TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{a.count}</TableCell>
                                                    <TableCell align="right">{percent(a.share)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </TableContainer>
                        </Grid>
                    </Grid>

                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Sensor</TableCell>
                                    <TableCell align="right">Min</TableCell>
                                    <TableCell align="right">Average</TableCell>
                                    <TableCell align="right">Max</TableCell>
                                    <TableCell align="right">Availability</TableCell>
                                    <TableCell align="right">Warning</TableCell>
                                    <TableCell align="right">Critical</TableCell>
                                    <TableCell align="right">Alarms</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} sx={{ color: 'text.secondary' }}>No sensors {filter ? 'in this area' : 'yet'}.</TableCell>
                                    </TableRow>
                                )}
                                {rows.map(r => {
                                    const unit = unitOf(r.sensor);
                                    const alarmCount = alarmsBySensor.get(r.sensorId) ?? 0;
                                    return (
                                        <TableRow key={r.sensorId}>
                                            <TableCell>
                                                <Link component={RouterLink} to={`/sensors/${r.sensorId}`} underline="hover" color="inherit"
                                                    sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.sensor.name}</Link>
                                                {r.location && <Typography variant="caption" color="text.secondary" component="div">{r.location}</Typography>}
                                            </TableCell>
                                            <TableCell align="right">{formatValue(r.min ?? undefined, unit)}</TableCell>
                                            <TableCell align="right">{formatValue(r.avg ?? undefined, unit)}</TableCell>
                                            <TableCell align="right">{formatValue(r.max ?? undefined, unit)}</TableCell>
                                            <TableCell align="right" sx={{ color: r.availability !== null && r.availability < AVAILABILITY_TARGET ? statusColors.stale : undefined }}>
                                                {r.availability === null ? 'not yet added' : percent(r.availability)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: r.warningSeconds ? statusColors.warning : 'text.secondary' }}>
                                                {r.warningSeconds ? formatDuration(r.warningSeconds * 1000) : '—'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: r.criticalSeconds ? statusColors.critical : 'text.secondary' }}>
                                                {r.criticalSeconds ? formatDuration(r.criticalSeconds * 1000) : '—'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: alarmCount ? 600 : undefined, color: alarmCount ? undefined : 'text.secondary' }}>
                                                {alarmCount || '—'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                        Availability counts the hours with at least one reading since a sensor was added. Warning and critical times count the
                        {stats.source === 'minute' ? ' minutes' : ' hours'} whose worst reading had that status.
                        {capped && ` Only the first ${ALARM_LIMIT} alarms of the period are counted.`}
                        {' '}Generated {new Date(now).toLocaleString()}.
                    </Typography>
                </Box>
            )}
        </>
    );
};

export default ReportsPage;
