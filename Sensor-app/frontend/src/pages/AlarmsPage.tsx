import { useNavigate } from 'react-router';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import { useSensorData } from '../data/SensorDataContext';
import { useSensorRows, type SensorRow } from '../data/useSensorRows';
import { evaluate, formatAge, formatValue, isAlarm, primaryValue, sensorTypeLabels } from '../status';
import { statusColors } from '../theme';
import type { Reading } from '../types';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

/** What triggered the alarm, e.g. "> 28 °C (critical limit)". */
const condition = (row: SensorRow): string => {
    const { warning, critical } = row.sensor.details.threshold ?? {};
    switch (row.status) {
        case 'critical': return `> ${formatValue(critical, row.unit)} critical limit`;
        case 'warning': return `> ${formatValue(warning, row.unit)} warning limit`;
        case 'stale': return 'No data received recently';
        default: return '';
    }
};

/** Start of the current abnormal period within the loaded history. */
const alarmSince = (row: SensorRow, history: Reading[]): number | undefined => {
    if (row.status === 'stale') return row.latest?.timestamp;
    let since: number | undefined;
    for (let i = history.length - 1; i >= 0; i--) {
        if (evaluate(row.sensor, primaryValue(row.sensor, history[i])) !== row.status) break;
        since = history[i].timestamp;
    }
    return since;
};

const AlarmsPage = () => {
    const navigate = useNavigate();
    const { readings, now } = useSensorData();
    const alarms = useSensorRows().filter(r => isAlarm(r.status));

    return (
        <>
            <PageHeader title="Alarms" subtitle="Sensors currently outside their limits or not reporting, most severe first" />
            {alarms.length === 0 ? (
                <EmptyState
                    icon={<CheckCircleOutline sx={{ fontSize: 40, color: statusColors.normal }} />}
                    title="No active alarms"
                    message="All sensors are reporting and within their configured limits."
                />
            ) : (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Severity</TableCell>
                                <TableCell>Sensor</TableCell>
                                <TableCell>Condition</TableCell>
                                <TableCell align="right">Value</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Since</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {alarms.map(row => {
                                const since = alarmSince(row, readings[row.id] ?? []);
                                return (
                                    <TableRow key={row.id} hover onClick={() => navigate(`/sensors/${row.id}`)}
                                        sx={{ cursor: 'pointer', boxShadow: `inset 3px 0 0 ${statusColors[row.status]}` }}>
                                        <TableCell><StatusChip status={row.status} /></TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.sensor.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{sensorTypeLabels[row.sensor.type]}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ color: 'text.secondary' }}>{condition(row)}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600, color: statusColors[row.status] }}>{formatValue(row.value, row.unit)}</TableCell>
                                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                                            {since ? `${new Date(since).toLocaleTimeString()} (${formatAge(since, now)})` : '—'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
};

export default AlarmsPage;
