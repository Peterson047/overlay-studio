import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Layers, Pencil, Plus, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { ADD_SECTIONS, BUILTIN_LAYERS, ELEMENT_TYPE_MAP, SHAPE_ELEMENTS } from './elementCatalog';
import { Button, IconButton, SegmentButton, SelectField, Slider, TextField } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

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

const IconBtn = ({ onClick, title, danger, children }) => (
    <IconButton size="sm" variant="ghost" danger={danger} title={title} onClick={onClick}>
        {children}
    </IconButton>
);

// Toolbox item: icon on a soft tinted tile with a plain label under it. Two per
// row; the label wraps between words only, so nothing is clipped or split.
const AddCard = ({ label, title, color, preview, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className="qs-toolcard"
    >
        <span style={{
            width: 38, height: 30, flexShrink: 0, borderRadius: 'var(--qs-radius)', color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            background: `linear-gradient(145deg, ${color}26, ${color}0a)`, boxShadow: `inset 0 0 0 1px ${color}2e`,
        }}>
            {preview}
        </span>
        <span style={{
            fontSize: 10.5, fontWeight: 500, color: 'var(--qs-text-dim)', lineHeight: 1.2, textAlign: 'center',
            fontFamily: 'var(--qs-font)', wordBreak: 'keep-all', overflowWrap: 'normal', hyphens: 'none',
        }}>
            {label}
        </span>
    </button>
);

// Shapes are self-explanatory — icon-only, label on hover.
const ShapeBtn = ({ title, color, preview, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className="qs-shape-btn"
        style={{ color }}
    >
        <span style={{ display: 'flex', transform: 'scale(0.85)' }}>{preview}</span>
    </button>
);

const ToolboxLabel = ({ children }) => (
    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--qs-text-dim)', fontFamily: 'var(--qs-font)', padding: '12px 4px 6px' }}>
        {children}
    </div>
);

const TOOL_GRID = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5, padding: '0 2px' };

// ── Scenes (dropdown) ─────────────────────────────────────────────────────────

const SceneDot = ({ active }) => (
    <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: active ? 'var(--qs-accent)' : 'var(--qs-text-faint)',
        boxShadow: active ? '0 0 6px var(--qs-accent-line)' : 'none',
    }} />
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
    useI18n();
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '6px 4px 4px' }}>
                <span style={{
                    fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--qs-font)', color: 'var(--qs-text-faint)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
                }}>
                    {layoutName ? tx('Scenes · {name}', { name: layoutName }) : tx('Scenes')}
                </span>
                {onSaveScene && (
                    <button
                        type="button"
                        onClick={() => { setOpen(true); setSaving(true); setRenamingId(null); }}
                        title={tx('Save current canvas as a new scene')}
                        className="qs-inline-link"
                    >
                        <Plus size={11} /> {tx('Save')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onOpenLayouts}
                    title={tx('Switch / manage layouts')}
                    className="qs-inline-link qs-inline-link--accent"
                >
                    <Layers size={11} /> {tx('Layouts')}
                </button>
            </div>

            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="qs-scene-trigger"
            >
                {active
                    ? <SceneDot active />
                    : <span style={{ width: 6, height: 6, borderRadius: '50%', border: '1px solid var(--qs-line-strong)', flexShrink: 0 }} />}
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? 'var(--qs-text)' : 'var(--qs-text-dim)' }}>
                    {active ? active.name : (scenes.length ? tx('Choose a scene…') : tx('No scenes yet'))}
                </span>
                <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--qs-text-faint)', flexShrink: 0 }} />
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
                            marginTop: 5, padding: 5, borderRadius: 'var(--qs-radius)',
                            background: 'var(--qs-raised)', border: '1px solid var(--qs-line)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                        }}>
                            {onSaveScene && saving && (
                                <form onSubmit={submitSaveScene} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 2px 6px', borderBottom: '1px solid var(--qs-line)', marginBottom: 2 }}>
                                    <TextField
                                        autoFocus
                                        value={saveDraft}
                                        onChange={setSaveDraft}
                                        onKeyDown={e => { if (e.key === 'Escape') { setSaving(false); setSaveDraft(''); } }}
                                        placeholder={tx('Scene name…')}
                                        style={{ height: 26, fontSize: 11 }}
                                    />
                                    <IconBtn onClick={submitSaveScene} title={tx('Confirm save scene')}><Check size={12} /></IconBtn>
                                    <IconBtn onClick={(e) => { e.preventDefault(); setSaving(false); setSaveDraft(''); }} title={tx('Cancel')} danger><X size={12} /></IconBtn>
                                </form>
                            )}
                            {scenes.length === 0 && (
                                <div style={{ fontSize: 11, fontFamily: 'var(--qs-font)', color: 'var(--qs-text-faint)', padding: '6px 7px', lineHeight: 1.45 }}>
                                    {onSaveScene ? tx('No scenes here yet — save this canvas as your first scene.') : tx('No scenes here yet — hit Save Scene in the top bar.')}
                                </div>
                            )}
                            {scenes.map(s => {
                                const isActive = s.id === activeSceneId;
                                const isRenaming = renamingId === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => { if (!isRenaming) { onSwitchScene?.(s.id); setOpen(false); } }}
                                        title={isRenaming ? undefined : tx('Switch to this scene')}
                                        data-active={isActive || undefined}
                                        className="qs-scene-row"
                                        style={{ cursor: isRenaming ? 'default' : 'pointer' }}
                                    >
                                        <SceneDot active={isActive} />
                                        {isRenaming ? (
                                            <>
                                                <TextField
                                                    autoFocus
                                                    value={renameDraft}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={setRenameDraft}
                                                    onKeyDown={e => {
                                                        e.stopPropagation();
                                                        if (e.key === 'Enter') submitRenameScene(s.id);
                                                        if (e.key === 'Escape') setRenamingId(null);
                                                    }}
                                                    style={{ height: 24, fontSize: 11 }}
                                                />
                                                <IconBtn onClick={(e) => { e.stopPropagation(); submitRenameScene(s.id); }} title={tx('Save name')}><Check size={11} /></IconBtn>
                                                <IconBtn onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} title={tx('Cancel')} danger><X size={11} /></IconBtn>
                                            </>
                                        ) : (
                                            <>
                                                <span style={{
                                                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    fontSize: 11.5, fontFamily: 'var(--qs-font)', color: isActive ? 'var(--qs-text)' : 'var(--qs-text-dim)',
                                                }}>
                                                    {s.name}
                                                </span>
                                                {onRenameScene && (
                                                    <IconBtn onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameDraft(s.name ?? ''); setSaving(false); }} title={tx('Rename scene')}><Pencil size={11} /></IconBtn>
                                                )}
                                                {isActive && (
                                                    <IconBtn onClick={(e) => { e.stopPropagation(); onUpdateScene?.(s.id); }} title={tx('Update this scene to match the current canvas')}><RotateCw size={11} /></IconBtn>
                                                )}
                                                <IconBtn onClick={(e) => { e.stopPropagation(); onDeleteScene?.(s.id); }} title={tx('Delete scene')} danger><X size={11} /></IconBtn>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            {onSaveScene && !saving && (
                                <Button
                                    variant="soft"
                                    size="sm"
                                    block
                                    onClick={() => { setSaving(true); setRenamingId(null); }}
                                    style={{ marginTop: 4 }}
                                >
                                    <Plus size={11} /> {tx('Save current as scene')}
                                </Button>
                            )}
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>

            {showTransitionControls && (
                <div style={{
                    marginTop: 6, padding: 8, borderRadius: 'var(--qs-radius)',
                    background: 'var(--qs-raised)', border: '1px solid var(--qs-line)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 11, fontFamily: 'var(--qs-font)', color: 'var(--qs-text-dim)', flexShrink: 0 }}>
                            {tx('Transition')}
                        </span>
                        <SelectField
                            aria-label={tx('Scene transition')}
                            value={transitionType}
                            onChange={value => onTransitionChange?.({ ...transition, type: value, durationMs: transitionMs })}
                            options={TRANSITION_OPTIONS.map(opt => ({ value: opt.value, label: tx(opt.label) }))}
                            style={{ height: 26, fontSize: 11 }}
                        />
                    </div>
                    {transitionType !== 'none' && (
                        <>
                            <Slider
                                ariaLabel={tx('Transition duration')}
                                min={150}
                                max={1200}
                                step={50}
                                value={transitionMs}
                                displayValue={`${transitionMs}ms`}
                                onChange={ms => onTransitionChange?.({ ...transition, type: transitionType, durationMs: ms })}
                            />
                            <div style={{ display: 'flex', gap: 4 }}>
                                {TRANSITION_DURATIONS.map(ms => (
                                    <SegmentButton
                                        key={ms}
                                        size="sm"
                                        active={transitionMs === ms}
                                        onClick={() => onTransitionChange?.({ ...transition, type: transitionType, durationMs: ms })}
                                        title={`${ms} ms`}
                                        style={{ flex: 1, minWidth: 0 }}
                                    >
                                        {ms >= 1000 ? `${ms / 1000}s` : `.${ms / 100}s`}
                                    </SegmentButton>
                                ))}
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
    useI18n();
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
                background: 'var(--qs-panel)',
                border: '1px solid var(--qs-line)',
                borderRadius: 'var(--qs-radius-lg)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* ── Header ── */}
            <div style={{
                padding: '10px 12px 9px',
                borderBottom: '1px solid var(--qs-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--qs-font)', letterSpacing: '0.04em', color: 'var(--qs-text-dim)' }}>
                    {tx('Add to scene')}
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
                    <div style={{ padding: '8px 2px 0' }}>
                        <TextField
                            value={addQuery}
                            onChange={setAddQuery}
                            onKeyDown={e => { if (e.key === 'Escape') setAddQuery(''); }}
                            placeholder={tx('Search elements…')}
                        />
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--qs-text-faint)', fontFamily: 'var(--qs-font)', lineHeight: 1.35, padding: '6px 4px 0' }}>
                        {tx('Click one, then click or drag on the canvas.')}
                    </div>
                    {(() => {
                        const q = addQuery.trim().toLowerCase();
                        const hit = (label) => !q || label.toLowerCase().includes(q) || tx(label).toLowerCase().includes(q);
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
                                        <ToolboxLabel>{tx('Cameras & components')}</ToolboxLabel>
                                        <div style={TOOL_GRID}>
                                            {builtins.map(l => (
                                                <AddCard
                                                    key={l.id}
                                                    label={tx(l.label)}
                                                    title={tx('Add {name}', { name: tx(l.label) })}
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
                                        <ToolboxLabel>{tx(sec.title)}</ToolboxLabel>
                                        <div style={TOOL_GRID}>
                                            {sec.items.map(t => (
                                                <AddCard
                                                    key={t.type}
                                                    label={tx(t.label)}
                                                    title={tx('Add {name}', { name: tx(t.label) })}
                                                    color={t.color}
                                                    preview={t.preview}
                                                    onClick={() => place(t.type)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {shapes.length > 0 && (
                                    <>
                                        <ToolboxLabel>{tx('Shapes')}</ToolboxLabel>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5, padding: '0 2px' }}>
                                            {shapes.map(t => (
                                                <ShapeBtn
                                                    key={t.type}
                                                    title={tx('Add {name}', { name: tx(t.label) })}
                                                    color={t.color}
                                                    preview={t.preview}
                                                    onClick={() => place(t.type)}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                                {none && (
                                    <div style={{ fontSize: 11, color: 'var(--qs-text-faint)', fontFamily: 'var(--qs-font)', padding: '14px 4px 4px', lineHeight: 1.5 }}>
                                        {tx('Nothing matches “{query}”.', { query: addQuery.trim() })}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>

            </div>

            {/* ── Footer actions ── */}
            <div style={{
                borderTop: '1px solid var(--qs-line)',
                padding: 8,
                display: 'flex', gap: 5, flexShrink: 0,
            }}>
                <Button variant="soft" size="sm" style={{ flex: 1 }} onClick={onOpenTheme}>{tx('Theme')}</Button>
                <Button size="sm" style={{ flex: 1 }} onClick={onOpenBackground}>{tx('BG')}</Button>
                <Button variant="danger" size="sm" style={{ flex: 1 }} onClick={onResetLayout}>{tx('Reset')}</Button>
            </div>
        </MotionDiv>
    );
};

export default LayersPanel;
