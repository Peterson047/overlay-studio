/* eslint-disable react-refresh/only-export-components -- background presets and style helpers live beside BackgroundPanel */
import { RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { scaleImageFile } from '../utils/imageScale.js';
import { Button, ColorField, IconButton, SegmentButton, Slider } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

// ── Presets ────────────────────────────────────────────────────────────────
export const PRESETS = [
    { label: 'Transparent',   type: 'transparent' },
    { label: 'Pure Black',    type: 'solid',    color: '#000000' },
    { label: 'Studio Dark',   type: 'solid',    color: '#0a0a0f' },
    { label: 'GitHub Dark',   type: 'solid',    color: '#0d1117' },
    { label: 'Slate',         type: 'solid',    color: '#0f172a' },
    { label: 'Purple Night',  type: 'gradient', from: '#0a0a0f', to: '#1a0830', dir: '135deg' },
    { label: 'Indigo Depth',  type: 'gradient', from: '#0f0c29', to: '#24243e', dir: '135deg' },
    { label: 'Midnight Blue', type: 'gradient', from: '#000428', to: '#0a1628', dir: '135deg' },
    { label: 'Deep Space',    type: 'gradient', from: '#0b0c2a', to: '#1a1a4e', dir: '160deg' },
    { label: 'Forest',        type: 'gradient', from: '#0a0f0a', to: '#0d2a1a', dir: '135deg' },
    { label: 'Crimson Dark',  type: 'gradient', from: '#0f0505', to: '#280a0a', dir: '135deg' },
    { label: 'Cyber Teal',    type: 'gradient', from: '#020c10', to: '#051a20', dir: '160deg' },
    { label: 'Warm Studio',   type: 'gradient', from: '#100a05', to: '#1a1005', dir: '135deg' },
    { label: 'Neon Grid',     type: 'gradient', from: '#080010', to: '#140028', dir: '135deg' },
];

// ── Compute CSS background from config ─────────────────────────────────────
const safeCssUrl = (raw) => {
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    if (!s || /[\r\n<>]/.test(s)) return null;
    const ok = /^https?:\/\//i.test(s)
        || /^\/(?!\/)/.test(s)
        || /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s);
    if (!ok) return null;
    return s.replace(/["\\]/g, '\\$&');
};

export const bgToCss = (bg) => {
    if (!bg || bg.type === 'transparent') return 'transparent';
    if (bg.type === 'solid')    return bg.color;
    if (bg.type === 'gradient') return `linear-gradient(${bg.dir ?? '135deg'}, ${bg.from}, ${bg.to})`;
    if (bg.type === 'image' && bg.src) {
        const url = safeCssUrl(bg.src);
        if (!url) return 'transparent';
        return bg.overlay
            ? `linear-gradient(rgba(0,0,0,${bg.overlayOpacity ?? 0.3}), rgba(0,0,0,${bg.overlayOpacity ?? 0.3})), url("${url}")`
            : `url("${url}")`;
    }
    return 'transparent';
};

// Inline style object for the canvas
export const bgToStyle = (bg) => {
    if (!bg || bg.type === 'transparent') return {};
    if (bg.type === 'solid')    return { background: bg.color };
    if (bg.type === 'gradient') return { background: `linear-gradient(${bg.dir ?? '135deg'}, ${bg.from}, ${bg.to})` };
    if (bg.type === 'image' && bg.src) {
        const url = safeCssUrl(bg.src);
        if (!url) return {};
        const repeat = bg.size === 'repeat';
        return {
            backgroundImage: bg.overlay
                ? `linear-gradient(rgba(0,0,0,${bg.overlayOpacity ?? 0.3}), rgba(0,0,0,${bg.overlayOpacity ?? 0.3})), url("${url}")`
                : `url("${url}")`,
            backgroundSize: repeat ? 'auto' : (bg.size ?? 'cover'),
            backgroundPosition: 'center',
            backgroundRepeat: repeat ? 'repeat' : 'no-repeat',
        };
    }
    return {};
};

// ── Small preset tile ───────────────────────────────────────────────────────
const PresetTile = ({ preset, label, active, onClick }) => {
    const innerStyle = preset.type === 'transparent'
        ? {
            width: '100%', height: '100%',
            backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            backgroundColor: '#555',
        }
        : preset.type === 'solid'
            ? { width: '100%', height: '100%', background: preset.color }
            : { width: '100%', height: '100%', background: `linear-gradient(${preset.dir}, ${preset.from}, ${preset.to})` };

    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            className="qs-tile"
            onClick={onClick}
        >
            <div style={innerStyle} />
        </button>
    );
};

// ── Direction picker ────────────────────────────────────────────────────────
const DIRS = [
    { label: '↘', value: '135deg' },
    { label: '↓', value: '180deg' },
    { label: '↗', value: '45deg'  },
    { label: '→', value: '90deg'  },
    { label: '↙', value: '225deg' },
];

const BG_TYPES = [
    { id: 'transparent', label: 'Transparent' },
    { id: 'solid',       label: 'Solid' },
    { id: 'gradient',    label: 'Gradient' },
    { id: 'image',       label: 'Image' },
];

const FIT_OPTIONS = [
    { id: 'cover',   label: 'Cover' },
    { id: 'contain', label: 'Contain' },
    { id: 'repeat',  label: 'Repeat' },
];

// ── Main panel ─────────────────────────────────────────────────────────────
const BackgroundPanel = ({ bg, onChange, onClose }) => {
    useI18n();
    const fileRef = useRef(null);
    const [narrow, setNarrow] = useState(() => (
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 759px)').matches
            : false
    ));
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mq = window.matchMedia('(max-width: 759px)');
        const update = (e) => setNarrow(e.matches);
        mq.addEventListener?.('change', update);
        return () => mq.removeEventListener?.('change', update);
    }, []);
    const current = bg ?? { type: 'transparent' };

    const set = (updates) => onChange({ ...current, ...updates });

    const isPresetActive = (p) => {
        if (p.type === 'transparent' && current.type === 'transparent') return true;
        if (p.type === 'solid' && current.type === 'solid' && current.color === p.color) return true;
        if (p.type === 'gradient' && current.type === 'gradient' && current.from === p.from && current.to === p.to && (current.dir ?? '135deg') === (p.dir ?? '135deg')) return true;
        return false;
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            // Downscale + re-encode before storing. The image lives as a base64
            // string inside the synced layout, which is SET into Upstash on every
            // save — a raw multi-MB photo exceeds request limits and the save
            // fails silently. ~960px JPEG keeps it well under that.
            const src = await scaleImageFile(file, { maxDim: 960, quality: 0.82, preserveAlpha: false });
            set({ type: 'image', src, size: 'cover', overlay: false, overlayOpacity: 0.3 });
        } catch (err) {
            console.error('[BackgroundPanel] image upload failed', err);
        } finally {
            // Reset so re-selecting the same file still fires onChange.
            e.target.value = '';
        }
    };

    return (
        <div
            className="qs-floating-panel"
            style={{
                position: 'absolute',
                left: narrow ? 12 : 248,
                top: narrow ? 104 : 60,
                width: 248,
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: narrow ? 'calc(100vh - 116px)' : 'calc(100vh - 72px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                zIndex: 395,
            }}
        >
            {/* Header */}
            <div className="qs-floating-head">
                <span className="qs-floating-title">{tx('Background')}</span>
                <IconButton size="sm" variant="ghost" title={tx('Close')} onClick={onClose}>
                    <X size={14} />
                </IconButton>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Preset tiles ── */}
                <div>
                    <div className="qs-subhead">{tx('Presets')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {PRESETS.map((p, i) => (
                            <PresetTile
                                key={i}
                                preset={p}
                                label={tx(p.label)}
                                active={isPresetActive(p)}
                                onClick={() => {
                                    if (p.type === 'transparent') onChange({ type: 'transparent' });
                                    else if (p.type === 'solid')    onChange({ type: 'solid', color: p.color });
                                    else                             onChange({ type: 'gradient', from: p.from, to: p.to, dir: p.dir });
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Type tabs ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
                    {BG_TYPES.map(t => (
                        <SegmentButton
                            key={t.id}
                            size="sm"
                            active={current.type === t.id}
                            style={{ padding: '0 4px', fontSize: 10.5 }}
                            onClick={() => {
                                if (t.id === 'transparent') onChange({ type: 'transparent' });
                                else if (t.id === 'solid')  onChange({ type: 'solid', color: current.color ?? '#0a0a0f' });
                                else if (t.id === 'gradient') onChange({ type: 'gradient', from: current.from ?? '#0a0a0f', to: current.to ?? '#1a0830', dir: current.dir ?? '135deg' });
                                else onChange({ ...current, type: 'image' });
                            }}
                        >
                            {tx(t.label)}
                        </SegmentButton>
                    ))}
                </div>

                {/* ── Solid controls ── */}
                {current.type === 'solid' && (
                    <ColorField
                        hex={current.color ?? '#000000'}
                        label={tx('Color')}
                        onChange={color => set({ color })}
                    />
                )}

                {/* ── Gradient controls ── */}
                {current.type === 'gradient' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Color stops */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span className="qs-swatch" style={{ width: 28, height: 28, background: current.from ?? '#000000' }}>
                                    <input type="color" aria-label={tx('From')} value={current.from ?? '#000000'} onChange={e => set({ from: e.target.value })} />
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--qs-text-faint)' }}>{tx('From')}</span>
                            </label>

                            {/* Live gradient preview */}
                            <div style={{
                                flex: 1, height: 28, borderRadius: 'var(--qs-radius-sm)',
                                background: `linear-gradient(${current.dir ?? '135deg'}, ${current.from}, ${current.to})`,
                                border: '1px solid var(--qs-line-strong)',
                            }} />

                            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span className="qs-swatch" style={{ width: 28, height: 28, background: current.to ?? '#1a0830' }}>
                                    <input type="color" aria-label={tx('To')} value={current.to ?? '#1a0830'} onChange={e => set({ to: e.target.value })} />
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--qs-text-faint)' }}>{tx('To')}</span>
                            </label>
                        </div>

                        {/* Direction */}
                        <div>
                            <div className="qs-subhead">{tx('Direction')}</div>
                            <div style={{ display: 'flex', gap: 5 }}>
                                {DIRS.map(d => (
                                    <SegmentButton
                                        key={d.value}
                                        size="sm"
                                        active={current.dir === d.value}
                                        onClick={() => set({ dir: d.value })}
                                        style={{ width: 34, padding: 0, fontSize: 13 }}
                                    >
                                        {d.label}
                                    </SegmentButton>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Image controls ── */}
                {current.type === 'image' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Upload */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Button
                                variant="soft"
                                size="sm"
                                style={{ flex: 1 }}
                                onClick={() => fileRef.current?.click()}
                            >
                                {current.src
                                    ? <><RefreshCw size={12} />{tx('Replace image')}</>
                                    : <><Upload size={12} />{tx('Upload image')}</>}
                            </Button>
                            {current.src && (
                                <IconButton
                                    size="sm"
                                    danger
                                    title={tx('Remove image')}
                                    onClick={() => set({ src: null })}
                                >
                                    <X size={12} />
                                </IconButton>
                            )}
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </div>

                        {/* Preview */}
                        {current.src && (
                            <div style={{
                                width: '100%', height: 72, borderRadius: 'var(--qs-radius-sm)',
                                ...bgToStyle(current),
                                border: '1px solid var(--qs-line-strong)',
                                overflow: 'hidden',
                            }} />
                        )}

                        {/* Size */}
                        <div>
                            <div className="qs-subhead">{tx('Fit')}</div>
                            <div style={{ display: 'flex', gap: 5 }}>
                                {FIT_OPTIONS.map(opt => (
                                    <SegmentButton
                                        key={opt.id}
                                        size="sm"
                                        active={current.size === opt.id}
                                        style={{ flex: 1 }}
                                        onClick={() => set({ size: opt.id })}
                                    >
                                        {tx(opt.label)}
                                    </SegmentButton>
                                ))}
                            </div>
                        </div>

                        {/* Dark overlay */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 11.5, color: 'var(--qs-text-dim)' }}>{tx('Dark overlay')}</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-label={tx('Dark overlay')}
                                    aria-checked={!!current.overlay}
                                    className="qs-switch"
                                    onClick={() => set({ overlay: !current.overlay })}
                                />
                            </div>
                            {current.overlay && (
                                <Slider
                                    min={0}
                                    max={0.9}
                                    step={0.05}
                                    value={current.overlayOpacity ?? 0.3}
                                    ariaLabel={tx('Overlay opacity')}
                                    onChange={overlayOpacity => set({ overlayOpacity })}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Transparent hint */}
                {current.type === 'transparent' && (
                    <div className="qs-hint" style={{ padding: '8px 10px' }}>
                        <span>{tx('OBS will see through to whatever is behind the browser source. Use chroma key or scene layers as needed.')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BackgroundPanel;
