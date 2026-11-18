// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import LayerStrip from '../../src/components/LayerStrip.jsx'

afterEach(cleanup)

it('lists custom layers front to back in the same order as the canvas', () => {
    // OverlayLayout renders index 0 above index 1; duplicating inserts at index 0.
    const front = { id: 'copy', type: 'text', content: 'Cópia', hidden: false }
    const back = { id: 'original', type: 'text', content: 'Original', hidden: false }
    const { rerender } = render(<LayerStrip elements={[front, back]} />)
    expect(screen.getAllByText(/^(Cópia|Original)$/).map(el => el.textContent)).toEqual(['Cópia', 'Original'])
    rerender(<LayerStrip elements={[back, front]} />)
    expect(screen.getAllByText(/^(Cópia|Original)$/).map(el => el.textContent)).toEqual(['Original', 'Cópia'])
})
