import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { SensorDataProvider } from './data/SensorDataContext';
import { MeProvider, useMe } from './data/MeContext';
import AppShell from './layout/AppShell';
import OverviewPage from './pages/OverviewPage';
import SetPasswordPage from './pages/SetPasswordPage';
import type { Role } from './types';

// Every other page is loaded when it is first opened: the sensor page alone needs Chart.js,
// Recharts and Leaflet, which are most of the bundle
const SensorsPage = lazy(() => import('./pages/SensorsPage'));
const SensorDetailPage = lazy(() => import('./pages/SensorDetailPage'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const PlantPage = lazy(() => import('./pages/PlantPage'));

const Centered = ({ children }: { children: ReactNode }) => (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
        {children}
    </Box>
);

/** Pages for a role the user does not have redirect to the overview (the backend refuses them anyway). */
const RequireRole = ({ role, children }: { role: Role; children: ReactNode }) =>
    useMe().can(role) ? <>{children}</> : <Navigate to="/overview" replace />;

const Pages = () => {
    const { me, failed, refresh } = useMe();

    if (!me) {
        return (
            <Centered>
                {failed ? (
                    <>
                        <Typography color="text.secondary">Could not load your account.</Typography>
                        <Button variant="outlined" onClick={refresh}>Try again</Button>
                    </>
                ) : <CircularProgress size={28} />}
            </Centered>
        );
    }
    if (me.mustChangePassword) {
        return <SetPasswordPage />;
    }

    return (
        <SensorDataProvider>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="overview" element={<OverviewPage />} />
                    <Route path="plant" element={<PlantPage />} />
                    <Route path="plant/:assetId" element={<PlantPage />} />
                    <Route path="sensors" element={<SensorsPage />} />
                    <Route path="sensors/:id" element={<SensorDetailPage />} />
                    <Route path="alarms" element={<AlarmsPage />} />
                    <Route path="audit" element={<RequireRole role="engineer"><AuditPage /></RequireRole>} />
                    <Route path="users" element={<RequireRole role="admin"><UsersPage /></RequireRole>} />
                    <Route path="profile" element={<AccountPage />} />
                    <Route path="*" element={<Navigate to="/overview" replace />} />
                </Route>
            </Routes>
        </SensorDataProvider>
    );
};

/** Everything behind the login. Loaded lazily, so the sign-in page stays small. */
const AuthenticatedApp = () => (
    <MeProvider>
        <Pages />
    </MeProvider>
);

export default AuthenticatedApp;
