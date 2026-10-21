import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import theme from './theme';
import { getToken } from './auth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Charts, maps and the data layer are only needed after sign-in
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

const Loading = () => (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
    </Box>
);

const RequireAuth = ({ children }: { children: ReactNode }) =>
    getToken() ? <>{children}</> : <Navigate to="/login" replace />;

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <Suspense fallback={<Loading />}>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/" element={<Navigate to="/overview" replace />} />
                        <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
                        <Route path="/*" element={<RequireAuth><AuthenticatedApp /></RequireAuth>} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
