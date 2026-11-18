import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getVisibleThemes, THEMES } from '../theme/themes';
import { getThemeTier } from '../theme/entitlements';
import { THEME_PACKS, packGradient } from '../scenes/packs';
import { getVisibleBackdrops, FRAME_STYLES, LOWER_THIRDS, TEXT_FX } from './graphics';
import { IconButton, SegmentButton, SelectField, Slider } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

// ── Font choices ──────────────────────────────────────────────────────────
const FONTS = [
    { label: 'Inter',     value: 'inter, system-ui, sans-serif' },
    { label: 'Mono',      value: "'JetBrains Mono', ui-monospace, monospace" },
    { label: 'Serif',     value: 'Georgia, "Times New Roman", serif' },
    { label: 'System',    value: 'system-ui, -apple-system, sans-serif' },
    { label: 'Grotesk',   value: "'Space Grotesk', 'Inter', system-ui, sans-serif" },
    { label: 'Rajdhani',  value: "'Rajdhani', 'Inter', system-ui, sans-serif" },
    { label: 'Fredoka',   value: "'Fredoka', 'Inter', system-ui, sans-serif" },
    { label: 'Playfair',  value: "'Playfair Display', Georgia, serif" },
    { label: 'Caveat',    value: "'Caveat', 'Segoe Print', cursive" },
    { label: 'VT323',     value: "'VT323', ui-monospace, monospace" },
];

// Headline fonts, used by elements set to the theme's headline font.
const DISPLAY_FONTS = [
    { label: 'Same as body', value: '' },
    { label: 'Orbitron',     value: "'Orbitron', 'Rajdhani', sans-serif" },
    { label: 'Monoton',      value: "'Monoton', 'Space Grotesk', sans-serif" },
    { label: 'Anton',        value: "'Anton', 'Impact', sans-serif" },
    { label: 'Press Start',  value: "'Press Start 2P', 'VT323', monospace" },
    { label: 'Playfair',     value: "'Playfair Display', Georgia, serif" },
    { label: 'Fredoka',      value: "'Fredoka', 'Inter', sans-serif" },
    { label: 'Caveat',       value: "'Caveat', 'Segoe Print', cursive" },
    { label: 'VT323',        value: "'VT323', ui-monospace, monospace" },
    { label: 'Cinzel',       value: "'Cinzel', Georgia, serif" },
    { label: 'Shojumaru',    value: "'Shojumaru', 'Inter', sans-serif" },
    { label: 'Audiowide',    value: "'Audiowide', 'Rajdhani', sans-serif" },
    { label: 'Teko',         value: "'Teko', 'Rajdhani', sans-serif" },
    { label: 'Creepster',    value: "'Creepster', 'Fredoka', cursive" },
    { label: 'Pacifico',     value: "'Pacifico', 'Fredoka', cursive" },
    { label: 'Yatra One',    value: "'Yatra One', 'Fredoka', cursive" },
    { label: 'Cinzel Deco',  value: "'Cinzel Decorative', 'Cinzel', Georgia, serif" },
    { label: 'Christmas',    value: "'Mountains of Christmas', 'Fredoka', cursive" },
    { label: 'Henny Penny',  value: "'Henny Penny', 'Fredoka', cursive" },
    { label: 'Bungee',       value: "'Bungee', 'Fredoka', sans-serif" },
    { label: 'Ma Shan Zheng', value: "'Ma Shan Zheng', 'Cinzel', serif" },
    { label: 'Aref Ruqaa',   value: "'Aref Ruqaa', 'Cinzel', Georgia, serif" },
    { label: 'Great Vibes',  value: "'Great Vibes', 'Pacifico', cursive" },
    { label: 'Bebas Neue',   value: "'Bebas Neue', 'Anton', sans-serif" },
    { label: 'Stencil',      value: "'Saira Stencil One', 'Teko', sans-serif" },
    { label: 'Luckiest Guy', value: "'Luckiest Guy', 'Fredoka', cursive" },
    { label: 'Black Ops',    value: "'Black Ops One', 'Teko', sans-serif" },
    { label: 'Chakra Petch', value: "'Chakra Petch', 'Rajdhani', sans-serif" },
    { label: 'Silkscreen',   value: "'Silkscreen', 'VT323', monospace" },
    { label: 'Russo One',    value: "'Russo One', 'Rajdhani', sans-serif" },
    { label: 'Lilita One',   value: "'Lilita One', 'Fredoka', sans-serif" },
];

const StyleSelect = ({ caption, value, options, onChange }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 68, flexShrink: 0, fontSize: 10.5, fontWeight: 500, color: 'var(--qs-text-dim)', fontFamily: 'var(--qs-font)' }}>
            {caption}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
            <SelectField
                value={value ?? ''}
                onChange={onChange}
                options={options.map(o => ({ value: o.id ?? o.value, label: tx(o.label) }))}
            />
        </div>
    </label>
);

const swatch = (theme) => ({
    width: 44, height: 30, borderRadius: 'var(--qs-radius)', overflow: 'hidden', flexShrink: 0,
    background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
    position: 'relative',
    padding: 0,
});

const ColorPick = ({ value, onChange, caption }) => (
    <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--qs-radius)', background: value, border: '1px solid var(--qs-line-strong)', overflow: 'hidden' }}>
            <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)}
                style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--qs-text-dim)', fontFamily: 'var(--qs-font)' }}>{caption}</span>
    </label>
);

// ── Main panel ─────────────────────────────────────────────────────────────
const ThemePanel = ({ theme, onApply, onChange, onInstallPack, onClose, isOwner = false }) => {
    useI18n();
    const visibleThemes = getVisibleThemes({ isOwner });
    const visibleBackdrops = getVisibleBackdrops({ isOwner });
    const t = theme ?? visibleThemes[0] ?? THEMES[0];
    const set = (changes) => onChange?.(changes);
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
                <span className="qs-floating-title">{tx('Theme')}</span>
                <IconButton size="sm" variant="ghost" title={tx('Close')} onClick={onClose}>
                    <X size={14} />
                </IconButton>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Theme packs (one-click look + scene) ── */}
                {onInstallPack && (
                    <div>
                        <div className="qs-subhead">{tx('Library — install a look')}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {THEME_PACKS.map(pack => (
                                <button
                                    key={pack.id}
                                    type="button"
                                    onClick={() => onInstallPack(pack)}
                                    title={tx('Install {name}', { name: pack.name })}
                                    className="qs-scene-row"
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 8px', textAlign: 'left', cursor: 'pointer',
                                        background: 'var(--qs-raise)', border: '1px solid var(--qs-line)',
                                        borderRadius: 'var(--qs-radius)',
                                    }}
                                >
                                    <span style={{ width: 28, height: 28, borderRadius: 'var(--qs-radius)', flexShrink: 0, background: packGradient(pack) }} />
                                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--qs-text)', fontFamily: 'var(--qs-font)' }}>{pack.name}</span>
                                        <span style={{ fontSize: 10, color: 'var(--qs-text-dim)', fontFamily: 'var(--qs-font)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pack.tagline}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Starter themes ── */}
                <div>
                    <div className="qs-subhead">{tx('Themes')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {visibleThemes.map(th => {
                            const tier = getThemeTier(th.id);
                            const isPro = tier === 'pro';
                            return (
                                <div
                                    key={th.id}
                                    title={th.name}
                                    onClick={() => onApply?.(th.id)}
                                    style={{
                                        ...swatch(th),
                                        cursor: 'pointer',
                                        border: t.id === th.id ? '2px solid var(--qs-accent)' : '2px solid var(--qs-line-strong)',
                                        boxShadow: t.id === th.id ? '0 0 0 1px var(--qs-accent-line)' : 'none',
                                    }}
                                >
                                    {isPro && (
                                        <span style={{
                                            position: 'absolute', right: 2, bottom: 2,
                                            padding: '1px 3px', borderRadius: 3,
                                            background: 'rgba(13, 14, 13, 0.85)',
                                            color: '#ff9679',
                                            fontSize: 7.5, fontWeight: 700, fontFamily: 'var(--qs-font)',
                                            letterSpacing: '0.04em', lineHeight: 1.1,
                                            pointerEvents: 'none',
                                        }}>
                                            PRO
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Colors ── */}
                <div>
                    <div className="qs-subhead">{tx('Colors')}</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <ColorPick value={t.accent} onChange={v => set({ accent: v })} caption={tx('Accent')} />
                        <ColorPick value={t.accent2} onChange={v => set({ accent2: v })} caption={tx('Accent 2')} />
                        <ColorPick value={t.textColor} onChange={v => set({ textColor: v })} caption={tx('Text')} />
                        <ColorPick value={t.panelColor} onChange={v => set({ panelColor: v })} caption={tx('Panel')} />
                    </div>
                </div>

                {/* ── Font ── */}
                <div>
                    <div className="qs-subhead">{tx('Font')}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {FONTS.map(f => (
                            <SegmentButton
                                key={f.label}
                                size="sm"
                                active={t.fontFamily === f.value}
                                onClick={() => set({ fontFamily: f.value })}
                                style={{ flex: '1 0 44%', fontFamily: f.value }}
                            >
                                {f.label}
                            </SegmentButton>
                        ))}
                    </div>
                </div>

                {/* ── Corner radius ── */}
                <div>
                    <div className="qs-subhead">{tx('Corner radius')}</div>
                    <Slider
                        value={t.cornerRadius ?? 8}
                        min={0}
                        max={24}
                        step={1}
                        unit="px"
                        aria-label={tx('Corner radius')}
                        onChange={v => set({ cornerRadius: v })}
                    />
                </div>

                {/* ── Style kit: the graphics token-authored elements pick up ── */}
                <div>
                    <div className="qs-subhead">{tx('Graphics')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <StyleSelect caption={tx('Cam frame')} value={t.frameStyle} options={FRAME_STYLES} onChange={v => set({ frameStyle: v })} />
                        <StyleSelect caption={tx('Backdrop')} value={t.backdrop ?? 'bokeh'} options={visibleBackdrops} onChange={v => set({ backdrop: v })} />
                        <StyleSelect caption={tx('Headline')} value={t.textFx ?? 'plain'} options={TEXT_FX} onChange={v => set({ textFx: v })} />
                        <StyleSelect caption={tx('Lower 3rd')} value={t.lowerThird ?? 'panel'} options={LOWER_THIRDS} onChange={v => set({ lowerThird: v })} />
                        <StyleSelect caption={tx('Head font')} value={t.displayFont ?? ''} options={DISPLAY_FONTS} onChange={v => set({ displayFont: v || undefined })} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ThemePanel;
