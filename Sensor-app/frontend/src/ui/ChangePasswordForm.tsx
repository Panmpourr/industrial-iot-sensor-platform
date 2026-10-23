import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Stack, TextField } from '@mui/material';
import * as api from '../api';

const MIN_PASSWORD_LENGTH = 6;

/** Current + new password form, used on the account page and for replacing a temporary password. */
const ChangePasswordForm = ({ onChanged, currentLabel = 'Current password' }: { onChanged?: () => void; currentLabel?: string }) => {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

    const mismatch = confirm !== '' && confirm !== newPassword;
    const tooShort = newPassword !== '' && newPassword.length < MIN_PASSWORD_LENGTH;
    const unchanged = newPassword !== '' && newPassword === oldPassword;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (mismatch || tooShort || unchanged) return;
        setBusy(true);
        setResult(null);
        try {
            const { success } = await api.changePassword(oldPassword, newPassword);
            setResult(success
                ? { severity: 'success', text: 'Password changed.' }
                : { severity: 'error', text: `${currentLabel} is incorrect.` });
            if (success) {
                setOldPassword(''); setNewPassword(''); setConfirm('');
                onChanged?.();
            }
        } catch {
            setResult({ severity: 'error', text: 'Could not change the password. Try again.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box component="form" onSubmit={submit} sx={{ maxWidth: 420 }}>
            <Stack spacing={2}>
                <TextField label={currentLabel} type="password" value={oldPassword} size="small" required
                    autoComplete="current-password" onChange={(e) => setOldPassword(e.target.value)} />
                <TextField label="New password" type="password" value={newPassword} size="small" required
                    autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)}
                    error={tooShort || unchanged}
                    helperText={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : unchanged ? 'Choose a different password' : ' '} />
                <TextField label="Confirm new password" type="password" value={confirm} size="small" required
                    autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
                    error={mismatch} helperText={mismatch ? 'Passwords do not match' : ' '} />
                {result && <Alert severity={result.severity}>{result.text}</Alert>}
                <Box>
                    <Button type="submit" variant="contained" disabled={busy || mismatch || tooShort || unchanged}>Update password</Button>
                </Box>
            </Stack>
        </Box>
    );
};

export default ChangePasswordForm;
