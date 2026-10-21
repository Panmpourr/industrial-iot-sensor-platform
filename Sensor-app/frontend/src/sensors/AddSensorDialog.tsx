import { useState, type ReactNode } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
    Paper, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { LanOutlined, HubOutlined, UsbOutlined, CellTowerOutlined, CloudOutlined } from '@mui/icons-material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import { sensorTypeLabels } from '../status';
import type { SensorType } from '../types';
import { connectionValid, defaultLimits, limitsValid, toDetails, type ConnectionValues, type Limits } from './sensorForm';
import { ConnectionFields, LimitsFields } from './SensorFormFields';

interface TypeOption {
    type: SensorType;
    icon: ReactNode;
    description: string;
}

const typeOptions: TypeOption[] = [
    { type: 'Plc-Opcua', icon: <HubOutlined />, description: 'Subscribe to a node on an OPC UA server' },
    { type: 'Plc-Modbus', icon: <LanOutlined />, description: 'Poll a holding register over Modbus TCP' },
    { type: 'TTN', icon: <CellTowerOutlined />, description: 'LoRaWAN device via The Things Network' },
    { type: 'Arduino', icon: <UsbOutlined />, description: 'Microcontroller on a USB serial port' },
    { type: 'WeatherApi', icon: <CloudOutlined />, description: 'Temperature & humidity from weatherapi.com' },
];

const steps = ['Sensor type', 'Connection', 'Limits & location'];

interface AddSensorDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (sensorId: string) => void;
}

const AddSensorDialog = ({ open, onClose, onCreated }: AddSensorDialogProps) => {
    const [step, setStep] = useState(0);
    const [type, setType] = useState<SensorType | null>(null);
    const [name, setName] = useState('');
    const [connection, setConnection] = useState<ConnectionValues>({});
    const [limits, setLimits] = useState<Limits>(defaultLimits('Plc-Opcua'));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setStep(0); setType(null); setName(''); setConnection({}); setError(null); setBusy(false);
    };

    const close = () => {
        if (busy) return;
        reset();
        onClose();
    };

    const chooseType = (t: SensorType) => {
        setType(t);
        setConnection({});
        setLimits(defaultLimits(t));
    };

    const stepValid = [
        type !== null && name.trim() !== '',
        type !== null && connectionValid(type, connection),
        limitsValid(limits),
    ];

    const submit = async () => {
        if (!type) return;
        setBusy(true);
        setError(null);
        try {
            const { sensorId } = await api.registerSensor({ name: name.trim(), type, details: toDetails(connection, limits) });
            reset();
            onCreated(sensorId);
        } catch (e) {
            setError(apiErrorMessage(e) ?? 'The sensor could not be added. Check the connection settings.');
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
            <DialogTitle>Add sensor</DialogTitle>
            <DialogContent dividers>
                <Stepper activeStep={step} sx={{ mb: 3 }}>
                    {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                {step === 0 && (
                    <Stack spacing={2.5}>
                        <TextField label="Sensor name" value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Line 1 – Oven temperature" size="small" fullWidth autoFocus />
                        <Grid container spacing={1.5}>
                            {typeOptions.map(option => {
                                const selected = option.type === type;
                                return (
                                    <Grid item xs={12} sm={6} key={option.type}>
                                        <Paper
                                            variant="outlined"
                                            onClick={() => chooseType(option.type)}
                                            role="radio"
                                            aria-checked={selected}
                                            tabIndex={0}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && chooseType(option.type)}
                                            sx={{
                                                p: 1.5, cursor: 'pointer', display: 'flex', gap: 1.5, alignItems: 'center',
                                                borderColor: selected ? 'primary.main' : undefined,
                                                bgcolor: selected ? 'rgba(122,162,200,0.08)' : undefined,
                                                '&:hover': { borderColor: 'primary.main' },
                                            }}
                                        >
                                            <Box sx={{ color: selected ? 'primary.main' : 'text.secondary', display: 'flex' }}>{option.icon}</Box>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{sensorTypeLabels[option.type]}</Typography>
                                                <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                                            </Box>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Stack>
                )}

                {step === 1 && type && <ConnectionFields type={type} values={connection} onChange={setConnection} />}

                {step === 2 && (
                    <Stack spacing={3}>
                        <LimitsFields limits={limits} onChange={setLimits} />
                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={close} color="inherit" disabled={busy}>Cancel</Button>
                <Box sx={{ flexGrow: 1 }} />
                {step > 0 && <Button onClick={() => setStep(s => s - 1)} disabled={busy}>Back</Button>}
                {step < steps.length - 1 ? (
                    <Button variant="contained" onClick={() => setStep(s => s + 1)} disabled={!stepValid[step]}>Next</Button>
                ) : (
                    <Button variant="contained" onClick={submit} disabled={!stepValid[2] || busy}
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                        Add sensor
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AddSensorDialog;
