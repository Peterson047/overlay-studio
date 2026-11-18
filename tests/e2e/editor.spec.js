import { expect, test, openEditor, readLayout, uniqueRoom } from './fixtures.js'

// These tests check editor behaviour, so they pin the English UI labels.
test.use({ locale: 'en-US' })

async function placeText(page, content) {
    await page.getByTitle('Add Text', { exact: true }).click()
    const canvas = page.locator('[data-canvas-stage]')
    const area = await canvas.boundingBox()
    await page.mouse.click(area.x + area.width * 0.2, area.y + area.height * 0.25)
    await page.getByPlaceholder('Enter text...').fill(content)
    return page.locator('[data-box-id]').filter({ hasText: content })
}

test('text can be placed, moved, resized and recovered after reloading', async ({ page, request }) => {
    const room = uniqueRoom('geometry')
    await openEditor(page, room)
    const box = await placeText(page, 'Título persistente')
    await expect(box).toBeVisible()
    await expect.poll(async () => (await readLayout(request, room)).elements?.[0]?.content).toBe('Título persistente')
    const initial = (await readLayout(request, room)).elements[0]
    const rect = await box.boundingBox()
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.mouse.down()
    await page.mouse.move(rect.x + rect.width / 2 + 85, rect.y + rect.height / 2 + 45, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await readLayout(request, room)).elements[0].box.x).toBeGreaterThan(initial.box.x + 2)
    await expect.poll(async () => (await readLayout(request, room)).elements[0].box.y).toBeGreaterThan(initial.box.y + 2)

    const resize = box.locator('[style*="cursor: se-resize"]')
    const grip = await resize.boundingBox()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 + 90, grip.y + grip.height / 2 + 45, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await readLayout(request, room)).elements[0].box.w).toBeGreaterThan(initial.box.w + 2)
    await expect.poll(async () => (await readLayout(request, room)).elements[0].box.h).toBeGreaterThan(initial.box.h + 2)
    const saved = (await readLayout(request, room)).elements[0]
    await page.reload()
    const restored = page.locator(`[data-box-id="${saved.id}"]`)
    await expect(restored).toContainText('Título persistente')
    const style = await restored.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) }))
    for (const dimension of ['x', 'y', 'w', 'h']) expect(style[dimension]).toBeCloseTo(saved.box[dimension], 2)
})

test('duplicate, layer ordering, visibility and deletion persist independently', async ({ page, request }) => {
    const room = uniqueRoom('layers')
    await openEditor(page, room)
    await placeText(page, 'Original')
    await page.getByTitle('Duplicate', { exact: true }).click()
    await page.getByPlaceholder('Enter text...').fill('Cópia')
    await expect.poll(async () => (await readLayout(request, room)).elements?.map(el => el.content)).toEqual(['Cópia', 'Original'])
    const elements = (await readLayout(request, room)).elements
    expect(elements[0].id).not.toBe(elements[1].id)
    const copyId = elements.find(el => el.content === 'Cópia').id
    const copy = page.locator(`[data-box-id="${copyId}"]`)
    await copy.getByTitle('Send backward', { exact: true }).click()
    await expect.poll(async () => (await readLayout(request, room)).elements?.map(el => el.content)).toEqual(['Original', 'Cópia'])
    await copy.getByTitle('Bring forward', { exact: true }).click()
    await expect.poll(async () => (await readLayout(request, room)).elements?.map(el => el.content)).toEqual(['Cópia', 'Original'])
    await page.getByTitle('Hide from stream', { exact: true }).click()
    await expect(copy).toHaveCount(0)
    await expect.poll(async () => (await readLayout(request, room)).elements?.find(el => el.id === copyId)?.hidden).toBe(true)
    await page.getByTitle('Show on stream', { exact: true }).click()
    await expect(copy).toBeVisible()
    await page.getByTitle('Delete', { exact: true }).click()
    await expect(copy).toBeVisible() // deletion requires confirmation
    await page.getByTitle('Click again to delete', { exact: true }).click()
    await expect.poll(async () => (await readLayout(request, room)).elements?.map(el => el.content)).toEqual(['Original'])
    await page.reload()
    await expect(page.locator('[data-box-id]').filter({ hasText: 'Original' })).toBeVisible()
    await expect(page.locator('[data-box-id]').filter({ hasText: 'Cópia' })).toHaveCount(0)
})

test('starter kit installs as an editable kit, every scene can be selected, and owner-only Xaxinim is blocked', async ({ page, request }) => {
    const blockedRoom = uniqueRoom('kit-blocked')
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto(`/?studio&room=${blockedRoom}&kit=kit-xaxinim`)
    await page.getByRole('button', { name: 'Edit layout', exact: true }).click()
    const blockedLayout = await readLayout(request, blockedRoom)
    expect(blockedLayout.layouts ?? []).toHaveLength(0)

    const room = uniqueRoom('kit')
    await page.goto(`/?studio&room=${room}&kit=midnight-pro`)
    await expect.poll(async () => (await readLayout(request, room)).layouts?.[0]?.name).toBe('Midnight Pro')
    await page.getByRole('button', { name: 'Edit layout', exact: true }).click()
    const installed = (await readLayout(request, room)).layouts[0]
    expect(installed.scenes.length).toBe(4)
    let active = installed.scenes[0]
    for (const scene of installed.scenes.slice(1)) {
        await page.getByRole('button', { name: active.name, exact: true }).click()
        await page.getByTitle('Switch to this scene', { exact: true }).filter({ has: page.getByText(scene.name, { exact: true }) }).click()
        await expect.poll(async () => (await readLayout(request, room)).live?.scene?.activeSceneId).toBe(scene.id)
        for (const el of scene.snapshot.elements.filter(el => !el.hidden)) {
            await expect(page.locator(`[data-box-id="${el.id}"]`)).toBeAttached()
        }
        active = scene
    }
    await page.reload()
    await expect.poll(async () => (await readLayout(request, room)).layouts?.[0]?.activeSceneId).toBe(active.id)
    await expect(page.locator(`[data-box-id="${active.snapshot.elements[0].id}"]`)).toBeAttached()
})

test('applying a theme preserves content and persists after reload', async ({ page, request }) => {
    const room = uniqueRoom('theme')
    await openEditor(page, room)
    await placeText(page, 'Identidade preservada')
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByTitle('Neon', { exact: true }).click()
    await expect.poll(async () => (await readLayout(request, room)).theme?.id).toBe('neon')
    await page.reload()
    await expect(page.locator('[data-box-id]').filter({ hasText: 'Identidade preservada' })).toBeVisible()
    const saved = await readLayout(request, room)
    expect(saved.theme?.id ?? saved.theme).toBe('neon')
    expect(saved.elements[0].content).toBe('Identidade preservada')
})
