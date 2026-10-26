import { useNavigate } from 'react-router';
import { Grid, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { pathText } from '../assets';
import { useSensorData } from '../data/SensorDataContext';
import type { SensorRow } from '../data/useSensorRows';
import { formatAge, formatValue, sensorTypeLabels } from '../status';
import { statusColors } from '../theme';
import KpiTile from './KpiTile';
import Sparkline from './Sparkline';
import { StatusChip } from './StatusIndicator';

interface SensorTableProps {
    rows: SensorRow[];
    /** Also show where each sensor is in the plant. */
    showLocation?: boolean;
}

/** Live values of the given sensors; a row opens the sensor's page. */
export const SensorTable = ({ rows, showLocation }: SensorTableProps) => {
    const navigate = useNavigate();
    const { now, assets } = useSensorData();

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
                    {rows.map(row => {
                        const location = showLocation ? pathText(assets, row.sensor.assetId) : '';
                        return (
                            <TableRow key={row.id} hover onClick={() => navigate(`/sensors/${row.id}`)} sx={{ cursor: 'pointer' }}>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.sensor.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {sensorTypeLabels[row.sensor.type]}{location && ` · ${location}`}
                                    </Typography>
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
                        );
                    })}
                </TableBody>
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
