import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeRedis } from './fakeRedis.js'

let fake
vi.mock('@upstash/redis', () => ({
    Redis: class {
        constructor() { return fake }
    },
}))

const { default: handler } = await import('../../api/layout.js')

function call({ method = 'GET', query = {}, body } = {}) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            setHeader(k, v) { this.headers[k] = v },
            status(code) { this.statusCode = code; return this },
            json(data) { resolve({ status: this.statusCode, body: data, headers: this.headers }) },
            end() { resolve({ status: this.statusCode, body: undefined, headers: this.headers }) },
        }
        handler({ method, query, body }, res)
    })
}

beforeEach(() => {
    fake = createFakeRedis()
    vi.stubEnv('KV_REST_API_URL', 'https://fake.upstash.io')
    vi.stubEnv('KV_REST_API_TOKEN', `t-${Math.random()}`) // new client per test
})

describe('api/layout', () => {
    it('answers OPTIONS with CORS headers and no cache', async () => {
        const res = await call({ method: 'OPTIONS' })
        expect(res.status).toBe(204)
        expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
        expect(res.headers['Cache-Control']).toBe('no-store')
    })

    it('returns an empty layout with a version for a new room', async () => {
        const res = await call({ query: { room: 'r1' } })
        expect(res.status).toBe(200)
        expect(res.body._v).toMatch(/^d\w+\.l\w+$/)
        expect(res.body.live).toEqual({})
    })

    it('saves a design and reads it back', async () => {
        const saved = await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'neon', elements: [{ id: 'a' }] } })
        expect(saved.status).toBe(200)
        expect(saved.body.ok).toBe(true)

        const res = await call({ query: { room: 'r1' } })
        expect(res.body).toMatchObject({ theme: 'neon', elements: [{ id: 'a' }], _v: saved.body._v })
    })

    it('keeps rooms isolated from each other', async () => {
        await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'mine' } })
        const other = await call({ query: { room: 'r2' } })
        expect(other.body).not.toHaveProperty('theme')
    })

    it('answers 204 when polling with the current version', async () => {
        const saved = await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'x' } })
        const res = await call({ query: { room: 'r1', v: saved.body._v } })
        expect(res.status).toBe(204)
    })

    it('returns only live state after a live-only change', async () => {
        const saved = await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'x' } })
        await call({ method: 'POST', query: { room: 'r1' }, body: { livePatch: { scene: { id: 'brb' } } } })
        const res = await call({ query: { room: 'r1', v: saved.body._v } })
        expect(res.body._liveOnly).toBe(true)
        expect(res.body.live.scene.id).toBe('brb')
        expect(res.body).not.toHaveProperty('theme')
    })

    it('does not expose the layouts library on the shared default room', async () => {
        await call({ method: 'POST', query: {}, body: { layouts: [{ id: 'secret' }] } })
        const res = await call({ query: {} })
        expect(res.body).not.toHaveProperty('layouts')
    })

    it('rejects invalid bodies', async () => {
        expect((await call({ method: 'POST', query: { room: 'r1' }, body: '{bad' })).status).toBe(400)
        expect((await call({ method: 'POST', query: { room: 'r1' }, body: [1, 2] })).status).toBe(400)
    })

    it('rejects payloads over 2 MB', async () => {
        const big = { blob: 'x'.repeat(2_000_001) }
        expect((await call({ method: 'POST', query: { room: 'r1' }, body: big })).status).toBe(413)
        expect((await call({ method: 'POST', query: { room: 'r1' }, body: JSON.stringify(big) })).status).toBe(413)
    })

    it('rejects unsupported methods', async () => {
        expect((await call({ method: 'DELETE', query: { room: 'r1' } })).status).toBe(405)
    })

    it('retries when a concurrent write wins the race', async () => {
        fake.failNextCas = 2
        const res = await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'x' } })
        expect(res.status).toBe(200)
    })

    it('gives up with 409 after repeated conflicts', async () => {
        fake.failNextCas = 99
        const res = await call({ method: 'POST', query: { room: 'r1' }, body: { theme: 'x' } })
        expect(res.status).toBe(409)
    })

    it('fails with 500 and a generic message when the KV is not configured', async () => {
        vi.stubEnv('KV_REST_API_URL', '')
        vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const res = await call({ query: { room: 'r1' } })
        expect(res.status).toBe(500)
        expect(res.body.error).toBe('Internal server error')
    })
})
