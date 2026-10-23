import { useState } from 'react';
import { Box, Button, CircularProgress, Grid, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import type { SensorType } from '../types';
import { connectionFields, limitsValid, type ConnectionValues, type Limits } from './sensorForm';

interface ConnectionFieldsProps {
    type: SensorType;
    values: ConnectionValues;
    onChange: (values: ConnectionValues) => void;
}

/** Protocol-specific connection settings, with a "Test connection" button for OPC UA. */
export const ConnectionFields = ({ type, values, onChange }: ConnectionFieldsProps) => {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    const testOpcUa = async () => {
        setTestResult(null);
        setTesting(true);
        try {
            const result = await api.testOpcUaConnection(values.endpointUrl ?? '');
            setTestResult({ ok: true, text: `Connected — ${result.endpoints?.length ?? 0} endpoint(s) available` });
        } catch (e) {
            setTestResult({ ok: false, text: apiErrorMessage(e) ?? 'Server not reachable' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <Stack spacing={2}>
            {connectionFields[type].map(field => (
                <TextField
                    key={field.key}
                    label={field.label}
                    placeholder={field.placeholder}
                    helperText={field.helper}
                    type={field.secret ? 'password' : 'text'}
                    value={values[field.key] ?? ''}
                    onChange={(e) => {
                        setTestResult(null);
                        onChange({ ...values, [field.key]: e.target.value });
                    }}
                    size="small"
                    fullWidth
                    autoComplete="off"
                />
            ))}
            {type === 'Plc-Opcua' && (
                <Stack direction="row" spacing={2} alignItems="center">
                    <Button variant="outlined" onClick={testOpcUa} disabled={testing || !values.endpointUrl?.trim()}>
                        Test connection
                    </Button>
                    {testing && <CircularProgress size={18} />}
                    {testResult && (
                        <Typography variant="body2" color={testResult.ok ? 'success.main' : 'error.main'}>{testResult.text}</Typography>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

interface LimitsFieldsProps {
    limits: Limits;
    onChange: (limits: Limits) => void;
}

/** Unit, range, high / low alarm limits, deadband, on-delay and optional map location. */
export const LimitsFields = ({ limits, onChange }: LimitsFieldsProps) => {
    const field = (key: keyof Limits, label: string, withUnit?: boolean) => (
        <TextField
            label={label}
            value={limits[key]}
            onChange={(e) => onChange({ ...limits, [key]: e.target.value })}
            fullWidth
            size="small"
            inputMode="decimal"
            InputProps={withUnit && limits.unit ? { endAdornment: <InputAdornment position="end">{limits.unit}</InputAdornment> } : undefined}
        />
    );

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Alarm limits</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                        <TextField label="Unit" value={limits.unit} placeholder="°C, bar, rpm…" size="small" fullWidth
                            onChange={(e) => onChange({ ...limits, unit: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={4}>{field('min', 'Range min', true)}</Grid>
                    <Grid item xs={6} sm={4}>{field('max', 'Range max', true)}</Grid>
                    <Grid item xs={6} sm={6}>{field('warning', 'Warning above (HI)', true)}</Grid>
                    <Grid item xs={6} sm={6}>{field('critical', 'Critical above (HIHI)', true)}</Grid>
                    <Grid item xs={6} sm={6}>{field('lowWarning', 'Warning below (LO, optional)', true)}</Grid>
                    <Grid item xs={6} sm={6}>{field('lowCritical', 'Critical below (LOLO, optional)', true)}</Grid>
                    <Grid item xs={6} sm={6}>{field('deadband', 'Deadband', true)}</Grid>
                    <Grid item xs={6} sm={6}>
                        <TextField label="On-delay" value={limits.onDelay} size="small" fullWidth inputMode="decimal"
                            onChange={(e) => onChange({ ...limits, onDelay: e.target.value })}
                            InputProps={{ endAdornment: <InputAdornment position="end">s</InputAdornment> }} />
                    </Grid>
                </Grid>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Deadband: how far the value must come back before an alarm clears. On-delay: how long a limit
                    must stay exceeded before the alarm is raised. Both stop short spikes from flooding the alarm list.
                </Typography>
                {!limitsValid(limits) && (
                    <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                        Use numbers, with min &lt; max, low-low ≤ low &lt; warning ≤ critical, and no negative deadband or delay.
                    </Typography>
                )}
            </Box>
            <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    Location <Typography component="span" variant="caption" color="text.secondary">(optional)</Typography>
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={6}>{field('latitude', 'Latitude')}</Grid>
                    <Grid item xs={6}>{field('longitude', 'Longitude')}</Grid>
                </Grid>
            </Box>
        </Stack>
    );
};
