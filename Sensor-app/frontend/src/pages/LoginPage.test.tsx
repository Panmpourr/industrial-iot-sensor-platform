import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LoginPage from './LoginPage';

vi.mock('axios');

const renderLogin = () =>
    render(
        <MemoryRouter>
            <LoginPage />
        </MemoryRouter>
    );

const fillAndSubmit = (id: string, password: string) => {
    fireEvent.change(screen.getByLabelText(/User ID/), { target: { value: id } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginPage', () => {
    afterEach(() => {
        cleanup();
        localStorage.clear();
        vi.resetAllMocks();
    });

    it('stores the user id and token after a successful login', async () => {
        vi.mocked(axios.post).mockResolvedValue({ data: { success: true, token: 'jwt-token' } });
        renderLogin();

        fillAndSubmit('alice', 'secret');

        await vi.waitFor(() => expect(localStorage.getItem('token')).toBe('jwt-token'));
        expect(localStorage.getItem('userId')).toBe('alice');
    });

    it('shows an error for wrong credentials', async () => {
        vi.mocked(axios.post).mockResolvedValue({ data: { success: false } });
        renderLogin();

        fillAndSubmit('alice', 'wrong');

        expect(await screen.findByText('Invalid ID or password')).toBeInTheDocument();
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('keeps the sign-in button disabled until both fields are filled', () => {
        renderLogin();

        expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    });
});
