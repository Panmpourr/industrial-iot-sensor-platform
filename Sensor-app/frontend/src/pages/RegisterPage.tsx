import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import AuthLayout from './AuthLayout';

const MIN_PASSWORD_LENGTH = 6;

const RegisterPage = () => {
    const navigate = useNavigate();
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const tooShort = password !== '' && password.length < MIN_PASSWORD_LENGTH;
    const mismatch = confirm !== '' && confirm !== password;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (tooShort || mismatch) return;
        setBusy(true);
        setError('');
        try {
            await api.register(id.trim(), password);
            navigate('/login', { state: { registered: true } });
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Registration failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthLayout
            title="Create account"
            subtitle="Choose a user ID and a password"
            footer={<Typography variant="body2" color="text.secondary">
                Already registered? <Link component={RouterLink} to="/login">Sign in</Link>
            </Typography>}
        >
            <Stack component="form" spacing={2} onSubmit={submit} noValidate>
                <TextField label="User ID" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username"
                    inputProps={{ maxLength: 50 }} autoFocus required fullWidth />
                <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password" error={tooShort} helperText={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : ' '} required fullWidth />
                <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password" error={mismatch} helperText={mismatch ? 'Passwords do not match' : ' '} required fullWidth />
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" size="large"
                    disabled={busy || !id.trim() || !password || tooShort || mismatch || confirm === ''}>
                    Create account
                </Button>
            </Stack>
        </AuthLayout>
    );
};

export default RegisterPage;
