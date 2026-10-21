import { useNavigate, Link as RouterLink } from 'react-router';
import {
    Box, Button, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { Add as AddIcon, CheckCircleOutline } from '@mui/icons-material';
import { useSensorData } from '../data/SensorDataContext';
import { useSensorRows, type SensorRow } from '../data/useSensorRows';
import { formatAge, formatValue, isAlarm, sensorTypeLabels } from '../status';
import { statusColors } from '../theme';
import KpiTile from '../ui/KpiTile';
import PageHeader from '../ui/PageHeader';
import Sparkline from '../ui/Sparkline';
import { StatusChip, StatusDot } from '../ui/StatusIndicator';
import EmptyState from '../ui/EmptyState';

const AlarmSummary = ({ rows }: { rows: SensorRow[] }) => {
    const { now } = useSensorData();
    const alarms = rows.filter(r => isAlarm(r.status));

    return (
        <Paper variant="outlined" sx={{ height: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2">Active alarms</Typography>
                <Button size="small" component={RouterLink} to="/alarms">View all</Button>
            </Stack>
            {alarms.length === 0 ? (
                <Stack alignItems="center" spacing={1} sx={{ py: 5, color: 'text.secondary' }}>
                    <CheckCircleOutline sx={{ color: statusColors.normal }} />
                    <Typography variant="body2">All sensors within limits</Typography>
                </Stack>
            ) : (
                <Box>
                    {alarms.slice(0, 6).map(row => (
                        <Stack key={row.id} direction="row" spacing={1.5} alignItems="center"
                            component={RouterLink} to={`/sensors/${row.id}`}
                            sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                            <StatusDot status={row.status} size={10} />
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{row.sensor.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {row.latest ? formatAge(row.latest.timestamp, now) : 'never reported'}
                                </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: statusColors[row.status] }}>
                                {formatValue(row.value, row.unit)}
                            </Typography>
                        </Stack>
                    ))}
                </Box>
            )}
        </Paper>
    );
};

export const SensorTable = ({ rows }: { rows: SensorRow[] }) => {
    const navigate = useNavigate();
    const { now } = useSensorData();

    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Sensor</TableCell>
                        <TableCell align="right">Value</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Trend</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Last update</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.id} hover onClick={() => navigate(`/sensors/${row.id}`)} sx={{ cursor: 'pointer' }}>
                            <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.sensor.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{sensorTypeLabels[row.sensor.type]}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatValue(row.value, row.unit)}</Typography>
                            </TableCell>
                            <TableCell><StatusChip status={row.status} /></TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, py: 0.5 }}>
                                <Sparkline values={row.trend} />
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                                {row.latest ? formatAge(row.latest.timestamp, now) : '—'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const OverviewPage = () => {
    const { sensorsLoaded } = useSensorData();
    const rows = useSensorRows();

    const count = (status: SensorRow['status']) => rows.filter(r => r.status === status).length;
    const reporting = rows.filter(r => r.status !== 'stale' && r.status !== 'nodata').length;
    const warnings = count('warning');
    const criticals = count('critical');

    if (sensorsLoaded && rows.length === 0) {
        return (
            <EmptyState
                title="No sensors yet"
                message="Connect your first PLC, OPC UA server, LoRaWAN device or weather feed to start monitoring."
                action={<Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/sensors?add=1">Add sensor</Button>}
            />
        );
    }

    return (
        <>
            <PageHeader title="Plant overview" subtitle="Live status of all connected sensors" />

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
                    <KpiTile label="Warnings" value={warnings} accent={warnings ? statusColors.warning : undefined} caption="above warning limit" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiTile label="Critical" value={criticals} accent={criticals ? statusColors.critical : undefined} caption="above critical limit" />
                </Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} lg={8}>
                    <SensorTable rows={rows} />
                </Grid>
                <Grid item xs={12} lg={4}>
                    <AlarmSummary rows={rows} />
                </Grid>
            </Grid>
        </>
    );
};

export default OverviewPage;
