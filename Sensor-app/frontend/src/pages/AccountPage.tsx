import { useNavigate } from 'react-router';
import { Button, Grid, Paper, Typography } from '@mui/material';
import { LogoutOutlined } from '@mui/icons-material';
import { clearSession, getUserId } from '../auth';
import { useMe } from '../data/MeContext';
import { roleDescriptions, roleLabels } from '../roles';
import ChangePasswordForm from '../ui/ChangePasswordForm';
import PageHeader from '../ui/PageHeader';

const AccountPage = () => {
    const navigate = useNavigate();
    const { me } = useMe();

    return (
        <>
            <PageHeader title="Account" subtitle="Your profile and security settings" />
            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="overline" color="text.secondary">User ID</Typography>
                        <Typography variant="h6" sx={{ mb: 2 }}>{getUserId()}</Typography>
                        {me && (
                            <>
                                <Typography variant="overline" color="text.secondary">Site</Typography>
                                <Typography sx={{ mb: 2 }}>{me.siteName}</Typography>
                                <Typography variant="overline" color="text.secondary">Role</Typography>
                                <Typography>{roleLabels[me.role]}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{roleDescriptions[me.role]}</Typography>
                            </>
                        )}
                        <Button variant="outlined" color="inherit" startIcon={<LogoutOutlined />}
                            onClick={() => { clearSession(); navigate('/login'); }}>
                            Sign out
                        </Button>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={8}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2 }}>Change password</Typography>
                        <ChangePasswordForm />
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
};

export default AccountPage;
