import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Breadcrumbs, Button, Grid, Link, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography,
} from '@mui/material';
import { FileDownloadOutlined, DeleteOutline } from '@mui/icons-material';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import * as api from '../api';
import { DETAIL_HISTORY, useSensorData } from '../data/SensorDataContext';
import { formatAge, formatValue, primaryValue, sensorStatus, sensorTypeLabels, unitOf } from '../status';
import { statusColors } from '../theme';
import type { Sensor, SensorDetails } from '../types';
import Gauge from '../charts/Gauge';
import TrendChart from '../charts/TrendChart';
import TtnChart from '../charts/TtnChart';
import ConfirmDialog from '../ui/ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import KpiTile from '../ui/KpiTile';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

const Panel = ({ title, children, height }: { title: string; children: ReactNode; height?: number }) => (
    <Paper variant="outlined" sx={{ height: '100%' }}>
        <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>{title}</Typography>
        <Box sx={{ p: 2, height }}>{children}</Box>
    </Paper>
);

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
    const { sensors, sensorsLoaded, readings, now, loadHistory, removeSensor } = useSensorData();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const sensor = sensors[id];
    const history = readings[id] ?? [];
    const latest = history.at(-1);

    // Load the longer history for the trend when the page opens (or once the sensor list has loaded)
    const sensorExists = sensor !== undefined;
    useEffect(() => {
        if (sensorExists) loadHistory(id, DETAIL_HISTORY);
    }, [id, sensorExists, loadHistory]);

    const stats = useMemo(() => {
        if (!sensor) return null;
        const values = history.map(r => primaryValue(sensor, r)).filter((v): v is number => v !== undefined);
        if (values.length === 0) return null;
        return {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            from: history[0].timestamp,
        };
    }, [sensor, history]);

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
                    <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => api.downloadCsv(id, sensor.name).catch(() => undefined)}>Export CSV</Button>
                    <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => setConfirmDelete(true)}>Delete</Button>
                </>}
            />

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} md={3}>
                    <KpiTile label={sensor.type === 'WeatherApi' ? 'Temperature' : 'Current value'} value={formatValue(current, unit)}
                        accent={status === 'critical' || status === 'warning' ? statusColors[status] : undefined}
                        caption={latest ? new Date(latest.timestamp).toLocaleTimeString() : '—'} />
                </Grid>
                <Grid item xs={6} md={3}><KpiTile label="Minimum" value={formatValue(stats?.min, unit)} caption="in displayed period" /></Grid>
                <Grid item xs={6} md={3}><KpiTile label="Average" value={formatValue(stats?.avg, unit)} caption={`${history.length} readings`} /></Grid>
                <Grid item xs={6} md={3}><KpiTile label="Maximum" value={formatValue(stats?.max, unit)}
                    caption={stats ? `since ${new Date(stats.from).toLocaleTimeString()}` : '—'} /></Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} lg={8}>
                    <Panel title="Trend" height={360}>
                        {history.length === 0
                            ? <Typography color="text.secondary" variant="body2">Waiting for the first reading…</Typography>
                            : sensor.type === 'TTN'
                                ? <TtnChart readings={history} />
                                : <TrendChart sensor={sensor} readings={history} />}
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
                            <MapContainer center={[latitude, longitude]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: 4 }}>
                                <TileLayer
                                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    className="map-tiles-dark"
                                />
                                <CircleMarker center={[latitude, longitude]} radius={9}
                                    pathOptions={{ color: statusColors[status], fillColor: statusColors[status], fillOpacity: 0.6 }}>
                                    <Popup>
                                        <b>{sensor.name}</b><br />{formatValue(current, unit)}
                                    </Popup>
                                </CircleMarker>
                            </MapContainer>
                        </Panel>
                    </Grid>
                )}
            </Grid>

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
