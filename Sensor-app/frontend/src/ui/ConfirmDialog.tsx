import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

/** Confirmation for destructive actions (e.g. deleting a sensor and its history). */
const ConfirmDialog = ({ open, title, message, confirmLabel, busy, onConfirm, onClose }: ConfirmDialogProps) => (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
            <DialogContentText>{message}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
            <Button onClick={onConfirm} disabled={busy} variant="contained" color="error">{confirmLabel}</Button>
        </DialogActions>
    </Dialog>
);

export default ConfirmDialog;
