import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import type { MaintenanceEntry, MaintenanceTask } from '../types';

/** The site's maintenance tasks and work log, with a refresh after every change. */
export const useMaintenance = () => {
    const [tasks, setTasks] = useState<MaintenanceTask[] | null>(null);
    const [log, setLog] = useState<MaintenanceEntry[]>([]);
    const [failed, setFailed] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const [nextTasks, nextLog] = await Promise.all([api.getMaintenanceTasks(), api.getMaintenanceLog()]);
            setTasks(nextTasks);
            setLog(nextLog);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { tasks, log, failed, refresh };
};
