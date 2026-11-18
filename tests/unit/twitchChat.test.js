import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelFeed, normalizeChannel, parseIrcLine, toAlert } from '../../src/live/twitchChat.js'

// Sanitized protocol fixtures. No connection to Twitch is made by these tests.
const message = (id, login, text, tags = '') =>
    `@id=${id};display-name=${login};tmi-sent-ts=1700000000000${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #canal :${text}`
const notice = (event, extra = '', text = '') =>
    `@id=event-${event};msg-id=${event};login=ana;display-name=Ana;tmi-sent-ts=1700000000000;${extra} :tmi.twitch.tv USERNOTICE #canal :${text}`

describe('Twitch IRC protocol', () => {
    it.each(['Canal', '@Canal', '#Canal', 'https://www.twitch.tv/Canal/videos?filter=all'])('normalizes %s', input => {
        expect(normalizeChannel(input)).toBe('canal')
    })

    it.each(['', 'ab', 'nome com espaço', 'https://example.com/channel'])('rejects invalid channel %s', input => {
        expect(normalizeChannel(input)).toBe('')
    })

    it('preserves tags, Unicode emote positions and escaped display names', () => {
        const parsed = parseIrcLine('@id=m1;display-name=Ana\\sMaria;color=#ff7956;badges=moderator/1,subscriber/12;emotes=25:2-6;tmi-sent-ts=1700000000000 :ana!ana@ana.tmi.twitch.tv PRIVMSG #canal :😀 Kappa olá')
        expect(parsed).toMatchObject({
            kind: 'message', id: 'm1', login: 'ana', user: 'Ana Maria',
            color: '#ff7956', badges: ['moderator', 'subscriber'],
            emotes: [{ id: '25', start: 2, end: 6 }], text: '😀 Kappa olá', ts: 1700000000000,
        })
    })

    it('handles /me actions without displaying control characters', () => {
        expect(parseIrcLine(message('m1', 'ana', '\u0001ACTION chegou\u0001')))
            .toMatchObject({ text: 'chegou', action: true })
    })

    it('keeps ordinary numbers when converting a cheer into an alert', () => {
        const alert = toAlert(parseIrcLine(message('m1', 'ana', 'Cheer100 jogando cs2 no ps5', ';bits=100')))
        expect(alert).toMatchObject({ type: 'cheer', amount: 100, message: 'jogando cs2 no ps5', emotes: [] })
        expect(toAlert(parseIrcLine(message('m2', 'ana', 'oi')))).toBeNull()
    })

    it.each([
        ['sub', 'msg-param-sub-plan=Prime', { type: 'sub', amount: 1, detail: 'Prime sub' }],
        ['resub', 'msg-param-cumulative-months=12', { type: 'resub', amount: 12 }],
        ['subgift', 'msg-param-recipient-display-name=Bia', { type: 'gift', detail: 'gifted Bia' }],
        ['submysterygift', 'msg-param-mass-gift-count=5', { type: 'giftbomb', amount: 5 }],
        ['raid', 'msg-param-viewerCount=42', { type: 'raid', amount: 42 }],
    ])('converts %s notices into alerts', (event, tags, expected) => {
        expect(toAlert(parseIrcLine(notice(event, tags)))).toMatchObject({ ...expected, user: 'Ana' })
    })

    it('ignores server messages and unsupported events', () => {
        expect(parseIrcLine(':server 001 nickname :Welcome')).toBeNull()
        expect(parseIrcLine(notice('unknown-event'))).toBeNull()
        expect(toAlert(null)).toBeNull()
    })
})

describe('channel feed without a network connection', () => {
    let feed
    beforeEach(() => {
        vi.useFakeTimers()
        feed = new ChannelFeed('canal')
        feed.ws = { send: vi.fn(), close: vi.fn() }
    })
    afterEach(() => {
        feed.close()
        vi.useRealTimers()
    })

    it('handles multi-line frames, ping and connection status', () => {
        feed.ingest(`:server ROOMSTATE #canal\r\nPING :tmi.twitch.tv\r\n${message('m1', 'ana', 'olá')}\r\n`)
        expect(feed.status).toBe('connected')
        expect(feed.ws.send).toHaveBeenCalledWith('PONG :tmi.twitch.tv')
        expect(feed.items).toHaveLength(1)
    })

    it('removes deleted messages, timed-out users and then clears the channel', () => {
        feed.ingest([message('a1', 'ana', 'um'), message('a2', 'ana', 'dois'), message('b1', 'bia', 'três')].join('\r\n'))
        feed.ingest('@target-msg-id=a1 :server CLEARMSG #canal :um')
        expect(feed.items.map(item => item.id)).toEqual(['a2', 'b1'])
        feed.ingest(':server CLEARCHAT #canal :ana')
        expect(feed.items.map(item => item.id)).toEqual(['b1'])
        feed.ingest(':server CLEARCHAT #canal')
        expect(feed.items).toEqual([])
    })

    it('emits a gift bomb once and does not replay it to a new subscriber', () => {
        const onAlert = vi.fn()
        const unsubscribe = feed.subscribe({ onAlert })
        feed.ingest(notice('submysterygift', 'msg-param-mass-gift-count=2'))
        feed.ingest(notice('subgift', 'msg-param-recipient-display-name=Bia'))
        feed.ingest(notice('subgift', 'msg-param-recipient-display-name=Leo'))
        expect(onAlert).toHaveBeenCalledTimes(1)
        expect(feed.alerts[0]).toMatchObject({ type: 'giftbomb', amount: 2 })
        const lateListener = vi.fn()
        const unsubscribeLate = feed.subscribe({ onAlert: lateListener })
        expect(lateListener).not.toHaveBeenCalled()
        feed.ingest(notice('subgift', 'msg-param-recipient-display-name=Eva'))
        expect(lateListener).toHaveBeenCalledTimes(1)
        unsubscribe()
        unsubscribeLate()
        vi.advanceTimersByTime(4000)
        expect(feed.closed).toBe(true)
    })

    it('bounds chat history so long transmissions do not accumulate every message', () => {
        for (let i = 0; i < 75; i++) feed.ingest(message(`m${i}`, 'ana', `${i}`))
        expect(feed.items).toHaveLength(60)
        expect(feed.items[0].id).toBe('m15')
        expect(feed.items.at(-1).id).toBe('m74')
    })
})
