import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material';
import * as api from '../api';
import { saveSession } from '../auth';
import AuthLayout from './AuthLayout';

const LoginPage = () => {
    const navigate = useNavigate();
    const justRegistered = (useLocation().state as { registered?: boolean } | null)?.registered === true;
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await api.login(id.trim(), password);
            if (result.success && result.token) {
                saveSession(id.trim(), result.token);
                navigate('/overview');
            } else {
                setError('Invalid ID or password');
            }
        } catch {
            setError('Cannot reach the server. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthLayout
            title="Sign in"
            subtitle="Monitor your sensors in real time"
            footer={<Typography variant="body2" color="text.secondary">
                No account? <Link component={RouterLink} to="/register">Create one</Link>
            </Typography>}
        >
            <Stack component="form" spacing={2} onSubmit={submit} noValidate>
                {justRegistered && !error && <Alert severity="success">Account created. You can now sign in.</Alert>}
                <TextField label="User ID" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus required fullWidth />
                <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required fullWidth />
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" size="large" disabled={busy || !id.trim() || !password}>Sign in</Button>
            </Stack>
        </AuthLayout>
    );
};

export default LoginPage;
