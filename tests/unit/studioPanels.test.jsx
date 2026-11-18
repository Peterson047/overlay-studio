// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../../src/i18n/index.js'
import LayersPanel from '../../src/components/LayersPanel.jsx'
import LayerStrip from '../../src/components/LayerStrip.jsx'
import BackgroundPanel from '../../src/components/BackgroundPanel.jsx'
import CameraEditor from '../../src/components/CameraEditor.jsx'
import HelpPanel from '../../src/components/HelpPanel.jsx'
import ThemePanel from '../../src/components/ThemePanel.jsx'

let mockObsState = {
    isConnected: false,
    connectionError: null,
    camStatus: null,
    obsConfig: { enabled: false, url: '', password: '' },
    updateObsConfig: vi.fn(),
    reconnect: vi.fn(),
    disableObs: vi.fn(),
    placeCameras: vi.fn(),
}

vi.mock('../../src/context/OBSContext.jsx', () => ({
    useOBS: () => mockObsState,
}))

afterEach(() => {
    cleanup()
    act(() => setLocale('pt-BR'))
    mockObsState = {
        isConnected: false,
        connectionError: null,
        camStatus: null,
        obsConfig: { enabled: false, url: '', password: '' },
        updateObsConfig: vi.fn(),
        reconnect: vi.fn(),
        disableObs: vi.fn(),
        placeCameras: vi.fn(),
    }
})

describe('studio UI panels localization and design system controls', () => {
    it('renders LayersPanel in pt-BR and filters elements across Portuguese and English terms', () => {
        act(() => setLocale('pt-BR'))
        const onOpenBackground = vi.fn()
        render(
            <LayersPanel
                boxVisibility={{}}
                onAddBuiltin={vi.fn()}
                onAddElement={vi.fn()}
                onOpenTheme={vi.fn()}
                onOpenBackground={onOpenBackground}
                onResetLayout={vi.fn()}
            />,
        )
        expect(screen.getByText('Adicionar à cena')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Tema' })).toBeInTheDocument()
        const bgButtons = screen.getAllByRole('button', { name: 'Fundo' })
        expect(bgButtons.length).toBeGreaterThanOrEqual(2)
        fireEvent.click(bgButtons[bgButtons.length - 1])
        expect(onOpenBackground).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeInTheDocument()

        const search = screen.getByPlaceholderText('Buscar elementos…')
        fireEvent.change(search, { target: { value: 'relógio' } })
        expect(screen.getByText('Relógio')).toBeInTheDocument()
        expect(screen.queryByText('Roleta')).toBeNull()

        fireEvent.change(search, { target: { value: 'clock' } })
        expect(screen.getByText('Relógio')).toBeInTheDocument()

        act(() => setLocale('en'))
        expect(screen.getByText('Add to scene')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument()
    })

    it('renders LayerStrip status in pt-BR and keyboard-accessible layer cards', () => {
        act(() => setLocale('pt-BR'))
        const onSelect = vi.fn()
        render(
            <LayerStrip
                elements={[{ id: 'el-1', type: 'text', content: 'Minha cena', hidden: false }]}
                onSelectElement={onSelect}
                onToggleElement={vi.fn()}
                onDeleteElement={vi.fn()}
            />,
        )
        expect(screen.getByText('Camadas nesta cena')).toBeInTheDocument()
        expect(screen.getByText('1/1 visíveis')).toBeInTheDocument()
        const card = screen.getByRole('button', { name: /Minha cena/i })
        fireEvent.keyDown(card, { key: 'Enter' })
        expect(onSelect).toHaveBeenCalledWith('el-1')
    })

    it('renders BackgroundPanel in pt-BR and switches background mode', () => {
        act(() => setLocale('pt-BR'))
        const onChange = vi.fn()
        render(<BackgroundPanel bg={{ type: 'transparent' }} onChange={onChange} onClose={vi.fn()} />)
        expect(screen.getByText('Fundo')).toBeInTheDocument()
        expect(screen.getByText('Predefinições')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Sólido' }))
        expect(onChange).toHaveBeenCalledWith({ type: 'solid', color: '#0a0a0f' })
    })

    it('renders CameraEditor OBS actions matching help documentation in pt-BR and en', () => {
        act(() => setLocale('pt-BR'))
        render(<CameraEditor slot="faceCam" camStyle={{}} onChangeCamStyle={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Conectar ao OBS' })).toBeInTheDocument()

        act(() => setLocale('en'))
        expect(screen.getByRole('button', { name: 'Connect to OBS' })).toBeInTheDocument()

        cleanup()
        mockObsState = { ...mockObsState, isConnected: true }
        act(() => setLocale('pt-BR'))
        render(<CameraEditor slot="faceCam" camStyle={{}} onChangeCamStyle={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Desligar' })).toBeInTheDocument()

        act(() => setLocale('en'))
        expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    })

    it('renders HelpPanel with About tab containing AGPL-3.0 credits and source link', () => {
        act(() => setLocale('pt-BR'))
        render(<HelpPanel onClose={vi.fn()} />)
        expect(screen.getByText('Como funciona')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Sobre' }))
        expect(screen.getByText(/fork do Overlay Studio/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Código-fonte do qorpStreamer \(AGPL-3\.0\)/i }))
            .toHaveAttribute('href', 'https://github.com/Peterson047/overlay-studio')
    })

    it('renders ThemePanel with PRO badges on Pro themes, hides Xaxinim for non-owners, and reveals it for owners', () => {
        act(() => setLocale('pt-BR'))
        const onApply = vi.fn()
        render(<ThemePanel onApply={onApply} onChange={vi.fn()} onInstallPack={vi.fn()} onClose={vi.fn()} isOwner={false} />)
        expect(screen.getByText('Biblioteca — instalar visual')).toBeInTheDocument()
        expect(screen.getByText('Temas')).toBeInTheDocument()

        const neonSwatch = screen.getByTitle('Neon')
        expect(neonSwatch.textContent).toBe('')
        fireEvent.click(neonSwatch)
        expect(onApply).toHaveBeenCalledWith('neon')

        const proSwatches = screen.getAllByText('PRO')
        expect(proSwatches).toHaveLength(57)
        expect(screen.queryByTitle('Xaxinim · Vice Beach')).toBeNull()

        cleanup()
        render(<ThemePanel onApply={vi.fn()} onChange={vi.fn()} onClose={vi.fn()} isOwner={true} />)
        expect(screen.getByTitle('Xaxinim · Vice Beach')).toBeInTheDocument()
    })
})
