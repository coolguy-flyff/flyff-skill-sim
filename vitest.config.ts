import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test-setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@engine': resolve(__dirname, 'src/engine'),
            '@app': resolve(__dirname, 'src/app'),
        },
    },
});
