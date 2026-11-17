import { defineConfig, devices } from '@playwright/test'
import { PORTS } from './ports.config.js'

const baseURL = `http://localhost:${PORTS.FRONTEND}`

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
    // The Vite dev server includes a local stand-in for /api/layout backed by
    // .dev-layouts.json, so e2e runs never touch Upstash.
    webServer: {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
})
