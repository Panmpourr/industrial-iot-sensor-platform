/** Backend base URL (set VITE_API_URL in .env or as a Docker build argument). */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';
