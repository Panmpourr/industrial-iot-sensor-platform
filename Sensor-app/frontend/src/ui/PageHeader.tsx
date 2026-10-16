import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface PageHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
}

const PageHeader = ({ title, subtitle, actions }: PageHeaderProps) => (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} sx={{ mb: 3 }}>
        <Box>
            <Typography variant="h5" component="h1">{title}</Typography>
            {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={1}>{actions}</Stack>}
    </Stack>
);

export default PageHeader;
