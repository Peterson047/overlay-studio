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

test('free preview works without an account and never touches the server', async ({ page }) => {
    const errors = trackErrors(page)
    const serverCalls = []
    page.on('request', (r) => { if (/\/api\/(layout|project)/.test(r.url())) serverCalls.push(r.url()) })
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto('/?studio')
    await expect(page.getByText('Preview grátis', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTitle(/Entre para salvar/)).toBeVisible()
    await page.waitForTimeout(1_000)
    expect(serverCalls).toEqual([])
    expect(errors).toEqual([])
})

test('saving the preview without an account asks to sign in and keeps the design', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto('/?studio')
    await page.getByRole('button', { name: 'Entrar e salvar' }).click()
    await expect(page).toHaveURL(/\?conta&importar/)
    await expect(page.getByRole('heading', { name: 'Entre para salvar seu overlay' })).toBeVisible()
    expect(await page.evaluate(() => !!localStorage.getItem('qorp_pending_import'))).toBe(true)
})

test('home offers the free preview, sign-in and the tutorial', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Experimentar grátis/ }).first()).toHaveAttribute('href', '/?studio')
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toHaveAttribute('href', '/?conta')
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Tutorial' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Do preview à sua live no OBS')
})

test.describe('english browsers', () => {
    test.use({ locale: 'en-US' })

    test('home switches to English automatically and remembers a manual choice', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('lang', 'en')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your stream overlay, ready in minutes.')
        await page.getByRole('button', { name: 'PT' }).click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seu overlay de live, pronto em minutos.')
        await page.reload()
        await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    })

    test('tutorial and account follow the language', async ({ page }) => {
        await page.goto('/?tutorial')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('From preview to your stream in OBS')
        await page.goto('/?conta')
        await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    })
})

test('studio properties panel follows the language', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto(`/?room=${uniqueRoom('i18n')}`)
    await page.getByRole('button', { name: 'Editar layout', exact: true }).click()
    await page.getByTitle('Adicionar Texto', { exact: true }).click()
    const area = await page.locator('[data-canvas-stage]').boundingBox()
    await page.mouse.click(area.x + area.width * 0.2, area.y + area.height * 0.25)
    await expect(page.getByPlaceholder('Digite o texto…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Posição e tamanho' })).toBeVisible()
})

test('preview mode keeps banner visible below editor header, shows Pro badges, and hides Xaxinim', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('help_seen', '1'))
    await page.goto('/?studio')
    const previewBanner = page.getByRole('status').filter({ hasText: 'Preview grátis' })
    await expect(previewBanner).toBeVisible()

    await page.getByRole('button', { name: 'Editar layout', exact: true }).click()
    await expect(previewBanner).toBeVisible()
    const bannerBox = await previewBanner.boundingBox()
    expect(bannerBox.y).toBeGreaterThanOrEqual(56)

    await page.getByRole('button', { name: 'Tema', exact: true }).click()
    await expect(page.getByTitle('Xaxinim · Vice Beach')).toHaveCount(0)
    await page.getByTitle('Sunset', { exact: true }).click()
    await expect(previewBanner).toContainText('PRO')
})

test('authenticated account page renders Free/Pro billing, Checkout options, and Customer Portal', async ({ page }) => {
    const fakeSession = {
        access_token: 'e2e-fake-access-token',
        refresh_token: 'e2e-fake-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: 'user-e2e-1', email: 'streamer@example.com' },
    }
    await page.addInitScript((session) => {
        const origGet = Storage.prototype.getItem
        Storage.prototype.getItem = function (key) {
            if (/^sb-.*-auth-token$/.test(key)) return JSON.stringify(session)
            return origGet.call(this, key)
        }
    }, fakeSession)

    const checkoutCalls = []
    let portalCalled = false

    await page.route('**/api/projects*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                projects: [
                    { id: 'proj-1', name: 'Overlay Principal', updatedAt: new Date().toISOString(), published: true, readOnly: false },
                ],
                entitlements: {
                    plan: 'free',
                    isPro: false,
                    isOwner: false,
                    status: 'free',
                    activeProjectCount: 1,
                    stripeConfigured: true,
                    limits: { maxProjects: 2, maxScenes: 6, maxRevisions: 5, maxObsLinks: 1 },
                },
            }),
        })
    })

    await page.route('**/api/billing*', async (route) => {
        const req = route.request()
        if (req.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    plan: 'free',
                    isPro: false,
                    isOwner: false,
                    status: 'free',
                    hasCustomer: true,
                    activeProjectCount: 1,
                    stripeConfigured: true,
                    limits: { maxProjects: 2, maxScenes: 6, maxRevisions: 5, maxObsLinks: 1 },
                }),
            })
            return
        }
        const postBody = JSON.parse(req.postData() || '{}')
        if (postBody.action === 'checkout') {
            checkoutCalls.push(postBody.plan)
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: '/?conta&checkout=success', sessionId: `cs_${postBody.plan}` }),
            })
            return
        }
        if (postBody.action === 'portal') {
            portalCalled = true
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: '/?conta&portal=1' }),
            })
        }
    })

    await page.goto('/?conta')
    await expect(page.getByText('Plano Gratuito')).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinar Pro mensal/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinar Pro anual/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Pro 12 meses no Pix/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Gerenciar assinatura/i })).toBeVisible()

    await page.getByRole('button', { name: /Assinar Pro mensal/i }).click()
    await expect.poll(() => checkoutCalls).toEqual(['monthly'])

    await page.getByRole('button', { name: /Gerenciar assinatura/i }).click()
    await expect.poll(() => portalCalled).toBe(true)
})

test('account page supports project rename, duplicate, live scene panel, version rollback, and 30-day trash restore', async ({ page }) => {
    const fakeSession = {
        access_token: 'e2e-fake-access-token',
        refresh_token: 'e2e-fake-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: 'user-e2e-1', email: 'streamer@example.com' },
    }
    await page.addInitScript((session) => {
        const origGet = Storage.prototype.getItem
        Storage.prototype.getItem = function (key) {
            if (/^sb-.*-auth-token$/.test(key)) return JSON.stringify(session)
            return origGet.call(this, key)
        }
    }, fakeSession)
    page.on('dialog', d => d.accept())

    let projectsState = [
        {
            id: 'proj-live-1',
            name: 'Live de Quinta',
            revision: 3,
            published: true,
            publishedRevision: 3,
            hasPlaybackToken: true,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            readOnly: false,
        },
    ]
    let activeSceneId = 'sc-1'
    const actionsLog = []

    await page.route('**/api/billing*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                plan: 'pro',
                isPro: true,
                isOwner: false,
                status: 'active',
                hasCustomer: true,
                activeProjectCount: projectsState.filter(p => !p.deletedAt).length,
                stripeConfigured: true,
                limits: { maxProjects: 15, maxScenes: 999, maxRevisions: 50, maxObsLinks: 3 },
            }),
        })
    })

    await page.route('**/api/projects*', async (route) => {
        const req = route.request()
        const url = new URL(req.url())
        if (req.method() === 'GET') {
            if (url.searchParams.get('id')) {
                const proj = projectsState[0]
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...proj,
                        activeSceneId,
                        scenes: [
                            { id: 'sc-1', name: 'Começando', layoutName: 'Principal' },
                            { id: 'sc-2', name: 'Gameplay', layoutName: 'Principal' },
                            { id: 'sc-3', name: 'Intervalo', layoutName: 'Principal' },
                        ],
                        revisions: [
                            { revision: 3, created_at: new Date().toISOString() },
                            { revision: 2, created_at: new Date(Date.now() - 3600_000).toISOString() },
                        ],
                    }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    projects: projectsState,
                    entitlements: {
                        plan: 'pro',
                        isPro: true,
                        isOwner: false,
                        status: 'active',
                        activeProjectCount: projectsState.filter(p => !p.deletedAt).length,
                        stripeConfigured: true,
                        limits: { maxProjects: 15, maxScenes: 999, maxRevisions: 50, maxObsLinks: 3 },
                    },
                }),
            })
            return
        }

        const body = JSON.parse(req.postData() || '{}')
        actionsLog.push(body.action)
        if (body.action === 'rename') {
            projectsState = projectsState.map(p => p.id === body.id ? { ...p, name: body.name } : p)
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectsState[0]) })
            return
        }
        if (body.action === 'scene') {
            activeSceneId = body.sceneId
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...projectsState[0], activeSceneId }) })
            return
        }
        if (body.action === 'rollback') {
            projectsState = projectsState.map(p => p.id === body.id ? { ...p, publishedRevision: body.restoreRevision } : p)
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectsState[0]) })
            return
        }
        if (body.action === 'trash') {
            projectsState = projectsState.map(p => p.id === body.id ? { ...p, deletedAt: new Date().toISOString() } : p)
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectsState[0]) })
            return
        }
        if (body.action === 'restore') {
            projectsState = projectsState.map(p => p.id === body.id ? { ...p, deletedAt: null } : p)
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectsState[0]) })
        }
    })

    await page.goto('/?conta')
    await expect(page.getByText('Live de Quinta')).toBeVisible()

    // Rename inline
    await page.getByRole('button', { name: 'Renomear' }).click()
    await page.getByRole('textbox', { name: 'Renomear' }).fill('Live Oficial')
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.getByText('Live Oficial')).toBeVisible()

    // Live Panel scene switching
    await page.getByRole('button', { name: 'Painel ao vivo' }).click()
    await expect(page.getByRole('region', { name: /Painel ao vivo/i })).toBeVisible()
    await page.getByRole('button', { name: /Gameplay/ }).click()
    await expect(page.getByText(/Cena no OBS alterada para “Gameplay”/)).toBeVisible()

    // Version history rollback
    await page.getByRole('button', { name: 'Histórico de versões' }).click()
    await expect(page.getByRole('region', { name: 'Versões publicadas' })).toBeVisible()
    await page.getByRole('button', { name: 'Restaurar no OBS' }).click()
    await expect(page.getByText(/Saída do OBS restaurada para a versão 2/)).toBeVisible()

    // Move to 30-day trash and restore
    await page.getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(page.getByRole('heading', { name: 'Lixeira (30 dias)' })).toBeVisible()
    await page.getByRole('button', { name: 'Restaurar projeto' }).click()
    await expect(page.getByRole('heading', { name: 'Lixeira (30 dias)' })).toHaveCount(0)
    expect(actionsLog).toEqual(['rename', 'scene', 'rollback', 'trash', 'restore'])
})

test('design system catalog renders', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/?ui')
    await expect(page.getByRole('heading', { name: 'Design system do estúdio' })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Opacidade' })).toBeVisible()
    expect(errors).toEqual([])
})
