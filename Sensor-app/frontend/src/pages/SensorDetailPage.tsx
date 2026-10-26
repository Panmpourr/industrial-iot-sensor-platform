import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router';
import {
    Box, Breadcrumbs, Button, Grid, Link, Paper, Stack, Table, TableBody, TableCell, TableRow, ToggleButton,
    ToggleButtonGroup, Typography,
} from '@mui/material';
import { FileDownloadOutlined, DeleteOutline, EditOutlined, ShowChartOutlined } from '@mui/icons-material';
import { trendsLink } from '../trends';
import * as api from '../api';
import { DETAIL_HISTORY, useSensorData } from '../data/SensorDataContext';
import { formatAge, formatValue, primaryValue, sensorStatus, sensorTypeLabels, unitOf } from '../status';
import { statusColors } from '../theme';
import type { History, Reading, Sensor, SensorDetails } from '../types';
import { formatBucket, isRangeKey, ranges, refreshDelay, sourceLabels, summarize, type RangeKey } from '../history';
import HistoryChart from '../charts/HistoryChart';
import Gauge from '../charts/Gauge';
import TrendChart from '../charts/TrendChart';
import ConfirmDialog from '../ui/ConfirmDialog';
import EditSensorDialog from '../sensors/EditSensorDialog';
import { useMe } from '../data/MeContext';
import EmptyState from '../ui/EmptyState';
import KpiTile from '../ui/KpiTile';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

interface PanelProps {
    title: string;
    children: ReactNode;
    height?: number;
    action?: ReactNode;
    footer?: ReactNode;
}

const Panel = ({ title, children, height, action, footer }: PanelProps) => (
    <Paper variant="outlined" sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap"
            sx={{ px: 2, py: action ? 1 : 1.5, borderBottom: 1, borderColor: 'divider', minHeight: 48 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{title}</Typography>
            {action}
        </Stack>
        <Box sx={{ p: 2, height }}>{children}</Box>
        {footer && <Box sx={{ px: 2, pb: 1.5, mt: -1 }}>{footer}</Box>}
    </Paper>
);

// Only some sensors need these, so they load separately: Leaflet for sensors with a location,
// Recharts for LoRaWAN payloads
const LocationMap = lazy(() => import('../charts/LocationMap'));
const TtnChart = lazy(() => import('../charts/TtnChart'));

/** Stable empty list, so memoized values do not recompute on every render before data arrives. */
const NO_READINGS: Reading[] = [];

const detailLabels: Partial<Record<keyof SensorDetails, string>> = {
    endpointUrl: 'Endpoint URL',
    nodeId: 'Node ID',
    ipAddress: 'IP address',
    port: 'Port',
    registerAddress: 'Holding register',
    applicationId: 'Application ID',
    clusterId: 'Tenant / cluster',
    deviceId: 'Device ID',
    serialPort: 'Serial port',
    location: 'Location',
    apiKey: 'API key',
};

const ConfigurationTable = ({ sensor }: { sensor: Sensor }) => {
    const { threshold } = sensor.details;
    const unit = unitOf(sensor);
    const rows: [string, string][] = [
        ['Protocol', sensorTypeLabels[sensor.type]],
        ...Object.entries(detailLabels)
            .filter(([key]) => sensor.details[key as keyof SensorDetails] !== undefined && sensor.details[key as keyof SensorDetails] !== '')
            .map(([key, label]): [string, string] => [label!, key === 'apiKey' ? '••••••••' : String(sensor.details[key as keyof SensorDetails])]),
        ['Range', `${threshold?.min ?? '—'} … ${threshold?.max ?? '—'} ${unit}`],
        ['Warning above', formatValue(threshold?.warning, unit)],
        ['Critical above', formatValue(threshold?.critical, unit)],
    ];

    return (
        <Table size="small">
            <TableBody>
                {rows.map(([label, value]) => (
                    <TableRow key={label}>
                        <TableCell sx={{ color: 'text.secondary', width: '45%', pl: 0 }}>{label}</TableCell>
                        <TableCell sx={{ fontFamily: label === 'Protocol' ? undefined : 'monospace', fontSize: '0.8rem', overflowWrap: 'anywhere', pr: 0 }}>{value}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

const SensorDetailPage = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { sensors, sensorsLoaded, readings, now, loadHistory, removeSensor, refreshSensors } = useSensorData();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editing, setEditing] = useState(false);
    const canEdit = useMe().can('engineer');
    const [deleting, setDeleting] = useState(false);
    const [params, setParams] = useSearchParams();
    const rangeParam = params.get('range');
    const rangeKey: RangeKey = isRangeKey(rangeParam) ? rangeParam : 'live';
    const range = ranges.find(r => r.key === rangeKey)!;
    const [history, setHistory] = useState<History | null>(null);
    const [historyFailed, setHistoryFailed] = useState(false);

    const sensor = sensors[id];
    const live = readings[id] ?? NO_READINGS;
    const latest = live.at(-1);

    // Load the longer history for the trend when the page opens (or once the sensor list has loaded)
    const sensorExists = sensor !== undefined;
    useEffect(() => {
        if (sensorExists) loadHistory(id, DETAIL_HISTORY);
    }, [id, sensorExists, loadHistory]);

    // Historical ranges come from the server as min/avg/max buckets and refresh periodically
    useEffect(() => {
        setHistory(null);
        setHistoryFailed(false);
        if (!sensorExists || range.ms === 0) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            const to = new Date();
            try {
                const result = await api.getHistory(id, new Date(to.getTime() - range.ms), to);
                if (cancelled) return;
                setHistory(result);
                setHistoryFailed(false);
                timer = setTimeout(load, refreshDelay(result.bucketSeconds));
            } catch {
                if (cancelled) return;
                setHistoryFailed(true);
                timer = setTimeout(load, 30_000);
            }
        };
        load();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [id, sensorExists, range.ms]);

    const stats = useMemo(() => {
        if (!sensor) return null;
        if (range.ms > 0) {
            const summary = history ? summarize(history.points) : null;
            return summary && history ? { ...summary, from: history.from } : null;
        }
        const values = live.map(r => primaryValue(sensor, r)).filter((v): v is number => v !== undefined);
        if (values.length === 0) return null;
        return {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            count: values.length,
            worst: undefined,
            abnormalBuckets: 0,
            from: live[0].timestamp,
        };
    }, [sensor, live, history, range.ms]);

    if (!sensor) {
        return sensorsLoaded ? (
            <EmptyState title="Sensor not found" message="It may have been deleted."
                action={<Button component={RouterLink} to="/sensors">Back to sensors</Button>} />
        ) : null;
    }

    const unit = unitOf(sensor);
    const status = sensorStatus(sensor, latest, now);
    const current = latest ? primaryValue(sensor, latest) : undefined;
    const { threshold, latitude, longitude } = sensor.details;
    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';
    // TTN uplinks have several fields and no single value to aggregate, so they stay live-only
    const supportsHistory = sensor.type !== 'TTN';
    const periodCaption = range.ms > 0 ? `last ${range.label}` : 'in displayed period';
    const sinceCaption = !stats ? '—'
        : `since ${range.ms > 86_400_000 ? new Date(stats.from).toLocaleDateString() : new Date(stats.from).toLocaleTimeString()}`;

    const setRange = (key: RangeKey | null) => {
        if (key) setParams(key === 'live' ? {} : { range: key }, { replace: true });
    };

    const rangePicker = supportsHistory && (
        <ToggleButtonGroup size="small" exclusive value={rangeKey} onChange={(_, key: RangeKey | null) => setRange(key)}
            aria-label="Time range" sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.25, fontSize: '0.75rem', textTransform: 'none' } }}>
            {ranges.map(r => <ToggleButton key={r.key} value={r.key}>{r.label}</ToggleButton>)}
        </ToggleButtonGroup>
    );

    const renderTrend = () => {
        if (range.ms > 0) {
            if (historyFailed) return <Typography color="error" variant="body2">Could not load the history. Retrying…</Typography>;
            if (!history) return <Typography color="text.secondary" variant="body2">Loading history…</Typography>;
            if (history.points.length === 0) return <Typography color="text.secondary" variant="body2">No readings in the last {range.label}.</Typography>;
            return <HistoryChart sensor={sensor} history={history} rangeMs={range.ms} />;
        }
        if (live.length === 0) return <Typography color="text.secondary" variant="body2">Waiting for the first reading…</Typography>;
        return sensor.type === 'TTN'
            ? <Suspense fallback={null}><TtnChart readings={live} /></Suspense>
            : <TrendChart sensor={sensor} readings={live} />;
    };

    const abnormal = stats?.abnormalBuckets ?? 0;
    const trendFooter = range.ms > 0 && history && history.points.length > 0 && (
        <Typography variant="caption" color="text.secondary">
            Each point is {formatBucket(history.bucketSeconds)} · line = average, band = min–max
            {abnormal > 0 && ` · ${abnormal} interval${abnormal === 1 ? '' : 's'} out of limits`}
            {` · source: ${sourceLabels[history.source]}`}
        </Typography>
    );

    const doDelete = async () => {
        setDeleting(true);
        try {
            await removeSensor(id);
            navigate('/sensors');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Breadcrumbs sx={{ mb: 1, fontSize: '0.8rem' }}>
                <Link component={RouterLink} to="/sensors" underline="hover" color="text.secondary">Sensors</Link>
                <Typography color="text.primary" fontSize="inherit">{sensor.name}</Typography>
            </Breadcrumbs>
            <PageHeader
                title={<Stack direction="row" spacing={1.5} alignItems="center"><span>{sensor.name}</span><StatusChip status={status} /></Stack>}
                subtitle={`${sensorTypeLabels[sensor.type]} · ${latest ? `last reading ${formatAge(latest.timestamp, now)}` : 'no readings yet'}`}
                actions={<>
                    {supportsHistory && (
                        <Button variant="outlined" startIcon={<ShowChartOutlined />} component={RouterLink}
                            to={trendsLink([id], rangeKey === 'live' ? undefined : rangeKey)}>Compare</Button>
                    )}
                    {canEdit && <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>}
                    <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => api.downloadCsv(id, sensor.name).catch(() => undefined)}>Export CSV</Button>
                    {canEdit && <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
                </>}
            />

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} md={3}>
                    <KpiTile label={sensor.type === 'WeatherApi' ? 'Temperature' : 'Current value'} value={formatValue(current, unit)}
                        accent={status === 'critical' || status === 'warning' ? statusColors[status] : undefined}
                        caption={latest ? new Date(latest.timestamp).toLocaleTimeString() : '—'} />
                </Grid>
                <Grid item xs={6} md={3}><KpiTile label="Minimum" value={formatValue(stats?.min, unit)} caption={periodCaption} /></Grid>
                <Grid item xs={6} md={3}><KpiTile label="Average" value={formatValue(stats?.avg, unit)}
                    caption={`${(stats?.count ?? 0).toLocaleString()} readings`} /></Grid>
                <Grid item xs={6} md={3}><KpiTile label="Maximum" value={formatValue(stats?.max, unit)} caption={sinceCaption}
                    accent={stats?.worst && stats.worst !== 'normal' ? statusColors[stats.worst] : undefined} /></Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} lg={8}>
                    <Panel title="Trend" height={360} action={rangePicker} footer={trendFooter}>
                        {renderTrend()}
                    </Panel>
                </Grid>
                <Grid item xs={12} lg={4}>
                    <Panel title="Current reading" height={360}>
                        {sensor.type === 'TTN' ? (
                            <Table size="small">
                                <TableBody>
                                    {Object.entries(latest?.raw ?? {}).map(([key, value]) => (
                                        <TableRow key={key}>
                                            <TableCell sx={{ color: 'text.secondary', pl: 0 }}>{key}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600, pr: 0 }}>
                                                {typeof value === 'number' ? formatValue(value) : JSON.stringify(value)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : sensor.type === 'WeatherApi' ? (
                            <Stack direction={{ xs: 'row', lg: 'column' }} justifyContent="center" sx={{ height: '100%' }}>
                                <Gauge value={latest?.temp} min={threshold?.min ?? 0} max={threshold?.max ?? 40}
                                    warning={threshold?.warning} critical={threshold?.critical} unit={unit} label="Temperature" />
                                <Typography variant="body2" color="text.secondary" textAlign="center">
                                    Humidity <b>{formatValue(latest?.humidity, '%')}</b>
                                </Typography>
                            </Stack>
                        ) : (
                            <Stack justifyContent="center" sx={{ height: '100%' }}>
                                <Gauge value={current} min={threshold?.min ?? 0} max={threshold?.max ?? 100}
                                    warning={threshold?.warning} critical={threshold?.critical} unit={unit} />
                                {latest && current === undefined && latest.value !== undefined && (
                                    <Typography textAlign="center" sx={{ mt: 1 }}>Value: <b>{String(latest.value)}</b></Typography>
                                )}
                            </Stack>
                        )}
                    </Panel>
                </Grid>

                <Grid item xs={12} md={hasLocation ? 6 : 12} lg={hasLocation ? 4 : 12}>
                    <Panel title="Configuration"><ConfigurationTable sensor={sensor} /></Panel>
                </Grid>
                {hasLocation && (
                    <Grid item xs={12} md={6} lg={8}>
                        <Panel title="Location" height={300}>
                            <Suspense fallback={null}>
                                <LocationMap latitude={latitude} longitude={longitude} color={statusColors[status]}
                                    name={sensor.name} valueText={formatValue(current, unit)} />
                            </Suspense>
                        </Panel>
                    </Grid>
                )}
            </Grid>

            <EditSensorDialog
                sensor={editing ? { ...sensor, id } : null}
                onClose={() => setEditing(false)}
                onSaved={async () => {
                    setEditing(false);
                    await refreshSensors();
                }}
            />

            <ConfirmDialog
                open={confirmDelete}
                title="Delete sensor?"
                message={`“${sensor.name}” and its entire measurement history will be permanently deleted.`}
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={doDelete}
                onClose={() => setConfirmDelete(false)}
            />
        </>
    );
};

export default SensorDetailPage;
