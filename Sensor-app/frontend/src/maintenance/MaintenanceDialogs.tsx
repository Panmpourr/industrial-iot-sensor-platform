import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import * as api from '../api';
import { alarmCondition, conditionLabels } from '../alarms';
import { assetFilter } from '../assets';
import { apiErrorMessage } from '../auth';
import { useSensorData } from '../data/SensorDataContext';
import { addDays, formatDay, intervalPresets, kindLabels, manualKinds, todayText } from '../maintenance';
import type { Alarm, MaintenanceKind, MaintenanceTask } from '../types';
import AssetSelect from '../ui/AssetSelect';

const CUSTOM = -1;

/** Dialog shell shared by the maintenance forms: submit, busy state and the error message. */
const FormDialog = ({ open, title, submitLabel, onClose, onSubmit, children }: {
    open: boolean; title: string; submitLabel: string; onClose: () => void; onSubmit: () => Promise<void>; children: ReactNode;
}) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) setError(null);
    }, [open]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await onSubmit();
        } catch (err) {
            setError(apiErrorMessage(err) ?? 'Could not save. Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <form onSubmit={submit}>
                <DialogTitle>{title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {children}
                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
                    <Button type="submit" variant="contained" disabled={busy}>{submitLabel}</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

const durationValue = (text: string): number | null => (text.trim() === '' ? null : Math.max(0, Math.round(Number(text))));

// ---------------- Task (plan) ----------------

export type TaskEditing = { task: MaintenanceTask } | { assetId: string | null } | null;

/** Adds or changes a recurring task. Engineers only. */
export const TaskDialog = ({ editing, onClose, onSaved }: { editing: TaskEditing; onClose: () => void; onSaved: () => void }) => {
    const { assets } = useSensorData();
    const existing = editing && 'task' in editing ? editing.task : null;
    const [assetId, setAssetId] = useState('');
    const [name, setName] = useState('');
    const [preset, setPreset] = useState(30);
    const [customDays, setCustomDays] = useState('');
    const [nextDue, setNextDue] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!editing) return;
        const task = 'task' in editing ? editing.task : null;
        setAssetId(task?.assetId ?? ('assetId' in editing ? editing.assetId ?? '' : ''));
        setName(task?.name ?? '');
        const days = task?.intervalDays ?? 30;
        const known = intervalPresets.some(p => p.days === days);
        setPreset(known ? days : CUSTOM);
        setCustomDays(known ? '' : String(days));
        setNextDue(task?.nextDue ?? addDays(todayText(), days));
        setNotes(task?.notes ?? '');
    }, [editing]);

    const intervalDays = preset === CUSTOM ? Number(customDays) : preset;

    const save = async () => {
        const input = { assetId, name, intervalDays, nextDue, notes: notes.trim() || null };
        if (existing) await api.updateMaintenanceTask(existing.id, input);
        else await api.createMaintenanceTask(input);
        onSaved();
    };

    return (
        <FormDialog open={editing !== null} title={existing ? 'Change task' : 'Add maintenance task'} submitLabel={existing ? 'Save' : 'Add'}
            onClose={onClose} onSubmit={save}>
            {!existing && (
                <AssetSelect assets={assets} label="Equipment or area" value={assetId} onChange={setAssetId}
                    emptyLabel="Choose…" fullWidth />
            )}
            <TextField label="Task" value={name} onChange={e => setName(e.target.value)} required autoFocus={!!existing}
                placeholder="e.g. Replace air filter" inputProps={{ maxLength: 200 }} />
            <TextField select label="Repeat" value={preset} onChange={e => setPreset(Number(e.target.value))}>
                {intervalPresets.map(p => <MenuItem key={p.days} value={p.days}>{p.label}</MenuItem>)}
                <MenuItem value={CUSTOM}>Other number of days…</MenuItem>
            </TextField>
            {preset === CUSTOM && (
                <TextField label="Every … days" type="number" value={customDays} onChange={e => setCustomDays(e.target.value)} required
                    inputProps={{ min: 1, max: 3650 }} />
            )}
            <TextField label={existing ? 'Next due' : 'First due'} type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} required
                InputLabelProps={{ shrink: true }} helperText={nextDue ? formatDay(nextDue) : ' '} />
            <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline minRows={2}
                placeholder="Parts, tools, instructions…" inputProps={{ maxLength: 2000 }} />
        </FormDialog>
    );
};

// ---------------- Complete a task ----------------

/** Marks a task done; the next due date moves to that day plus the interval. Every role. */
export const CompleteDialog = ({ task, onClose, onDone }: { task: MaintenanceTask | null; onClose: () => void; onDone: (nextDue: string) => void }) => {
    const [performedOn, setPerformedOn] = useState('');
    const [description, setDescription] = useState('');
    const [duration, setDuration] = useState('');
    const today = todayText();

    useEffect(() => {
        if (!task) return;
        setPerformedOn(todayText());
        setDescription('');
        setDuration('');
    }, [task]);

    const save = async () => {
        onDone(await api.completeMaintenanceTask(task!.id, { performedOn, description, durationMinutes: durationValue(duration) }));
    };

    return (
        <FormDialog open={task !== null} title={`Done: ${task?.name ?? ''}`} submitLabel="Mark done" onClose={onClose} onSubmit={save}>
            <TextField label="Done on" type="date" value={performedOn} onChange={e => setPerformedOn(e.target.value)} required
                InputLabelProps={{ shrink: true }} inputProps={{ max: today }}
                helperText={task && performedOn ? `Next due: ${formatDay(addDays(performedOn, task.intervalDays))}` : ' '} />
            <TextField label="Notes (optional)" value={description} onChange={e => setDescription(e.target.value)} multiline minRows={2}
                placeholder="What you found, parts used…" inputProps={{ maxLength: 2000 }} />
            <TextField label="Time spent (minutes, optional)" type="number" value={duration} onChange={e => setDuration(e.target.value)}
                inputProps={{ min: 0, max: 100000 }} />
        </FormDialog>
    );
};

// ---------------- Log other work ----------------

/** Logs a repair, inspection... optionally caused by a recent alarm of a sensor there. Every role. */
export const LogWorkDialog = ({ open, assetId: initialAssetId, onClose, onSaved }: {
    open: boolean; assetId: string | null; onClose: () => void; onSaved: () => void;
}) => {
    const { assets, sensors } = useSensorData();
    const [assetId, setAssetId] = useState('');
    const [kind, setKind] = useState<MaintenanceKind>('repair');
    const [performedOn, setPerformedOn] = useState('');
    const [description, setDescription] = useState('');
    const [duration, setDuration] = useState('');
    const [alarmId, setAlarmId] = useState('');
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const today = todayText();

    useEffect(() => {
        if (!open) return;
        setAssetId(initialAssetId ?? '');
        setKind('repair');
        setPerformedOn(todayText());
        setDescription('');
        setDuration('');
        setAlarmId('');
        // Alarms of the last 30 days, to link the work to what caused it
        const to = new Date();
        api.getAlarmHistory(new Date(to.getTime() - 30 * 86_400_000), to).then(setAlarms).catch(() => setAlarms([]));
    }, [open, initialAssetId]);

    const inside = assetId ? assetFilter(assets, assetId) : () => false;
    const relevant = alarms.filter(a => sensors[a.sensorId] && inside(sensors[a.sensorId].assetId)).slice(0, 30);

    const save = async () => {
        await api.logMaintenanceWork({
            assetId, kind, performedOn, description, durationMinutes: durationValue(duration), alarmId: alarmId || null,
        });
        onSaved();
    };

    return (
        <FormDialog open={open} title="Log work" submitLabel="Save" onClose={onClose} onSubmit={save}>
            <AssetSelect assets={assets} label="Equipment or area" value={assetId} onChange={value => { setAssetId(value); setAlarmId(''); }}
                emptyLabel="Choose…" fullWidth />
            <TextField select label="Kind" value={kind} onChange={e => setKind(e.target.value as MaintenanceKind)}>
                {manualKinds.map(k => <MenuItem key={k} value={k}>{kindLabels[k]}</MenuItem>)}
            </TextField>
            <TextField label="Done on" type="date" value={performedOn} onChange={e => setPerformedOn(e.target.value)} required
                InputLabelProps={{ shrink: true }} inputProps={{ max: today }} />
            <TextField label="What was done" value={description} onChange={e => setDescription(e.target.value)} required multiline minRows={3}
                placeholder="e.g. Replaced the worn drive belt" inputProps={{ maxLength: 2000 }} />
            <TextField label="Time spent (minutes, optional)" type="number" value={duration} onChange={e => setDuration(e.target.value)}
                inputProps={{ min: 0, max: 100000 }} />
            <TextField select label="Caused by an alarm (optional)" value={alarmId} onChange={e => setAlarmId(e.target.value)}
                disabled={relevant.length === 0} helperText={assetId && relevant.length === 0 ? 'No alarms here in the last 30 days' : ' '}>
                <MenuItem value="">None</MenuItem>
                {relevant.map(a => {
                    const sensor = sensors[a.sensorId];
                    return (
                        <MenuItem key={a.id} value={a.id}>
                            <Typography variant="body2" component="span">
                                {new Date(a.raisedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                {' · '}{sensor.name} · {conditionLabels[a.condition]} {alarmCondition(a)}
                            </Typography>
                        </MenuItem>
                    );
                })}
            </TextField>
        </FormDialog>
    );
};
