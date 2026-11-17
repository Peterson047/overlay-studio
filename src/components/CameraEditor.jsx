// Right-panel editor for a selected camera box. Device assignment used to
// live in the Layers panel; it moved here so each camera shows up only once
// in the unified layers list.

import { useState } from 'react';
import { useOBS } from '../context/OBSContext';
import { CAMERA_FRAMES } from './CameraFrame';

const Label = ({ children }) => (
    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
        {children}
    </span>
);

const WS_INPUT_STYLE = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 7px',
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#e5e7eb',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 4,
    outline: 'none',
};

const WS_BTN_STYLE = {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    padding: '4px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)',
    color: '#e5e7eb',
};

const describeObsDisconnect = (connectionError) => {
    switch (connectionError?.kind) {
        case 'auth':
            return {
                title: 'OBS auth required (4009)',
                tone: 'error',
                body: 'OBS WebSocket rejected the connection password. Paste your OBS Server Password below or disable authentication in OBS: Tools → WebSocket Server Settings.',
            };
        case 'mixed-content':
            return {
                title: 'WebSocket blocked (HTTPS)',
                tone: 'error',
                body: 'This page is loaded over HTTPS while OBS uses ws://. Open the overlay on http:// (or provide a wss:// URL below).',
            };
        case 'unreachable':
            return {
                title: 'OBS WebSocket unreachable',
                tone: 'warn',
                body: `Could not reach ${connectionError.url || 'ws://127.0.0.1:4455'}. Confirm OBS Studio is running with Tools → WebSocket Server Settings → Enable WebSocket server on port 4455.`,
            };
        default:
            return {
                title: 'OBS not connected',
                tone: 'warn',
                body: 'Add your webcam as an OBS “Video Capture Device” source behind this overlay. Enable Tools → WebSocket Server Settings → Enable WebSocket server (port 4455).',
            };
    }
};

const CAMERA_LABELS = { faceCam: 'Face Cam', handCam: 'Hand Cam', roomCam: 'Room Cam' };

const POLYGON_PREVIEWS = {
    hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
    diamond: '50,0 100,50 50,100 0,50',
};

// Tiny visual swatch echoing each frame preset so it's pickable at a glance.
const FramePreview = ({ id, accent }) => {
    if (POLYGON_PREVIEWS[id]) {
        const size = id === 'diamond' ? { width: 20, height: 20 } : { width: 26, height: 18 };
        return (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ ...size, overflow: 'visible', display: 'block' }}>
                <polygon
                    points={POLYGON_PREVIEWS[id]}
                    fill="rgba(255,255,255,0.12)"
                    stroke={accent}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }
    const base = { width: 26, height: 18, background: 'rgba(255,255,255,0.12)', boxSizing: 'border-box' };
    const map = {
        none:     { ...base, borderRadius: 3, border: '1px dashed rgba(255,255,255,0.25)', background: 'transparent' },
        soft:     { ...base, borderRadius: 5, boxShadow: '0 2px 6px rgba(0,0,0,0.6)' },
        ring:     { ...base, borderRadius: 5, border: `2px solid ${accent}` },
        neon:     { ...base, borderRadius: 5, border: `1.5px solid ${accent}`, boxShadow: `0 0 7px ${accent}` },
        gradient: { ...base, borderRadius: 5, background: `linear-gradient(135deg, ${accent}, ${accent}55)` },
        glass:    { ...base, borderRadius: 5, border: '1px solid rgba(255,255,255,0.5)' },
        circle:   { width: 20, height: 20, borderRadius: '50%', border: `2px solid ${accent}`, background: 'rgba(255,255,255,0.12)', boxSizing: 'border-box' },
    };
    return <span style={map[id] ?? base} />;
};

const PRESET_ACCENTS = ['#6366f1', '#22d3ee', '#ec4899', '#f59e0b', '#22c55e', '#ffffff'];

const CameraEditor = ({ slot, camStyle = {}, onChangeCamStyle }) => {
    const {
        isConnected,
        connectionError,
        camStatus,
        obsConfig,
        updateObsConfig,
        reconnect,
        disableObs,
        placeCameras,
    } = useOBS();
    const [showWsConfig, setShowWsConfig] = useState(false);
    const [wsUrl, setWsUrl] = useState(obsConfig?.url ?? '');
    const [wsPassword, setWsPassword] = useState(obsConfig?.password ?? '');
    const frame = camStyle.frame ?? 'soft';
    const accent = camStyle.accent ?? '#6366f1';
    const radius = camStyle.radius ?? 14;
    const usesAccent = ['ring', 'neon', 'gradient', 'circle', 'hexagon', 'diamond'].includes(frame);
    const usesRadius = !['none', 'circle', 'hexagon', 'diamond'].includes(frame);
    const matchedForSlot = camStatus?.matched?.find((m) => m.slot === slot);
    const disconnectInfo = describeObsDisconnect(connectionError);
    const wsFormOpen = showWsConfig || (!isConnected && connectionError?.kind === 'auth');

    const handleSaveWs = (e) => {
        e.preventDefault();
        updateObsConfig({ url: wsUrl.trim(), password: wsPassword });
        setShowWsConfig(false);
    };

    return (
        <div style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(7,7,16,0.94)',
            padding: '12px 14px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
        }}>
            {/* Type badge */}
            <div>
                <Label>Camera</Label>
                <div style={{
                    fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                    color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 5, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                    {CAMERA_LABELS[slot] ?? slot}
                </div>
            </div>

            {/* OBS source hint — the real webcam is a native OBS source behind this
                frame. When the OBS WebSocket is connected we auto-place that source
                into the frame; otherwise show exact failure reason & credentials. */}
            {isConnected ? (
                <div style={{
                    fontSize: 9, fontFamily: 'monospace', lineHeight: 1.5, color: 'rgba(134,239,172,0.85)',
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: 6, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                            OBS connected
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" onClick={disableObs} style={WS_BTN_STYLE} title="Parar de conectar ao OBS a partir do estúdio">
                                Desligar
                            </button>
                            <button type="button" onClick={() => placeCameras(undefined, undefined, undefined, { syncPreview: true })} style={{ ...WS_BTN_STYLE, color: '#bbf7d0', borderColor: 'rgba(34,197,94,0.35)' }}>
                                Sync OBS
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setWsUrl(obsConfig?.url ?? '');
                                    setWsPassword(obsConfig?.password ?? '');
                                    setShowWsConfig((v) => !v);
                                }}
                                style={WS_BTN_STYLE}
                            >
                                WS
                            </button>
                        </div>
                    </div>

                    {camStatus?.error ? (
                        <div style={{ color: '#fca5a5' }}>
                            Auto-place error: {camStatus.error}
                        </div>
                    ) : camStatus && camStatus.matched.length === 0 ? (
                        <div style={{ color: '#fde047' }}>
                            No camera source found in OBS scene “{camStatus.sceneName}”. Add a Video Capture Device (or name your source Webcam / Face Cam).
                        </div>
                    ) : matchedForSlot ? (
                        <div>
                            Scene “{camStatus.sceneName}” → <strong style={{ color: '#dcfce7' }}>{matchedForSlot.sourceName}</strong>
                            {matchedForSlot.inGroup ? ' (group)' : ''}
                            {camStatus.studioModeEnabled && (
                                <div style={{ color: 'rgba(253,224,71,0.8)', marginTop: 3 }}>
                                    Studio Mode active in OBS: click Transition (or turn off Studio Mode) if Program does not refresh.
                                </div>
                            )}
                        </div>
                    ) : camStatus ? (
                        <div style={{ color: 'rgba(255,255,255,0.72)' }}>
                            No OBS camera assigned to {CAMERA_LABELS[slot] ?? slot}. Matched:{' '}
                            {camStatus.matched.map((m) => `${m.slot}=${m.sourceName}`).join(', ')}.
                        </div>
                    ) : (
                        <div>
                            Your OBS camera source snaps into this frame automatically when you move it or switch scenes.
                        </div>
                    )}
                </div>
            ) : !obsConfig?.enabled ? (
                <div style={{
                    fontSize: 9, fontFamily: 'monospace', lineHeight: 1.5, color: 'rgba(255,255,255,0.72)',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Encaixe automático (opcional)
                        </span>
                        <button type="button" onClick={reconnect} style={WS_BTN_STYLE}>
                            Conectar ao OBS
                        </button>
                    </div>
                    <div>
                        Com o OBS aberto e o servidor WebSocket ligado (Ferramentas → Configurações do servidor WebSocket, porta 4455),
                        a câmera do OBS se encaixa nesta moldura sozinha. Sem isso, posicione a câmera no OBS manualmente.
                    </div>
                </div>
            ) : (
                <div style={{
                    fontSize: 9,
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    color: disconnectInfo.tone === 'error' ? 'rgba(252,165,165,0.9)' : 'rgba(253,224,71,0.82)',
                    background: disconnectInfo.tone === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.07)',
                    border: `1px solid ${disconnectInfo.tone === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.25)'}`,
                    borderRadius: 6,
                    padding: '7px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                            <span
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: disconnectInfo.tone === 'error' ? '#ef4444' : '#eab308',
                                    flexShrink: 0,
                                }}
                            />
                            {disconnectInfo.title}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" onClick={reconnect} style={WS_BTN_STYLE}>
                                Retry
                            </button>
                            <button type="button" onClick={disableObs} style={WS_BTN_STYLE} title="Parar de tentar conectar ao OBS">
                                Desligar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setWsUrl(obsConfig?.url ?? '');
                                    setWsPassword(obsConfig?.password ?? '');
                                    setShowWsConfig((v) => !v);
                                }}
                                style={WS_BTN_STYLE}
                            >
                                {wsFormOpen ? 'Hide' : 'Setup'}
                            </button>
                        </div>
                    </div>
                    <div>{disconnectInfo.body}</div>
                </div>
            )}

            {wsFormOpen && (
                <form
                    onSubmit={handleSaveWs}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '7px 9px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}
                >
                    <div>
                        <Label>OBS WebSocket URL (optional)</Label>
                        <input
                            type="text"
                            value={wsUrl}
                            onChange={(e) => setWsUrl(e.target.value)}
                            placeholder="ws://127.0.0.1:4455"
                            style={WS_INPUT_STYLE}
                        />
                    </div>
                    <div>
                        <Label>OBS Server Password</Label>
                        <input
                            type="password"
                            value={wsPassword}
                            onChange={(e) => setWsPassword(e.target.value)}
                            placeholder="Leave blank if auth disabled"
                            style={WS_INPUT_STYLE}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                            type="submit"
                            style={{
                                ...WS_BTN_STYLE,
                                background: 'rgba(99,102,241,0.28)',
                                borderColor: 'rgba(99,102,241,0.6)',
                                color: '#e0e7ff',
                            }}
                        >
                            Save & Connect
                        </button>
                    </div>
                </form>
            )}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            {/* Frame picker */}
            <div>
                <Label>Frame</Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {CAMERA_FRAMES.map(f => {
                        const selected = frame === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => onChangeCamStyle?.({ frame: f.id })}
                                title={f.label}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                                    padding: '8px 2px 5px', borderRadius: 7, cursor: 'pointer',
                                    background: selected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${selected ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.08)'}`,
                                    transition: 'all 0.12s', minHeight: 46,
                                }}
                            >
                                <span style={{ height: 20, display: 'flex', alignItems: 'center' }}>
                                    <FramePreview id={f.id} accent={accent} />
                                </span>
                                <span style={{ fontSize: 7.5, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, color: selected ? '#c7d2fe' : 'rgba(255,255,255,0.4)' }}>
                                    {f.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Accent — only for frames that use it */}
            {usesAccent && (
                <div>
                    <Label>Accent</Label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {PRESET_ACCENTS.map(c => (
                            <button
                                key={c}
                                onClick={() => onChangeCamStyle?.({ accent: c })}
                                title={c}
                                style={{
                                    width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                                    background: c, border: accent.toLowerCase() === c.toLowerCase() ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                                    boxShadow: accent.toLowerCase() === c.toLowerCase() ? `0 0 8px ${c}` : 'none',
                                }}
                            />
                        ))}
                        <label title="Custom color" style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0, position: 'relative', background: 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' }}>
                            <input type="color" value={accent} onChange={e => onChangeCamStyle?.({ accent: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                        </label>
                    </div>
                </div>
            )}

            {/* Corner radius — only for rectangular frames */}
            {usesRadius && (
                <div>
                    <Label>Corner radius — {radius}px</Label>
                    <input
                        type="range" min={0} max={40} value={radius}
                        onChange={e => onChangeCamStyle?.({ radius: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: accent, cursor: 'pointer' }}
                    />
                </div>
            )}

            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                Position, resize, and z-order this cam from the canvas or the Layers list.
            </div>
        </div>
    );
};

export default CameraEditor;
