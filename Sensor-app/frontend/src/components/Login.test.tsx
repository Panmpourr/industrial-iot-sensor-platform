import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';

vi.mock('axios');

const renderLogin = () =>
    render(
        <MemoryRouter>
            <Login />
        </MemoryRouter>
    );

const fillAndSubmit = (id: string, password: string) => {
    fireEvent.change(screen.getByPlaceholderText('Enter your ID'), { target: { value: id } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: password } });
    fireEvent.submit(screen.getByPlaceholderText('Enter your password').closest('form')!);
};

describe('Login', () => {
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
});
