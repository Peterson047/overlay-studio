import { expect, test, uniqueRoom } from './fixtures.js'

// Collect uncaught page errors so a broken render fails the test even when
// the boundary swallows it.
function trackErrors(page) {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    return errors
}

test('homepage loads with product copy and fork credits', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Baseado no Overlay Studio' }))
        .toHaveAttribute('href', 'https://github.com/abhayraghuwanshi/overlay-studio')
    await expect(page.getByRole('link', { name: /Código-fonte/ })).toBeVisible()
    expect(errors).toEqual([])
})

test('studio opens without crashing', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto(`/?room=${uniqueRoom('studio')}`)
    await expect(page.getByText('Não foi possível abrir o qorpStreamer')).toHaveCount(0)
    // The live dock's room button only exists once the editor has rendered.
    await expect(page.getByTitle(/OBS link/)).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
})

test('OBS player is transparent and has no editor chrome', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto(`/?obs&room=${uniqueRoom('obs')}`)
    await page.waitForLoadState('networkidle')
    const bg = await page.evaluate(() => [
        getComputedStyle(document.documentElement).backgroundColor,
        getComputedStyle(document.body).backgroundColor,
    ])
    expect(bg).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
    await expect(page.getByRole('button')).toHaveCount(0)
    expect(errors).toEqual([])
})

test('a saved design reaches the OBS player', async ({ page, request }) => {
    const room = uniqueRoom('sync')
    const marker = `E2E-SYNC-${Date.now()}`
    await page.goto(`/?obs&room=${room}`)
    await page.waitForLoadState('networkidle')

    const res = await request.post(`/api/layout?room=${room}`, {
        data: {
            elements: [{
                id: 'e2e-text', type: 'text', hidden: false, content: marker,
                box: { x: 10, y: 10, w: 40, h: 10 }, fontSize: 48, opacity: 1,
            }],
        },
    })
    expect(res.ok()).toBe(true)

    // The player polls the layout; the new text must show up without a reload.
    await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 })
})

test('widget lab player keeps the iframe mounted across scene switches', async ({ page }) => {
    const cfg = { url: 'https://example.com/', vw: 800, vh: 600, x: 0, y: 0, w: 400, cycle: 1 }
    const hash = Buffer.from(JSON.stringify(cfg)).toString('base64url')
    await page.goto(`/?widgetlab=play#${hash}`)
    const frame = page.locator('iframe[title="Widget externo"]')
    await expect(frame).toHaveAttribute('src', cfg.url)
    await expect(page.getByText('Cena A')).toBeVisible()
    const handle = await frame.elementHandle()
    await expect(page.getByText('Cena B')).toBeVisible({ timeout: 3_000 })
    expect(await handle.evaluate((el) => el.isConnected)).toBe(true)
})

test('widget lab refuses local addresses', async ({ page }) => {
    const hash = Buffer.from(JSON.stringify({ url: 'https://127.0.0.1/x' })).toString('base64url')
    await page.goto(`/?widgetlab=play#${hash}`)
    await expect(page.getByRole('alert')).toContainText('Endereços locais')
    await expect(page.locator('iframe')).toHaveCount(0)
})
