import { useMemo } from 'react';
import { Alert, Grid } from '@mui/material';
import { assetFilter } from '../assets';
import { useSensorData } from '../data/SensorDataContext';
import { useAssetFilter } from '../data/useAssetFilter';
import { addDays, dueStatus, formatMinutes, todayText } from '../maintenance';
import MaintenanceSection from '../maintenance/MaintenanceSection';
import { useMaintenance } from '../maintenance/useMaintenance';
import { statusColors } from '../theme';
import AssetSelect from '../ui/AssetSelect';
import KpiTile from '../ui/KpiTile';
import PageHeader from '../ui/PageHeader';

/** Planned maintenance of the whole plant (or one area): what is overdue, what is due soon, and the work log. */
const MaintenancePage = () => {
    const { assets, now } = useSensorData();
    const { filter, setFilter } = useAssetFilter();
    const data = useMaintenance();
    const today = todayText(now);
    const matches = useMemo(() => assetFilter(assets, filter), [assets, filter]);

    const tasks = (data.tasks ?? []).filter(t => matches(t.assetId));
    const overdue = tasks.filter(t => dueStatus(t.nextDue, today) === 'overdue').length;
    const soon = tasks.filter(t => dueStatus(t.nextDue, today) === 'soon').length;
    const monthAgo = addDays(today, -30);
    const recent = data.log.filter(e => matches(e.assetId) && e.performedOn >= monthAgo);
    const minutes = recent.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

    return (
        <>
            <PageHeader
                title="Maintenance"
                subtitle="Planned work on the equipment, and what was done"
                actions={assets.length > 0 && (
                    <AssetSelect assets={assets} label="Area" value={filter} onChange={setFilter} emptyLabel="Whole plant" sx={{ minWidth: 220 }} />
                )}
            />
            {data.failed && <Alert severity="error" sx={{ mb: 2 }}>Could not load the maintenance data.</Alert>}
            {assets.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Maintenance is planned per area or piece of equipment. Describe the plant on the Plant page first.
                </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} md={3}>
                    <KpiTile label="Overdue" value={overdue} accent={overdue ? statusColors.critical : undefined} caption="past their due date" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiTile label="Due this week" value={soon} accent={soon ? statusColors.warning : undefined} caption="in the next 7 days" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiTile label="Planned tasks" value={tasks.length} caption="recurring" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiTile label="Work logged" value={recent.length} caption={`last 30 days${minutes ? ` · ${formatMinutes(minutes)}` : ''}`} />
                </Grid>
            </Grid>

            <MaintenanceSection data={data} matches={matches} defaultAssetId={filter && filter !== 'unassigned' ? filter : null} logLimit={100} />
        </>
    );
};

export default MaintenancePage;
