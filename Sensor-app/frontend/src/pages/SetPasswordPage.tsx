import { useNavigate } from 'react-router';
import { Link, Typography } from '@mui/material';
import { clearSession } from '../auth';
import { useMe } from '../data/MeContext';
import ChangePasswordForm from '../ui/ChangePasswordForm';
import AuthLayout from './AuthLayout';

/** Shown instead of the app until a user added by an admin replaces their temporary password. */
const SetPasswordPage = () => {
    const navigate = useNavigate();
    const { me, refresh } = useMe();

    return (
        <AuthLayout
            title="Choose your password"
            subtitle={`Welcome to ${me?.siteName ?? 'the site'}. Replace the temporary password you received before you continue.`}
            footer={
                <Typography variant="body2" color="text.secondary">
                    Not you? <Link component="button" onClick={() => { clearSession(); navigate('/login'); }}>Sign out</Link>
                </Typography>
            }
        >
            <ChangePasswordForm currentLabel="Temporary password" onChanged={refresh} />
        </AuthLayout>
    );
};

export default SetPasswordPage;
