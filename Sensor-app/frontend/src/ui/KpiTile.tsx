import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

interface KpiTileProps {
    label: string;
    value: ReactNode;
    /** Highlight colour; only used when the KPI represents an abnormal state. */
    accent?: string;
    caption?: ReactNode;
}

const KpiTile = ({ label, value, accent, caption }: KpiTileProps) => (
    <Paper
        variant="outlined"
        sx={{
            p: 2,
            height: '100%',
            borderLeft: accent ? `3px solid ${accent}` : undefined,
        }}
    >
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.2, color: accent ?? 'text.primary' }}>
            {value}
        </Typography>
        {caption && (
            <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{caption}</Typography>
            </Box>
        )}
    </Paper>
);

export default KpiTile;
