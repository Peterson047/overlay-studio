// Right-panel editor for a selected camera box. Device assignment used to
// live in the Layers panel; it moved here so each camera shows up only once
// in the unified layers list.

import { useState } from 'react';
import { useOBS } from '../context/OBSContext';
import { CAMERA_FRAMES } from './CameraFrame';
import { Badge, Button, Field, Hint, Slider, TextField } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

const Label = ({ children }) => <span className="qs-label">{children}</span>;

const describeObsDisconnect = (connectionError) => {
    switch (connectionError?.kind) {
        case 'auth':
            return {
                title: tx('OBS auth required (4009)'),
                tone: 'danger',
                body: tx('OBS WebSocket rejected the connection password. Paste your OBS Server Password below or disable authentication in OBS: Tools → WebSocket Server Settings.'),
            };
        case 'mixed-content':
            return {
                title: tx('WebSocket blocked (HTTPS)'),
                tone: 'danger',
                body: tx('This page is loaded over HTTPS while OBS uses ws://. Open the overlay on http:// (or provide a wss:// URL below).'),
            };
        case 'unreachable':
            return {
                title: tx('OBS WebSocket unreachable'),
                tone: 'warning',
                body: tx('Could not reach {url}. Confirm OBS Studio is running with Tools → WebSocket Server Settings → Enable WebSocket server on port 4455.', {
                    url: connectionError.url || 'ws://127.0.0.1:4455',
                }),
            };
        default:
            return {
                title: tx('OBS not connected'),
                tone: 'warning',
                body: tx('Add your webcam as an OBS “Video Capture Device” source behind this overlay. Enable Tools → WebSocket Server Settings → Enable WebSocket server (port 4455).'),
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

// Overlay camera-frame preset colors (stream content, not studio chrome).
const PRESET_ACCENTS = ['#e2021b', '#22d3ee', '#ec4899', '#f59e0b', '#22c55e', '#ffffff'];

const CameraEditor = ({ slot, camStyle = {}, onChangeCamStyle }) => {
    useI18n();
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
    const accent = camStyle.accent ?? '#ff7956';
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

    const camLabel = tx(CAMERA_LABELS[slot] ?? slot);

    return (
        <div style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--qs-panel)',
            fontFamily: 'var(--qs-font)',
            padding: '12px 14px 16px',
            display: 'flex', flexDirection: 'column', gap: 14,
        }}>
            {/* Type badge */}
            <div>
                <Label>{tx('Camera')}</Label>
                <Badge tone="live">{camLabel}</Badge>
            </div>

            {/* OBS source hint — the real webcam is a native OBS source behind this
                frame. When the OBS WebSocket is connected we auto-place that source
                into the frame; otherwise show exact failure reason & credentials. */}
            {isConnected ? (
                <div className="qs-callout qs-callout--success">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--qs-success)', flexShrink: 0 }} />
                            {tx('OBS connected')}
                        </span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <Button size="sm" onClick={disableObs} title={tx('Stop connecting to OBS from the studio')}>
                                {tx('Turn off')}
                            </Button>
                            <Button size="sm" variant="soft" onClick={() => placeCameras(undefined, undefined, undefined, { syncPreview: true })}>
                                {tx('Sync OBS')}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setWsUrl(obsConfig?.url ?? '');
                                    setWsPassword(obsConfig?.password ?? '');
                                    setShowWsConfig((v) => !v);
                                }}
                            >
                                WS
                            </Button>
                        </div>
                    </div>

                    {camStatus?.error ? (
                        <div style={{ color: 'var(--qs-danger)' }}>
                            {tx('Auto-place error: {error}', { error: camStatus.error })}
                        </div>
                    ) : camStatus && camStatus.matched.length === 0 ? (
                        <div style={{ color: 'var(--qs-warning)' }}>
                            {tx('No camera source found in OBS scene “{scene}”. Add a Video Capture Device (or name your source Webcam / Face Cam).', { scene: camStatus.sceneName })}
                        </div>
                    ) : matchedForSlot ? (
                        <div>
                            {tx('Scene “{scene}” → ', { scene: camStatus.sceneName })}<strong style={{ color: 'var(--qs-text)' }}>{matchedForSlot.sourceName}</strong>
                            {matchedForSlot.inGroup ? tx(' (group)') : ''}
                            {camStatus.studioModeEnabled && (
                                <div style={{ color: 'var(--qs-warning)', marginTop: 4 }}>
                                    {tx('Studio Mode active in OBS: click Transition (or turn off Studio Mode) if Program does not refresh.')}
                                </div>
                            )}
                        </div>
                    ) : camStatus ? (
                        <div>
                            {tx('No OBS camera assigned to {cam}. Matched: {list}.', {
                                cam: camLabel,
                                list: camStatus.matched.map((m) => `${m.slot}=${m.sourceName}`).join(', '),
                            })}
                        </div>
                    ) : (
                        <div>
                            {tx('Your OBS camera source snaps into this frame automatically when you move it or switch scenes.')}
                        </div>
                    )}
                </div>
            ) : !obsConfig?.enabled ? (
                <div className="qs-callout">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--qs-text)' }}>
                            {tx('Auto-fit (optional)')}
                        </span>
                        <Button size="sm" variant="soft" onClick={reconnect}>
                            {tx('Connect to OBS')}
                        </Button>
                    </div>
                    <div>
                        {tx('With OBS open and the WebSocket server enabled (Tools → WebSocket Server Settings, port 4455), your OBS camera snaps into this frame automatically. Otherwise, position your camera in OBS manually.')}
                    </div>
                </div>
            ) : (
                <div className={`qs-callout qs-callout--${disconnectInfo.tone}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                            <span
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: disconnectInfo.tone === 'danger' ? 'var(--qs-danger)' : 'var(--qs-warning)',
                                    flexShrink: 0,
                                }}
                            />
                            {disconnectInfo.title}
                        </span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <Button size="sm" onClick={reconnect}>
                                {tx('Retry')}
                            </Button>
                            <Button size="sm" onClick={disableObs} title={tx('Stop trying to connect to OBS')}>
                                {tx('Turn off')}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setWsUrl(obsConfig?.url ?? '');
                                    setWsPassword(obsConfig?.password ?? '');
                                    setShowWsConfig((v) => !v);
                                }}
                            >
                                {tx(wsFormOpen ? 'Hide' : 'Setup')}
                            </Button>
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
                        gap: 8,
                        padding: 10,
                        borderRadius: 'var(--qs-radius)',
                        background: 'var(--qs-raised)',
                        border: '1px solid var(--qs-line)',
                    }}
                >
                    <Field stack label={tx('OBS WebSocket URL (optional)')}>
                        <TextField
                            value={wsUrl}
                            onChange={setWsUrl}
                            placeholder="ws://127.0.0.1:4455"
                        />
                    </Field>
                    <Field stack label={tx('OBS Server Password')}>
                        <TextField
                            type="password"
                            value={wsPassword}
                            onChange={setWsPassword}
                            placeholder={tx('Leave blank if auth disabled')}
                        />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="submit" size="sm" variant="primary">
                            {tx('Save & Connect')}
                        </Button>
                    </div>
                </form>
            )}

            <div style={{ height: 1, background: 'var(--qs-line)' }} />

            {/* Frame picker */}
            <div>
                <Label>{tx('Frame')}</Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                    {CAMERA_FRAMES.map(f => {
                        const selected = frame === f.id;
                        return (
                            <button
                                key={f.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onChangeCamStyle?.({ frame: f.id })}
                                title={tx(f.label)}
                                className="qs-frame-btn"
                            >
                                <span style={{ height: 20, display: 'flex', alignItems: 'center' }}>
                                    <FramePreview id={f.id} accent={accent} />
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.15 }}>
                                    {tx(f.label)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Accent — only for frames that use it */}
            {usesAccent && (
                <div>
                    <Label>{tx('Accent')}</Label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        {PRESET_ACCENTS.map(c => {
                            const active = accent.toLowerCase() === c.toLowerCase();
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => onChangeCamStyle?.({ accent: c })}
                                    title={c}
                                    aria-label={c}
                                    aria-pressed={active}
                                    style={{
                                        width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                                        background: c, border: active ? '2px solid #fff' : '2px solid var(--qs-line-strong)',
                                        boxShadow: active ? `0 0 8px ${c}` : 'none',
                                    }}
                                />
                            );
                        })}
                        <label title={tx('Custom color')} style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '2px solid var(--qs-line-strong)', flexShrink: 0, position: 'relative', background: 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' }}>
                            <input type="color" aria-label={tx('Custom color')} value={accent} onChange={e => onChangeCamStyle?.({ accent: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                        </label>
                    </div>
                </div>
            )}

            {/* Corner radius — only for rectangular frames */}
            {usesRadius && (
                <Field stack label={tx('Corner radius')}>
                    <Slider
                        min={0}
                        max={40}
                        step={1}
                        value={radius}
                        displayValue={`${radius}px`}
                        ariaLabel={tx('Corner radius')}
                        onChange={r => onChangeCamStyle?.({ radius: r })}
                    />
                </Field>
            )}

            <Hint>
                {tx('Position, resize, and z-order this cam from the canvas or the Layers list.')}
            </Hint>
        </div>
    );
};

export default CameraEditor;
