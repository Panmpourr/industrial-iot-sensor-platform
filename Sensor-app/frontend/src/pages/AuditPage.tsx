import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, FormControlLabel, IconButton, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { FileDownloadOutlined, HistoryOutlined, Refresh } from '@mui/icons-material';
import * as api from '../api';
import { actionLabels, auditCsv, describeDetails, isChange } from '../audit';
import type { AuditEntry } from '../types';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';

const ranges = [
    { label: 'Last 24 hours', ms: 24 * 3600_000 },
    { label: 'Last 7 days', ms: 7 * 24 * 3600_000 },
    { label: 'Last 30 days', ms: 30 * 24 * 3600_000 },
    { label: 'Last 365 days', ms: 365 * 24 * 3600_000 },
];

const download = (entries: AuditEntry[]) => {
    // BOM so Excel opens the UTF-8 file with the right characters
    const url = URL.createObjectURL(new Blob(['\uFEFF', auditCsv(entries)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

/** Who changed what and when (engineer and admin). */
const AuditPage = () => {
    const [range, setRange] = useState(ranges[1].ms);
    const [user, setUser] = useState('');
    const [withSignIns, setWithSignIns] = useState(false);
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const to = new Date();
            setEntries(await api.getAuditLog(new Date(to.getTime() - range), to));
        } catch (error) {
            console.error('Could not load the audit log', error);
            setFailed(true);
        }
    }, [range]);

    useEffect(() => {
        setEntries(null);
        load();
    }, [load]);

    const users = useMemo(() => [...new Set(entries?.map(e => e.userId) ?? [])].sort(), [entries]);
    const shown = (entries ?? []).filter(e => (withSignIns || isChange(e)) && (user === '' || e.userId === user));

    return (
        <>
            <PageHeader
                title="Audit log"
                subtitle="Who changed what, and when. Entries cannot be edited or deleted."
                actions={
                    <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={shown.length === 0} onClick={() => download(shown)}>
                        Export CSV
                    </Button>
                }
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
                <TextField select size="small" label="Period" value={range} onChange={(e) => setRange(Number(e.target.value))} sx={{ minWidth: 160 }}>
                    {ranges.map(r => <MenuItem key={r.ms} value={r.ms}>{r.label}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="User" value={user} onChange={(e) => setUser(e.target.value)} sx={{ minWidth: 160 }}>
                    <MenuItem value="">All users</MenuItem>
                    {users.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </TextField>
                <FormControlLabel control={<Switch checked={withSignIns} onChange={(e) => setWithSignIns(e.target.checked)} />}
                    label={<Typography variant="body2">Show sign-ins and password changes</Typography>} />
                <Tooltip title="Refresh">
                    <IconButton onClick={load} aria-label="Refresh"><Refresh /></IconButton>
                </Tooltip>
                <Box sx={{ flexGrow: 1 }} />
                {entries && <Typography variant="body2" color="text.secondary">{shown.length} entries</Typography>}
            </Stack>

            {failed && <Typography color="error.main">Could not load the audit log.</Typography>}
            {entries && shown.length === 0 && (
                <EmptyState icon={<HistoryOutlined sx={{ fontSize: 40 }} />} title="Nothing recorded" message="No changes in this period." />
            )}
            {shown.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>Target</TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.map(e => (
                                <TableRow key={e.id}>
                                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{new Date(e.time).toLocaleString()}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{e.userId}</TableCell>
                                    <TableCell>{actionLabels[e.action] ?? e.action}</TableCell>
                                    <TableCell>{e.targetName ?? '—'}</TableCell>
                                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{describeDetails(e)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
};

export default AuditPage;
