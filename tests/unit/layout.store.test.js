import { describe, expect, it } from 'vitest'
import {
    applyLayoutWrite,
    buildLayoutGetResponse,
    formatVer,
    keysFor,
    roomOf,
    splitVer,
} from '../../layout.store.js'

const NOW = 1_800_000_000_000
const write = (state, body, opts = {}) =>
    applyLayoutWrite(
        { existingMain: null, existingLib: null, existingLive: null, curVer: '', ...state },
        body,
        { nowMs: NOW, ...opts },
    )

describe('roomOf / keysFor', () => {
    it('keeps safe room ids', () => {
        expect(roomOf('swift-otter-4821')).toBe('swift-otter-4821')
    })

    it('falls back to default for empty, reserved or forbidden ids', () => {
        for (const r of [undefined, '', '   ', '__proto__', 'constructor', '__ver', '_all']) {
            expect(roomOf(r)).toBe('default')
        }
    })

    it('replaces unsafe characters and caps length', () => {
        expect(roomOf('a/b c:d')).toBe('a_b_c_d')
        expect(roomOf('x'.repeat(200))).toHaveLength(64)
    })

    it('namespaces every key by room', () => {
        expect(keysFor('r1')).toEqual({
            key: 'layout:r1', libKey: 'layoutlib:r1', verKey: 'layoutver:r1', liveKey: 'live:r1',
        })
    })
})

describe('versions', () => {
    it('splits compound and legacy versions', () => {
        expect(splitVer('dA.lB')).toEqual({ d: 'dA', l: 'lB' })
        expect(splitVer('dA')).toEqual({ d: 'dA', l: '0' })
        expect(splitVer('')).toEqual({ d: '', l: '' })
    })

    it('formats with generated tags when missing', () => {
        expect(formatVer('dA', 'lB')).toBe('dA.lB')
        expect(formatVer('', '')).toMatch(/^d\w+\.l\w+$/)
    })
})

describe('applyLayoutWrite — design', () => {
    it('merges a patch into the existing layout and bumps only the design version', () => {
        const plan = write(
            { existingMain: { theme: 'a', elements: [] }, curVer: 'dOld.lOld' },
            { theme: 'b' },
        )
        expect(plan.nextMain).toEqual({ theme: 'b', elements: [] })
        expect(plan.writeMain).toBe(true)
        expect(plan.designChanged).toBe(true)
        expect(plan.liveChanged).toBe(false)
        const v = splitVer(plan.nextVer)
        expect(v.d).not.toBe('dOld')
        expect(v.l).toBe('lOld')
    })

    it('ignores client bookkeeping fields and prototype-pollution keys', () => {
        const body = JSON.parse('{"_clientId":"c","_v":"x","__proto__":{"polluted":1},"title":"ok"}')
        const plan = write({}, body)
        expect(plan.nextMain).toEqual({ title: 'ok' })
        expect({}.polluted).toBeUndefined()
    })

    it('applies elementPatch to matching elements only', () => {
        const existingMain = { elements: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }] }
        const plan = write({ existingMain }, {
            elementPatch: [{ id: 'b', changes: { x: 9 } }, { id: 'missing', changes: { x: 5 } }],
        })
        expect(plan.nextMain.elements).toEqual([{ id: 'a', x: 1 }, { id: 'b', x: 9 }])
        expect(plan.writeMain).toBe(true)
    })

    it('does not write when elementPatch matches nothing', () => {
        const plan = write({ existingMain: { elements: [] }, curVer: 'd1.l1' }, {
            elementPatch: { id: 'nope', changes: { x: 1 } },
        })
        expect(plan.writeMain).toBe(false)
        expect(plan.designChanged).toBe(false)
        expect(plan.nextVer).toBe('d1.l1')
    })

    it('stores the layouts library separately', () => {
        const plan = write({}, { layouts: [{ id: 'L1' }] })
        expect(plan.writeLib).toBe(true)
        expect(plan.nextLib).toEqual([{ id: 'L1' }])
        expect(plan.nextMain).not.toHaveProperty('layouts')
    })

    it('never stores a library for the shared default room', () => {
        const plan = write({}, { layouts: [{ id: 'L1' }] }, { isShared: true })
        expect(plan.writeLib).toBe(false)
    })

    it('migrates a legacy embedded library out of the main blob', () => {
        const plan = write({ existingMain: { theme: 'a', layouts: [{ id: 'old' }] } }, {})
        expect(plan.nextMain).toEqual({ theme: 'a' })
        expect(plan.writeMain).toBe(true)
        expect(plan.writeLib).toBe(true)
        expect(plan.nextLib).toEqual([{ id: 'old' }])
    })
})

describe('applyLayoutWrite — live state', () => {
    it('bumps only the live version for live patches', () => {
        const plan = write({ curVer: 'd1.l1' }, { livePatch: { scene: { id: 'brb' } } })
        expect(plan.writeMain).toBe(false)
        expect(plan.writeLive).toBe(true)
        expect(plan.nextLive.scene).toEqual({ id: 'brb', seq: 1, at: NOW })
        const v = splitVer(plan.nextVer)
        expect(v.d).toBe('d1')
        expect(v.l).not.toBe('l1')
    })

    it('increments scene and trigger sequence numbers', () => {
        const existingLive = { scene: { id: 'a', seq: 4 }, triggers: { wheel: { seq: 2 } } }
        const plan = write({ existingLive }, {
            livePatch: { scene: { id: 'b' }, triggers: { wheel: { spin: true } } },
        })
        expect(plan.nextLive.scene.seq).toBe(5)
        expect(plan.nextLive.triggers.wheel).toEqual({ seq: 3, spin: true, at: NOW })
    })

    it('anchors a running timer on the server clock', () => {
        const plan = write({}, { livePatch: { timers: { t: { state: 'running', remainingSec: 60 } } } })
        expect(plan.nextLive.timers.t).toMatchObject({ state: 'running', remainingSec: 60, anchorAt: NOW })
    })

    it('settles elapsed time when pausing a running timer', () => {
        const existingLive = { timers: { t: { state: 'running', remainingSec: 60, anchorAt: NOW - 15_500 } } }
        const plan = write({ existingLive }, { livePatch: { timers: { t: { state: 'paused' } } } })
        expect(plan.nextLive.timers.t.remainingSec).toBe(45)
    })

    it('never lets a paused timer go negative', () => {
        const existingLive = { timers: { t: { state: 'running', remainingSec: 5, anchorAt: NOW - 60_000 } } }
        const plan = write({ existingLive }, { livePatch: { timers: { t: { state: 'paused' } } } })
        expect(plan.nextLive.timers.t.remainingSec).toBe(0)
    })

    it('removes timers, triggers and counters set to null', () => {
        const existingLive = { timers: { t: {} }, triggers: { g: {} }, counters: { c: { n: 1 } } }
        const plan = write({ existingLive }, {
            livePatch: { timers: { t: null }, triggers: { g: null }, counters: { c: null } },
        })
        expect(plan.nextLive).toEqual({ timers: {}, triggers: {}, counters: {} })
    })

    it('clears the live scene with null', () => {
        const plan = write({ existingLive: { scene: { id: 'a' } } }, { livePatch: { scene: null } })
        expect(plan.nextLive).not.toHaveProperty('scene')
    })
})

describe('buildLayoutGetResponse', () => {
    const getters = {
        getMain: async () => ({ theme: 'a' }),
        getLive: async () => ({ scene: { id: 's' } }),
        getLib: async () => [{ id: 'L1' }],
    }

    it('answers 204 when the client already has the current version', async () => {
        const res = await buildLayoutGetResponse({ ...getters, reqVer: 'd1.l1', curVer: 'd1.l1' })
        expect(res).toEqual({ status: 204 })
    })

    it('sends only live state when just the live version changed', async () => {
        const res = await buildLayoutGetResponse({ ...getters, reqVer: 'd1.l1', curVer: 'd1.l2', nowMs: NOW })
        expect(res.body).toEqual({ _v: 'd1.l2', _liveOnly: true, serverNow: NOW, live: { scene: { id: 's' } } })
    })

    it('sends the full layout with library on a design change', async () => {
        const res = await buildLayoutGetResponse({ ...getters, reqVer: 'd1.l1', curVer: 'd2.l1', nowMs: NOW })
        expect(res.body).toEqual({
            theme: 'a', layouts: [{ id: 'L1' }], live: { scene: { id: 's' } }, _v: 'd2.l1', serverNow: NOW,
        })
    })

    it('omits the library in lite mode and for the shared room', async () => {
        for (const opts of [{ lite: true }, { isShared: true }]) {
            const res = await buildLayoutGetResponse({ ...getters, curVer: 'd1.l1', ...opts })
            expect(res.body).not.toHaveProperty('layouts')
        }
    })
})
