import { Box, Chip } from '@mui/material';
import { statusColors, statusLabels } from '../theme';
import type { SensorStatus } from '../status';

/**
 * Status shown as shape + colour + text, so it is readable for colour-blind operators
 * and on monochrome screens (ISA-101): ● normal, ▲ warning, ◆ critical, ○ no data.
 */
const symbols: Record<SensorStatus, string> = {
    critical: '◆',
    warning: '▲',
    normal: '●',
    stale: '◌',
    nodata: '○',
};

export const StatusChip = ({ status }: { status: SensorStatus }) => {
    const color = statusColors[status];
    const abnormal = status === 'critical' || status === 'warning';
    return (
        <Chip
            size="small"
            label={<><Box component="span" sx={{ mr: 0.75 }}>{symbols[status]}</Box>{statusLabels[status]}</>}
            sx={{
                height: 22,
                fontWeight: 600,
                fontSize: '0.72rem',
                color: abnormal ? '#111316' : color,
                bgcolor: abnormal ? color : 'transparent',
                border: `1px solid ${abnormal ? color : 'rgba(255,255,255,0.12)'}`,
                '& .MuiChip-label': { px: 1 },
            }}
        />
    );
};

export const StatusDot = ({ status, size = 8 }: { status: SensorStatus; size?: number }) => (
    <Box
        component="span"
        sx={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', bgcolor: statusColors[status], flexShrink: 0 }}
    />
);
