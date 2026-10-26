import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { CheckCircleOutline, LinkOffOutlined, SendOutlined, Telegram as TelegramIcon } from '@mui/icons-material';
import * as api from '../api';
import { apiErrorMessage } from '../auth';
import { statusColors } from '../theme';
import type { TelegramStatus } from '../types';

/** How long to wait for the user to press Start in Telegram (the link is valid 10 minutes). */
const WAIT_MS = 10 * 60_000;

/** Connects the signed-in user's Telegram chat, so alarm notifications reach their phone. */
const TelegramConnect = () => {
    const [status, setStatus] = useState<TelegramStatus | null>(null);
    const [link, setLink] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const next = await api.getTelegram();
            setStatus(next);
            return next;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // After the link was opened: check every few seconds whether Start was pressed
    useEffect(() => {
        if (!link) return;
        const started = Date.now();
        const timer = setInterval(async () => {
            const next = await load();
            if (next?.connected || Date.now() - started > WAIT_MS) {
                clearInterval(timer);
                setLink(null);
                if (next?.connected) setMessage({ severity: 'success', text: 'Connected. Alarms for you will now arrive in Telegram.' });
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [link, load]);

    const connect = async () => {
        // Opened right away, so the browser does not block it as a pop-up
        const tab = window.open('', '_blank');
        setBusy(true);
        setMessage(null);
        try {
            const url = await api.createTelegramLink();
            setLink(url);
            if (tab) tab.location.href = url;
        } catch (e) {
            tab?.close();
            setMessage({ severity: 'error', text: apiErrorMessage(e) ?? 'Could not create the link. Try again.' });
        } finally {
            setBusy(false);
        }
    };

    const run = async (action: () => Promise<void>, success: string) => {
        setBusy(true);
        setMessage(null);
        try {
            await action();
            setMessage({ severity: 'success', text: success });
            await load();
        } catch (e) {
            setMessage({ severity: 'error', text: apiErrorMessage(e) ?? 'Something went wrong. Try again.' });
        } finally {
            setBusy(false);
        }
    };

    if (!status) return <CircularProgress size={20} />;

    if (!status.enabled) {
        return (
            <Typography variant="body2" color="text.secondary">
                Telegram notifications are not set up on this server yet. An administrator adds a bot token
                (TELEGRAM_BOT_TOKEN in .env, see the README).
            </Typography>
        );
    }

    return (
        <Stack spacing={1.5} alignItems="flex-start">
            {status.connected ? (
                <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircleOutline sx={{ color: statusColors.normal }} fontSize="small" />
                    <Typography variant="body2">Connected{status.botUsername && <> to <b>@{status.botUsername}</b></>}. Alarms for you arrive there.</Typography>
                </Stack>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    Get the alarms that the notification rules send you on your phone, and acknowledge them from there.
                </Typography>
            )}

            {link && (
                <Alert severity="info" sx={{ width: '100%' }}>
                    In Telegram, press <b>Start</b>. Nothing opened? Open this link on the device with Telegram:{' '}
                    <Link href={link} target="_blank" rel="noreferrer" sx={{ wordBreak: 'break-all' }}>{link}</Link>
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>Waiting for Telegram…</Box>
                </Alert>
            )}
            {message && <Alert severity={message.severity} sx={{ width: '100%' }}>{message.text}</Alert>}

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {status.connected ? (
                    <>
                        <Button variant="outlined" startIcon={<SendOutlined />} disabled={busy}
                            onClick={() => run(api.sendTelegramTest, 'Test message sent. Check Telegram.')}>Send test message</Button>
                        <Button variant="outlined" color="inherit" startIcon={<LinkOffOutlined />} disabled={busy}
                            onClick={() => run(api.disconnectTelegram, 'Disconnected. You will no longer receive alarms in Telegram.')}>Disconnect</Button>
                    </>
                ) : (
                    <Button variant="contained" startIcon={<TelegramIcon />} disabled={busy || !status.botUsername} onClick={connect}>
                        {link ? 'Open the link again' : 'Connect Telegram'}
                    </Button>
                )}
            </Stack>
            {!status.botUsername && !status.connected && (
                <Typography variant="caption" color="text.secondary">The bot is starting. Try again in a minute.</Typography>
            )}
        </Stack>
    );
};

export default TelegramConnect;
