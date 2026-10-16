import { useState, type ReactNode } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
    InputAdornment, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { LanOutlined, HubOutlined, UsbOutlined, CellTowerOutlined, CloudOutlined } from '@mui/icons-material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import { sensorTypeLabels } from '../status';
import type { SensorDetails, SensorType } from '../types';

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

interface Field {
    key: keyof SensorDetails;
    label: string;
    placeholder?: string;
    helper?: string;
    secret?: boolean;
    optional?: boolean;
}

const connectionFields: Record<SensorType, Field[]> = {
    'Plc-Opcua': [
        { key: 'endpointUrl', label: 'Endpoint URL', placeholder: 'opc.tcp://opcua-sim:4840' },
        { key: 'nodeId', label: 'Node ID', placeholder: 'ns=2;i=2', helper: 'e.g. ns=2;i=2 or ns=2;s=Temperature' },
    ],
    'Plc-Modbus': [
        { key: 'ipAddress', label: 'IP address', placeholder: '192.168.1.10' },
        { key: 'port', label: 'Port', placeholder: '502' },
        { key: 'registerAddress', label: 'Holding register', placeholder: '0' },
    ],
    TTN: [
        { key: 'applicationId', label: 'Application ID' },
        { key: 'clusterId', label: 'Tenant / cluster ID', placeholder: 'ttn' },
        { key: 'deviceId', label: 'Device ID' },
        { key: 'apiKey', label: 'API key', placeholder: 'NNSXS.…', secret: true },
    ],
    Arduino: [
        { key: 'serialPort', label: 'Serial port', placeholder: 'COM3 or /dev/ttyUSB0' },
    ],
    WeatherApi: [
        { key: 'location', label: 'Location', placeholder: 'Thessaloniki' },
        { key: 'apiKey', label: 'API key', secret: true },
    ],
};

interface Limits {
    unit: string;
    min: string;
    max: string;
    warning: string;
    critical: string;
    latitude: string;
    longitude: string;
}

const defaultLimits = (type: SensorType): Limits => ({
    unit: type === 'WeatherApi' ? '°C' : '',
    min: '0',
    max: type === 'WeatherApi' ? '40' : '100',
    warning: type === 'WeatherApi' ? '25' : '70',
    critical: type === 'WeatherApi' ? '30' : '90',
    latitude: '',
    longitude: '',
});

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
    const [connection, setConnection] = useState<Partial<Record<keyof SensorDetails, string>>>({});
    const [limits, setLimits] = useState<Limits>(defaultLimits('Plc-Opcua'));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    const reset = () => {
        setStep(0); setType(null); setName(''); setConnection({}); setError(null); setTestResult(null); setBusy(false);
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
        setTestResult(null);
    };

    const num = (text: string) => (text.trim() === '' ? undefined : Number(text));
    const fields = type ? connectionFields[type] : [];

    const stepValid = [
        type !== null && name.trim() !== '',
        fields.every(f => f.optional || (connection[f.key] ?? '').trim() !== ''),
        [limits.min, limits.max, limits.warning, limits.critical].every(v => v.trim() !== '' && !Number.isNaN(Number(v)))
            && Number(limits.min) < Number(limits.max)
            && Number(limits.warning) <= Number(limits.critical)
            && [limits.latitude, limits.longitude].every(v => v.trim() === '' || !Number.isNaN(Number(v))),
    ];

    const testOpcUa = async () => {
        setTestResult(null);
        setBusy(true);
        try {
            const result = await api.testOpcUaConnection(connection.endpointUrl ?? '');
            setTestResult({ ok: true, text: `Connected — ${result.endpoints?.length ?? 0} endpoint(s) available` });
        } catch (e) {
            setTestResult({ ok: false, text: apiErrorMessage(e) ?? 'Server not reachable' });
        } finally {
            setBusy(false);
        }
    };

    const submit = async () => {
        if (!type) return;
        setBusy(true);
        setError(null);
        const details: SensorDetails = {
            ...Object.fromEntries(Object.entries(connection).map(([k, v]) => [k, v?.trim()])),
            latitude: num(limits.latitude),
            longitude: num(limits.longitude),
            threshold: {
                unit: limits.unit.trim(),
                min: Number(limits.min),
                max: Number(limits.max),
                warning: Number(limits.warning),
                critical: Number(limits.critical),
            },
        };
        try {
            const { sensorId } = await api.registerSensor({ name: name.trim(), type, details });
            reset();
            onCreated(sensorId);
        } catch (e) {
            setError(apiErrorMessage(e) ?? 'The sensor could not be added. Check the connection settings.');
            setBusy(false);
        }
    };

    const limitField = (key: keyof Limits, label: string, adornment?: boolean) => (
        <TextField
            label={label}
            value={limits[key]}
            onChange={(e) => setLimits(prev => ({ ...prev, [key]: e.target.value }))}
            fullWidth
            size="small"
            inputMode="decimal"
            InputProps={adornment && limits.unit ? { endAdornment: <InputAdornment position="end">{limits.unit}</InputAdornment> } : undefined}
        />
    );

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

                {step === 1 && type && (
                    <Stack spacing={2}>
                        {fields.map(field => (
                            <TextField
                                key={field.key}
                                label={field.label}
                                placeholder={field.placeholder}
                                helperText={field.helper}
                                type={field.secret ? 'password' : 'text'}
                                value={connection[field.key] ?? ''}
                                onChange={(e) => setConnection(prev => ({ ...prev, [field.key]: e.target.value }))}
                                size="small"
                                fullWidth
                                autoComplete="off"
                            />
                        ))}
                        {type === 'Plc-Opcua' && (
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Button variant="outlined" onClick={testOpcUa} disabled={busy || !connection.endpointUrl?.trim()}>
                                    Test connection
                                </Button>
                                {busy && <CircularProgress size={18} />}
                                {testResult && (
                                    <Typography variant="body2" color={testResult.ok ? 'success.main' : 'error.main'}>{testResult.text}</Typography>
                                )}
                            </Stack>
                        )}
                    </Stack>
                )}

                {step === 2 && (
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Alarm limits</Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={4}>
                                    <TextField label="Unit" value={limits.unit} placeholder="°C, bar, rpm…" size="small" fullWidth
                                        onChange={(e) => setLimits(prev => ({ ...prev, unit: e.target.value }))} />
                                </Grid>
                                <Grid item xs={6} sm={4}>{limitField('min', 'Range min', true)}</Grid>
                                <Grid item xs={6} sm={4}>{limitField('max', 'Range max', true)}</Grid>
                                <Grid item xs={6} sm={6}>{limitField('warning', 'Warning above', true)}</Grid>
                                <Grid item xs={6} sm={6}>{limitField('critical', 'Critical above', true)}</Grid>
                            </Grid>
                            {!stepValid[2] && (
                                <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                                    Use numbers, with min &lt; max and warning ≤ critical.
                                </Typography>
                            )}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Location <Typography component="span" variant="caption" color="text.secondary">(optional)</Typography></Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>{limitField('latitude', 'Latitude')}</Grid>
                                <Grid item xs={6}>{limitField('longitude', 'Longitude')}</Grid>
                            </Grid>
                        </Box>
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
