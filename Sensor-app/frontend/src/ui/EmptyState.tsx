import type { ReactNode } from 'react';
import { Paper, Stack, Typography } from '@mui/material';
import { SensorsOutlined } from '@mui/icons-material';

interface EmptyStateProps {
    title: string;
    message: string;
    action?: ReactNode;
    icon?: ReactNode;
}

const EmptyState = ({ title, message, action, icon }: EmptyStateProps) => (
    <Paper variant="outlined" sx={{ py: 8, px: 3 }}>
        <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
            {icon ?? <SensorsOutlined sx={{ fontSize: 40, color: 'text.secondary' }} />}
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary">{message}</Typography>
            {action}
        </Stack>
    </Paper>
);

export default EmptyState;
