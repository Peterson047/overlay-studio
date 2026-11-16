import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose: the app config wires dev-only
// middlewares (local layout file, scores feed) that tests must not touch.
export default defineConfig({
    plugins: [react()],
    test: {
        include: ['tests/unit/**/*.test.{js,jsx}', 'tests/api/**/*.test.js'],
        environment: 'node',
        setupFiles: ['tests/setup.js'],
        restoreMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/**', 'api/**', 'layout.store.js'],
        },
    },
})
