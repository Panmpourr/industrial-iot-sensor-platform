import axios from 'axios';

const TOKEN_KEY = 'token';
const USER_ID_KEY = 'userId';

export const saveSession = (userId, token) => {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearSession = () => {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(TOKEN_KEY);
};

// Send the login token with every API request
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Token missing or expired: go back to the login page
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && window.location.pathname !== '/login') {
            clearSession();
            window.location.assign('/login');
        }
        return Promise.reject(error);
    }
);
