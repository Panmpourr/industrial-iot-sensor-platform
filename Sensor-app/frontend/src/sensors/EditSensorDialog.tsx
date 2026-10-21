import { useEffect, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography,
} from '@mui/material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import { sensorTypeLabels } from '../status';
import type { Sensor } from '../types';
import { connectionValid, fromSensor, limitsValid, toDetails, type ConnectionValues, type Limits } from './sensorForm';
import { ConnectionFields, LimitsFields } from './SensorFormFields';

interface EditSensorDialogProps {
    /** Sensor being edited; `null` closes the dialog. */
    sensor: (Sensor & { id: string }) | null;
    onClose: () => void;
    onSaved: () => void;
}

/** Rename a sensor and change its connection, alarm limits and location. The protocol cannot change. */
const EditSensorDialog = ({ sensor, onClose, onSaved }: EditSensorDialogProps) => {
    const [name, setName] = useState('');
    const [connection, setConnection] = useState<ConnectionValues>({});
    const [limits, setLimits] = useState<Limits | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Start from the sensor's current settings when the dialog opens. Keyed on the id, not the
    // object: the page re-renders with every live reading and must not wipe what the user typed.
    const openId = sensor?.id ?? null;
    useEffect(() => {
        if (!sensor) return;
        const values = fromSensor(sensor);
        setName(sensor.name);
        setConnection(values.connection);
        setLimits(values.limits);
        setError(null);
        setBusy(false);
    }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

    const valid = !!sensor && !!limits && name.trim() !== '' && connectionValid(sensor.type, connection) && limitsValid(limits);

    const close = () => {
        if (!busy) onClose();
    };

    const save = async () => {
        if (!sensor || !limits) return;
        setBusy(true);
        setError(null);
        try {
            // Keep any stored settings the form does not show
            await api.updateSensor(sensor.id, { name: name.trim(), details: { ...sensor.details, ...toDetails(connection, limits) } });
            onSaved();
        } catch (e) {
            setError(apiErrorMessage(e) ?? 'The changes could not be saved. Check the connection settings.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!sensor} onClose={close} maxWidth="sm" fullWidth>
            <DialogTitle>Edit sensor</DialogTitle>
            {sensor && limits && (
                <DialogContent dividers>
                    <Stack spacing={3}>
                        <Box>
                            <TextField label="Sensor name" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                                Protocol: {sensorTypeLabels[sensor.type]} (to change the protocol, add a new sensor)
                            </Typography>
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Connection</Typography>
                            <ConnectionFields type={sensor.type} values={connection} onChange={setConnection} />
                        </Box>
                        <Divider />
                        <LimitsFields limits={limits} onChange={setLimits} />
                        <Typography variant="caption" color="text.secondary">
                            New limits apply to readings from now on; stored history keeps the status it had.
                        </Typography>
                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </DialogContent>
            )}
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={close} color="inherit" disabled={busy}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={!valid || busy}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                    Save changes
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EditSensorDialog;
