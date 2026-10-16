/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // Same port as before (CRA), so CORS settings for local development still match
        port: 3000,
    },
    build: {
        // The lazily loaded dashboard chunk bundles MUI, Chart.js, Recharts and Leaflet (~860 kB);
        // the login page stays small (~220 kB)
        chunkSizeWarningLimit: 1000,
    },
    test: {
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
    },
});
