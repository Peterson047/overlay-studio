import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getTheme } from '../theme/themes';
import { getKitTier } from '../theme/entitlements';
import { TEMPLATE_CATEGORIES } from '../scenes/starterLayouts';
import { sceneHoles } from './graphics';
import { bgToStyle } from './BackgroundPanel';
import CameraFrame, { DEFAULT_CAM_STYLE } from './CameraFrame';
import ElementRenderer from './ElementRenderer';
import { Badge, Button, IconButton, SegmentButton, TextField } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

const MotionDiv = motion.div;

// Layouts gallery — each card is a LAYOUT (a "show": a named container of
// scenes). Switching a layout makes it active and loads its active scene.
// Thumbnails render the scene for real — the same element renderers at the
// OBS 1920×1080 size, scaled down to the card — so they look like the overlay
// instead of a wireframe. ‹ › on the card flips through every scene in the layout.

const BASE_W = 1920;
const BASE_H = 1080;
const CAM_LABELS = { faceCam: 'CAM', handCam: 'HAND', roomCam: 'ROOM' };

// Static mini overlay. Mounts the real elements only once the card scrolls into
// view (a gallery has a dozen-plus of these, some with timers and animations).
// `fallbackTheme` covers starter scenes, which carry the theme on the starter
// (themeId) rather than in each snapshot.
const Thumb = ({ snapshot = {}, fallbackTheme }) => {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
        ro.observe(el);
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
        io.observe(el);
        return () => { ro.disconnect(); io.disconnect(); };
    }, []);

    const theme = getTheme(snapshot.theme ?? fallbackTheme);
    const vis = snapshot.boxVisibility ?? {};
    const cams = Object.entries(snapshot.boxes ?? {}).filter(([id]) => vis[id] && CAM_LABELS[id]);
    const els = snapshot.elements ?? [];
    const shown = els.filter(e => !e.hidden && e.box);
    const mood = els.find(e => e.type === 'moodring' && !e.hidden)?.mood ?? 'chill';
    const scale = width / BASE_W;
    const holes = sceneHoles(snapshot, theme);

    return (
        <div ref={ref} style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 'var(--qs-radius)', overflow: 'hidden',
            border: '1px solid var(--qs-line)',
            background: 'var(--qs-bg)',
            ...bgToStyle(snapshot.background),
        }}>
            {seen && width > 0 && (
                <div aria-hidden="true" style={{
                    position: 'absolute', top: 0, left: 0, width: BASE_W, height: BASE_H,
                    transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none',
                }}>
                    {cams.map(([id, b]) => {
                        const cs = snapshot.camStyles?.[id] ?? DEFAULT_CAM_STYLE;
                        return (
                            <div key={id} style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
                                <CameraFrame frame={cs.frame} radius={cs.radius} accent={cs.accent ?? theme.accent} accent2={cs.accent2 ?? theme.accent2}>
                                    {/* stand-in for the webcam OBS shows through the frame */}
                                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontFamily: 'var(--qs-mono)', fontSize: 40, letterSpacing: 6, color: 'rgba(255,255,255,0.28)' }}>{CAM_LABELS[id]}</span>
                                    </div>
                                </CameraFrame>
                            </div>
                        );
                    })}
                    {shown.map((e, i) => (
                        <div key={e.id} style={{
                            position: 'absolute', left: `${e.box.x}%`, top: `${e.box.y}%`, width: `${e.box.w}%`, height: `${e.box.h}%`,
                            overflow: 'hidden', zIndex: 100 + (els.length - 1 - i),
                        }}>
                            <ElementRenderer element={e} theme={theme} mood={mood} editMode={false} preview holes={e.type === 'backdrop' ? holes : undefined} />
                        </div>
                    ))}
                </div>
            )}
            {cams.length === 0 && shown.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--qs-text-faint)', fontSize: 10, fontFamily: 'var(--qs-font)' }}>{tx('Empty')}</div>
            )}
        </div>
    );
};

const PagerBtn = ({ onClick, title, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        style={{
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, padding: 0, cursor: 'pointer',
            background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'var(--qs-text)', transition: 'background 0.1s',
        }}
    >
        {children}
    </button>
);

// Thumbnail with a scene pager — shows one scene's wireframe at a time and lets
// you flip through every scene in the layout without opening it. Clicking the
// thumbnail itself still triggers the card action (open / add).
const ScenePreview = ({ scenes = [], startIndex = 0, theme, onOpen, openTitle, children }) => {
    const [idx, setIdx] = useState(startIndex);
    const n = scenes.length;
    const i = n > 0 ? Math.min(Math.max(idx, 0), n - 1) : 0;
    const scene = scenes[i];
    const step = (d) => setIdx(((i + d) % n + n) % n);

    return (
        <div style={{ position: 'relative', cursor: onOpen ? 'pointer' : 'inherit' }} onClick={onOpen} title={openTitle}>
            <Thumb snapshot={scene?.snapshot} fallbackTheme={theme} />
            {/* Scene strip: name + ‹ i/n › pager over a bottom scrim */}
            <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                padding: '12px 6px 5px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.82))',
                borderRadius: '0 0 var(--qs-radius) var(--qs-radius)',
            }}>
                <span style={{ fontSize: 10, fontWeight: 500, fontFamily: 'var(--qs-font)', color: 'var(--qs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scene?.name ?? '—'}
                </span>
                {n > 1 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <PagerBtn onClick={() => step(-1)} title={tx('Previous scene')}><ChevronLeft size={11} /></PagerBtn>
                        <span style={{ fontSize: 9.5, fontFamily: 'var(--qs-mono)', color: 'var(--qs-text-dim)', minWidth: 22, textAlign: 'center' }}>{i + 1}/{n}</span>
                        <PagerBtn onClick={() => step(1)} title={tx('Next scene')}><ChevronRight size={11} /></PagerBtn>
                    </span>
                )}
            </div>
            {children}
        </div>
    );
};

// Shared card shell for the list pane. Clicking selects; the side panel then
// shows the big preview and the Open / Use action.
const Card = ({ active, selected, onSelect, children }) => {
    const [hover, setHover] = useState(false);
    const borderColor = selected
        ? 'var(--qs-accent-line)'
        : active
            ? 'rgba(255, 121, 86, 0.45)'
            : hover
                ? 'var(--qs-line-strong)'
                : 'var(--qs-line)';
    return (
        <div
            onClick={onSelect}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: 6, borderRadius: 'var(--qs-radius-lg)', cursor: 'pointer',
                background: selected ? 'var(--qs-accent-soft)' : hover ? 'var(--qs-raise-hover)' : 'var(--qs-raise)',
                border: `1px solid ${borderColor}`,
                boxShadow: selected ? '0 0 0 1px var(--qs-accent-line)' : 'none',
                transition: 'background 0.12s, border-color 0.12s',
            }}
        >
            {children(hover)}
        </div>
    );
};

const ActiveBadge = () => (
    <span style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 3,
        background: 'var(--qs-accent)', borderRadius: 5, padding: '2px 6px',
        fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--qs-font)', color: '#fff',
    }}>
        <Check size={10} /> {tx('Active')}
    </span>
);

const FreeKitBadge = () => (
    <span style={{
        position: 'absolute', top: 6, right: 6,
        background: 'rgba(13, 14, 13, 0.88)', border: '1px solid rgba(74, 222, 128, 0.5)', color: 'var(--qs-success)',
        borderRadius: 5, padding: '2px 6px',
        fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--qs-font)', letterSpacing: '0.04em',
    }}>
        {tx('FREE')}
    </span>
);

const ProKitBadge = () => (
    <span style={{
        position: 'absolute', top: 6, right: 6,
        background: 'rgba(13, 14, 13, 0.88)',
        border: '1px solid var(--qs-accent-line)',
        color: '#ff9679',
        borderRadius: 5, padding: '2px 6px',
        fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--qs-font)', letterSpacing: '0.04em',
    }}>
        PRO
    </span>
);

// Templates open on their busiest scene, so the component-rich showcases lead
// with the wheel / pet / goals. Ties keep the first scene: gameplay scenes are
// transparent (the game shows through in OBS) and read as empty in a thumbnail.
const richestScene = (scenes = []) => scenes.reduce((best, sc, i) => {
    const s = sc.snapshot ?? {};
    const vis = s.boxVisibility ?? {};
    const score = (s.elements ?? []).filter(e => !e.hidden).length + 2 * Object.keys(s.boxes ?? {}).filter(id => vis[id]).length;
    return score > best.score ? { i, score } : best;
}, { i: 0, score: -1 }).i;

const startSceneOf = (kind, item) => {
    const scenes = item.scenes ?? [];
    if (kind === 'mine') return Math.max(0, scenes.findIndex(s => s.id === item.activeSceneId));
    // Style-kit packs lead with their animated Starting Soon screen.
    return item.kit ? 0 : richestScene(scenes);
};

const LayoutCard = ({ layout, active, selected, onSelect, onRename, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(layout.name);
    const [confirmDel, setConfirmDel] = useState(false);

    const commitName = () => { onRename(layout.id, name); setEditing(false); };
    const scenes = layout.scenes ?? [];

    return (
        <Card active={active} selected={selected} onSelect={onSelect}>{() => (<>
            <ScenePreview scenes={scenes} startIndex={startSceneOf('mine', layout)}>
                {active && <ActiveBadge />}
            </ScenePreview>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24, padding: '0 2px' }} onClick={e => e.stopPropagation()}>
                {editing ? (
                    <TextField
                        autoFocus
                        value={name}
                        onChange={setName}
                        onBlur={commitName}
                        onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(layout.name); setEditing(false); } }}
                    />
                ) : (
                    <span
                        onClick={() => setEditing(true)}
                        title={tx('Click to rename')}
                        style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--qs-text)', fontWeight: 600, fontFamily: 'var(--qs-font)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {layout.name}
                    </span>
                )}
                {confirmDel ? (
                    <Button variant="danger" size="sm" onClick={() => onDelete(layout.id)} title={tx('Click to confirm delete')}>
                        {tx('Delete?')}
                    </Button>
                ) : (
                    <IconButton size="sm" variant="ghost" danger onClick={() => setConfirmDel(true)} title={tx('Delete layout')}>
                        <Trash2 size={12} />
                    </IconButton>
                )}
            </div>
        </>)}</Card>
    );
};

// A starter is a ready-made template (not yet a saved layout). Adding it builds
// a real, editable layout from its scenes.
const StarterCard = ({ starter, selected, onSelect }) => {
    const isPro = getKitTier(starter) === 'pro';
    return (
        <Card selected={selected} onSelect={onSelect}>{() => (<>
            <ScenePreview scenes={starter.scenes} startIndex={startSceneOf('templates', starter)} theme={starter.themeId}>
                {starter.isNew && (
                    <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(250,204,21,0.92)', color: '#1a1405', borderRadius: 5, padding: '2px 6px', fontSize: 9, fontFamily: 'var(--qs-font)', fontWeight: 700 }}>{tx('New')}</span>
                )}
                {isPro ? <ProKitBadge /> : <FreeKitBadge />}
            </ScenePreview>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 2px 2px' }}>
                <span style={{ fontSize: 12, color: 'var(--qs-text)', fontWeight: 600, fontFamily: 'var(--qs-font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {starter.name}
                </span>
                <span title={starter.tagline} style={{ fontSize: 10.5, color: 'var(--qs-text-dim)', fontFamily: 'var(--qs-font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {starter.tagline}
                </span>
            </div>
        </>)}</Card>
    );
};

// Side panel: big preview of the selected layout/template, its scenes as a
// 2-column grid to flip the big preview, and the primary action.
const DetailPanel = ({ kind, item, active, onPrimary }) => {
    const scenes = item.scenes ?? [];
    const [idx, setIdx] = useState(() => startSceneOf(kind, item));
    const i = Math.min(idx, Math.max(0, scenes.length - 1));
    const theme = kind === 'templates' ? item.themeId : undefined;
    const isPro = kind === 'templates' && getKitTier(item) === 'pro';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            <div style={{ position: 'relative' }}>
                <Thumb snapshot={scenes[i]?.snapshot} fallbackTheme={theme} />
                {active && <ActiveBadge />}
                {isPro ? <ProKitBadge /> : <FreeKitBadge />}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--qs-font)', color: 'var(--qs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        {isPro && <Badge tone="accent">PRO</Badge>}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--qs-font)', color: 'var(--qs-text-dim)', marginTop: 3 }}>
                        {scenes.length} {scenes.length === 1 ? tx('scene') : tx('scenes')}{item.tagline ? ` · ${item.tagline}` : ''}
                    </div>
                </div>
                <Button variant="primary" onClick={onPrimary}>
                    {kind === 'templates' ? <><Plus size={13} /> {tx('Use template')}</> : <><Check size={13} /> {active ? tx('Reload') : tx('Open')}</>}
                </Button>
            </div>

            {scenes.length > 1 && (
                <>
                    <div className="qs-subhead" style={{ marginBottom: 0 }}>{tx('Scenes')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                        {scenes.map((sc, j) => (
                            <button
                                key={sc.id ?? j}
                                type="button"
                                onClick={() => setIdx(j)}
                                style={{
                                    display: 'flex', flexDirection: 'column', gap: 4, padding: 5, textAlign: 'left',
                                    borderRadius: 'var(--qs-radius)', cursor: 'pointer',
                                    background: j === i ? 'var(--qs-accent-soft)' : 'var(--qs-raise)',
                                    border: `1px solid ${j === i ? 'var(--qs-accent-line)' : 'var(--qs-line)'}`,
                                }}
                            >
                                <Thumb snapshot={sc.snapshot} fallbackTheme={theme} />
                                <span style={{ fontSize: 10.5, fontWeight: 500, fontFamily: 'var(--qs-font)', color: j === i ? 'var(--qs-text)' : 'var(--qs-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                                    {sc.name ?? `${tx('Scene')} ${j + 1}`}
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const TabBtn = ({ active, onClick, children, count }) => (
    <SegmentButton active={active} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>{children}</span>
        <Badge tone={active ? 'accent' : 'neutral'}>{count}</Badge>
    </SegmentButton>
);

const LIST_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 };

// Accent-insensitive search over name, tagline and tags.
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matchesQuery = (st, q) => !q || fold(`${st.name} ${st.tagline} ${(st.tags || []).join(' ')}`).includes(q);

const LayoutGallery = ({ layouts = [], activeLayoutId, starters = [], onAddStarter, onClose, onCreate, onSwitch, onRename, onDelete }) => {
    useI18n();
    const [newName, setNewName] = useState('');
    const hasStarters = starters.length > 0 && !!onAddStarter;
    // Land on your own layouts once you have some; first-timers see templates.
    const [tab, setTab] = useState(layouts.length > 0 || !hasStarters ? 'mine' : 'templates');
    const [selectedId, setSelectedId] = useState({
        mine: activeLayoutId ?? layouts[0]?.id,
        // Open on a free template, so the first preview is one anyone can save.
        templates: (starters.find(st => getKitTier(st) !== 'pro') ?? starters[0])?.id,
    });
    const [category, setCategory] = useState('all');
    const [price, setPrice] = useState('all'); // all | free | pro
    const [query, setQuery] = useState('');
    const [narrow, setNarrow] = useState(() => (
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 860px)').matches
            : false
    ));

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mq = window.matchMedia('(max-width: 860px)');
        const update = (e) => setNarrow(e.matches);
        mq.addEventListener?.('change', update);
        return () => mq.removeEventListener?.('change', update);
    }, []);

    useEffect(() => {
        if (!onClose) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const create = () => { onCreate(newName); setNewName(''); };

    const q = fold(query.trim());
    const byPrice = (st) => price === 'all' || (getKitTier(st) === 'pro') === (price === 'pro');
    const inCategory = (st, cat) => cat === 'all' || (cat === 'new' ? st.isNew : st.tags?.includes(cat));
    const priced = starters.filter(st => byPrice(st) && matchesQuery(st, q));
    // Free first inside every view, so the no-cost options are always on top.
    const shownStarters = priced.filter(st => inCategory(st, category))
        .sort((a, b) => (getKitTier(a) === 'pro') - (getKitTier(b) === 'pro'));
    const freeCount = starters.filter(st => getKitTier(st) !== 'pro').length;
    const list = tab === 'mine' ? layouts : shownStarters;
    const selected = list.find(x => x.id === selectedId[tab]) ?? list[0] ?? null;
    const select = (id) => setSelectedId(s => ({ ...s, [tab]: id }));
    const primary = () => {
        if (!selected) return;
        if (tab === 'templates') { onAddStarter(selected); setTab('mine'); }
        else onSwitch(selected.id);
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? 10 : 24,
            }}
        >
            <MotionDiv
                onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                role="dialog" aria-modal="true" aria-label={tx('Layouts and templates')}
                className="qs-floating-panel"
                style={{
                    width: 'min(1120px, 100%)', height: 'min(760px, 92vh)', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header — tabs */}
                <div className="qs-floating-head" style={{ flexWrap: 'wrap', gap: 10, padding: '10px 12px 10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} count={layouts.length}>{tx('Your layouts')}</TabBtn>
                        {hasStarters && <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')} count={starters.length}>{tx('Templates')}</TabBtn>}
                    </div>
                    <IconButton size="sm" variant="ghost" onClick={onClose} title={tx('Close')}>
                        <X size={16} />
                    </IconButton>
                </div>

                {tab === 'mine' && (
                    /* New layout — snapshots the current canvas as its first scene */
                    <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--qs-line)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <TextField
                                value={newName}
                                onChange={setNewName}
                                onKeyDown={e => { if (e.key === 'Enter') create(); }}
                                placeholder={tx('New layout name (e.g. Valorant Stream)…')}
                            />
                        </div>
                        <Button
                            variant="soft"
                            onClick={create}
                            title={tx('Create a new layout from the current canvas')}
                        >
                            <Plus size={13} /> {tx('New layout')}
                        </Button>
                    </div>
                )}

                {tab === 'templates' && (
                    /* Search, price and category — free kits are one click away */
                    <div style={{ display: 'grid', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--qs-line)' }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
                                <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--qs-text-faint)', pointerEvents: 'none', zIndex: 1 }} />
                                <TextField
                                    value={query}
                                    onChange={setQuery}
                                    placeholder={tx('Search templates…')}
                                    aria-label={tx('Search templates…')}
                                    style={{ paddingLeft: 30, height: 36 }}
                                />
                            </div>
                            <div role="group" aria-label={tx('Price')} style={{ display: 'flex', gap: 4 }}>
                                {[
                                    { id: 'all', label: tx('All'), n: starters.length },
                                    { id: 'free', label: tx('Free'), n: freeCount },
                                    { id: 'pro', label: 'Pro', n: starters.length - freeCount },
                                ].map(opt => (
                                    <SegmentButton key={opt.id} active={price === opt.id} onClick={() => setPrice(opt.id)} style={{ height: 36, padding: '0 14px' }}>
                                        {opt.id === 'free' && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--qs-success)' }} />}
                                        {opt.label} <span style={{ opacity: 0.6 }}>{opt.n}</span>
                                    </SegmentButton>
                                ))}
                            </div>
                        </div>
                        <div role="group" aria-label={tx('Category')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[{ id: 'all', label: 'All' }, ...(starters.some(st => st.isNew) ? [{ id: 'new', label: 'New' }] : []), ...TEMPLATE_CATEGORIES].map(cat => {
                                const n = priced.filter(st => inCategory(st, cat.id)).length;
                                return (
                                    <SegmentButton key={cat.id} size="sm" active={category === cat.id} disabled={n === 0 && category !== cat.id} onClick={() => setCategory(cat.id)}>
                                        {tx(cat.label)} <span style={{ opacity: 0.6 }}>{n}</span>
                                    </SegmentButton>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Body — list (2 columns) | preview. On narrow viewports, preview stays on top above the list. */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: narrow ? 'column' : 'row', overflowY: narrow ? 'auto' : 'hidden' }}>
                    <div style={{ flex: narrow ? 'none' : '1 1 560px', minWidth: 0, maxHeight: narrow ? 'none' : '100%', overflowY: narrow ? 'visible' : 'auto', padding: 14, boxSizing: 'border-box', order: narrow ? 2 : 0 }}>
                        {tab === 'templates' && list.length === 0 && starters.length > 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--qs-text-dim)', fontSize: 13, fontFamily: 'var(--qs-font)', lineHeight: 1.7, padding: '60px 20px' }}>
                                {tx('No templates match these filters.')}<br />
                                <button type="button" className="qs-inline-link" onClick={() => { setQuery(''); setPrice('all'); setCategory('all'); }}>{tx('Clear filters')}</button>
                            </div>
                        ) : list.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--qs-text-dim)', fontSize: 12, fontFamily: 'var(--qs-font)', lineHeight: 1.8, padding: '60px 20px' }}>
                                {tx('No saved layouts yet.')}<br />
                                {hasStarters && <>{tx('Pick one from')} <button type="button" onClick={() => setTab('templates')} className="qs-inline-link">{tx('Templates')}</button>, {tx('or name')}</>}
                                {!hasStarters && tx('Name')} {tx('one above and hit')} <span style={{ color: 'var(--qs-accent-text)', fontWeight: 600 }}>{tx('New layout')}</span> {tx('to capture the current canvas.')}
                            </div>
                        ) : (
                            <div style={LIST_GRID}>
                                {tab === 'templates'
                                    ? shownStarters.map(st => <StarterCard key={st.id} starter={st} selected={st.id === selected?.id} onSelect={() => select(st.id)} />)
                                    : layouts.map(l => (
                                        <LayoutCard
                                            key={l.id}
                                            layout={l}
                                            active={l.id === activeLayoutId}
                                            selected={l.id === selected?.id}
                                            onSelect={() => select(l.id)}
                                            onRename={onRename}
                                            onDelete={onDelete}
                                        />
                                    ))}
                            </div>
                        )}
                    </div>

                    {selected && (
                        <div style={{ flex: narrow ? 'none' : '0 0 380px', minWidth: 0, maxHeight: narrow ? 'none' : '100%', overflowY: narrow ? 'visible' : 'auto', padding: 16, boxSizing: 'border-box', borderLeft: narrow ? 'none' : '1px solid var(--qs-line)', borderBottom: narrow ? '1px solid var(--qs-line)' : 'none', background: 'rgba(255,255,255,0.015)', order: narrow ? 1 : 0 }}>
                            <DetailPanel
                                key={`${tab}:${selected.id}`}
                                kind={tab}
                                item={selected}
                                active={tab === 'mine' && selected.id === activeLayoutId}
                                onPrimary={primary}
                            />
                        </div>
                    )}
                </div>
            </MotionDiv>
        </div>
    );
};

export default LayoutGallery;
