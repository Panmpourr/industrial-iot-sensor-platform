import { Navigate, Route, Routes } from 'react-router-dom';
import { SensorDataProvider } from './data/SensorDataContext';
import AppShell from './layout/AppShell';
import OverviewPage from './pages/OverviewPage';
import SensorsPage from './pages/SensorsPage';
import SensorDetailPage from './pages/SensorDetailPage';
import AlarmsPage from './pages/AlarmsPage';
import AccountPage from './pages/AccountPage';

/** Everything behind the login. Loaded lazily, so the sign-in page stays small. */
const AuthenticatedApp = () => (
    <SensorDataProvider>
        <Routes>
            <Route element={<AppShell />}>
                <Route path="overview" element={<OverviewPage />} />
                <Route path="sensors" element={<SensorsPage />} />
                <Route path="sensors/:id" element={<SensorDetailPage />} />
                <Route path="alarms" element={<AlarmsPage />} />
                <Route path="profile" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
        </Routes>
    </SensorDataProvider>
);

export default AuthenticatedApp;
