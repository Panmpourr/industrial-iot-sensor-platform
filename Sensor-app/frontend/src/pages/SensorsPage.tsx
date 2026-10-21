import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Button, IconButton, InputAdornment, Paper, Snackbar, Alert, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, Search as SearchIcon, FileDownloadOutlined, DeleteOutline, EditOutlined } from '@mui/icons-material';
import * as api from '../api';
import { useSensorData } from '../data/SensorDataContext';
import { useSensorRows, type SensorRow } from '../data/useSensorRows';
import { formatValue, sensorTypeLabels } from '../status';
import type { Sensor } from '../types';
import AddSensorDialog from '../sensors/AddSensorDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import EditSensorDialog from '../sensors/EditSensorDialog';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { StatusChip } from '../ui/StatusIndicator';

/** Short description of where the data comes from, e.g. "opc.tcp://plc:4840 · ns=2;i=2". */
export const connectionSummary = (sensor: Sensor): string => {
    const d = sensor.details;
    switch (sensor.type) {
        case 'Plc-Opcua': return `${d.endpointUrl ?? ''} · ${d.nodeId ?? ''}`;
        case 'Plc-Modbus': return `${d.ipAddress ?? ''}:${d.port ?? 502} · HR ${d.registerAddress ?? 0}`;
        case 'TTN': return `${d.applicationId ?? ''} / ${d.deviceId ?? ''}`;
        case 'Arduino': return d.serialPort ?? '';
        case 'WeatherApi': return d.location ?? '';
    }
};

const SensorsPage = () => {
    const { sensorsLoaded, refreshSensors, removeSensor } = useSensorData();
    const rows = useSensorRows();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [toDelete, setToDelete] = useState<SensorRow | null>(null);
    const [toEdit, setToEdit] = useState<SensorRow | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

    const addOpen = params.get('add') === '1';
    const setAddOpen = (open: boolean) => setParams(open ? { add: '1' } : {}, { replace: true });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return [...rows]
            .sort((a, b) => a.sensor.name.localeCompare(b.sensor.name))
            .filter(r => !q || r.sensor.name.toLowerCase().includes(q) || sensorTypeLabels[r.sensor.type].toLowerCase().includes(q));
    }, [rows, search]);

    const exportCsv = async (row: SensorRow) => {
        try {
            await api.downloadCsv(row.id, row.sensor.name);
        } catch {
            setNotice({ severity: 'error', text: `No data to export for ${row.sensor.name}` });
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setBusy(true);
        try {
            await removeSensor(toDelete.id);
            setNotice({ severity: 'success', text: `${toDelete.sensor.name} deleted` });
        } catch {
            setNotice({ severity: 'error', text: `Could not delete ${toDelete.sensor.name}` });
        } finally {
            setBusy(false);
            setToDelete(null);
        }
    };

    const onCreated = async (sensorId: string) => {
        setAddOpen(false);
        await refreshSensors();
        navigate(`/sensors/${sensorId}`);
    };

    return (
        <>
            <PageHeader
                title="Sensors"
                subtitle="Data sources connected to the platform"
                actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add sensor</Button>}
            />

            {sensorsLoaded && rows.length === 0 ? (
                <EmptyState
                    title="No sensors yet"
                    message="Add an OPC UA node, Modbus register, LoRaWAN device, serial device or weather feed."
                    action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add sensor</Button>}
                />
            ) : (
                <>
                    <TextField
                        placeholder="Search by name or protocol"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        size="small"
                        sx={{ mb: 2, width: { xs: '100%', sm: 320 } }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    />
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Protocol</TableCell>
                                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Source</TableCell>
                                    <TableCell align="right">Value</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map(row => (
                                    <TableRow key={row.id} hover onClick={() => navigate(`/sensors/${row.id}`)} sx={{ cursor: 'pointer' }}>
                                        <TableCell sx={{ fontWeight: 600 }}>{row.sensor.name}</TableCell>
                                        <TableCell>{sensorTypeLabels[row.sensor.type]}</TableCell>
                                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                            {connectionSummary(row.sensor)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatValue(row.value, row.unit)}</TableCell>
                                        <TableCell><StatusChip status={row.status} /></TableCell>
                                        <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{ whiteSpace: 'nowrap' }}>
                                            <Tooltip title="Edit">
                                                <IconButton size="small" onClick={() => setToEdit(row)}><EditOutlined fontSize="small" /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Export CSV">
                                                <IconButton size="small" onClick={() => exportCsv(row)}><FileDownloadOutlined fontSize="small" /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" onClick={() => setToDelete(row)}><DeleteOutline fontSize="small" /></IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filtered.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No sensors match “{search}”</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            <AddSensorDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={onCreated} />

            <EditSensorDialog
                sensor={toEdit ? { ...toEdit.sensor, id: toEdit.id } : null}
                onClose={() => setToEdit(null)}
                onSaved={async () => {
                    setToEdit(null);
                    await refreshSensors();
                    setNotice({ severity: 'success', text: 'Sensor updated' });
                }}
            />

            <ConfirmDialog
                open={!!toDelete}
                title="Delete sensor?"
                message={`“${toDelete?.sensor.name}” and its entire measurement history will be permanently deleted.`}
                confirmLabel="Delete"
                busy={busy}
                onConfirm={confirmDelete}
                onClose={() => setToDelete(null)}
            />

            <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                {notice ? <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>{notice.text}</Alert> : undefined}
            </Snackbar>
        </>
    );
};

export default SensorsPage;
