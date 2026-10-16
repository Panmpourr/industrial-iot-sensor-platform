import axios from 'axios';

const TOKEN_KEY = 'token';
const USER_ID_KEY = 'userId';

export const getUserId = (): string | null => localStorage.getItem(USER_ID_KEY);
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const saveSession = (userId: string, token: string): void => {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearSession = (): void => {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(TOKEN_KEY);
};

/** Error message sent by the API (`{ error: "..." }`), if any. */
export const apiErrorMessage = (error: unknown): string | undefined =>
    axios.isAxiosError<{ error?: string }>(error) ? error.response?.data?.error : undefined;

// Send the login token with every API request
axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Token missing or expired: go back to the login page
axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401 && window.location.pathname !== '/login') {
            clearSession();
            window.location.assign('/login');
        }
        return Promise.reject(error);
    }
);
