import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Layers, Pencil, Plus, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { ADD_SECTIONS, BUILTIN_LAYERS, ELEMENT_TYPE_MAP, SHAPE_ELEMENTS } from './elementCatalog';

const MotionDiv = motion.div;

const TRANSITION_OPTIONS = [
    { value: 'fade', label: 'Fade' },
    { value: 'fade-dip', label: 'Fade dip' },
    { value: 'slide-left', label: 'Slide left' },
    { value: 'slide-right', label: 'Slide right' },
    { value: 'slide-up', label: 'Slide up' },
    { value: 'wipe', label: 'Wipe' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'none', label: 'Cut (none)' },
];

const TRANSITION_DURATIONS = [200, 400, 700, 1000];

// ── Sub-components ────────────────────────────────────────────────────────────

const Divider = () => (
    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
);

const IconBtn = ({ onClick, title, danger, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        style={{
            background: 'none', border: 'none', padding: '2px 2px', cursor: 'pointer', flexShrink: 0,
            color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', borderRadius: 4,
            transition: 'color 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = danger ? '#f87171' : 'rgba(255,255,255,0.7)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.28)'}
    >
        {children}
    </button>
);

// One row in the unified layers list. Every layer gets reorder (↑↓) + remove;
// elements additionally get an eye (hide/show without removing).
// Toolbox item: icon on a soft tinted tile with a plain label under it. Two per
// row; the label wraps between words only, so nothing is clipped or split.
const AddCard = ({ label, color, preview, onClick }) => (
    <button
        onClick={onClick}
        title={`Add ${label}`}
        style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 6,
            minWidth: 0, padding: '8px 4px 7px',
            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
            cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s, transform 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${color}14`; e.currentTarget.style.borderColor = `${color}55`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'none'; }}
    >
        <span style={{
            width: 38, height: 30, flexShrink: 0, borderRadius: 8, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            background: `linear-gradient(145deg, ${color}26, ${color}0a)`, boxShadow: `inset 0 0 0 1px ${color}2e`,
        }}>
            {preview}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,0.75)', lineHeight: 1.2, textAlign: 'center', fontFamily: 'inter, system-ui, sans-serif', wordBreak: 'keep-all', overflowWrap: 'normal', hyphens: 'none' }}>
            {label}
        </span>
    </button>
);

// Shapes are self-explanatory — icon-only, label on hover.
const ShapeBtn = ({ label, color, preview, onClick }) => (
    <button
        onClick={onClick}
        title={`Add ${label}`}
        aria-label={`Add ${label}`}
        style={{
            height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', color,
            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${color}14`; e.currentTarget.style.borderColor = `${color}55`; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
        <span style={{ display: 'flex', transform: 'scale(0.85)' }}>{preview}</span>
    </button>
);

const ToolboxLabel = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', fontFamily: 'inter, system-ui, sans-serif', padding: '10px 4px 6px' }}>
        {children}
    </div>
);

const TOOL_GRID = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5, padding: '0 2px' };

// ── Scenes (dropdown) ─────────────────────────────────────────────────────────

const SceneDot = ({ color }) => (
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}aa` }} />
);

// Scenes belong to the ACTIVE layout. This switches between them, saves the
// current canvas as a new scene, updates a scene to match the canvas, or
// deletes one. The "Layouts" link opens the gallery to switch which show (layout)
// is active.
const ScenesDropdown = ({
    layoutName,
    scenes = [],
    activeSceneId,
    onSwitchScene,
    onSaveScene,
    onUpdateScene,
    onRenameScene,
    onDeleteScene,
    onOpenLayouts,
    sceneTransition,
    onTransitionChange,
}) => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveDraft, setSaveDraft] = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameDraft, setRenameDraft] = useState('');

    const active = scenes.find(s => s.id === activeSceneId) ?? null;
    const transition = sceneTransition ?? { type: 'fade', durationMs: 350 };
    const transitionType = transition.type ?? 'fade';
    const transitionMs = Math.max(150, Math.min(1200, Number(transition.durationMs ?? 350)));
    const showTransitionControls = !!(onTransitionChange || sceneTransition);

    const submitSaveScene = (e) => {
        e?.preventDefault?.();
        if (!onSaveScene) return;
        const name = saveDraft.trim();
        onSaveScene(name || undefined);
        setSaveDraft('');
        setSaving(false);
    };

    const submitRenameScene = (sceneId) => {
        if (!onRenameScene) { setRenamingId(null); return; }
        const next = renameDraft.trim();
        const current = scenes.find(s => s.id === sceneId);
        if (next && next !== current?.name) {
            onRenameScene(sceneId, next);
        }
        setRenamingId(null);
    };

    return (
        <div style={{ padding: '0 2px' }}>
            {/* Header: section label + layout (show) switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 8px 3px' }}>
                <span style={{ fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                    {layoutName ? `Scenes · ${layoutName}` : 'Scenes'}
                </span>
                {onSaveScene && (
                    <button
                        onClick={() => { setOpen(true); setSaving(true); setRenamingId(null); }}
                        title="Save current canvas as a new scene"
                        style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#a5b4fc', fontSize: 8.5, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0, padding: 0 }}
                    >
                        <Plus size={10} /> Save
                    </button>
                )}
                <button
                    onClick={onOpenLayouts}
                    title="Switch / manage layouts"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#ff7956', fontSize: 8.5, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0, padding: 0 }}
                >
                    <Layers size={10} /> Layouts
                </button>
            </div>

            {/* Trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 9px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.78)', cursor: 'pointer',
                    fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                }}
            >
                {active ? <SceneDot color="#ff7956" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />}
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>
                    {active ? active.name : (scenes.length ? 'Choose a scene…' : 'No scenes yet')}
                </span>
                <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.5, flexShrink: 0 }} />
            </button>

            <AnimatePresence>
                {open && (
                    <MotionDiv
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{
                            marginTop: 4, padding: 4, borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                        }}>
                            {onSaveScene && saving && (
                                <form onSubmit={submitSaveScene} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px 5px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 }}>
                                    <input
                                        autoFocus
                                        value={saveDraft}
                                        onChange={e => setSaveDraft(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Escape') { setSaving(false); setSaveDraft(''); } }}
                                        placeholder="Scene name…"
                                        style={{
                                            flex: 1, minWidth: 0, height: 24, padding: '0 7px', borderRadius: 5,
                                            background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(165,180,252,0.4)',
                                            color: '#fff', fontSize: 10, fontFamily: 'inter, system-ui, sans-serif', outline: 'none',
                                        }}
                                    />
                                    <IconBtn onClick={submitSaveScene} title="Confirm save scene"><Check size={11} /></IconBtn>
                                    <IconBtn onClick={(e) => { e.preventDefault(); setSaving(false); setSaveDraft(''); }} title="Cancel" danger><X size={11} /></IconBtn>
                                </form>
                            )}
                            {scenes.length === 0 && (
                                <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', padding: '6px 7px', lineHeight: 1.5 }}>
                                    {onSaveScene ? 'No scenes here yet — save this canvas as your first scene.' : 'No scenes here yet — hit Save Scene in the top bar.'}
                                </div>
                            )}
                            {scenes.map(s => {
                                const isActive = s.id === activeSceneId;
                                const isRenaming = renamingId === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => { if (!isRenaming) { onSwitchScene?.(s.id); setOpen(false); } }}
                                        title={isRenaming ? undefined : 'Switch to this scene'}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
                                            borderRadius: 6, cursor: isRenaming ? 'default' : 'pointer',
                                            background: isActive ? 'rgba(255,121,86,0.16)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { if (!isActive && !isRenaming) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                        onMouseLeave={e => { if (!isActive && !isRenaming) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <SceneDot color={isActive ? '#ff7956' : '#64748b'} />
                                        {isRenaming ? (
                                            <>
                                                <input
                                                    autoFocus
                                                    value={renameDraft}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => setRenameDraft(e.target.value)}
                                                    onKeyDown={e => {
                                                        e.stopPropagation();
                                                        if (e.key === 'Enter') submitRenameScene(s.id);
                                                        if (e.key === 'Escape') setRenamingId(null);
                                                    }}
                                                    style={{
                                                        flex: 1, minWidth: 0, height: 22, padding: '0 6px', borderRadius: 4,
                                                        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.25)',
                                                        color: '#fff', fontSize: 10, fontFamily: 'inter, system-ui, sans-serif', outline: 'none',
                                                    }}
                                                />
                                                <IconBtn onClick={(e) => { e.stopPropagation(); submitRenameScene(s.id); }} title="Save name"><Check size={10} /></IconBtn>
                                                <IconBtn onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} title="Cancel" danger><X size={10} /></IconBtn>
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)' }}>
                                                    {s.name}
                                                </span>
                                                {onRenameScene && (
                                                    <IconBtn onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameDraft(s.name ?? ''); setSaving(false); }} title="Rename scene"><Pencil size={10} /></IconBtn>
                                                )}
                                                {isActive && (
                                                    <IconBtn onClick={(e) => { e.stopPropagation(); onUpdateScene?.(s.id); }} title="Update this scene to match the current canvas"><RotateCw size={10} /></IconBtn>
                                                )}
                                                <IconBtn onClick={(e) => { e.stopPropagation(); onDeleteScene?.(s.id); }} title="Delete scene" danger><X size={11} /></IconBtn>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            {onSaveScene && !saving && (
                                <button
                                    type="button"
                                    onClick={() => { setSaving(true); setRenamingId(null); }}
                                    style={{
                                        marginTop: 2, padding: '5px 7px', borderRadius: 6, cursor: 'pointer',
                                        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)',
                                        color: '#a5b4fc', fontSize: 9.5, fontFamily: 'monospace',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                    }}
                                >
                                    <Plus size={10} /> Save current as scene
                                </button>
                            )}
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>

            {showTransitionControls && (
                <div style={{
                    marginTop: 5, padding: '6px 7px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 8.5, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>
                            Transition
                        </span>
                        <select
                            aria-label="Scene transition"
                            value={transitionType}
                            onChange={e => onTransitionChange?.({ ...transition, type: e.target.value, durationMs: transitionMs })}
                            style={{
                                flex: 1, minWidth: 0, height: 22, padding: '0 5px', borderRadius: 5,
                                background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'inter, system-ui, sans-serif', outline: 'none', cursor: 'pointer',
                            }}
                        >
                            {TRANSITION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value} style={{ background: '#0e0e18', color: '#fff' }}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {transitionType !== 'none' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                    type="range"
                                    aria-label="Transition duration"
                                    min={150}
                                    max={1200}
                                    step={50}
                                    value={transitionMs}
                                    onChange={e => onTransitionChange?.({ ...transition, type: transitionType, durationMs: Number(e.target.value) })}
                                    style={{ flex: 1, minWidth: 0, accentColor: '#ff7956', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: 9.5, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {transitionMs}ms
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 3 }}>
                                {TRANSITION_DURATIONS.map(ms => {
                                    const activeDur = transitionMs === ms;
                                    return (
                                        <button
                                            key={ms}
                                            onClick={() => onTransitionChange?.({ ...transition, type: transitionType, durationMs: ms })}
                                            style={{
                                                flex: 1, padding: '2px 0', borderRadius: 4, cursor: 'pointer',
                                                fontSize: 8.5, fontFamily: 'monospace',
                                                background: activeDur ? 'rgba(255,121,86,0.22)' : 'rgba(255,255,255,0.04)',
                                                border: activeDur ? '1px solid rgba(255,121,86,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                color: activeDur ? '#ff9d82' : 'rgba(255,255,255,0.48)',
                                            }}
                                        >
                                            {ms}ms
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Main panel ────────────────────────────────────────────────────────────────

const LayersPanel = ({
    // Built-in boxes (add on demand)
    boxVisibility,
    onAddBuiltin,
    // Elements
    onAddElement,
    onPlaceElement,
    // Scenes (of the active layout)
    layoutName,
    scenes = [],
    activeSceneId,
    onSwitchScene,
    onSaveScene,
    onUpdateScene,
    onRenameScene,
    onDeleteScene,
    onOpenLayouts,
    sceneTransition,
    onTransitionChange,
    // Background / Theme / Reset
    onOpenBackground,
    onOpenTheme,
    onResetLayout,
}) => {
    const [addQuery, setAddQuery] = useState('');

    const availableBuiltins = BUILTIN_LAYERS.filter(l => !boxVisibility[l.id]);

    return (
        <MotionDiv
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            style={{
                position: 'absolute',
                left: 8, top: 8, bottom: 8,
                width: 'min(224px, calc(100% - 16px))',
                maxWidth: 'calc(100vw - 24px)',
                zIndex: 200,
                background: 'rgba(8,8,16,0.92)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* ── Header ── */}
            <div style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <span style={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 2.5, color: 'rgba(255,255,255,0.45)' }}>
                    Add to scene
                </span>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>

                {/* ── Scenes ── */}
                <ScenesDropdown
                    layoutName={layoutName}
                    scenes={scenes}
                    activeSceneId={activeSceneId}
                    onSwitchScene={onSwitchScene}
                    onSaveScene={onSaveScene}
                    onUpdateScene={onUpdateScene}
                    onRenameScene={onRenameScene}
                    onDeleteScene={onDeleteScene}
                    onOpenLayouts={onOpenLayouts}
                    sceneTransition={sceneTransition}
                    onTransitionChange={onTransitionChange}
                />
                {/* ── Toolbox — always open; current layers live in the strip under the canvas ── */}
                <div>
                            {/* Search — filters every section below */}
                            <div style={{ padding: '6px 2px 0' }}>
                                <input
                                    value={addQuery}
                                    onChange={e => setAddQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') setAddQuery(''); }}
                                    placeholder="Search elements…"
                                    style={{
                                        width: '100%', boxSizing: 'border-box', height: 30, padding: '0 10px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#fff', fontSize: 11, fontFamily: 'inter, system-ui, sans-serif', outline: 'none',
                                    }}
                                />
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'inter, system-ui, sans-serif', padding: '6px 4px 0' }}>
                                Click one, then click or drag on the canvas.
                            </div>
                            {(() => {
                                const q = addQuery.trim().toLowerCase();
                                const hit = (label) => !q || label.toLowerCase().includes(q);
                                const place = (type) => {
                                    // Arm placement (click/drag on canvas) if available, else instant add.
                                    if (onPlaceElement) onPlaceElement(type);
                                    else onAddElement(type);
                                   
                                    setAddQuery('');
                                };
                                const builtins = availableBuiltins.filter(l => hit(l.label));
                                const sections = ADD_SECTIONS
                                    .map(sec => ({ ...sec, items: sec.types.map(t => ELEMENT_TYPE_MAP[t]).filter(t => t && hit(t.label)) }))
                                    .filter(sec => sec.items.length);
                                const shapes = SHAPE_ELEMENTS.filter(t => hit(t.label));
                                const none = !builtins.length && !sections.length && !shapes.length;
                                return (
                                    <>
                                        {builtins.length > 0 && (
                                            <>
                                                <ToolboxLabel>Cameras & components</ToolboxLabel>
                                                <div style={TOOL_GRID}>
                                                    {builtins.map(l => (
                                                        <AddCard
                                                            key={l.id}
                                                            label={l.label}
                                                            color={l.color}
                                                            preview={<l.Icon size={16} color={l.color} />}
                                                            onClick={() => { onAddBuiltin(l.id); setAddQuery(''); }}
                                                        />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {sections.map(sec => (
                                            <div key={sec.title}>
                                                <ToolboxLabel>{sec.title}</ToolboxLabel>
                                                <div style={TOOL_GRID}>
                                                    {sec.items.map(t => (
                                                        <AddCard key={t.type} label={t.label} color={t.color} preview={t.preview} onClick={() => place(t.type)} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {shapes.length > 0 && (
                                            <>
                                                <ToolboxLabel>Shapes</ToolboxLabel>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5, padding: '0 2px' }}>
                                                    {shapes.map(t => (
                                                        <ShapeBtn key={t.type} label={t.label} color={t.color} preview={t.preview} onClick={() => place(t.type)} />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {none && (
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'inter, system-ui, sans-serif', padding: '14px 4px 4px', lineHeight: 1.5 }}>
                                                Nothing matches “{addQuery.trim()}”.
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                </div>

            </div>

            {/* ── Footer actions ── */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '8px 8px',
                display: 'flex', gap: 5, flexShrink: 0,
            }}>
                <button
                    onClick={onOpenTheme}
                    style={{
                        flex: 1, padding: '5px 0', borderRadius: 7,
                        background: 'rgba(255,121,86,0.14)', border: '1px solid rgba(255,121,86,0.3)',
                        color: '#ff7956', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                        cursor: 'pointer', transition: 'all 0.12s',
                    }}
                >
                    Theme
                </button>
                <button
                    onClick={onOpenBackground}
                    style={{
                        flex: 1, padding: '5px 0', borderRadius: 7,
                        background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)',
                        color: '#7dd3fc', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                        cursor: 'pointer', transition: 'all 0.12s',
                    }}
                >
                    BG
                </button>
                <button
                    onClick={onResetLayout}
                    style={{
                        flex: 1, padding: '5px 0', borderRadius: 7,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                        cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                    Reset
                </button>
            </div>
        </MotionDiv>
    );
};

export default LayersPanel;
