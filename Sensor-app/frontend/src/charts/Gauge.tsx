import { Box, Typography } from '@mui/material';
import { statusColors } from '../theme';
import { formatValue } from '../status';

interface GaugeProps {
    value: number | undefined;
    min: number;
    max: number;
    warning?: number;
    critical?: number;
    unit?: string;
    label?: string;
}

const START = 135; // degrees, measured clockwise from 3 o'clock
const SWEEP = 270;
const SIZE = 180;
const CENTER = SIZE / 2;
const RADIUS = 72;

const point = (angle: number, radius = RADIUS) => {
    const rad = (angle * Math.PI) / 180;
    return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
};

const arc = (from: number, to: number, radius = RADIUS) => {
    const a = point(from, radius);
    const b = point(to, radius);
    const large = to - from > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
};

/**
 * Radial gauge in ISA-101 style: the value arc stays neutral while the value is normal and only
 * turns amber/red when a limit is exceeded. Limit zones are shown as a thin outer band.
 */
const Gauge = ({ value, min, max, warning, critical, unit, label }: GaugeProps) => {
    const span = max - min || 1;
    const angleOf = (v: number) => START + (Math.min(Math.max((v - min) / span, 0), 1) * SWEEP);

    const color = value === undefined ? statusColors.nodata
        : critical !== undefined && value > critical ? statusColors.critical
            : warning !== undefined && value > warning ? statusColors.warning
                : '#c9cdd2';

    return (
        <Box sx={{ position: 'relative', width: SIZE, height: SIZE, mx: 'auto' }}>
            <svg width={SIZE} height={SIZE} role="img" aria-label={`${label ?? 'Value'}: ${formatValue(value, unit)}`}>
                <path d={arc(START, START + SWEEP)} stroke="#2a2e33" strokeWidth={12} fill="none" strokeLinecap="round" />
                {warning !== undefined && (
                    <path d={arc(angleOf(warning), angleOf(critical ?? max), RADIUS + 11)} stroke={statusColors.warning} strokeWidth={3} fill="none" />
                )}
                {critical !== undefined && (
                    <path d={arc(angleOf(critical), START + SWEEP, RADIUS + 11)} stroke={statusColors.critical} strokeWidth={3} fill="none" />
                )}
                {value !== undefined && value > min && (
                    <path d={arc(START, angleOf(value))} stroke={color} strokeWidth={12} fill="none" strokeLinecap="round" />
                )}
            </svg>
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: '1.6rem', fontWeight: 600, color: color === '#c9cdd2' ? 'text.primary' : color }}>
                    {formatValue(value)}
                </Typography>
                <Typography variant="caption" color="text.secondary">{unit || label}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', left: 22, bottom: 8 }}>{min}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', right: 22, bottom: 8 }}>{max}</Typography>
        </Box>
    );
};

export default Gauge;
