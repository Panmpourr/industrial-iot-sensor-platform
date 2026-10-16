import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { FactoryOutlined } from '@mui/icons-material';

/** Centered card used by the sign-in and registration pages. */
const AuthLayout = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) => (
    <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
        background: 'radial-gradient(1200px 600px at 50% -10%, rgba(122,162,200,0.10), transparent 60%)',
    }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>
            <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="center" sx={{ mb: 3 }}>
                <FactoryOutlined sx={{ color: 'primary.main', fontSize: 30 }} />
                <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.1 }}>IIoT Platform</Typography>
                    <Typography variant="caption" color="text.secondary">Industrial sensor monitoring</Typography>
                </Box>
            </Stack>
            <Paper variant="outlined" sx={{ p: 4 }}>
                <Typography variant="h5" component="h1">{title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>{subtitle}</Typography>
                {children}
            </Paper>
            <Box sx={{ mt: 2, textAlign: 'center' }}>{footer}</Box>
        </Box>
    </Box>
);

export default AuthLayout;
