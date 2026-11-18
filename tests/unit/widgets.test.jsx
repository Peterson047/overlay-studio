// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ElementRenderer, { computePomodoroState, defaultElement } from '../../src/components/ElementRenderer.jsx'

const element = (type, overrides = {}) => ({ ...defaultElement(type), id: 'widget', ...overrides })
const timerState = timer => ({ timers: { widget: timer } })

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 17, 12, 34, 56))
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
    })
})
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('manual goals', () => {
    it.each([
        ['goal', 25, 100, '25%', '25 / 100'],
        ['goal', 150, 100, '100%', '150 / 100'],
        ['goal', -10, 100, '0%', '0 / 100'],
        ['goal', 0, 0, '0%', '0 / 1'],
        ['liquidgoal', 25, 100, '25%', '25/100'],
        ['liquidgoal', 150, 100, '100%', '150/100'],
    ])('%s displays %s/%s and clamps its fill', (type, current, target, fill, label) => {
        const { container } = render(<ElementRenderer element={element(type, { content: 'Meu objetivo', current, target })} />)
        expect(screen.getByText('Meu objetivo')).toBeVisible()
        expect(screen.getByText(label)).toBeVisible()
        // Assert the painted extent rather than an internal calculation helper.
        const bar = type === 'goal'
            ? container.firstElementChild.lastElementChild.firstElementChild
            : container.firstElementChild.firstElementChild
        expect(bar.style[type === 'goal' ? 'width' : 'height']).toBe(fill)
    })
})

describe('live clocks and timers', () => {
    it('advances the clock and releases its interval when removed', () => {
        const { unmount } = render(<ElementRenderer element={element('clock')} />)
        expect(screen.getByText(/12:34:56/)).toBeVisible()
        act(() => vi.advanceTimersByTime(2000))
        expect(screen.getByText(/12:34:58/)).toBeVisible()
        unmount()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('counts down from the server anchor including clock offset and stops at zero', () => {
        const now = Date.now()
        const props = { element: element('countdown'), serverOffsetMs: 2000,
            liveState: timerState({ kind: 'countdown', state: 'running', remainingSec: 10, anchorAt: now }) }
        const { unmount } = render(<ElementRenderer {...props} />)
        expect(screen.getByText('00:08')).toBeVisible()
        act(() => vi.advanceTimersByTime(3000))
        expect(screen.getByText('00:05')).toBeVisible()
        act(() => vi.advanceTimersByTime(9000))
        expect(screen.getByText('00:00')).toBeVisible()
        unmount()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('keeps paused countdowns stable and resumes from the new anchor', () => {
        const el = element('countdown')
        const { rerender } = render(<ElementRenderer element={el} liveState={timerState({ state: 'paused', remainingSec: 65 })} />)
        act(() => vi.advanceTimersByTime(30000))
        expect(screen.getByText('01:05')).toBeVisible()
        rerender(<ElementRenderer element={el} liveState={timerState({ state: 'running', remainingSec: 65, anchorAt: Date.now() })} />)
        act(() => vi.advanceTimersByTime(1000))
        expect(screen.getByText('01:04')).toBeVisible()
    })

    it('renders the pomodoro transition and completed work count', () => {
        render(<ElementRenderer element={element('pomodoro', { workMin: 1, breakMin: 1 })}
            liveState={timerState({ kind: 'pomodoro', state: 'running', phase: 'work', remainingSec: 1, anchorAt: Date.now(), count: 0 })} />)
        expect(screen.getByText('● Focus')).toBeVisible()
        act(() => vi.advanceTimersByTime(1000))
        expect(screen.getByText('○ Break')).toBeVisible()
        expect(screen.getByText('01:00')).toBeVisible()
        expect(screen.getByText('🍅')).toBeVisible()
    })
})

describe('pomodoro synchronization after a player reconnects', () => {
    it.each([
        [0, 'work', 60, 0], [60000, 'break', 60, 1],
        [120000, 'work', 60, 1], [181000, 'break', 59, 2],
        [3600000, 'work', 60, 30],
    ])('reconstructs state after %s milliseconds', (elapsed, phase, remainingSec, count) => {
        expect(computePomodoroState({ state: 'running', phase: 'work', remainingSec: 60, anchorAt: 1000 },
            { workMin: 1, breakMin: 1 }, 1000 + elapsed)).toMatchObject({ phase, remainingSec, count })
    })

    it('does not advance while paused or when the local clock is behind the anchor', () => {
        expect(computePomodoroState({ state: 'paused', phase: 'break', remainingSec: 12, count: 3 }, {}, 999999))
            .toMatchObject({ phase: 'break', remainingSec: 12, count: 3 })
        expect(computePomodoroState({ state: 'running', anchorAt: 5000, remainingSec: 30 }, {}, 1000))
            .toMatchObject({ phase: 'work', remainingSec: 30, count: 0 })
    })
})
