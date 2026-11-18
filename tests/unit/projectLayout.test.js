import { describe, expect, it } from 'vitest'
import { liveView, mergeDraft, playbackPayload, sanitizeExport } from '../../server/project-layout.js'
import { revisionFromVersion } from '../../src/sync/transport.js'

const published = {
    elements: [{ id: 'a', type: 'text', content: 'Gameplay' }],
    theme: 'neon',
    layouts: [{ id: 'L', scenes: [{ id: 'brb', snapshot: { elements: [{ id: 'b', type: 'text', content: 'Volto já' }] } }] }],
    live: { timers: { t: { state: 'paused' } } },
}

describe('liveView', () => {
    it('shows the published revision when no live scene is set', () => {
        expect(liveView(published, {}).elements[0].content).toBe('Gameplay')
    })

    it('applies the live scene on top without changing the published revision', () => {
        const before = structuredClone(published)
        const view = liveView(published, { scene: { activeSceneId: 'brb', seq: 2 } })
        expect(view.elements[0].content).toBe('Volto já')
        expect(view.live).toEqual({ timers: { t: { state: 'paused' } }, scene: { activeSceneId: 'brb', seq: 2 } })
        expect(published).toEqual(before)
    })

    it('ignores a live scene that no longer exists in the revision', () => {
        expect(liveView(published, { scene: { activeSceneId: 'gone' } }).elements[0].content).toBe('Gameplay')
    })
})

describe('playbackPayload', () => {
    it('never sends the private scene library to OBS', () => {
        const out = playbackPayload(liveView(published, {}))
        expect(out).not.toHaveProperty('layouts')
        expect(out.elements).toHaveLength(1)
    })
})

describe('mergeDraft', () => {
    it('merges a patch, keeps the library and drops the base version', () => {
        const draft = mergeDraft(published, { theme: 'calm', _baseVersion: 'd3.0' })
        expect(draft.theme).toBe('calm')
        expect(draft.layouts).toEqual(published.layouts)
        expect(draft).not.toHaveProperty('_baseVersion')
    })

    it('rejects external widgets with local addresses', () => {
        expect(() => mergeDraft({}, { elements: [{ id: 'w', type: 'external', widgetUrl: 'https://127.0.0.1/x' }] }))
            .toThrow(/locais/)
    })
})

describe('sanitizeExport', () => {
    it('removes private widget URLs and live state from exports', () => {
        const out = sanitizeExport({ elements: [{ id: 'w', type: 'external', widgetUrl: 'https://streamlabs.com/secret' }], live: { x: 1 } })
        expect(out.elements[0].widgetUrl).toBe('')
        expect(out).not.toHaveProperty('live')
    })
})

describe('revisionFromVersion', () => {
    it('reads the draft revision from the version string', () => {
        expect(revisionFromVersion('d12.0')).toBe(12)
        expect(revisionFromVersion(null)).toBeNull()
        expect(revisionFromVersion('p3.0')).toBeNull()
    })
})
