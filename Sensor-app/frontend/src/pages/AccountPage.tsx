import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Box, Button, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { LogoutOutlined } from '@mui/icons-material';
import * as api from '../api';
import { clearSession, getUserId } from '../auth';
import PageHeader from '../ui/PageHeader';

const MIN_PASSWORD_LENGTH = 6;

const AccountPage = () => {
    const navigate = useNavigate();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

    const mismatch = confirm !== '' && confirm !== newPassword;
    const tooShort = newPassword !== '' && newPassword.length < MIN_PASSWORD_LENGTH;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (mismatch || tooShort) return;
        setBusy(true);
        setResult(null);
        try {
            const { success } = await api.changePassword(oldPassword, newPassword);
            setResult(success
                ? { severity: 'success', text: 'Password changed.' }
                : { severity: 'error', text: 'Current password is incorrect.' });
            if (success) {
                setOldPassword(''); setNewPassword(''); setConfirm('');
            }
        } catch {
            setResult({ severity: 'error', text: 'Could not change the password. Try again.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeader title="Account" subtitle="Your profile and security settings" />
            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="overline" color="text.secondary">User ID</Typography>
                        <Typography variant="h6" sx={{ mb: 2 }}>{getUserId()}</Typography>
                        <Button variant="outlined" color="inherit" startIcon={<LogoutOutlined />}
                            onClick={() => { clearSession(); navigate('/login'); }}>
                            Sign out
                        </Button>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={8}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2 }}>Change password</Typography>
                        <Box component="form" onSubmit={submit} sx={{ maxWidth: 420 }}>
                            <Stack spacing={2}>
                                <TextField label="Current password" type="password" value={oldPassword} size="small" required
                                    autoComplete="current-password" onChange={(e) => setOldPassword(e.target.value)} />
                                <TextField label="New password" type="password" value={newPassword} size="small" required
                                    autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)}
                                    error={tooShort} helperText={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : ' '} />
                                <TextField label="Confirm new password" type="password" value={confirm} size="small" required
                                    autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
                                    error={mismatch} helperText={mismatch ? 'Passwords do not match' : ' '} />
                                {result && <Alert severity={result.severity}>{result.text}</Alert>}
                                <Box>
                                    <Button type="submit" variant="contained" disabled={busy || mismatch || tooShort}>Update password</Button>
                                </Box>
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
};

export default AccountPage;
