import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BUILTIN_LAYERS, ELEMENT_TYPE_MAP } from './elementCatalog';
import { IconButton } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

// Every layer in the current scene, as a grid of cards under the editor canvas
// (where the 16:9 canvas leaves free space). Front-most first, like the canvas
// stacking. The left panel is just the Add toolbox now.

const ActionBtn = ({ title, onClick, danger, children }) => (
    <IconButton
        size="sm"
        variant="ghost"
        danger={danger}
        title={title}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
        {children}
    </IconButton>
);

const LayerCard = ({ icon, label, kind, color, visible, selected, touch, narrow, onSelect, onToggle, onUp, onDown, onRemove }) => {
    const [hover, setHover] = useState(false);
    const showFull = hover || selected || touch || narrow;
    const hiddenLabel = tx('{kind} · hidden', { kind });
    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            data-selected={selected || undefined}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); }
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="qs-layercard"
        >
            <span style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: 'var(--qs-radius)', color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                background: `linear-gradient(145deg, ${color}26, ${color}0a)`, boxShadow: `inset 0 0 0 1px ${color}2e`,
                opacity: visible ? 1 : 0.4, filter: visible ? 'none' : 'grayscale(1)',
            }}>
                <span style={{ display: 'flex', transform: 'scale(0.8)' }}>{icon}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{
                    fontSize: 11.5, fontWeight: 500, fontFamily: 'var(--qs-font)',
                    color: visible ? 'var(--qs-text)' : 'var(--qs-text-faint)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: visible ? 'none' : 'line-through',
                }}>
                    {label}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--qs-font)', color: 'var(--qs-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {visible ? kind : hiddenLabel}
                </span>
            </span>
            {/* Hide/show and delete remain visible without hover (e.g. touch/narrow devices); reorder arrows reveal on active/hover/touch. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, opacity: showFull ? 1 : 0.65, transition: 'opacity 0.12s' }}>
                {onToggle && (
                    <ActionBtn title={tx(visible ? 'Hide' : 'Show')} onClick={onToggle}>
                        {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </ActionBtn>
                )}
                {showFull && (
                    <>
                        <ActionBtn title={tx('Bring forward')} onClick={onUp}><ChevronUp size={13} /></ActionBtn>
                        <ActionBtn title={tx('Send backward')} onClick={onDown}><ChevronDown size={13} /></ActionBtn>
                    </>
                )}
                <ActionBtn title={tx('Remove')} danger onClick={onRemove}><Trash2 size={12} /></ActionBtn>
            </span>
        </div>
    );
};

// Text-ish elements are named by their content, everything else by its type —
// non-text types still carry the base placeholder content ("New Title").
const NAMED_BY_CONTENT = new Set(['text', 'lowerthird', 'social', 'goal', 'liquidgoal', 'ticker', 'daycounter', 'live', 'note']);
const firstLine = (v) => String(v ?? '').split('\n').find(l => l.trim())?.trim() ?? '';

const TOUCH_MEDIA_QUERY = '(hover: none), (pointer: coarse)';

const LayerStrip = ({
    boxVisibility = {}, zOrder = [], elements = [], selectedBox, selectedElementId,
    onSelectBox, onLayerUp, onLayerDown, onRemoveBuiltin,
    onSelectElement, onToggleElement, onElementUp, onElementDown, onDeleteElement,
    narrow,
}) => {
    useI18n();
    const [isTouch, setIsTouch] = useState(() => (
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(TOUCH_MEDIA_QUERY).matches
            : false
    ));
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mq = window.matchMedia(TOUCH_MEDIA_QUERY);
        const update = (e) => setIsTouch(e.matches);
        mq.addEventListener?.('change', update);
        return () => mq.removeEventListener?.('change', update);
    }, []);

    // Higher index in zOrder = rendered on top = listed first.
    const builtins = BUILTIN_LAYERS
        .filter(l => boxVisibility[l.id])
        .sort((a, b) => zOrder.indexOf(b.id) - zOrder.indexOf(a.id));
    const total = builtins.length + elements.length;
    const visible = builtins.length + elements.filter(e => !e.hidden).length;

    return (
        <div style={{ marginTop: narrow ? 10 : 16, fontFamily: 'var(--qs-font)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 2px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--qs-text-dim)' }}>{tx('Layers in this scene')}</span>
                    <span style={{ fontSize: 11, color: 'var(--qs-text-faint)' }}>{tx('{visible}/{total} visible', { visible, total })}</span>
                </div>
                {total > 1 && <span style={{ fontSize: 11, color: 'var(--qs-text-faint)' }}>{tx('Front → back')}</span>}
            </div>

            {total === 0 ? (
                <div style={{ padding: '18px 12px', borderRadius: 'var(--qs-radius)', border: '1px dashed var(--qs-line-strong)', textAlign: 'center', fontSize: 12, color: 'var(--qs-text-faint)' }}>
                    {tx(narrow
                        ? 'No layers yet. Pick something from the toolbox above, then click or drag on the canvas.'
                        : 'No layers yet. Pick something from the toolbox on the left, then click or drag on the canvas.')}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${narrow ? 150 : 190}px, 1fr))`, gap: 6 }}>
                    {/* Custom elements use index 0 as the front-most layer, matching the canvas. */}
                    {elements.map(el => {
                        const t = ELEMENT_TYPE_MAP[el.type];
                        const kind = t ? tx(t.label) : el.type;
                        return (
                            <LayerCard
                                key={el.id}
                                icon={t?.preview ?? el.type.charAt(0).toUpperCase()}
                                label={(NAMED_BY_CONTENT.has(el.type) && firstLine(el.content)) || kind}
                                kind={kind}
                                color={t?.color ?? '#6b7280'}
                                visible={!el.hidden}
                                selected={selectedElementId === el.id}
                                touch={isTouch}
                                narrow={narrow}
                                onSelect={() => onSelectElement(el.id)}
                                onToggle={() => onToggleElement(el.id)}
                                onUp={() => onElementUp?.(el.id)}
                                onDown={() => onElementDown?.(el.id)}
                                onRemove={() => onDeleteElement(el.id)}
                            />
                        );
                    })}
                    {builtins.map(l => (
                        <LayerCard
                            key={l.id}
                            icon={<l.Icon size={16} color={l.color} />}
                            label={tx(l.label)}
                            kind={tx(l.id.endsWith('Cam') ? 'Camera' : 'Component')}
                            color={l.color}
                            visible
                            selected={selectedBox === l.id}
                            touch={isTouch}
                            narrow={narrow}
                            onSelect={() => onSelectBox(l.id)}
                            onUp={() => onLayerUp?.(l.id)}
                            onDown={() => onLayerDown?.(l.id)}
                            onRemove={() => onRemoveBuiltin(l.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default LayerStrip;
