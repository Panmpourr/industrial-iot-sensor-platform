import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api';
import { atLeast } from '../roles';
import type { Me, Role } from '../types';

interface MeValue {
    /** null until the profile is loaded */
    me: Me | null;
    failed: boolean;
    /** Whether the signed-in user's role allows actions that need `role`. The backend checks this too. */
    can: (role: Role) => boolean;
    refresh: () => Promise<void>;
}

const MeContext = createContext<MeValue | null>(null);

/** Loads the signed-in user's site and role once, for showing or hiding actions by role. */
export const MeProvider = ({ children }: { children: ReactNode }) => {
    const [me, setMe] = useState<Me | null>(null);
    const [failed, setFailed] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setMe(await api.getProfile());
            setFailed(false);
        } catch (error) {
            console.error('Could not load the profile', error);
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const can = useCallback((role: Role) => me !== null && atLeast(me.role, role), [me]);
    const value = useMemo(() => ({ me, failed, can, refresh }), [me, failed, can, refresh]);

    return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
};

export const useMe = (): MeValue => {
    const value = useContext(MeContext);
    if (!value) throw new Error('useMe must be used inside <MeProvider>');
    return value;
};
