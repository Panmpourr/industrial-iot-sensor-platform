import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
    AppBar, Badge, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
    Menu, MenuItem, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { DashboardOutlined, SensorsOutlined, NotificationsActiveOutlined, AccountCircleOutlined, Menu as MenuIcon, LogoutOutlined, PersonOutline, FactoryOutlined, GroupOutlined, HistoryOutlined } from '@mui/icons-material';
import { clearSession, getUserId } from '../auth';
import { useSensorData, type ConnectionState } from '../data/SensorDataContext';
import { isUnacked } from '../alarms';
import { useMe } from '../data/MeContext';
import { roleLabels } from '../roles';
import { statusColors } from '../theme';

const DRAWER_WIDTH = 220;

const connectionInfo: Record<ConnectionState, { label: string; color: string; hint: string }> = {
    live: { label: 'Live', color: statusColors.normal, hint: 'Receiving readings in real time' },
    connecting: { label: 'Connecting', color: statusColors.stale, hint: 'Connecting to the live data stream…' },
    reconnecting: { label: 'Reconnecting', color: statusColors.warning, hint: 'Connection lost, reconnecting…' },
    offline: { label: 'Offline', color: statusColors.critical, hint: 'No live connection; values may be outdated' },
};

const ConnectionIndicator = () => {
    const { connection } = useSensorData();
    const info = connectionInfo[connection];
    return (
        <Tooltip title={info.hint}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.5, border: 1, borderColor: 'divider', borderRadius: 5 }}>
                <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: info.color,
                    animation: connection === 'live' ? 'pulse 2s ease-in-out infinite' : 'none',
                    '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
                }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{info.label}</Typography>
            </Stack>
        </Tooltip>
    );
};

const pageTitles: [string, string][] = [
    ['/overview', 'Overview'],
    ['/sensors', 'Sensors'],
    ['/alarms', 'Alarms'],
    ['/audit', 'Audit log'],
    ['/users', 'Users'],
    ['/profile', 'Account'],
];

const AppShell = () => {
    const theme = useTheme();
    const desktop = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userMenu, setUserMenu] = useState<HTMLElement | null>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { alarms } = useSensorData();
    const { me, can } = useMe();
    // Like an alarm banner: the number of alarms an operator still has to acknowledge
    const alarmCount = alarms.filter(isUnacked).length;

    const title = pageTitles.find(([path]) => location.pathname.startsWith(path))?.[1] ?? '';

    const logout = () => {
        clearSession();
        navigate('/login');
    };

    const navItem = (to: string, label: string, icon: ReactNode) => (
        <ListItemButton
            key={to}
            component={NavLink}
            to={to}
            onClick={() => setMobileOpen(false)}
            sx={{
                mx: 1, mb: 0.5, borderRadius: 1,
                color: 'text.secondary',
                '&.active': { bgcolor: 'rgba(122, 162, 200, 0.12)', color: 'text.primary', '& .MuiListItemIcon-root': { color: 'primary.main' } },
            }}
        >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{icon}</ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
        </ListItemButton>
    );

    const drawer = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2.5, height: 56 }}>
                <FactoryOutlined sx={{ color: 'primary.main' }} />
                <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.1 }}>IIoT Platform</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ maxWidth: 150 }}>{me?.siteName ?? 'Sensor monitoring'}</Typography>
                </Box>
            </Stack>
            <Divider />
            <List sx={{ pt: 1.5 }}>
                {navItem('/overview', 'Overview', <DashboardOutlined fontSize="small" />)}
                {navItem('/sensors', 'Sensors', <SensorsOutlined fontSize="small" />)}
                {navItem('/alarms', 'Alarms', (
                    <Badge badgeContent={alarmCount} color="error" max={99}>
                        <NotificationsActiveOutlined fontSize="small" />
                    </Badge>
                ))}
                {can('engineer') && navItem('/audit', 'Audit log', <HistoryOutlined fontSize="small" />)}
                {can('admin') && navItem('/users', 'Users', <GroupOutlined fontSize="small" />)}
            </List>
            <Box sx={{ flexGrow: 1 }} />
            <Divider />
            <List>{navItem('/profile', 'Account', <AccountCircleOutlined fontSize="small" />)}</List>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
                <Drawer
                    variant={desktop ? 'permanent' : 'temporary'}
                    open={desktop || mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    PaperProps={{ sx: { width: DRAWER_WIDTH, bgcolor: '#15171a', borderRight: 1, borderColor: 'divider' } }}
                >
                    {drawer}
                </Drawer>
            </Box>

            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <AppBar position="sticky" color="transparent" elevation={0}
                    sx={{ bgcolor: 'rgba(17, 19, 22, 0.85)', backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
                    <Toolbar variant="dense" sx={{ minHeight: 56, gap: 1.5 }}>
                        {!desktop && (
                            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                                <MenuIcon />
                            </IconButton>
                        )}
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>{title}</Typography>
                        <ConnectionIndicator />
                        <Tooltip title="Account">
                            <IconButton onClick={(e) => setUserMenu(e.currentTarget)} aria-label="Account menu">
                                <PersonOutline />
                            </IconButton>
                        </Tooltip>
                        <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                            <Box sx={{ px: 2, py: 1 }}>
                                <Typography variant="caption" color="text.secondary">Signed in as</Typography>
                                <Typography sx={{ fontWeight: 600 }}>{getUserId()}</Typography>
                                {me && <Typography variant="caption" color="text.secondary">{roleLabels[me.role]} · {me.siteName}</Typography>}
                            </Box>
                            <Divider />
                            <MenuItem onClick={() => { setUserMenu(null); navigate('/profile'); }}>
                                <ListItemIcon><AccountCircleOutlined fontSize="small" /></ListItemIcon>Account settings
                            </MenuItem>
                            <MenuItem onClick={logout}>
                                <ListItemIcon><LogoutOutlined fontSize="small" /></ListItemIcon>Sign out
                            </MenuItem>
                        </Menu>
                    </Toolbar>
                </AppBar>

                <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default AppShell;
