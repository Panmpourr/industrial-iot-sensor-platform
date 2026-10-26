import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router';
import { Box, Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { Add as AddIcon, CheckCircleOutline } from '@mui/icons-material';
import { alarmCondition, compareAlarms, conditionLabels, isActive, isUnacked } from '../alarms';
import { pathText, UNASSIGNED } from '../assets';
import { useMe } from '../data/MeContext';
import { useSensorData } from '../data/SensorDataContext';
import { useAssetFilter } from '../data/useAssetFilter';
import { useSensorRows } from '../data/useSensorRows';
import { formatAge, formatValue, unitOf } from '../status';
import { statusColors } from '../theme';
import AssetSelect from '../ui/AssetSelect';
import PageHeader from '../ui/PageHeader';
import { SensorKpis, SensorTable } from '../ui/SensorTable';
import { StatusDot } from '../ui/StatusIndicator';
import EmptyState from '../ui/EmptyState';

/** Active alarms from the alarm journal (the same list as the Alarms page), most important first. */
export const ActiveAlarms = ({ sensorMatches, viewAllLink = '/alarms' }: {
    sensorMatches: (sensorId: string) => boolean;
    viewAllLink?: string;
}) => {
    const { alarms, sensors, now } = useSensorData();
    const active = useMemo(
        () => alarms.filter(a => isActive(a) && sensorMatches(a.sensorId)).sort(compareAlarms),
        [alarms, sensorMatches]);
    const unacked = active.filter(isUnacked).length;

    return (
        <Paper variant="outlined" sx={{ height: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2">
                    Active alarms{active.length > 0 && ` (${active.length})`}
                    {unacked > 0 && <Typography component="span" variant="caption" color="text.secondary"> · {unacked} to acknowledge</Typography>}
                </Typography>
                <Button size="small" component={RouterLink} to={viewAllLink}>View all</Button>
            </Stack>
            {active.length === 0 ? (
                <Stack alignItems="center" spacing={1} sx={{ py: 5, color: 'text.secondary' }}>
                    <CheckCircleOutline sx={{ color: statusColors.normal }} />
                    <Typography variant="body2">No active alarms</Typography>
                </Stack>
            ) : (
                <Box>
                    {active.slice(0, 6).map(alarm => {
                        const sensor = sensors[alarm.sensorId];
                        const unit = sensor ? unitOf(sensor) : '';
                        return (
                            <Stack key={alarm.id} direction="row" spacing={1.5} alignItems="center"
                                component={RouterLink} to={`/sensors/${alarm.sensorId}`}
                                sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                                <StatusDot status={alarm.priority} size={10} />
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography variant="body2" noWrap sx={{ fontWeight: isUnacked(alarm) ? 700 : 500 }}>
                                        {sensor?.name ?? 'Deleted sensor'} · {conditionLabels[alarm.condition]}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {alarmCondition(alarm, unit)} · {formatAge(alarm.raisedAt, now)}
                                    </Typography>
                                </Box>
                                {alarm.value !== null && (
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: statusColors[alarm.priority] }}>
                                        {formatValue(alarm.value, unit)}
                                    </Typography>
                                )}
                            </Stack>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
};

const OverviewPage = () => {
    const { sensorsLoaded, assets } = useSensorData();
    const allRows = useSensorRows();
    const canEdit = useMe().can('engineer');
    const { filter, setFilter, sensorMatches } = useAssetFilter();
    const rows = useMemo(() => allRows.filter(r => sensorMatches(r.id)), [allRows, sensorMatches]);

    if (sensorsLoaded && allRows.length === 0) {
        return (
            <EmptyState
                title="No sensors yet"
                message={canEdit
                    ? 'Connect your first PLC, OPC UA server, LoRaWAN device or weather feed to start monitoring.'
                    : 'An engineer of your site can add sensors.'}
                action={canEdit && <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/sensors?add=1">Add sensor</Button>}
            />
        );
    }

    return (
        <>
            <PageHeader
                title="Plant overview"
                subtitle={filter ? `Live status of the sensors in ${filter === UNASSIGNED ? 'no area' : pathText(assets, filter)}` : 'Live status of all connected sensors'}
                actions={assets.length > 0 && (
                    <AssetSelect assets={assets} label="Area" value={filter} onChange={setFilter}
                        emptyLabel="Whole plant" unassignedOption sx={{ minWidth: 220 }} />
                )}
            />

            <SensorKpis rows={rows} />

            <Grid container spacing={2}>
                <Grid item xs={12} lg={8}>
                    {rows.length > 0
                        ? <SensorTable rows={rows} showLocation={!!assets.length} />
                        : <EmptyState title="No sensors here" message="No sensors are placed in this part of the plant yet." />}
                </Grid>
                <Grid item xs={12} lg={4}>
                    <ActiveAlarms sensorMatches={sensorMatches} viewAllLink={filter ? `/alarms?asset=${filter}` : '/alarms'} />
                </Grid>
            </Grid>
        </>
    );
};

export default OverviewPage;
