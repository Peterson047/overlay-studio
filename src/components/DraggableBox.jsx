import { memo, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

const MIN_W_PCT = 4;
const MIN_H_PCT = 3;
const DRAG_THRESHOLD = 5; // Minimum px of movement before a mousedown counts as a drag

// Hit areas straddle the box edge; the visible part is a small dot/pill drawn
// inside (see render). Edges are full-length strips so they're easy to grab.
const RESIZE_HANDLES = [
    { id: 'n',  style: { top: -5,    left: 12, right: 12, height: 10, cursor: 'n-resize' } },
    { id: 's',  style: { bottom: -5, left: 12, right: 12, height: 10, cursor: 's-resize' } },
    { id: 'e',  style: { right: -5,  top: 12, bottom: 12, width: 10,  cursor: 'e-resize' } },
    { id: 'w',  style: { left: -5,   top: 12, bottom: 12, width: 10,  cursor: 'w-resize' } },
    { id: 'ne', style: { top: -7,    right: -7,  width: 14, height: 14, cursor: 'ne-resize' } },
    { id: 'nw', style: { top: -7,    left: -7,   width: 14, height: 14, cursor: 'nw-resize' } },
    { id: 'se', style: { bottom: -7, right: -7,  width: 14, height: 14, cursor: 'se-resize' } },
    { id: 'sw', style: { bottom: -7, left: -7,   width: 14, height: 14, cursor: 'sw-resize' } },
];

// Presses on real controls inside a box (task list inputs, buttons…) should
// act on the control, not start a drag.
const isInteractive = (el) => !!el?.closest?.('input, textarea, select, button, a, [contenteditable="true"]');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Module-level flag — shared across all DraggableBox instances.
// While any box is being dragged or resized, suppress hover-state changes
// so other boxes don't re-render as the mouse passes over them.
let anyDragging = false;
const setAnyDragging = (active) => { anyDragging = active; };

const DraggableBox = ({
    id, title, box, zIndex,
    onBoxChange, onSelect, onLayerUp, onLayerDown,
    editMode, selected,
    canvasRef, children, extraStyle,
    overflowHidden = false,
}) => {
    const elRef   = useRef(null);
    const boxRef  = useRef(box);
    useEffect(() => { boxRef.current = box; }, [box]);
    useI18n();

    // Tracks whether the current press turned into a drag/resize.
    // onClick fires after pointerup — if didDrag is true, it's not a plain click so skip selection.
    const didDrag = useRef(false);

    const [hovered, setHovered] = useState(false);

    // ── Root click — select only on plain clicks, not after drag/resize ──────
    // In edit mode the whole box is the drag handle (a plain click still selects,
    // thanks to the drag threshold).
    const onRootPointerDown = (e) => {
        didDrag.current = false; // reset on every new press
        if (editMode && e.button === 0 && !isInteractive(e.target)) onDragPointerDown(e);
    };

    const onRootClick = () => {
        if (!didDrag.current) onSelect?.(id);
    };

    // ── Drag ──────────────────────────────────────────────────────────────────
    // Pointer events (not mouse) so this works with touch/pen on phones too. The
    // handle sets `touch-action: none` so the browser won't pan/scroll instead of
    // dispatching pointermove during a finger drag.
    const onDragPointerDown = (e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();

        didDrag.current = false;
        setAnyDragging(true);
        // NOTE: do NOT call setHovered here — any React state update schedules a
        // re-render which resets el.style.left back to the % value mid-drag.

        const canvas = canvasRef.current;
        if (!canvas || !canvas.offsetWidth || !canvas.offsetHeight) { setAnyDragging(false); return; }
        const { offsetWidth: W, offsetHeight: H } = canvas;
        const el = elRef.current;

        // el.offsetLeft/Top are canvas-relative px — same space as CSS left/top px.
        // Using these avoids any viewport→canvas coordinate conversion.
        const startLeft   = el.offsetLeft;
        const startTop    = el.offsetTop;
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const maxL = Math.max(0, W - el.offsetWidth);
        const maxT = Math.max(0, H - el.offsetHeight);

        const onMove = (ev) => {
            const dx = ev.clientX - startMouseX;
            const dy = ev.clientY - startMouseY;
            if (!didDrag.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            didDrag.current = true;
            el.style.left = `${clamp(startLeft + dx, 0, maxL)}px`;
            el.style.top  = `${clamp(startTop  + dy, 0, maxT)}px`;
        };

        const onUp = (ev) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup',   onUp);
            window.removeEventListener('pointercancel', onUp);
            setAnyDragging(false);
            if (didDrag.current) {
                const dx = ev.clientX - startMouseX;
                const dy = ev.clientY - startMouseY;
                const b = boxRef.current;
                const x = clamp(((startLeft + dx) / W) * 100, 0, Math.max(0, 100 - b.w));
                const y = clamp(((startTop  + dy) / H) * 100, 0, Math.max(0, 100 - b.h));
                el.style.left = `${x}%`;
                el.style.top  = `${y}%`;
                onBoxChange(id, { ...b, x, y });
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResizePointerDown = (e, dir) => {
        e.preventDefault();
        e.stopPropagation();

        const canvas = canvasRef.current;
        if (!canvas || !canvas.offsetWidth || !canvas.offsetHeight) return;
        const { offsetWidth: W, offsetHeight: H } = canvas;

        didDrag.current = false;
        setAnyDragging(true);

        const el = elRef.current;
        const b  = boxRef.current;

        const left   = (b.x / 100) * W;
        const top    = (b.y / 100) * H;
        const width  = (b.w / 100) * W;
        const height = (b.h / 100) * H;
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const minW = (MIN_W_PCT / 100) * W;
        const minH = (MIN_H_PCT / 100) * H;

        let nL = left, nT = top, nW = width, nH = height;

        const onMove = (ev) => {
            const dx = ev.clientX - startMouseX;
            const dy = ev.clientY - startMouseY;
            if (!didDrag.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            didDrag.current = true;
            nL = left; nT = top; nW = width; nH = height;
            if (dir.includes('e')) nW = clamp(width  + dx, minW, Math.max(minW, W - left));
            if (dir.includes('s')) nH = clamp(height + dy, minH, Math.max(minH, H - top));
            if (dir.includes('w')) { nW = clamp(width  - dx, minW, Math.max(minW, left + width));  nL = left + width  - nW; }
            if (dir.includes('n')) { nH = clamp(height - dy, minH, Math.max(minH, top  + height)); nT = top  + height - nH; }
            el.style.left   = `${nL}px`;
            el.style.top    = `${nT}px`;
            el.style.width  = `${nW}px`;
            el.style.height = `${nH}px`;
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup',   onUp);
            window.removeEventListener('pointercancel', onUp);
            setAnyDragging(false);
            if (didDrag.current) {
                const x = clamp((nL / W) * 100, 0, Math.max(0, 100 - MIN_W_PCT));
                const y = clamp((nT / H) * 100, 0, Math.max(0, 100 - MIN_H_PCT));
                const w = clamp((nW / W) * 100, MIN_W_PCT, Math.max(MIN_W_PCT, 100 - x));
                const h = clamp((nH / H) * 100, MIN_H_PCT, Math.max(MIN_H_PCT, 100 - y));
                el.style.left   = `${x}%`;
                el.style.top    = `${y}%`;
                el.style.width  = `${w}%`;
                el.style.height = `${h}%`;
                onBoxChange(id, { x, y, w, h });
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // ── Outline color ─────────────────────────────────────────────────────────
    // null = no outline at all. In live/OBS mode we must emit `outline: none`,
    // not `1px solid none` (a malformed value that renders a phantom 1px border
    // around things like camera frames).
    // Quiet at rest (a faint dashed guide), clearer on hover, crisp when selected.
    const outline = editMode
        ? selected
            ? '1.5px solid var(--qs-accent-text, #ff5a6c)'
            : hovered
                ? '1px solid var(--qs-accent-line, rgba(255, 64, 86, 0.55))'
                : '1px dashed rgba(255,255,255,0.12)'
        : 'none';
    const showChrome = editMode && (hovered || selected);
    // Tag sits just above the box; boxes hugging the canvas top get it inside.
    const tagInside = box.y < 4;

    return (
        <div
            ref={elRef}
            data-box-id={id}
            onPointerDown={onRootPointerDown}
            onClick={onRootClick}
            onMouseEnter={() => { if (!anyDragging) setHovered(true);  }}
            onMouseLeave={() => { if (!anyDragging) setHovered(false); }}
            style={{
                position: 'absolute',
                left:     `${box.x}%`,
                top:      `${box.y}%`,
                width:    `${box.w}%`,
                height:   `${box.h}%`,
                // Visible unless overflowHidden is explicitly requested outside edit mode.
                overflow:     editMode || !overflowHidden ? 'visible' : 'hidden',
                boxSizing:    'border-box',
                outline,
                outlineOffset: selected ? 1 : 0,
                zIndex,
                cursor:       editMode ? 'move' : undefined,
                touchAction:  editMode ? 'none' : undefined,
                transition:   'outline-color 0.12s, opacity 0.15s',
                ...extraStyle,
            }}
        >
            {/* ── Name tag — floats above the box on hover / selection, never covers content ── */}
            {showChrome && (
                <div
                    style={{
                        position: 'absolute', left: 0, zIndex: 33,
                        ...(tagInside ? { top: 4, left: 4 } : { bottom: 'calc(100% + 5px)' }),
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: selected ? '2px 3px 2px 8px' : '2px 8px', borderRadius: 'var(--qs-radius-sm, 6px)',
                        background: selected ? 'var(--qs-accent, #e2021b)' : 'var(--qs-panel, #141513)',
                        border: `1px solid ${selected ? 'var(--qs-accent-line, rgba(255, 64, 86, 0.55))' : 'var(--qs-line-strong, rgba(255,255,255,0.16))'}`,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
                        whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: selected ? 'auto' : 'none',
                    }}
                >
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--qs-font, Inter, system-ui, sans-serif)', color: selected ? '#fff' : 'var(--qs-text-dim, #b4b6ad)', lineHeight: '16px' }}>
                        {tx(title)}
                    </span>
                    {selected && (
                        <span style={{ display: 'flex', gap: 2 }}>
                            <LayerBtn onClick={(e) => { e.stopPropagation(); onLayerUp?.(id); }} title={tx('Bring forward')}>▲</LayerBtn>
                            <LayerBtn onClick={(e) => { e.stopPropagation(); onLayerDown?.(id); }} title={tx('Send backward')}>▼</LayerBtn>
                        </span>
                    )}
                </div>
            )}

            {/* ── Hover label (non-edit mode) ── */}
            {!editMode && hovered && (
                <div style={{
                    position: 'absolute', top: 4, left: 4,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 99,
                    padding: '2px 8px',
                    fontSize: 9, fontFamily: 'monospace',
                    textTransform: 'uppercase', letterSpacing: 2,
                    color: 'rgba(255,255,255,0.5)',
                    pointerEvents: 'none',
                    zIndex: 31,
                }}>
                    {tx(title)}
                </div>
            )}

            {/* ── Content — always full height ── */}
            <div style={{ width: '100%', height: '100%', overflow: overflowHidden ? 'hidden' : 'visible' }}>
                {children}
            </div>

            {/* ── Resize handles (edit mode only) ── */}
            {/* Hit areas are always live in edit mode; the dots only show when selected. */}
            {editMode && RESIZE_HANDLES.map(h => {
                const corner = h.id.length === 2;
                const vertical = h.id === 'e' || h.id === 'w';
                return (
                    <div
                        key={h.id}
                        onPointerDown={(e) => onResizePointerDown(e, h.id)}
                        style={{ position: 'absolute', ...h.style, zIndex: 32, touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        {selected && (
                            <span style={{
                                display: 'block', background: '#fff', border: '1.5px solid var(--qs-accent, #e2021b)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.5)', boxSizing: 'border-box',
                                ...(corner
                                    ? { width: 9, height: 9, borderRadius: 2 }
                                    : vertical ? { width: 5, height: 16, borderRadius: 3 } : { width: 16, height: 5, borderRadius: 3 }),
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const LayerBtn = ({ onClick, title, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className="qs-layerbtn"
    >
        {children}
    </button>
);

// Only re-render when the box position/size, selection, editMode, or children change.
// Callbacks (onBoxChange, onSelect, etc.) must be stable (useCallback) in the parent.
export default memo(DraggableBox, (prev, next) => {
    const pb = prev.box, nb = next.box;
    return (
        pb.x === nb.x && pb.y === nb.y && pb.w === nb.w && pb.h === nb.h &&
        prev.title          === next.title          &&
        prev.zIndex         === next.zIndex         &&
        prev.selected       === next.selected       &&
        prev.editMode       === next.editMode       &&
        prev.overflowHidden === next.overflowHidden &&
        prev.children       === next.children       &&
        // extraStyle: both undefined, or same opacity/pointerEvents
        prev.extraStyle === next.extraStyle
    );
});
