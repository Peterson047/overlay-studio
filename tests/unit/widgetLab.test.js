import { describe, expect, it } from 'vitest'
import { DEFAULTS, decodeConfig, encodeConfig, validateWidgetUrl } from '../../src/utils/widgetLab.js'

describe('widget lab config', () => {
    it('round-trips through the URL hash, including non-ASCII text', () => {
        const cfg = { ...DEFAULTS, url: 'https://example.com/w?token=ação+/=', w: 400 }
        const hash = `#${encodeConfig(cfg)}`
        expect(hash).not.toMatch(/[+/=]/)
        expect(decodeConfig(hash)).toEqual(cfg)
    })

    it('fills missing fields with defaults and rejects garbage', () => {
        expect(decodeConfig(`#${encodeConfig({ url: 'https://a.com' })}`)).toEqual({ ...DEFAULTS, url: 'https://a.com' })
        expect(decodeConfig('#not-base64!!')).toBeNull()
        expect(decodeConfig('')).toBeNull()
    })
})

describe('validateWidgetUrl', () => {
    it('accepts public https URLs', () => {
        expect(validateWidgetUrl('https://streamlabs.com/alert-box/v3/abc')).toBeNull()
    })

    it.each([
        ['http://streamlabs.com/x', 'https'],
        ['javascript:alert(1)', 'https'],
        ['not a url', 'inválida'],
        ['https://localhost/x', 'locais'],
        ['https://app.localhost/x', 'locais'],
        ['https://printer.local/x', 'locais'],
        ['https://127.0.0.1/x', 'locais'],
        ['https://10.0.0.5/x', 'locais'],
        ['https://192.168.1.10/x', 'locais'],
        ['https://172.20.0.1/x', 'locais'],
        ['https://169.254.169.254/x', 'locais'],
        ['https://[::1]/x', 'locais'],
    ])('rejects %s', (url, reason) => {
        expect(validateWidgetUrl(url)).toMatch(reason)
    })

    it('does not treat public 172.x addresses as local', () => {
        expect(validateWidgetUrl('https://172.32.0.1/x')).toBeNull()
    })
})
