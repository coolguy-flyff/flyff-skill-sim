import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@engine': resolve(__dirname, 'src/engine'),
            '@app': resolve(__dirname, 'src/app'),
        },
    },
    server: {
        port: 5173,
        host: true,
    },
});
