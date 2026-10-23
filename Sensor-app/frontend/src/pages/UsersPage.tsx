import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { DeleteOutline, EditOutlined, PersonAddAlt1Outlined } from '@mui/icons-material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import { useMe } from '../data/MeContext';
import { roleDescriptions, roleLabels, roles } from '../roles';
import type { Role, SiteUser } from '../types';
import ConfirmDialog from '../ui/ConfirmDialog';
import PageHeader from '../ui/PageHeader';

const MIN_TEMP_PASSWORD = 8;

const RoleSelect = ({ value, onChange, disabled }: { value: Role; onChange: (role: Role) => void; disabled?: boolean }) => (
    <TextField select size="small" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Role)}
        sx={{ minWidth: 140 }} SelectProps={{ renderValue: (v) => roleLabels[v as Role] }}>
        {roles.map(r => (
            <MenuItem key={r} value={r}>
                <Box>
                    <Typography variant="body2">{roleLabels[r]}</Typography>
                    <Typography variant="caption" color="text.secondary">{roleDescriptions[r]}</Typography>
                </Box>
            </MenuItem>
        ))}
    </TextField>
);

const AddUserDialog = ({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role>('operator');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setId(''); setPassword(''); setRole('operator'); setError('');
        }
    }, [open]);

    const tooShort = password !== '' && password.length < MIN_TEMP_PASSWORD;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.createSiteUser(id.trim(), password, role);
            onAdded();
            onClose();
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not add the user. Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <Box component="form" onSubmit={submit}>
                <DialogTitle>Add user</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField label="User ID" value={id} size="small" required autoFocus onChange={(e) => setId(e.target.value)} />
                        <TextField label="Temporary password" value={password} size="small" required autoComplete="off"
                            onChange={(e) => setPassword(e.target.value)} error={tooShort}
                            helperText={tooShort ? `At least ${MIN_TEMP_PASSWORD} characters` : 'Give it to the user; they must change it at the first sign-in.'} />
                        <RoleSelect value={role} onChange={setRole} />
                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
                    <Button type="submit" variant="contained" disabled={busy || id.trim() === '' || password.length < MIN_TEMP_PASSWORD}>Add user</Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

const SiteNameDialog = ({ open, current, onClose, onSaved }: { open: boolean; current: string; onClose: () => void; onSaved: () => void }) => {
    const [name, setName] = useState(current);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) setName(current);
    }, [open, current]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.renameSite(name.trim());
            onSaved();
            onClose();
        } catch (error) {
            console.error('Could not rename the site', error);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <Box component="form" onSubmit={submit}>
                <DialogTitle>Rename site</DialogTitle>
                <DialogContent>
                    <TextField label="Site name" value={name} size="small" fullWidth required autoFocus sx={{ mt: 1 }}
                        inputProps={{ maxLength: 100 }} onChange={(e) => setName(e.target.value)} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
                    <Button type="submit" variant="contained" disabled={busy || name.trim() === ''}>Save</Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

/** Admin page: the site's users and their roles. */
const UsersPage = () => {
    const { me, refresh: refreshMe } = useMe();
    const [users, setUsers] = useState<SiteUser[] | null>(null);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [toRemove, setToRemove] = useState<SiteUser | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setUsers(await api.getSiteUsers());
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not load the users.');
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const changeRole = async (user: SiteUser, role: Role) => {
        setError('');
        try {
            await api.updateUserRole(user.id, role);
            await load();
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not change the role.');
        }
    };

    const remove = async () => {
        if (!toRemove) return;
        setBusy(true);
        try {
            await api.deleteSiteUser(toRemove.id);
            setToRemove(null);
            await load();
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not remove the user.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeader
                title="Users"
                subtitle={
                    <>
                        People who can sign in to <b>{me?.siteName}</b>
                        <Tooltip title="Rename site">
                            <IconButton size="small" onClick={() => setRenaming(true)} sx={{ ml: 0.5 }} aria-label="Rename site">
                                <EditOutlined fontSize="inherit" />
                            </IconButton>
                        </Tooltip>
                    </>
                }
                actions={<Button variant="contained" startIcon={<PersonAddAlt1Outlined />} onClick={() => setAdding(true)}>Add user</Button>}
            />
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>User</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Added</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users?.map(user => {
                            const self = user.id === me?.id;
                            return (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.id}</Typography>
                                            {self && <Chip size="small" label="You" />}
                                            {user.mustChangePassword && <Chip size="small" variant="outlined" label="Temporary password" />}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={self ? 'You cannot change your own role' : ''}>
                                            <span><RoleSelect value={user.role} disabled={self} onChange={(role) => changeRole(user, role)} /></span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {!self && (
                                            <Tooltip title="Remove user">
                                                <IconButton size="small" onClick={() => setToRemove(user)} aria-label={`Remove ${user.id}`}>
                                                    <DeleteOutline fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <AddUserDialog open={adding} onClose={() => setAdding(false)} onAdded={load} />
            <SiteNameDialog open={renaming} current={me?.siteName ?? ''} onClose={() => setRenaming(false)} onSaved={refreshMe} />
            <ConfirmDialog
                open={toRemove !== null}
                title="Remove user?"
                message={`${toRemove?.id} will no longer be able to sign in. Their sensors stay in the site and their entries stay in the audit log.`}
                confirmLabel="Remove"
                busy={busy}
                onConfirm={remove}
                onClose={() => setToRemove(null)}
            />
        </>
    );
};

export default UsersPage;
