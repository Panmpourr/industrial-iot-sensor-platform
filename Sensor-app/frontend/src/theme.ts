import { createTheme } from '@mui/material/styles';
import type { SensorStatus } from './status';

/**
 * High-performance HMI palette (ISA-101): neutral greys for everything that is normal,
 * saturated colour reserved for abnormal states so alarms stand out at a glance.
 */
export const statusColors: Record<SensorStatus, string> = {
    critical: '#e5484d',
    warning: '#f5a524',
    normal: '#3fb37f',
    stale: '#8b8d98',
    nodata: '#5b5e6b',
};

export const statusLabels: Record<SensorStatus, string> = {
    critical: 'Critical',
    warning: 'Warning',
    normal: 'Normal',
    stale: 'No recent data',
    nodata: 'No data',
};

/** Neutral colour for trend lines (normal data is not colourful). */
export const trendColor = '#7aa2c8';
export const gridColor = 'rgba(255, 255, 255, 0.06)';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#7aa2c8' },
        error: { main: statusColors.critical },
        warning: { main: statusColors.warning },
        success: { main: statusColors.normal },
        background: {
            default: '#111316',
            paper: '#1a1d21',
        },
        divider: 'rgba(255, 255, 255, 0.08)',
        text: {
            primary: '#e6e8eb',
            secondary: '#9ba1a9',
        },
    },
    shape: { borderRadius: 6 },
    typography: {
        fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 13,
        h5: { fontWeight: 600, fontSize: '1.25rem' },
        h6: { fontWeight: 600, fontSize: '1rem' },
        subtitle2: { fontWeight: 600 },
        overline: { fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.6 },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                // Digits keep the same width, so live values don't jitter
                body: { fontVariantNumeric: 'tabular-nums' },
            },
        },
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: { backgroundImage: 'none' },
                outlined: { borderColor: 'rgba(255, 255, 255, 0.08)' },
            },
        },
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
        },
        MuiTableCell: {
            styleOverrides: {
                root: { borderColor: 'rgba(255, 255, 255, 0.06)' },
                head: { color: '#9ba1a9', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: { '&.MuiTableRow-hover:hover': { backgroundColor: 'rgba(255, 255, 255, 0.03)' } },
            },
        },
        MuiTooltip: {
            styleOverrides: { tooltip: { fontSize: '0.75rem' } },
        },
    },
});

export default theme;
