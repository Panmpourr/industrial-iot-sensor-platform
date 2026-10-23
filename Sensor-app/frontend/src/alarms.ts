import { formatValue } from './status';
import type { Alarm, AlarmCondition, AlarmState } from './types';

export const conditionLabels: Record<AlarmCondition, string> = {
    HIHI: 'High-high',
    HI: 'High',
    LO: 'Low',
    LOLO: 'Low-low',
    COMM: 'Communication lost',
};

export const stateLabels: Record<AlarmState, string> = {
    'active-unacked': 'Unacknowledged',
    'active-acked': 'Acknowledged',
    'cleared-unacked': 'Cleared, not acknowledged',
    closed: 'Closed',
};

export const isUnacked = (alarm: Alarm): boolean => alarm.ackedAt === null;
export const isActive = (alarm: Alarm): boolean => alarm.clearedAt === null;

/** What triggered the alarm, e.g. "> 70 °C" or "No data received". */
export const alarmCondition = (alarm: Alarm, unit?: string): string => {
    if (alarm.condition === 'COMM' || alarm.limit === null) return 'No data received';
    const high = alarm.condition === 'HI' || alarm.condition === 'HIHI';
    return `${high ? '>' : '<'} ${formatValue(alarm.limit, unit)}`;
};

/** Alarm summary order: critical first, then unacknowledged, then newest. */
export const compareAlarms = (a: Alarm, b: Alarm): number =>
    Number(a.priority !== 'critical') - Number(b.priority !== 'critical')
    || Number(!isUnacked(a)) - Number(!isUnacked(b))
    || b.raisedAt - a.raisedAt;

/** Applies a pushed alarm change to the list of open alarms (closed alarms leave the list). */
export const applyAlarm = (open: Alarm[], alarm: Alarm): Alarm[] => {
    const others = open.filter(a => a.id !== alarm.id);
    return alarm.state === 'closed' ? others : [...others, alarm];
};

/** "4 min", "2 h 5 min", ... */
export const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h ${minutes % 60} min`;
    return `${Math.floor(hours / 24)} d ${hours % 24} h`;
};

let audio: AudioContext | undefined;

/** Short two-tone alert for a new critical alarm (no sound file needed). */
export const playAlarmSound = (): void => {
    try {
        audio ??= new AudioContext();
        const start = audio.currentTime;
        [880, 660].forEach((frequency, i) => {
            const osc = audio!.createOscillator();
            const gain = audio!.createGain();
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.15, start + i * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.25 + 0.22);
            osc.connect(gain).connect(audio!.destination);
            osc.start(start + i * 0.25);
            osc.stop(start + i * 0.25 + 0.22);
        });
    } catch {
        // Audio not available (e.g. blocked until the user interacts with the page)
    }
};
