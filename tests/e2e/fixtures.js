import { test as base, expect } from '@playwright/test'

export const test = base.extend({
    isolatedServices: [async ({ context, baseURL }, use) => {
        const origin = new URL(baseURL).origin
        await context.route('**/*', async route => {
            if (new URL(route.request().url()).origin === origin) return route.continue()
            if (route.request().resourceType() === 'document') {
                return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline widget fixture</title><p>Widget de teste</p>' })
            }
            // Fonts, avatars and feeds must never depend on third-party availability.
            return route.abort()
        })
        await context.routeWebSocket(
            url => !['localhost', '127.0.0.1'].includes(url.hostname),
            socket => socket.close({ code: 1000, reason: 'External services disabled in tests' }),
        )
        await use()
    }, { auto: true }],
})

export { expect }
export const uniqueRoom = name => `e2e-${name}-${crypto.randomUUID()}`

export async function openEditor(page, room) {
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto(`/?room=${room}`)
    await page.getByRole('button', { name: 'Edit layout', exact: true }).click()
    await expect(page.getByTitle('Add Text', { exact: true })).toBeVisible()
}

export async function readLayout(request, room) {
    const response = await request.get(`/api/layout?room=${room}`)
    expect(response.ok()).toBe(true)
    return response.json()
}
