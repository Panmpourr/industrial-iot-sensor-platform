/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // Same port as before (CRA), so CORS settings for local development still match
        port: 3000,
    },
    test: {
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
    },
});
