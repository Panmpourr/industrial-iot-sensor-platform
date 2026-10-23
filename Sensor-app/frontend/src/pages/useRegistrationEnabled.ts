import { useEffect, useState } from 'react';
import * as api from '../api';

/**
 * Whether sign-up is turned on (REGISTRATION_ENABLED on the server). `null` while loading. If the
 * server cannot be asked, the link stays visible; the server refuses the sign-up anyway when it is off.
 */
export const useRegistrationEnabled = (): boolean | null => {
    const [enabled, setEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        let active = true;
        api.getAuthConfig()
            .then(config => active && setEnabled(config.registrationEnabled))
            .catch(() => active && setEnabled(true));
        return () => {
            active = false;
        };
    }, []);

    return enabled;
};
