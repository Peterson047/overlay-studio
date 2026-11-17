import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronUp, Film, GripHorizontal, HelpCircle, Home, Layers, LayoutGrid, Pencil, Play, RotateCcw, Save, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getRoom, isDefaultRoom, newRoomId, setRoomInUrl, shareLinks } from '../config.js';
import { fetchLayout, isPreviewMode, isProjectMode, previewDraft, projectIdFromUrl, projectObsLink, revisionFromVersion, saveLayout } from '../sync/transport.js';
import { createProjectFrom, stashImport } from '../auth/pendingImport.js';
import { supabase } from '../auth/supabase.js';
import { apiFetch } from '../auth/api.js';
import { track } from '../analytics';

// Saved-layouts library for the shared `default` room, kept per browser.
const LOCAL_LIB_KEY = 'overlay:default-layouts';
function loadLocalLibrary() {
    try { return JSON.parse(localStorage.getItem(LOCAL_LIB_KEY)) || []; } catch { return []; }
}
function saveLocalLibrary(layouts) {
    try { localStorage.setItem(LOCAL_LIB_KEY, JSON.stringify(layouts)); } catch { /* quota / private mode */ }
}
import { useOBS } from '../context/OBSContext';
import AICompanion from './AICompanion';
import BackgroundPanel, { bgToStyle } from './BackgroundPanel';
import CameraEditor from './CameraEditor';
import CurrentTask from './CurrentTask';
import DraggableBox from './DraggableBox';
import ElementEditor from './ElementEditor';
import HelpPanel from './HelpPanel';
import ElementRenderer, { defaultElement } from './ElementRenderer';
import LayerStrip from './LayerStrip';
import LayersPanel from './LayersPanel';
import ThemePanel from './ThemePanel';
import CameraFrame, { DEFAULT_CAM_STYLE } from './CameraFrame';
import LayoutGallery from './LayoutGallery';
import { frameHoleGeometry, holeMask, sceneHoles } from './graphics';
import { DEFAULT_THEME, getTheme } from '../theme/themes';
import { MOODS } from '../theme/moods';
import { packSnapshot } from '../scenes/packs';
import { STARTER_LAYOUTS, buildStarterLayout } from '../scenes/starterLayouts';

const MotionDiv = motion.div;

const DEFAULT_BOXES = {
    faceCam: { x: 80, y: 0, w: 20, h: 20 },
    aiCompanion: { x: 80, y: 38, w: 20, h: 37 },
    handCam: { x: 80, y: 75, w: 10, h: 10 },
    roomCam: { x: 90, y: 75, w: 10, h: 10 },
    currentTask: { x: 0, y: 85, w: 80, h: 15 },
};

const CAMERA_IDS = ['faceCam', 'handCam', 'roomCam'];
const NO_CAM_STYLES = {};
const NO_CAM_VEIL = { faceCam: false, handCam: false, roomCam: false, holes: false };
const RIGHT_PANEL_W = 300;  // element / camera editor sidebar width (desktop)   // stable fallback so memoised cut-outs don't churn
const DEFAULT_SCENE_TRANSITION = { type: 'fade', durationMs: 420 };

const boxNearlySame = (a, b) => !!a && !!b
    && Math.abs((a.x ?? 0) - (b.x ?? 0)) < 0.25
    && Math.abs((a.y ?? 0) - (b.y ?? 0)) < 0.25
    && Math.abs((a.w ?? 0) - (b.w ?? 0)) < 0.25
    && Math.abs((a.h ?? 0) - (b.h ?? 0)) < 0.25;

const SCENE_TRANSITIONS = {
    none: {
        enter: { initial: false, animate: { opacity: 1 } },
        exit: { initial: { opacity: 1 }, animate: { opacity: 0 } },
        ease: 'linear',
    },
    fade: {
        enter: { initial: { opacity: 0 }, animate: { opacity: 1 } },
        exit: { initial: { opacity: 1 }, animate: { opacity: 0 } },
        ease: [0.4, 0, 0.2, 1],
    },
    'fade-dip': {
        enter: { initial: { opacity: 0 }, animate: { opacity: [0, 0, 1, 1] }, times: [0, 0.49, 0.51, 1] },
        exit: { initial: { opacity: 1 }, animate: { opacity: [1, 1, 0, 0] }, times: [0, 0.48, 0.50, 1] },
        dip: true,
        ease: [0.4, 0, 0.2, 1],
    },
    'slide-left': {
        enter: { initial: { x: '100%' }, animate: { x: '0%' } },
        exit: { initial: { x: '0%' }, animate: { x: '-100%' } },
        ease: [0.22, 1, 0.36, 1],
    },
    'slide-right': {
        enter: { initial: { x: '-100%' }, animate: { x: '0%' } },
        exit: { initial: { x: '0%' }, animate: { x: '100%' } },
        ease: [0.22, 1, 0.36, 1],
    },
    'slide-up': {
        enter: { initial: { y: '100%' }, animate: { y: '0%' } },
        exit: { initial: { y: '0%' }, animate: { y: '-100%' } },
        ease: [0.22, 1, 0.36, 1],
    },
    wipe: {
        enter: { initial: { clipPath: 'inset(0 100% 0 0)' }, animate: { clipPath: 'inset(0 0% 0 0)' } },
        // Complementary right-shrinking clip reveals transparent OBS cutouts cleanly mid-wipe.
        exit: { initial: { clipPath: 'inset(0 0 0 0%)' }, animate: { clipPath: 'inset(0 0 0 100%)' } },
        enterTop: true,
        wipeEdge: true,
        ease: [0.25, 0.9, 0.3, 1],
    },
    zoom: {
        enter: { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 } },
        exit: { initial: { opacity: 1, scale: 1 }, animate: { opacity: 0, scale: 1.07 } },
        ease: [0.22, 1, 0.36, 1],
    },
};

function resolveTransition(t) {
    const type = t?.type && SCENE_TRANSITIONS[t.type] ? t.type : DEFAULT_SCENE_TRANSITION.type;
    const rawMs = Number(t?.durationMs);
    const durationMs = type === 'none'
        ? 0
        : Number.isFinite(rawMs)
            ? Math.min(1500, Math.max(80, rawMs))
            : DEFAULT_SCENE_TRANSITION.durationMs;
    return { type, durationMs };
}

function renderFramedCam(slot, label, showLabel, camStyles, theme, veiled = false) {
    const cs = camStyles?.[slot] ?? DEFAULT_CAM_STYLE;
    return (
        <CameraFrame frame={cs.frame} radius={cs.radius} accent={cs.accent ?? theme.accent} accent2={cs.accent2 ?? theme.accent2}>
            <div style={{
                position: 'relative',
                width: '100%', height: '100%', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showLabel ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: showLabel ? '1px dashed rgba(255,255,255,0.18)' : 'none',
            }}>
                {showLabel ? (
                    <div style={{ textAlign: 'center', pointerEvents: 'none', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{label}</div>
                        <div style={{ fontSize: 8, marginTop: 3, color: 'rgba(255,255,255,0.4)' }}>OBS source</div>
                    </div>
                ) : (
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: '#070712',
                            opacity: veiled ? 1 : 0,
                            transition: veiled ? 'none' : 'opacity 160ms ease-out',
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </div>
        </CameraFrame>
    );
}

const ScaledContent = ({ children }) => (
    <div style={{
        width: 'calc(100% / var(--scene-scale-x, 1))',
        height: 'calc(100% / var(--scene-scale-y, 1))',
        transform: 'scale(var(--scene-scale-x, 1), var(--scene-scale-y, 1))',
        transformOrigin: 'top left',
    }}>
        {children}
    </div>
);

const elementTitle = (type) => type.charAt(0).toUpperCase() + type.slice(1);

const FrozenSceneLayer = ({ stage }) => {
    const { boxes, boxVisibility, elements, background, zOrder, theme, camStyles, mood, channel, liveState, serverOffsetMs, holes } = stage;
    const bgLayer = background && background.type !== 'transparent'
        ? { ...bgToStyle(background), ...holeMask(holes) }
        : null;
    const getFrozenZ = (id) => {
        const idx = zOrder.indexOf(id);
        return (idx === -1 ? zOrder.length : idx) + 10;
    };

    return (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {bgLayer && <div style={{ position: 'absolute', inset: 0, zIndex: 0, ...bgLayer }} />}
            {elements.map((el, i) => {
                if (el.hidden || !el.box) return null;
                return (
                    <div key={el.id} style={{
                        position: 'absolute',
                        left: `${el.box.x}%`, top: `${el.box.y}%`,
                        width: `${el.box.w}%`, height: `${el.box.h}%`,
                        zIndex: 100 + (elements.length - 1 - i),
                    }}>
                        <ScaledContent>
                            <ElementRenderer
                                element={el}
                                theme={theme}
                                mood={mood}
                                channel={channel}
                                frozen
                                holes={el.type === 'backdrop' ? holes : undefined}
                                liveState={liveState}
                                serverOffsetMs={serverOffsetMs}
                            />
                        </ScaledContent>
                    </div>
                );
            })}
            {CAMERA_IDS.filter(id => (boxVisibility[id] ?? true) && boxes[id]).map(id => {
                const b = boxes[id];
                return (
                    <div key={id} style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, zIndex: getFrozenZ(id) }}>
                        {renderFramedCam(id, id.replace('Cam', '').toUpperCase(), false, camStyles, theme)}
                    </div>
                );
            })}
            {(boxVisibility.aiCompanion ?? true) && boxes.aiCompanion && (
                <div style={{ position: 'absolute', left: `${boxes.aiCompanion.x}%`, top: `${boxes.aiCompanion.y}%`, width: `${boxes.aiCompanion.w}%`, height: `${boxes.aiCompanion.h}%`, zIndex: getFrozenZ('aiCompanion'), overflow: 'hidden' }}>
                    <ScaledContent>
                        <div className="w-full h-full bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-3 flex flex-col gap-2 shadow-lg overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                <span className="text-xs font-bold text-white/80 uppercase tracking-widest">AI Companion</span>
                            </div>
                        </div>
                    </ScaledContent>
                </div>
            )}
            {(boxVisibility.currentTask ?? true) && boxes.currentTask && (
                <div style={{ position: 'absolute', left: `${boxes.currentTask.x}%`, top: `${boxes.currentTask.y}%`, width: `${boxes.currentTask.w}%`, height: `${boxes.currentTask.h}%`, zIndex: getFrozenZ('currentTask'), overflow: 'hidden' }}>
                    <ScaledContent>
                        <div className="w-full h-full bg-black/80 backdrop-blur-md border-t border-white/5 overflow-hidden">
                            <CurrentTask tasks={stage.tasks} onTasksChange={() => {}} />
                        </div>
                    </ScaledContent>
                </div>
            )}
        </div>
    );
};

const ElementBox = memo(
    ({
        element, zIndex, selected, editMode, canvasRef, extraStyle, theme, mood, channel, holes,
        liveState, serverOffsetMs, onLiveAction,
        onSelect, onBoxChange, onLayerUp, onLayerDown, onUploadLogo, onElementUpdate,
    }) => {
        const handleUploadLogo = useCallback(() => onUploadLogo(element.id), [element.id, onUploadLogo]);
        const handleUpdate = useCallback((changes) => onElementUpdate?.(element.id, changes), [element.id, onElementUpdate]);

        return (
            <DraggableBox
                id={element.id}
                title={elementTitle(element.type)}
                box={element.box}
                zIndex={zIndex}
                selected={selected}
                onSelect={onSelect}
                onLayerUp={onLayerUp}
                onLayerDown={onLayerDown}
                onBoxChange={onBoxChange}
                editMode={editMode}
                canvasRef={canvasRef}
                extraStyle={extraStyle}
            >
                <ScaledContent>
                    <ElementRenderer
                        element={element}
                        editMode={editMode}
                        onUploadLogo={handleUploadLogo}
                        onElementUpdate={handleUpdate}
                        theme={theme}
                        mood={mood}
                        channel={channel}
                        holes={holes}
                        liveState={liveState}
                        serverOffsetMs={serverOffsetMs}
                        onLiveAction={onLiveAction}
                    />
                </ScaledContent>
            </DraggableBox>
        );
    },
    (prev, next) => (
        prev.element === next.element &&
        prev.zIndex === next.zIndex &&
        prev.selected === next.selected &&
        prev.editMode === next.editMode &&
        prev.canvasRef === next.canvasRef &&
        prev.extraStyle === next.extraStyle &&
        prev.theme === next.theme &&
        prev.mood === next.mood &&
        prev.channel === next.channel &&
        prev.holes === next.holes &&
        prev.liveState === next.liveState &&
        prev.serverOffsetMs === next.serverOffsetMs &&
        prev.onLiveAction === next.onLiveAction &&
        prev.onSelect === next.onSelect &&
        prev.onLayerUp === next.onLayerUp &&
        prev.onLayerDown === next.onLayerDown &&
        prev.onBoxChange === next.onBoxChange &&
        prev.onUploadLogo === next.onUploadLogo &&
        prev.onElementUpdate === next.onElementUpdate
    )
);

// Built-ins are now "add on demand": a box is present in the composition only
// when its flag is true. Nothing is active by default — you add components from
// the Layers panel (or by applying a scene).
const DEFAULT_VISIBILITY = {
    faceCam: false,
    handCam: false,
    roomCam: false,
    aiCompanion: false,
    currentTask: false,
};

// Per-session ID to suppress WS echoes of our own updates.
const SESSION_ID = Math.random().toString(36).slice(2);

// Clean / "OBS" mode: when the overlay is loaded as an OBS browser source, add
// ?obs (or ?clean) to the URL to suppress all on-screen controls (the live dock)
// so only the overlay itself is captured. Read once at module load.
const CLEAN_MODE = (() => {
    try {
        const p = new URLSearchParams(window.location.search);
        return p.has('obs') || p.has('clean');
    } catch {
        return false;
    }
})();

// The overlay is designed against a fixed 1920×1080 canvas (OBS's source size);
// element font sizes etc. are px tuned for that. To preview it correctly at any
// viewport (a phone, a small window) we render at that real size and CSS-scale
// the whole canvas to fit — so everything scales uniformly instead of fixed-px
// fonts overflowing tiny %-based boxes.
const BASE_W = 1920;
const BASE_H = 1080;
const useFitScale = () => {
    const get = () => Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    const [scale, setScale] = useState(get);
    useEffect(() => {
        const on = () => setScale(get());
        window.addEventListener('resize', on);
        window.visualViewport?.addEventListener('resize', on);
        return () => {
            window.removeEventListener('resize', on);
            window.visualViewport?.removeEventListener('resize', on);
        };
    }, []);
    return scale;
};

// True on phone-width / narrow viewports, where the editor's fixed side panels
// (240 + 300 px) can't sit alongside the canvas. In that case the panels become
// overlays (a slide-in drawer + a bottom sheet) instead of eating canvas width.
const useIsNarrow = (bp = 760) => {
    const [narrow, setNarrow] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < bp
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [bp]);
    return narrow;
};

const OverlayLayout = () => {
    const { isRecording, isConnected, placeCameras } = useOBS();
    const canvasRef = useRef(null);

    // Elements use 1920×1080 design pixels. Scale their content independently
    // so editor handles and drag coordinates stay in screen pixels.
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const updateScale = (width, height) => {
            canvas.style.setProperty('--scene-scale-x', Math.max(width / BASE_W, 0.001));
            canvas.style.setProperty('--scene-scale-y', Math.max(height / BASE_H, 0.001));
        };
        updateScale(canvas.clientWidth, canvas.clientHeight);
        const observer = new ResizeObserver(([entry]) => {
            updateScale(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    // ── Boxes are separate state so dragging never re-renders the rest of the overlay ──
    const [boxes, setBoxes] = useState(DEFAULT_BOXES);
    const boxesRef = useRef(DEFAULT_BOXES);
    boxesRef.current = boxes;

    const [layoutSettings, setLayoutSettings] = useState({
        showFaceCam: true,
        showHandCam: true,
        showRoomCam: true,
        boxVisibility: DEFAULT_VISIBILITY,
        useGPU: true,
        tasks: [{ id: 1, text: 'Refactoring Overlay', status: 'active' }],
        elements: [],
        background: { type: 'solid', color: '#0a0a0f' },
        theme: DEFAULT_THEME,
        scenes: [],
        sceneTransition: DEFAULT_SCENE_TRANSITION,
    });
    // Live mirror of camera visibility, settings, and elements for callbacks without re-creating.
    const visRef = useRef(DEFAULT_VISIBILITY);
    visRef.current = layoutSettings.boxVisibility ?? DEFAULT_VISIBILITY;
    const elementsRef = useRef([]);
    elementsRef.current = layoutSettings.elements ?? [];
    const layoutSettingsRef = useRef(layoutSettings);
    layoutSettingsRef.current = layoutSettings;

    // Synchronized server live state (`live:<room>`) for timers, wheel/alert triggers & transitions.
    const [liveState, setLiveState] = useState({});
    const liveStateRef = useRef(liveState);
    liveStateRef.current = liveState;
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const serverOffsetRef = useRef(0);

    // Sync/serialization primitives to prevent stale polling overwrites or out-of-order saves.
    const layoutHydratedRef = useRef(false);
    const lastVerRef = useRef(null);
    const writeEpochRef = useRef(0);
    const writeQueueRef = useRef(Promise.resolve());
    const lastLiveSceneSeqRef = useRef(null);

    // ── Responsive editor ── on narrow phones the side panels become overlays.
    const isNarrow = useIsNarrow();
    const editorHeaderHeight = isNarrow ? 100 : 56;
    const fitScale = useFitScale();
    const [drawerOpen, setDrawerOpen] = useState(false); // left (layers) drawer on mobile

    const [showBgPanel, setShowBgPanel] = useState(false);
    const [showThemePanel, setShowThemePanel] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    // Studio guide (dock / edit mode / OBS). Opens once by itself on a first
    // visit; storage can throw (private mode, blocked site data), so best-effort.
    const [helpTab, setHelpTab] = useState(() => {
        if (CLEAN_MODE) return null;
        try { return localStorage.getItem('help_seen') ? null : 'dock'; } catch { return null; }
    });
    const openHelp = useCallback((tab, source) => { setHelpTab(tab); track('help_open', { source }); }, []);
    const closeHelp = useCallback(() => {
        setHelpTab(null);
        try { localStorage.setItem('help_seen', '1'); } catch { /* ignore */ }
    }, []);
    const [dockScenesOpen, setDockScenesOpen] = useState(false);
    // Live dock can collapse to a tiny handle for a clean view.
    const [dockCollapsed, setDockCollapsed] = useState(false);
    // Brief confirmation after "Go Live" mints/links a room.
    const [liveToast, setLiveToast] = useState(null);
    // When set, the next click/drag on the canvas places a new element of this
    // type (click = default size at point, drag = drawn box). null = off.
    const [placingType, setPlacingType] = useState(null);
    const placePreviewRef = useRef(null);
    const themeRef = useRef(DEFAULT_THEME);
    themeRef.current = layoutSettings.theme ?? DEFAULT_THEME;
    const [editMode, setEditMode] = useState(false);
    // Mirror editMode into a ref so the polling loop can read it without
    // resubscribing. While editing, polled server data must not clobber the
    // local edits you're making.
    const editModeRef = useRef(editMode);
    editModeRef.current = editMode;

    // "Save Scene" is two-step: the header button swaps in-place for a name
    // input + save/cancel, so scenes can be named as they're created.
    const [namingScene, setNamingScene] = useState(false);
    const [sceneNameDraft, setSceneNameDraft] = useState('');
    const [selectedBox, setSelectedBox] = useState(null);
    const [selectedElementId, setSelectedElementId] = useState(null);
    const [zOrder, setZOrder] = useState(Object.keys(DEFAULT_BOXES));
    const zOrderRef = useRef(zOrder);
    zOrderRef.current = zOrder;

    // Scene transition playback state (`sceneEpoch` increments for every switch;
    // `exitStage` temporarily holds the outgoing frozen scene snapshot during animation;
    // `camVeil` holds matte cutouts until native OBS cameras/captures reposition).
    const [sceneEpoch, setSceneEpoch] = useState(0);
    const [activeTransition, setActiveTransition] = useState(DEFAULT_SCENE_TRANSITION);
    const [exitStage, setExitStage] = useState(null);
    const [camVeil, setCamVeil] = useState(NO_CAM_VEIL);
    const [syncError, setSyncError] = useState(null);
    const currentMoodRef = useRef('chill');
    const transitionDoneTimerRef = useRef(null);
    const dipMidTimerRef = useRef(null);
    const veilTimerRef = useRef(null);
    const transitionMetaRef = useRef(null);
    const unsettledVeilRef = useRef(NO_CAM_VEIL);
    const overlayMountedRef = useRef(true);
    const forcePollRef = useRef(null);
    const liveToastTimerRef = useRef(null);

    const postLayout = useCallback((body) => {
        writeEpochRef.current += 1;
        const payload = { ...body, _clientId: SESSION_ID };
        const queued = writeQueueRef.current.then(async () => {
            // Base version is read at send time so queued writes chain correctly.
            const res = await saveLayout(payload, lastVerRef.current);
            if (!res) return true; // read-only output (OBS player)
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                if (res.status === 413) {
                    setSyncError('Layout too large to save (max 2 MB) — try a smaller image.');
                } else if (res.status === 409) {
                    if (data?._v) lastVerRef.current = data._v;
                    setSyncError('Layout updated elsewhere — synced latest version.');
                    forcePollRef.current?.();
                } else {
                    setSyncError(data?.error || `Failed to save layout (HTTP ${res.status})`);
                }
                return false;
            }
            setSyncError(null);
            if (data?._v) lastVerRef.current = data._v;
            if (typeof data?.serverNow === 'number') {
                const offset = data.serverNow - Date.now();
                serverOffsetRef.current = offset;
                setServerOffsetMs(prev => (Math.abs(prev - offset) > 50 ? offset : prev));
            }
            if (data?.live) {
                if (typeof data.live.scene?.seq === 'number') {
                    lastLiveSceneSeqRef.current = Math.max(lastLiveSceneSeqRef.current ?? 0, data.live.scene.seq);
                }
                setLiveState(data.live);
            }
            return true;
        }).catch((err) => {
            console.error(err);
            setSyncError('Save failed — check your connection.');
            return false;
        });
        writeQueueRef.current = queued;
        return queued;
    }, []);

    const handleLiveAction = useCallback((bucket, id, payload) => {
        if (!bucket || !id) return;
        const nowAligned = Date.now() + serverOffsetRef.current;
        setLiveState(prev => {
            const curBucket = prev?.[bucket] || {};
            const nextBucket = { ...curBucket };
            if (payload === null) {
                delete nextBucket[id];
            } else {
                const prevItem = curBucket[id] || {};
                const extra = bucket === 'triggers'
                    ? { seq: (prevItem.seq || 0) + 1, at: nowAligned }
                    : bucket === 'timers' && payload.state === 'running' && typeof payload.anchorAt !== 'number'
                        ? { anchorAt: nowAligned }
                        : {};
                nextBucket[id] = { ...prevItem, ...payload, ...extra };
            }
            return { ...prev, [bucket]: nextBucket };
        });
        postLayout({ livePatch: { [bucket]: { [id]: payload } } });
    }, [postLayout]);

    const captureCurrentStageSnapshot = useCallback(() => {
        const s = layoutSettingsRef.current;
        const t = s.theme ?? DEFAULT_THEME;
        const bv = s.boxVisibility ?? DEFAULT_VISIBILITY;
        const cs = s.camStyles ?? NO_CAM_STYLES;
        const els = s.elements ?? [];
        const bx = boxesRef.current;
        return {
            boxes: bx,
            boxVisibility: bv,
            elements: els,
            background: s.background ?? { type: 'solid', color: '#0a0a0f' },
            zOrder: zOrderRef.current,
            theme: t,
            camStyles: cs,
            tasks: s.tasks ?? [],
            mood: currentMoodRef.current,
            channel: s.twitchChannel ?? '',
            liveState: liveStateRef.current,
            serverOffsetMs: serverOffsetRef.current,
            holes: sceneHoles({ boxes: bx, boxVisibility: bv, camStyles: cs, elements: els }, t),
        };
    }, []);

    const clearExitStageTimers = useCallback(() => {
        if (transitionDoneTimerRef.current) { clearTimeout(transitionDoneTimerRef.current); transitionDoneTimerRef.current = null; }
        if (dipMidTimerRef.current) { clearTimeout(dipMidTimerRef.current); dipMidTimerRef.current = null; }
        if (veilTimerRef.current) { clearTimeout(veilTimerRef.current); veilTimerRef.current = null; }
    }, []);

    const finishSceneTransition = useCallback((maybeToken) => {
        const meta = transitionMetaRef.current;
        if (!meta || meta.done) return;
        if (typeof maybeToken === 'symbol' && meta.token !== maybeToken) return;
        meta.done = true;
        const token = meta.token;

        clearExitStageTimers();
        setExitStage(null);
        if (!layoutHydratedRef.current) {
            unsettledVeilRef.current = NO_CAM_VEIL;
            setCamVeil(NO_CAM_VEIL);
            return;
        }
        if (meta.isDip && meta.dipPromise) {
            Promise.resolve(meta.dipPromise)
                .finally(() => {
                    if (!overlayMountedRef.current || transitionMetaRef.current?.token !== token) return;
                    unsettledVeilRef.current = NO_CAM_VEIL;
                    setCamVeil(NO_CAM_VEIL);
                });
            return;
        }
        Promise.resolve(placeCameras(boxesRef.current, visRef.current, elementsRef.current, { theme: themeRef.current }))
            .finally(() => {
                if (!overlayMountedRef.current || transitionMetaRef.current?.token !== token) return;
                unsettledVeilRef.current = NO_CAM_VEIL;
                veilTimerRef.current = setTimeout(() => {
                    if (overlayMountedRef.current && transitionMetaRef.current?.token === token) {
                        setCamVeil(NO_CAM_VEIL);
                    }
                }, 75);
            });
    }, [clearExitStageTimers, placeCameras]);

    useEffect(() => {
        overlayMountedRef.current = true;
        return () => {
            overlayMountedRef.current = false;
            clearExitStageTimers();
            clearTimeout(liveToastTimerRef.current);
        };
    }, [clearExitStageTimers]);

    const startSceneTransition = useCallback((prevStage, rawTransition, nextBoxes, nextVis, nextEls, nextTheme = themeRef.current) => {
        clearExitStageTimers();
        const resolved = resolveTransition(rawTransition);
        setActiveTransition(resolved);
        setSceneEpoch(n => n + 1);

        if (resolved.type === 'none' || resolved.durationMs <= 0 || !prevStage) {
            transitionMetaRef.current = null;
            unsettledVeilRef.current = NO_CAM_VEIL;
            setExitStage(null);
            setCamVeil(NO_CAM_VEIL);
            placeCameras(nextBoxes, nextVis, nextEls, { theme: nextTheme });
            return;
        }

        const spec = SCENE_TRANSITIONS[resolved.type];
        const token = Symbol('sceneTransition');
        transitionMetaRef.current = { token, isDip: !!spec?.dip, dipPromise: null, done: false };
        const exitKey = `exit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setExitStage({ key: exitKey, token, ...prevStage, transition: resolved });

        const prevHoleEls = (prevStage.elements || []).filter(e => e.type === 'frame' && e.hole && !e.hidden && e.box);
        const nextHoleEls = (nextEls || []).filter(e => e.type === 'frame' && e.hole && !e.hidden && e.box);
        const prevPending = unsettledVeilRef.current;

        if (spec?.dip) {
            unsettledVeilRef.current = {
                faceCam: !!nextVis.faceCam,
                handCam: !!nextVis.handCam,
                roomCam: !!nextVis.roomCam,
                holes: nextHoleEls.length > 0,
            };
            setCamVeil(NO_CAM_VEIL);
            // Dip-to-black curtain stays 100% opaque across [0.34..0.66]; switch OBS inside that plateau.
            dipMidTimerRef.current = setTimeout(() => {
                if (transitionMetaRef.current?.token !== token) return;
                transitionMetaRef.current.dipPromise = Promise.resolve(
                    placeCameras(boxesRef.current, visRef.current, elementsRef.current, { theme: themeRef.current })
                ).finally(() => {
                    if (transitionMetaRef.current?.token === token) {
                        unsettledVeilRef.current = NO_CAM_VEIL;
                    }
                });
            }, Math.round(resolved.durationMs * 0.36));
        } else {
            // Defer OBS source resizing/enabling until the overlay layout finishes landing so
            // native OBS cameras/captures never pop in ahead of the transition animation.
            const movesCanvas = resolved.type !== 'fade';
            const holesChanged = nextHoleEls.length > 0 && (
                movesCanvas ||
                !!prevPending.holes ||
                prevHoleEls.length !== nextHoleEls.length ||
                nextHoleEls.some((ne, idx) => !boxNearlySame(ne.box, prevHoleEls[idx]?.box))
            );
            const nextVeil = {
                faceCam: !!nextVis.faceCam && (!!prevPending.faceCam || movesCanvas || !prevStage.boxVisibility?.faceCam || !boxNearlySame(prevStage.boxes?.faceCam, nextBoxes.faceCam)),
                handCam: !!nextVis.handCam && (!!prevPending.handCam || movesCanvas || !prevStage.boxVisibility?.handCam || !boxNearlySame(prevStage.boxes?.handCam, nextBoxes.handCam)),
                roomCam: !!nextVis.roomCam && (!!prevPending.roomCam || movesCanvas || !prevStage.boxVisibility?.roomCam || !boxNearlySame(prevStage.boxes?.roomCam, nextBoxes.roomCam)),
                holes: holesChanged,
            };
            unsettledVeilRef.current = nextVeil;
            setCamVeil(nextVeil);
        }

        transitionDoneTimerRef.current = setTimeout(() => {
            finishSceneTransition(token);
        }, resolved.durationMs + 110);
    }, [clearExitStageTimers, finishSceneTransition, placeCameras]);

    // Cameras are NOT captured in the browser — the real webcam is a native OBS
    // "Video Capture Device" source. The overlay only renders a styled FRAME
    // placeholder (pure CSS, so it composites into OBS) that you position over
    // the OBS camera source. No getUserMedia → no permission prompt, no webcam
    // spin-up, no video-decode memory growth.

    // ── OBS recording — close edit panels ───────────────────────────────────────
    useEffect(() => {
        if (isRecording) {
            setEditMode(false);
            setSelectedBox(null);
            setSelectedElementId(null);
            setShowBgPanel(false);
            setShowThemePanel(false);
            setNamingScene(false);
        }
    }, [isRecording]);

    // ── OBS connect — place native cameras once initial layout is hydrated ──
    useEffect(() => {
        if (isConnected && layoutHydratedRef.current) {
            placeCameras(boxesRef.current, visRef.current, elementsRef.current, { theme: themeRef.current });
        }
    }, [isConnected, placeCameras]);

    // ── Canvas click — deselect ──────────────────────────────────────────────
    const onCanvasPointerDown = useCallback((e) => {
        if (e.target === e.currentTarget || e.target?.dataset?.canvasStage === '1') {
            setSelectedBox(null);
            setSelectedElementId(null);
        }
    }, []);

    // ── Element placement: arm a type (handlers defined after addElement) ────
    const armPlace = useCallback((type) => {
        setPlacingType(type);
        setSelectedBox(null);
        setSelectedElementId(null);
    }, []);

    // Escape cancels an armed placement.
    useEffect(() => {
        if (!placingType) return;
        const onKey = (e) => { if (e.key === 'Escape') setPlacingType(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [placingType]);

    // On mobile, picking a layer / selecting a box / arming placement should
    // dismiss the layers drawer so the canvas (and the bottom-sheet editor) show.
    useEffect(() => {
        if (isNarrow && (selectedBox || selectedElementId || placingType)) setDrawerOpen(false);
    }, [isNarrow, selectedBox, selectedElementId, placingType]);

    // ── Stable layout updater (non-box settings only) ───────────────────────
    const updateLayout = useCallback((updates) => {
        setLayoutSettings(s => ({ ...s, ...updates }));
        postLayout(updates);
    }, [postLayout]);

    // ── Theme ────────────────────────────────────────────────────────────────
    // applyTheme replaces the whole theme (picking a starter); updateTheme
    // patches individual tokens (editing accent / radius / font in the panel).
    const applyTheme = useCallback((nextTheme) => {
        const resolved = getTheme(nextTheme);
        themeRef.current = resolved;
        setLayoutSettings(s => ({ ...s, theme: resolved }));
        placeCameras(boxesRef.current, visRef.current, elementsRef.current, { theme: resolved });
        postLayout({ theme: resolved });
    }, [placeCameras, postLayout]);
    const updateTheme = useCallback((changes) => {
        const theme = { ...(layoutSettingsRef.current.theme ?? DEFAULT_THEME), ...changes };
        themeRef.current = theme;
        setLayoutSettings(s => ({ ...s, theme }));
        placeCameras(boxesRef.current, visRef.current, elementsRef.current, { theme });
        postLayout({ theme });
    }, [placeCameras, postLayout]);

    // ── Stable box updater — only updates boxes state, not layoutSettings ───
    const updateBox = useCallback((id, newBox) => {
        const updated = { ...boxesRef.current, [id]: newBox };
        boxesRef.current = updated;
        setBoxes(updated);
        // Dragging a cam frame also re-pins the native OBS camera source to it.
        if (CAMERA_IDS.includes(id)) placeCameras(updated, visRef.current, elementsRef.current, { theme: themeRef.current });
        postLayout({ boxes: updated });
    }, [placeCameras, postLayout]);

    const resetLayout = useCallback(() => {
        boxesRef.current = DEFAULT_BOXES;
        setBoxes(DEFAULT_BOXES);
        placeCameras(DEFAULT_BOXES, visRef.current, elementsRef.current, { theme: themeRef.current });
        postLayout({ boxes: DEFAULT_BOXES });
    }, [placeCameras, postLayout]);

    // ── Scenes ───────────────────────────────────────────────────────────────
    // A scene snapshot = { boxes, boxVisibility, elements, background, zOrder }.
    // Applying replaces the whole visual layout in one shot (and persists it).
    const applyScene = useCallback((snapshot = {}, { persist = true, extraPatch = {}, transition } = {}) => {
        const prevStage = captureCurrentStageSnapshot();
        const nBoxes = { ...DEFAULT_BOXES, ...(snapshot.boxes ?? {}) };
        const nVis   = { ...DEFAULT_VISIBILITY, ...(snapshot.boxVisibility ?? {}) };
        const nEls   = snapshot.elements ?? [];
        const nBg    = snapshot.background ?? { type: 'solid', color: '#0a0a0f' };
        const nZ     = snapshot.zOrder ?? Object.keys(DEFAULT_BOXES);
        // A scene may carry a theme (theme packs do); otherwise keep the current one.
        const nTheme = snapshot.theme ? getTheme(snapshot.theme) : undefined;
        // Saved layouts (not scenes) additionally carry camera frames.
        const extra = {};
        if (snapshot.camStyles !== undefined) extra.camStyles = snapshot.camStyles;
        const { livePatch: _lp, ...stateExtraPatch } = extraPatch || {};
        void _lp;

        boxesRef.current = nBoxes;
        visRef.current = nVis;
        elementsRef.current = nEls;
        zOrderRef.current = nZ;
        if (nTheme) themeRef.current = nTheme;
        setBoxes(nBoxes);
        setZOrder(nZ);
        setSelectedBox(null);
        setSelectedElementId(null);

        const nextTransition = transition ?? snapshot.transition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        startSceneTransition(prevStage, nextTransition, nBoxes, nVis, nEls, nTheme ?? themeRef.current);

        setLayoutSettings(s => ({
            ...s,
            ...stateExtraPatch,
            elements: nEls,
            background: nBg,
            boxVisibility: nVis,
            showFaceCam: nVis.faceCam,
            showHandCam: nVis.handCam,
            showRoomCam: nVis.roomCam,
            ...(nTheme ? { theme: nTheme } : {}),
            ...extra,
        }));
        if (persist) {
            postLayout({
                ...extraPatch,
                boxes: nBoxes, elements: nEls, background: nBg, boxVisibility: nVis, zOrder: nZ,
                showFaceCam: nVis.faceCam, showHandCam: nVis.handCam, showRoomCam: nVis.roomCam,
                ...(nTheme ? { theme: nTheme } : {}),
                ...extra,
            });
        }
    }, [captureCurrentStageSnapshot, startSceneTransition, postLayout]);

    // Installing a pack applies its theme + signature scene in one shot.
    const installPack = useCallback((pack) => {
        const snap = packSnapshot(pack);
        const transition = layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        applyScene(snap, {
            transition,
            extraPatch: { livePatch: { scene: { activeSceneId: `pack:${pack.id}`, transition } } },
        });
    }, [applyScene]);

    // ── Go Live ──────────────────────────────────────────────────────────────
    // Give this session its own private room so multiple users don't collide on
    // the shared `default` slot. On first use it mints a meeting-style id, rewrites
    // the URL, seeds the new slot with the current design (one shallow-merged POST,
    // so the room is born complete), and copies the OBS browser-source link to the
    // clipboard. If already in a room, it just re-copies the link.
    const goLive = useCallback(async () => {
        if (isPreviewMode()) {
            // Free preview → account project. Logged in: create it now.
            // Otherwise carry the design through the login redirect.
            await writeQueueRef.current;
            const draft = { ...previewDraft(), layouts: loadLocalLibrary() };
            const { data } = supabase ? await supabase.auth.getSession() : { data: {} };
            if (data?.session) {
                try {
                    const project = await createProjectFrom(draft);
                    track('preview_saved', {});
                    window.location.href = `/?project=${project.id}`;
                } catch (err) {
                    setSyncError(`${err.message} Abra Meus projetos em /?conta.`);
                }
                return;
            }
            if (!stashImport(draft)) {
                setSyncError('Não foi possível guardar o preview neste navegador. Entre e recomece pelo estúdio.');
                return;
            }
            track('preview_login', {});
            window.location.href = '/?conta&importar';
            return;
        }
        if (isProjectMode()) {
            // Account project: wait for pending saves, then publish the draft.
            await writeQueueRef.current;
            const projectId = projectIdFromUrl();
            let toast;
            try {
                const result = await apiFetch('/api/projects', {
                    method: 'POST',
                    body: { action: 'publish', id: projectId, revision: revisionFromVersion(lastVerRef.current) },
                });
                const obs = result.token ? projectObsLink(projectId, result.token) : null;
                let copied = false;
                if (obs) { try { await navigator.clipboard.writeText(obs); copied = true; } catch { /* blocked */ } }
                toast = { room: result.name, obs, copied, published: true, fresh: !!obs };
                track('project_published', {});
            } catch (err) {
                setSyncError(err.message);
                return;
            }
            if (!overlayMountedRef.current) return;
            clearTimeout(liveToastTimerRef.current);
            setLiveToast(toast);
            liveToastTimerRef.current = setTimeout(() => setLiveToast(null), toast.obs ? 15000 : 6000);
            return;
        }
        const fresh = isDefaultRoom();
        if (fresh) {
            const roomId = newRoomId();
            const { livePatch: _lp, ...currentSettings } = layoutSettingsRef.current;
            void _lp;
            const localLib = loadLocalLibrary();
            const prevUrl = window.location.href;
            const prevVer = lastVerRef.current;
            const prevSeq = lastLiveSceneSeqRef.current;
            setRoomInUrl(roomId);
            lastVerRef.current = null;
            lastLiveSceneSeqRef.current = 0;
            const ok = await postLayout({
                ...currentSettings,
                layouts: localLib.length > 0 ? localLib : (currentSettings.layouts ?? []),
                boxes: boxesRef.current,
                zOrder: zOrderRef.current,
            });
            if (!ok) {
                window.history.replaceState(null, '', prevUrl);
                lastVerRef.current = prevVer;
                lastLiveSceneSeqRef.current = prevSeq;
                return;
            }
        }
        const room = getRoom();
        const links = shareLinks(room);
        let copied = false;
        try { await navigator.clipboard.writeText(links.obs); copied = true; } catch { /* clipboard blocked */ }
        if (!overlayMountedRef.current) return;
        clearTimeout(liveToastTimerRef.current);
        setLiveToast({ room, ...links, fresh, copied });
        liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 7000);

        // The one event that separates "just looking" from "actually using it":
        // minting a fresh room is the real activation moment; re-copying an
        // existing room's link is a returning user, tracked separately.
        track(fresh ? 'go_live' : 'obs_link_copied', { room });
    }, [postLayout]);

    // ── Layouts → Scenes ─────────────────────────────────────────────────────
    // A LAYOUT is a named container (a "show": e.g. Valorant Stream). It holds
    // many SCENES (Intro / Gameplay / Outro). Each scene is a FULL snapshot of
    // the whole composition, so scenes within a layout can look entirely
    // different. The live canvas = the active scene of the active layout.
    const captureSnapshot = useCallback(() => ({
        boxes: boxesRef.current,
        boxVisibility: layoutSettings.boxVisibility ?? DEFAULT_VISIBILITY,
        elements: layoutSettings.elements ?? [],
        background: layoutSettings.background ?? { type: 'solid', color: '#0a0a0f' },
        zOrder,
        theme: layoutSettings.theme ?? DEFAULT_THEME,
        camStyles: layoutSettings.camStyles ?? {},
    }), [zOrder, layoutSettings]);

    const layouts = useMemo(() => layoutSettings.layouts ?? [], [layoutSettings.layouts]);
    const activeLayoutId = layoutSettings.activeLayoutId ?? layouts[0]?.id ?? null;
    const activeLayout = layouts.find(l => l.id === activeLayoutId) ?? null;
    const activeScene = activeLayout?.scenes.find(s => s.id === activeLayout.activeSceneId) ?? activeLayout?.scenes[0] ?? null;

    // The shared `default` room is used by every anonymous visitor, so its saved
    // library lives in this browser only (the server ignores it there) — that
    // keeps strangers' layouts out of each other's downloads. Go Live seeds the
    // private room with the full layoutSettings, so the library moves with it.
    const writeLayouts = useCallback((nextLayouts, extra) => {
        if (isDefaultRoom()) {
            saveLocalLibrary(nextLayouts);
            setLayoutSettings(s => ({ ...s, layouts: nextLayouts, ...(extra || {}) }));
            if (extra) postLayout(extra);
            return;
        }
        updateLayout({ layouts: nextLayouts, ...(extra || {}) });
    }, [updateLayout, postLayout]);

    // ── Layout (container) ops ──
    const createLayout = useCallback((name) => {
        const sceneId = `scene_${Date.now()}`;
        const layoutId = `layout_${Date.now()}`;
        const scene = { id: sceneId, name: 'Scene 1', createdAt: Date.now(), snapshot: captureSnapshot() };
        const layout = {
            id: layoutId,
            name: (name || '').trim() || `Layout ${layouts.length + 1}`,
            createdAt: Date.now(),
            scenes: [scene],
            activeSceneId: sceneId,
        };
        writeLayouts([...layouts, layout], { activeLayoutId: layoutId });
    }, [layouts, captureSnapshot, writeLayouts]);

    // Add a ready-made starter layout: build a real container from the template,
    // append it, make it active, and apply its first scene atomically in one POST.
    const addStarterLayout = useCallback((starter) => {
        const layout = buildStarterLayout(starter);
        const nextLayouts = [...layouts, layout];
        const scene = layout.scenes[0];
        if (isDefaultRoom()) {
            saveLocalLibrary(nextLayouts);
            setLayoutSettings(s => ({ ...s, layouts: nextLayouts, activeLayoutId: layout.id }));
        }
        const transition = layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        if (scene) {
            applyScene(scene.snapshot, {
                transition,
                extraPatch: {
                    activeLayoutId: layout.id,
                    ...(isDefaultRoom() ? {} : { layouts: nextLayouts }),
                    livePatch: { scene: { activeSceneId: scene.id, transition } },
                },
            });
        } else {
            writeLayouts(nextLayouts, { activeLayoutId: layout.id });
        }
    }, [layouts, writeLayouts, applyScene]);

    const renameLayout = useCallback((id, name) => {
        writeLayouts(layouts.map(l => l.id === id ? { ...l, name: (name || '').trim() || l.name } : l));
    }, [layouts, writeLayouts]);

    const deleteLayout = useCallback((id) => {
        const next = layouts.filter(l => l.id !== id);
        if (id !== activeLayoutId) {
            writeLayouts(next);
            return;
        }
        const fallbackLayout = next[0] ?? null;
        const nextActiveId = fallbackLayout?.id ?? null;
        const fallbackScene = fallbackLayout?.scenes?.find(s => s.id === fallbackLayout.activeSceneId) ?? fallbackLayout?.scenes?.[0] ?? null;
        if (isDefaultRoom()) {
            saveLocalLibrary(next);
            setLayoutSettings(s => ({ ...s, layouts: next, activeLayoutId: nextActiveId }));
        }
        const transition = layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        if (fallbackScene) {
            applyScene(fallbackScene.snapshot, {
                transition,
                extraPatch: {
                    activeLayoutId: nextActiveId,
                    ...(isDefaultRoom() ? {} : { layouts: next }),
                    livePatch: { scene: { activeSceneId: fallbackScene.id, transition } },
                },
            });
        } else {
            writeLayouts(next, { activeLayoutId: nextActiveId });
        }
    }, [layouts, activeLayoutId, writeLayouts, applyScene]);

    const switchLayout = useCallback((id) => {
        const l = layouts.find(x => x.id === id);
        if (!l) return;
        const scene = l.scenes.find(s => s.id === l.activeSceneId) ?? l.scenes[0];
        const transition = scene?.snapshot?.transition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        if (scene) {
            applyScene(scene.snapshot, {
                transition,
                extraPatch: {
                    activeLayoutId: id,
                    livePatch: { scene: { activeSceneId: scene.id, transition } },
                },
            });
        } else {
            updateLayout({ activeLayoutId: id });
        }
    }, [layouts, updateLayout, applyScene]);

    // ── Scene ops (operate on the active layout) ──
    const saveScene = useCallback((name) => {
        const snap = captureSnapshot();
        let next = layouts;
        let layoutId = activeLayoutId;
        if (!activeLayout) {
            // No layout yet — lazily create a Default container.
            layoutId = `layout_${Date.now()}`;
            next = [...layouts, { id: layoutId, name: 'Default', createdAt: Date.now(), scenes: [], activeSceneId: null }];
        }
        const count = (next.find(l => l.id === layoutId)?.scenes.length) || 0;
        const scene = { id: `scene_${Date.now()}`, name: (name || '').trim() || `Scene ${count + 1}`, createdAt: Date.now(), snapshot: snap };
        next = next.map(l => l.id === layoutId ? { ...l, scenes: [...l.scenes, scene], activeSceneId: scene.id } : l);
        writeLayouts(next, { activeLayoutId: layoutId });
    }, [layouts, activeLayout, activeLayoutId, captureSnapshot, writeLayouts]);

    const switchScene = useCallback((sceneId) => {
        if (!activeLayout) return;
        const scene = activeLayout.scenes.find(s => s.id === sceneId);
        const nextLayouts = layouts.map(l => l.id === activeLayout.id ? { ...l, activeSceneId: sceneId } : l);
        if (isDefaultRoom()) {
            saveLocalLibrary(nextLayouts);
            setLayoutSettings(s => ({ ...s, layouts: nextLayouts }));
        }
        const transition = scene?.snapshot?.transition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
        if (scene) {
            applyScene(scene.snapshot, {
                transition,
                extraPatch: {
                    ...(isDefaultRoom() ? {} : { layouts: nextLayouts }),
                    livePatch: { scene: { activeSceneId: sceneId, transition } },
                },
            });
        } else if (!isDefaultRoom()) {
            postLayout({ layouts: nextLayouts });
        }
    }, [layouts, activeLayout, applyScene, postLayout]);

    const updateScene = useCallback((sceneId) => {
        if (!activeLayout) return;
        const snap = captureSnapshot();
        writeLayouts(layouts.map(l => l.id === activeLayout.id
            ? { ...l, scenes: l.scenes.map(s => s.id === sceneId ? { ...s, snapshot: snap, updatedAt: Date.now() } : s) }
            : l));
    }, [layouts, activeLayout, captureSnapshot, writeLayouts]);

    const renameScene = useCallback((sceneId, name) => {
        if (!activeLayout) return;
        writeLayouts(layouts.map(l => l.id === activeLayout.id
            ? { ...l, scenes: l.scenes.map(s => s.id === sceneId ? { ...s, name: (name || '').trim() || s.name } : s) }
            : l));
    }, [layouts, activeLayout, writeLayouts]);

    const deleteScene = useCallback((sceneId) => {
        if (!activeLayout) return;
        const remaining = activeLayout.scenes.filter(s => s.id !== sceneId);
        const deletingActive = activeLayout.activeSceneId === sceneId;
        const fallbackScene = deletingActive ? (remaining[0] ?? null) : null;
        const nextActiveSceneId = deletingActive ? (fallbackScene?.id ?? null) : activeLayout.activeSceneId;
        const nextLayouts = layouts.map(l => l.id === activeLayout.id
            ? { ...l, scenes: remaining, activeSceneId: nextActiveSceneId }
            : l);
        if (fallbackScene) {
            if (isDefaultRoom()) {
                saveLocalLibrary(nextLayouts);
                setLayoutSettings(s => ({ ...s, layouts: nextLayouts }));
            }
            const transition = fallbackScene.snapshot?.transition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
            applyScene(fallbackScene.snapshot, {
                transition,
                extraPatch: {
                    ...(isDefaultRoom() ? {} : { layouts: nextLayouts }),
                    livePatch: { scene: { activeSceneId: fallbackScene.id, transition } },
                },
            });
        } else {
            writeLayouts(nextLayouts);
        }
    }, [layouts, activeLayout, writeLayouts, applyScene]);

    // ── Element helpers ──────────────────────────────────────────────────────
    // `box` (optional) overrides the type's default position/size — used by
    // canvas placement (click = default size at point, drag = drawn box).
    const addElement = useCallback((type, box) => {
        const el = defaultElement(type, themeRef.current);
        if (box) el.box = box;
        const newElements = [...(elementsRef.current ?? []), el];
        elementsRef.current = newElements;
        setLayoutSettings(s => ({ ...s, elements: newElements }));
        if (el.hole && !el.hidden) {
            placeCameras(boxesRef.current, visRef.current, newElements, { theme: themeRef.current });
        }
        postLayout({ elements: newElements });
        setSelectedElementId(el.id);
        setSelectedBox(null);
    }, [placeCameras, postLayout]);

    // Canvas placement gesture: click = default-size at point, drag = drawn box.
    // Pointer events so tap/drag-to-place works with touch on phones.
    const onPlacePointerDown = useCallback((e) => {
        const type = placingType;
        const canvas = canvasRef.current;
        if (!type || !canvas) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        const preview = placePreviewRef.current;

        const onMove = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            moved = true;
            if (preview) {
                preview.style.display = 'block';
                preview.style.left = `${Math.min(startX, ev.clientX) - rect.left}px`;
                preview.style.top = `${Math.min(startY, ev.clientY) - rect.top}px`;
                preview.style.width = `${Math.abs(dx)}px`;
                preview.style.height = `${Math.abs(dy)}px`;
            }
        };

        const onUp = (ev) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (preview) preview.style.display = 'none';
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

            let box;
            if (moved) {
                // Drag → element fills the drawn rectangle.
                const left = Math.min(startX, ev.clientX) - rect.left;
                const top = Math.min(startY, ev.clientY) - rect.top;
                box = {
                    x: clamp((left / rect.width) * 100, 0, 100),
                    y: clamp((top / rect.height) * 100, 0, 100),
                    w: clamp((Math.abs(ev.clientX - startX) / rect.width) * 100, 4, 100),
                    h: clamp((Math.abs(ev.clientY - startY) / rect.height) * 100, 3, 100),
                };
            } else {
                // Click → default-size element centered on the click point.
                const def = defaultElement(type).box;
                const cx = ((startX - rect.left) / rect.width) * 100;
                const cy = ((startY - rect.top) / rect.height) * 100;
                box = {
                    x: clamp(cx - def.w / 2, 0, 100 - def.w),
                    y: clamp(cy - def.h / 2, 0, 100 - def.h),
                    w: def.w, h: def.h,
                };
            }
            addElement(type, box);
            setPlacingType(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [placingType, addElement]);

    const updateElement = useCallback((id, changes) => {
        const prev = elementsRef.current ?? [];
        const touched = prev.find(el => el.id === id);
        const nextElements = prev.map(el => el.id === id ? { ...el, ...changes } : el);
        elementsRef.current = nextElements;
        if ((touched?.hole || changes.hole !== undefined) &&
            (changes.box !== undefined || changes.hole !== undefined || changes.hidden !== undefined || changes.frameStyle !== undefined || changes.borderWidth !== undefined || changes.borderRadius !== undefined)) {
            placeCameras(boxesRef.current, visRef.current, nextElements, { theme: themeRef.current });
        }
        setLayoutSettings(s => ({
            ...s,
            elements: nextElements,
        }));
        postLayout({ elementPatch: { id, changes } });
    }, [placeCameras, postLayout]);

    const deleteElement = useCallback((id) => {
        const prev = elementsRef.current ?? [];
        const touched = prev.find(el => el.id === id);
        const nextElements = prev.filter(el => el.id !== id);
        elementsRef.current = nextElements;
        if (touched?.hole) placeCameras(boxesRef.current, visRef.current, nextElements, { theme: themeRef.current });
        setLayoutSettings(s => ({ ...s, elements: nextElements }));
        setLiveState(prevLive => {
            if (!prevLive) return prevLive;
            const timers = prevLive.timers ? { ...prevLive.timers } : undefined;
            const triggers = prevLive.triggers ? { ...prevLive.triggers } : undefined;
            const counters = prevLive.counters ? { ...prevLive.counters } : undefined;
            if (timers) delete timers[id];
            if (triggers) delete triggers[id];
            if (counters) delete counters[id];
            return {
                ...prevLive,
                ...(timers ? { timers } : {}),
                ...(triggers ? { triggers } : {}),
                ...(counters ? { counters } : {}),
            };
        });
        setSelectedElementId(null);
        postLayout({
            elements: nextElements,
            livePatch: { timers: { [id]: null }, triggers: { [id]: null }, counters: { [id]: null } },
        });
    }, [placeCameras, postLayout]);

    // Copy an element just above the original, nudged so both stay visible.
    const duplicateElement = useCallback((id) => {
        const els = elementsRef.current ?? [];
        const i = els.findIndex(el => el.id === id);
        if (i === -1) return;
        const copyId = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const src = els[i];
        const box = src.box ? { ...src.box, x: Math.min(100 - src.box.w, src.box.x + 2), y: Math.min(100 - src.box.h, src.box.y + 2) } : src.box;
        const newElements = [...els.slice(0, i), { ...src, id: copyId, box }, ...els.slice(i)];
        elementsRef.current = newElements;
        setLayoutSettings(s => ({ ...s, elements: newElements }));
        if (src.hole && !src.hidden) {
            placeCameras(boxesRef.current, visRef.current, newElements, { theme: themeRef.current });
        }
        postLayout({ elements: newElements });
        setSelectedElementId(copyId);
    }, [placeCameras, postLayout]);

    const toggleElementVisibility = useCallback((id) => {
        const prev = elementsRef.current ?? [];
        const touched = prev.find(el => el.id === id);
        if (!touched) return;
        const nextHidden = !touched.hidden;
        const nextElements = prev.map(e => e.id === id ? { ...e, hidden: nextHidden } : e);
        elementsRef.current = nextElements;
        if (touched.hole) placeCameras(boxesRef.current, visRef.current, nextElements, { theme: themeRef.current });
        setLayoutSettings(s => ({ ...s, elements: nextElements }));
        postLayout({ elementPatch: { id, changes: { hidden: nextHidden } } });
    }, [placeCameras, postLayout]);

    const updateElementBox = useCallback((id, box) => updateElement(id, { box }), [updateElement]);

    const selectElement = useCallback((id) => {
        setSelectedElementId(id);
        setSelectedBox(null);
    }, []);

    const onUploadLogo = useCallback((id) => {
        setSelectedElementId(id);
    }, []);

    // ── Box z-order ──────────────────────────────────────────────────────────
    const selectBox = useCallback((id) => {
        setSelectedBox(id);
        setSelectedElementId(null);
        const cur = zOrderRef.current;
        if (cur[cur.length - 1] === id) return;
        const next = [...cur.filter(x => x !== id), id];
        zOrderRef.current = next;
        setZOrder(next);
        postLayout({ zOrder: next });
    }, [postLayout]);

    const reorderBuiltinLayer = useCallback((id, dir) => {
        const cur = zOrderRef.current;
        const i = cur.indexOf(id);
        if (i === -1) return;
        const vis = visRef.current ?? DEFAULT_VISIBILITY;
        let j = i + dir;
        while (j >= 0 && j < cur.length && !(vis[cur[j]] ?? true)) {
            j += dir;
        }
        if (j < 0 || j >= cur.length) return;
        const next = [...cur];
        next.splice(i, 1);
        next.splice(j, 0, id);
        zOrderRef.current = next;
        setZOrder(next);
        postLayout({ zOrder: next });
    }, [postLayout]);

    const layerUp = useCallback((id) => reorderBuiltinLayer(id, 1), [reorderBuiltinLayer]);
    const layerDown = useCallback((id) => reorderBuiltinLayer(id, -1), [reorderBuiltinLayer]);

    const getZIndex = useCallback((id) => {
        const idx = zOrder.indexOf(id);
        return (idx === -1 ? zOrder.length : idx) + 10;
    }, [zOrder]);

    // ── Visibility helpers ───────────────────────────────────────────────────
    const getBoxVisible = useCallback((id) => {
        return (layoutSettings.boxVisibility ?? DEFAULT_VISIBILITY)[id] ?? true;
    }, [layoutSettings.boxVisibility]);

    // A built-in box is "present" when its visibility flag is true. Adding sets
    // it true (and selects it); removing sets it false (taking it off the
    // canvas and out of the layers list).
    const setBuiltinVisible = useCallback((id, value) => {
        // Adding/removing a cam box also shows/places or hides the matching
        // native OBS camera source.
        const nextVis = { ...visRef.current, [id]: value };
        visRef.current = nextVis;
        if (CAMERA_IDS.includes(id)) placeCameras(boxesRef.current, nextVis, elementsRef.current, { theme: themeRef.current });
        const updates = { boxVisibility: nextVis };
        if (id === 'faceCam') updates.showFaceCam = value;
        if (id === 'handCam') updates.showHandCam = value;
        if (id === 'roomCam') updates.showRoomCam = value;
        setLayoutSettings(s => ({ ...s, ...updates }));
        postLayout(updates);
    }, [placeCameras, postLayout]);

    const addBuiltin = useCallback((id) => {
        setBuiltinVisible(id, true);
        selectBox(id); // also brings it to the front of the z-order
    }, [setBuiltinVisible, selectBox]);

    const removeBuiltin = useCallback((id) => {
        setBuiltinVisible(id, false);
        setSelectedBox(prev => (prev === id ? null : prev));
    }, [setBuiltinVisible]);

    // Reorder a custom element within the stack. Earlier in the array renders on
    // top (see zIndex below), so "up" = toward the front / top of the list.
    const moveElement = useCallback((id, dir) => {
        const els = elementsRef.current ?? [];
        const i = els.findIndex(e => e.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= els.length) return;
        const next = [...els];
        [next[i], next[j]] = [next[j], next[i]];
        elementsRef.current = next;
        setLayoutSettings(s => ({ ...s, elements: next }));
        postLayout({ elements: next });
    }, [postLayout]);
    const elementUp = useCallback((id) => moveElement(id, -1), [moveElement]);
    const elementDown = useCallback((id) => moveElement(id, +1), [moveElement]);

    // Per-camera frame styling (frame preset, accent, corner radius).
    const updateCamStyle = useCallback((slot, changes) => {
        const cur = layoutSettingsRef.current.camStyles ?? {};
        const next = { ...cur, [slot]: { ...DEFAULT_CAM_STYLE, ...(cur[slot] ?? {}), ...changes } };
        setLayoutSettings(s => ({ ...s, camStyles: next }));
        postLayout({ camStyles: next });
    }, [postLayout]);

    // ── Hosted layout sync (adaptive polling + live-only delta path) ─────────
    // Viewers (?obs) poll by compound `_v` (<designVer>.<liveVer>):
    //   204 → nothing changed
    //   200 + _liveOnly → only timers/wheel/alert/scene live state changed (skips heavy layout read)
    //   200 full payload → full design update
    // Flips once the first load has brought in the saved-layouts library, so
    // anything that appends to it (e.g. ?kit=) doesn't overwrite it.
    const [libReady, setLibReady] = useState(false);
    useEffect(() => {
        const POLL_FAST = CLEAN_MODE ? 1500 : 3000;
        const POLL_SLOW = CLEAN_MODE ? 10000 : 20000;
        const POLL_MISSES_TO_SLOW = 5;
        let isMounted = true;
        let timer;
        let lastSig = null;    // signature of the last applied design payload
        let misses = 0;        // consecutive unchanged polls
        let libLoaded = false; // saved-layouts library fetched once already
        let activeAbort = null;
        let getErrorActive = false;

        const hydrateDefaultRoomLocally = () => {
            if (libLoaded || !isDefaultRoom()) return;
            libLoaded = true;
            layoutHydratedRef.current = true;
            const localLib = loadLocalLibrary();
            setLayoutSettings(s => ({ ...s, layouts: localLib }));
            if (isMounted) setLibReady(true);
        };

        const syncClockAndLive = (payload, isFirstLoad) => {
            if (typeof payload.serverNow === 'number') {
                const offset = payload.serverNow - Date.now();
                serverOffsetRef.current = offset;
                setServerOffsetMs(prev => (Math.abs(prev - offset) > 50 ? offset : prev));
            }
            if (payload.live && typeof payload.live === 'object') {
                const seq = payload.live.scene?.seq;
                if (isFirstLoad) {
                    lastLiveSceneSeqRef.current = typeof seq === 'number' ? seq : 0;
                }
                setLiveState(payload.live);
            } else if (isFirstLoad && lastLiveSceneSeqRef.current === null) {
                lastLiveSceneSeqRef.current = 0;
            }
        };

        const maybeAnimateRemoteSeq = (payload, isFirstLoad) => {
            const remoteSeq = payload.live?.scene?.seq;
            const hasNewSeq = !isFirstLoad &&
                typeof remoteSeq === 'number' &&
                lastLiveSceneSeqRef.current !== null &&
                remoteSeq > lastLiveSceneSeqRef.current;
            if (typeof remoteSeq === 'number') {
                lastLiveSceneSeqRef.current = Math.max(lastLiveSceneSeqRef.current ?? 0, remoteSeq);
            }
            if (hasNewSeq) {
                const prevStage = captureCurrentStageSnapshot();
                const trans = payload.live?.scene?.transition ?? payload.sceneTransition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
                startSceneTransition(prevStage, trans, boxesRef.current, visRef.current, elementsRef.current, themeRef.current);
            }
        };

        const applyData = (data, isFirstLoad) => {
            if (!isMounted || !data || typeof data !== 'object') return;
            const remoteSeq = data.live?.scene?.seq;
            const shouldAnimateRemoteScene =
                !isFirstLoad &&
                typeof remoteSeq === 'number' &&
                lastLiveSceneSeqRef.current !== null &&
                remoteSeq > lastLiveSceneSeqRef.current;

            const prevStage = shouldAnimateRemoteScene ? captureCurrentStageSnapshot() : null;
            if (typeof remoteSeq === 'number') lastLiveSceneSeqRef.current = remoteSeq;

            const nextBoxes = data.boxes ? { ...DEFAULT_BOXES, ...data.boxes } : boxesRef.current;
            if (data.boxes) {
                boxesRef.current = nextBoxes;
                setBoxes(nextBoxes);
            }
            const nextVis = {
                ...DEFAULT_VISIBILITY,
                ...(data.showFaceCam !== undefined ? { faceCam: data.showFaceCam } : {}),
                ...(data.showHandCam !== undefined ? { handCam: data.showHandCam } : {}),
                ...(data.showRoomCam !== undefined ? { roomCam: data.showRoomCam } : {}),
                ...(data.boxVisibility ?? {}),
            };
            visRef.current = nextVis;
            const nextEls = data.elements ?? elementsRef.current;
            if (data.elements) elementsRef.current = nextEls;
            if (Array.isArray(data.zOrder)) {
                zOrderRef.current = data.zOrder;
                setZOrder(data.zOrder);
            }

            const { boxes: _b, live: _live, serverNow: _sn, _liveOnly: _lo, zOrder: _z, ...rest } = data;
            void _b; void _live; void _sn; void _lo; void _z;
            const nextTheme = data.theme ? getTheme(data.theme) : themeRef.current;
            if (data.theme) themeRef.current = nextTheme;
            setLayoutSettings(s => ({
                ...s,
                ...rest,
                boxVisibility: nextVis,
            }));

            layoutHydratedRef.current = true;

            if (shouldAnimateRemoteScene && prevStage) {
                const trans = data.live?.scene?.transition ?? data.sceneTransition ?? layoutSettingsRef.current.sceneTransition ?? DEFAULT_SCENE_TRANSITION;
                startSceneTransition(prevStage, trans, nextBoxes, nextVis, nextEls, nextTheme);
            } else {
                placeCameras(nextBoxes, nextVis, nextEls, { theme: nextTheme });
            }
        };

        const tick = async (force) => {
            if (!isMounted) return;
            const skip = !force && (editModeRef.current || document.hidden);
            if (!skip) {
                const epochAtStart = writeEpochRef.current;
                activeAbort?.abort();
                const ac = new AbortController();
                activeAbort = ac;
                try {
                    const res = await fetchLayout({
                        v: lastVerRef.current,
                        lite: CLEAN_MODE || libLoaded || isDefaultRoom(),
                        signal: ac.signal,
                    });
                    if (!isMounted || writeEpochRef.current !== epochAtStart) {
                        // A local write happened while this GET was in flight — discard stale response.
                    } else if (res.status === 204) {
                        misses++;
                        if (getErrorActive) {
                            getErrorActive = false;
                            setSyncError(null);
                        }
                    } else if (res.ok) {
                        const raw = await res.json();
                        if (!isMounted || writeEpochRef.current !== epochAtStart) return;
                        if (getErrorActive) {
                            getErrorActive = false;
                            setSyncError(null);
                        }
                        const { _v, ...data } = raw;
                        lastVerRef.current = _v ?? null;
                        const firstLoad = !libLoaded;
                        if (!libLoaded) {
                            libLoaded = true;
                            layoutHydratedRef.current = true;
                            if (isDefaultRoom()) data.layouts = loadLocalLibrary();
                        }

                        syncClockAndLive(data, firstLoad);

                        if (data._liveOnly) {
                            misses = 0;
                            maybeAnimateRemoteSeq(data, firstLoad);
                        } else {
                            const designForSig = { ...data };
                            delete designForSig.serverNow;
                            delete designForSig.live;
                            const sig = JSON.stringify(designForSig);
                            if (sig !== lastSig) {
                                lastSig = sig;
                                misses = 0;
                                applyData(data, firstLoad);
                            } else {
                                misses++;
                                maybeAnimateRemoteSeq(data, firstLoad);
                            }
                        }
                        if (firstLoad && isMounted) setLibReady(true);
                    } else {
                        const errData = await res.json().catch(() => null);
                        if (!isMounted || writeEpochRef.current !== epochAtStart) return;
                        if (!CLEAN_MODE) {
                            getErrorActive = true;
                            setSyncError(errData?.error || `Failed to load layout (HTTP ${res.status})`);
                        }
                        hydrateDefaultRoomLocally();
                    }
                } catch (err) {
                    if (err?.name === 'AbortError' || ac.signal.aborted || !isMounted || writeEpochRef.current !== epochAtStart) {
                        // Aborted / superseded
                    } else {
                        if (!CLEAN_MODE) {
                            getErrorActive = true;
                            setSyncError('Sync failed — check your connection.');
                        }
                        hydrateDefaultRoomLocally();
                    }
                }
            }
            if (!isMounted) return;
            const delay = misses >= POLL_MISSES_TO_SLOW ? POLL_SLOW : POLL_FAST;
            timer = setTimeout(tick, delay);
        };

        forcePollRef.current = () => {
            misses = 0;
            clearTimeout(timer);
            tick(true);
        };

        // Poll promptly again whenever the tab regains focus.
        const onVisible = () => {
            if (document.hidden) return;
            misses = 0;
            clearTimeout(timer);
            tick();
        };
        document.addEventListener('visibilitychange', onVisible);

        tick(true); // initial load (even if mounted in edit mode)

        return () => {
            isMounted = false;
            forcePollRef.current = null;
            clearTimeout(timer);
            activeAbort?.abort();
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [placeCameras, captureCurrentStageSnapshot, startSceneTransition]);

    const prevEditModeRef = useRef(editMode);
    useEffect(() => {
        const wasEditing = prevEditModeRef.current;
        prevEditModeRef.current = editMode;
        if (wasEditing && !editMode) {
            forcePollRef.current?.();
        }
    }, [editMode]);

    useEffect(() => {
        if (!namingScene && !showBgPanel && !showThemePanel && !dockScenesOpen) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (showGallery || helpTab || placingType) return;
            setNamingScene(false);
            setShowBgPanel(false);
            setShowThemePanel(false);
            setDockScenesOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [namingScene, showBgPanel, showThemePanel, dockScenesOpen, showGallery, helpTab, placingType]);

    // ?kit=<starter id> — sent by the /templates/* landing pages. Installs that
    // starter once the library has loaded, then drops the param so a reload
    // doesn't add it again.
    const kitHandled = useRef(false);
    useEffect(() => {
        if (!libReady || kitHandled.current || CLEAN_MODE) return;
        kitHandled.current = true;
        const url = new URL(window.location.href);
        const kitId = url.searchParams.get('kit');
        if (!kitId) return;
        const starter = STARTER_LAYOUTS.find(s => s.id === kitId);
        if (starter) addStarterLayout(starter);
        url.searchParams.delete('kit');
        window.history.replaceState(null, '', url);
    }, [libReady, addStarterLayout]);

    // ── Derived state ────────────────────────────────────────────────────────
    const {
        tasks = [],
        background, boxVisibility = DEFAULT_VISIBILITY,
        theme = DEFAULT_THEME,
        twitchChannel = '',
        sceneTransition: storedTransition,
    } = layoutSettings;
    const elements = useMemo(() => layoutSettings.elements ?? [], [layoutSettings.elements]);
    const sceneTransition = useMemo(() => resolveTransition(storedTransition), [storedTransition]);

    const selectedElement = elements.find(el => el.id === selectedElementId) ?? null;
    const selectedCamera = CAMERA_IDS.includes(selectedBox) ? selectedBox : null;
    const rightPanelOpen = !!selectedElement || !!selectedCamera;

    const shouldRenderBox = (id) => getBoxVisible(id);

    // ── Live mood ── one source of truth the mood-ring and the pet both read.
    // Wall-clock aligned with `serverOffsetMs` so editor and ?obs advance identically.
    const moodRingEl = elements.find(e => e.type === 'moodring' && !e.hidden);
    const moodAuto = !!moodRingEl?.auto;
    const moodCycleSec = Math.max(3, moodRingEl?.cycleSec ?? 20);
    const moodManual = moodRingEl?.mood ?? 'chill';
    const [moodNowMs, setMoodNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (!moodAuto) return undefined;
        const sync = () => setMoodNowMs(Date.now());
        const initId = setTimeout(sync, 0);
        const id = setInterval(sync, 1000);
        return () => {
            clearTimeout(initId);
            clearInterval(id);
        };
    }, [moodAuto]);
    const moodBaseIdx = Math.max(0, MOODS.findIndex(m => m.id === moodManual));
    const currentMood = moodAuto
        ? MOODS[(moodBaseIdx + Math.floor(Math.max(0, moodNowMs + serverOffsetMs) / (moodCycleSec * 1000))) % MOODS.length].id
        : moodManual;
    useEffect(() => { currentMoodRef.current = currentMood; }, [currentMood]);

    // ── Stable callbacks for tasks ───────────────────────────────────────────
    const onTasksChange = useCallback((t) => updateLayout({ tasks: t }), [updateLayout]);

    // ── Memoised DraggableBox children — prevents re-renders on box drag ─────
    // Each child only re-creates when its own data changes (stream, social info, etc.)
    const camStyles = layoutSettings.camStyles ?? NO_CAM_STYLES;
    const veilFace = !editMode && !!camVeil.faceCam;
    const veilHand = !editMode && !!camVeil.handCam;
    const veilRoom = !editMode && !!camVeil.roomCam;
    const faceCamChild = useMemo(() => renderFramedCam('faceCam', 'CAM 01', editMode, camStyles, theme, veilFace), [editMode, camStyles, theme, veilFace]);
    const handCamChild = useMemo(() => renderFramedCam('handCam', 'HAND', editMode, camStyles, theme, veilHand), [editMode, camStyles, theme, veilHand]);
    const roomCamChild = useMemo(() => renderFramedCam('roomCam', 'ROOM', editMode, camStyles, theme, veilRoom), [editMode, camStyles, theme, veilRoom]);
    const aiCompanionChild = useMemo(() => (
        <ScaledContent><div className="w-full h-full overflow-hidden"><AICompanion /></div></ScaledContent>
    ), []);
    const currentTaskChild = useMemo(() => (
        <ScaledContent>
            <div className="w-full h-full bg-black/80 backdrop-blur-md border-t border-white/5 overflow-hidden">
                <CurrentTask tasks={tasks} onTasksChange={onTasksChange} />
            </div>
        </ScaledContent>
    ), [tasks, onTasksChange]);

    // In edit mode the canvas is a 16:9 preview inside the editor shell.
    // In live mode the canvas is position:absolute filling the viewport.
    // canvasRef always points to the same DOM node so transitions & ResizeObserver stay intact.
    const inEditor = editMode && !isRecording;
    const editorCheckerBg = {
        backgroundImage: 'linear-gradient(45deg,#1a1a1a 25%,transparent 25%),linear-gradient(-45deg,#1a1a1a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1a1a 75%),linear-gradient(-45deg,transparent 75%,#1a1a1a 75%)',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0,0 10px,10px -10px,-10px 0px',
        backgroundColor: '#111',
    };
    const canvasBg = (!background || background.type === 'transparent')
        ? (inEditor ? editorCheckerBg : {})
        : bgToStyle(background);
    const editorWorkspaceBg = { background: '#070712' };
    // Live preview in a normal browser (phone/desktop) — NOT the OBS source.
    const livePreview = !inEditor && !isRecording && !CLEAN_MODE;
    const livePreviewBg = { background: '#050510' };

    // Camera cut-outs: OBS draws cameras *under* this browser source, so the
    // scene background (and any backdrop element) gets transparent holes where
    // visible cams / game-capture frames sit. Painted inside the 16:9 canvas in
    // ALL modes (editor sees checkerboard cutouts, OBS sees transparent holes)
    // so transitions crossfade/slide cleanly inside the frame.
    const visFace = getBoxVisible('faceCam'), visHand = getBoxVisible('handCam'), visRoom = getBoxVisible('roomCam');
    const camHoles = useMemo(() => sceneHoles({
        boxes, camStyles, elements,
        boxVisibility: { faceCam: visFace, handCam: visHand, roomCam: visRoom },
    }, theme), [boxes, camStyles, elements, visFace, visHand, visRoom, theme]);
    const captureHoles = useMemo(
        () => elements.filter(e => e.type === 'frame' && e.hole && !e.hidden && e.box).map(e => ({ id: e.id, ...frameHoleGeometry(e, theme) })),
        [elements, theme],
    );
    const canvasBgLayer = Object.keys(canvasBg).length > 0
        ? { ...canvasBg, ...holeMask(camHoles) }
        : null;

    return (
        <div style={{
            width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative',
            ...(inEditor ? { background: '#0a0a12' } : livePreview ? livePreviewBg : { background: 'transparent' }),
        }}>
            {/* OBS recording flash */}
            {isRecording && (
                <MotionDiv
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.2, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,1)', pointerEvents: 'none', zIndex: 0 }}
                />
            )}

            {/* ── EDITOR CHROME — header + panels, hidden in live / OBS mode ── */}
            {inEditor && (<>
                {/* Header bar */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: editorHeaderHeight, zIndex: 400,
                    background: 'rgba(8,8,18,0.98)', borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 10px', flexWrap: isNarrow ? 'wrap' : 'nowrap',
                }}>
                    {/* Left: layers toggle (mobile) + logo + title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isNarrow && (
                            <button
                                onClick={() => setDrawerOpen(o => !o)}
                                title="Layers & sources"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                    minHeight: 44, padding: '0 12px', flexShrink: 0, cursor: 'pointer',
                                    borderRadius: 6, border: '1px solid rgba(255,121,86,0.4)',
                                    background: drawerOpen ? 'rgba(242,96,56,0.4)' : 'rgba(255,121,86,0.16)',
                                    color: '#f7d5c9', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                                }}
                            >
                                <Layers size={13} />Layers
                            </button>
                        )}
                        <a href="/" title="Home" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                            <img src="/favicon.svg" alt="" width="22" height="22" style={{ flexShrink: 0 }} />
                            {!isNarrow && (
                                <span style={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 3, color: 'rgba(255,255,255,0.45)' }}>
                                    qorpStreamer
                                </span>
                            )}
                        </a>
                    </div>
                    {/* Right: actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: isNarrow ? '100%' : undefined, justifyContent: isNarrow ? 'flex-end' : undefined }}>
                        {namingScene ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: isNarrow ? 1 : undefined }}>
                                <input
                                    autoFocus
                                    value={sceneNameDraft}
                                    onChange={(e) => setSceneNameDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { saveScene(sceneNameDraft); setNamingScene(false); }
                                        if (e.key === 'Escape') setNamingScene(false);
                                    }}
                                    placeholder={`Scene ${(activeLayout?.scenes.length ?? 0) + 1}`}
                                    style={{
                                        width: isNarrow ? 110 : 160, flex: isNarrow ? 1 : undefined, height: 42, minWidth: 0, padding: '0 8px', borderRadius: 5,
                                        border: '1px solid rgba(255,121,86,0.45)', background: 'rgba(255,121,86,0.12)',
                                        color: '#e0e7ff', fontSize: 10, fontFamily: 'monospace', outline: 'none',
                                    }}
                                />
                                <HdrBtn active title="Save scene" onClick={() => { saveScene(sceneNameDraft); setNamingScene(false); }}>
                                    <Check size={12} style={{ marginRight: 4 }} />{!isNarrow && 'Save'}
                                </HdrBtn>
                                <HdrBtn icon title="Cancel" onClick={() => setNamingScene(false)}><X size={12} /></HdrBtn>
                            </div>
                        ) : (
                            <HdrBtn onClick={() => { setSceneNameDraft(''); setNamingScene(true); }}><Save size={12} style={{ marginRight: 4 }} />Save Scene</HdrBtn>
                        )}
                        {!(isNarrow && namingScene) && (
                            <>
                                <HdrBtn title="Reset" icon={isNarrow} onClick={resetLayout}><RotateCcw size={12} style={{ marginRight: 4 }} />{!isNarrow && 'Reset'}</HdrBtn>
                                <HdrBtn icon title="Help" onClick={() => openHelp('edit', 'edit_header')}><HelpCircle size={12} /></HdrBtn>
                                <HdrSep />
                            </>
                        )}
                        <button
                            onClick={() => { setEditMode(false); setSelectedBox(null); setSelectedElementId(null); setShowBgPanel(false); setShowThemePanel(false); setNamingScene(false); }}
                            style={{ minHeight: 44, padding: '0 10px', borderRadius: 5, fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, border: '1px solid rgba(255,121,86,0.45)', background: 'rgba(242,96,56,0.4)', color: '#fff', cursor: 'pointer' }}
                        ><Check size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Done</button>
                    </div>
                </div>

                {/* Mobile drawer backdrop — tap to dismiss the layers panel */}
                {isNarrow && drawerOpen && (
                    <div
                        onClick={() => setDrawerOpen(false)}
                        style={{ position: 'absolute', inset: 0, top: editorHeaderHeight, zIndex: 350, background: 'rgba(0,0,0,0.5)' }}
                    />
                )}

                {/* Left panel: layers + sources — fixed sidebar on desktop, slide-in drawer on phones */}
                <div style={{
                    position: 'absolute', top: editorHeaderHeight, left: 0, bottom: 0, zIndex: isNarrow ? 360 : 300,
                    background: 'rgba(7,7,16,0.98)', borderRight: '1px solid rgba(255,255,255,0.07)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    ...(isNarrow ? {
                        width: 'min(280px, 85vw)',
                        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
                        transition: 'transform 0.22s ease',
                        boxShadow: drawerOpen ? '8px 0 40px rgba(0,0,0,0.6)' : 'none',
                    } : { width: 240 }),
                }}>
                    <LayersPanel
                        boxVisibility={boxVisibility}
                        onAddBuiltin={addBuiltin}
                        onAddElement={addElement}
                        onPlaceElement={armPlace}
                        layoutName={activeLayout?.name ?? null}
                        scenes={activeLayout?.scenes ?? []}
                        activeSceneId={activeLayout?.activeSceneId ?? null}
                        onSwitchScene={switchScene}
                        onSaveScene={saveScene}
                        onUpdateScene={updateScene}
                        onRenameScene={renameScene}
                        onDeleteScene={deleteScene}
                        onOpenLayouts={() => setShowGallery(true)}
                        sceneTransition={sceneTransition}
                        onTransitionChange={(t) => updateLayout({ sceneTransition: resolveTransition(t) })}
                        onOpenBackground={() => { setShowBgPanel(v => !v); setShowThemePanel(false); }}
                        onOpenTheme={() => { setShowThemePanel(v => !v); setShowBgPanel(false); }}
                        onResetLayout={resetLayout}
                    />
                </div>

                {/* Right panel: element editor or camera picker — sidebar on desktop, bottom sheet on phones */}
                {rightPanelOpen && (
                    <div style={{
                        position: 'absolute', zIndex: isNarrow ? 360 : 300,
                        background: 'rgba(7,7,16,0.98)', overflow: 'auto',
                        ...(isNarrow ? {
                            left: 0, right: 0, bottom: 0, top: 'auto', maxHeight: '58vh',
                            borderTop: '1px solid rgba(255,121,86,0.3)',
                            borderTopLeftRadius: 14, borderTopRightRadius: 14,
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
                        } : {
                            top: editorHeaderHeight, right: 0, bottom: 0, width: RIGHT_PANEL_W,
                            borderLeft: '1px solid rgba(255,255,255,0.07)',
                        }),
                    }}>
                        {isNarrow && (
                            <div style={{
                                position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', background: 'rgba(7,7,16,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto' }} />
                                <button
                                    onClick={() => { setSelectedElementId(null); setSelectedBox(null); }}
                                    title="Close"
                                    style={{ position: 'absolute', right: 8, top: 6, padding: 4, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}
                        {selectedElement ? (
                            <ElementEditor
                                element={selectedElement}
                                onChange={(changes) => updateElement(selectedElement.id, changes)}
                                onDelete={() => deleteElement(selectedElement.id)}
                                onDuplicate={() => duplicateElement(selectedElement.id)}
                                twitchChannel={twitchChannel}
                                onTwitchChannelChange={(v) => updateLayout({ twitchChannel: v })}
                                liveState={liveState}
                                serverOffsetMs={serverOffsetMs}
                                onLiveAction={handleLiveAction}
                                theme={theme}
                            />
                        ) : (
                            <CameraEditor
                                slot={selectedCamera}
                                camStyle={{ ...DEFAULT_CAM_STYLE, accent: theme.accent, ...(camStyles[selectedCamera] ?? {}) }}
                                onChangeCamStyle={(changes) => updateCamStyle(selectedCamera, changes)}
                            />
                        )}
                    </div>
                )}

                {/* Background panel */}
                {showBgPanel && (
                    <BackgroundPanel
                        bg={background}
                        onChange={(newBg) => updateLayout({ background: newBg })}
                        onClose={() => setShowBgPanel(false)}
                    />
                )}

                {/* Theme panel */}
                {showThemePanel && (
                    <ThemePanel
                        theme={theme}
                        onApply={applyTheme}
                        onChange={updateTheme}
                        onInstallPack={installPack}
                        onClose={() => setShowThemePanel(false)}
                    />
                )}
            </>)}

            {/* ── CANVAS POSITIONING WRAPPER ── */}
            {/* In editor: offset by header + left/right panels, canvas is 16:9 preview */}
            {/* In live:   fills the entire viewport absolutely */}
            <div style={{
                position: 'absolute',
                top:    inEditor ? editorHeaderHeight : 0,
                // On phones the panels float over the canvas, so it spans full width.
                left:   inEditor && !isNarrow ? 240 : 0,
                right:  inEditor && !isNarrow ? (rightPanelOpen ? RIGHT_PANEL_W : 0) : 0,
                bottom: 0,
                overflow: inEditor ? 'auto' : undefined,
                padding: inEditor ? (isNarrow ? 8 : 16) : 0,
                boxSizing: 'border-box',
                ...(inEditor ? editorWorkspaceBg : { background: 'transparent' }),
            }}>
                {/* Dot-grid backdrop */}
                {inEditor && (
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        backgroundImage: 'radial-gradient(rgba(255,121,86,0.10) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }} />
                )}
                {/* ── THE CANVAS ──
                    Live mode  → position:absolute filling the viewport (OBS sees this).
                    Editor mode → fills content area of wrapper (16px padding on each side),
                                  height from aspect-ratio so 16:9 is always maintained.
                    The 16px padding ensures resize handles at canvas edges stay reachable.
                */}
                <div
                    ref={canvasRef}
                    onPointerDown={onCanvasPointerDown}
                    className={`font-inter overflow-hidden ${isRecording ? 'outline outline-4 outline-red-500/50' : ''}`}
                    style={{
                        isolation: 'isolate', // required for Element Capture (RestrictionTarget)
                        ...(inEditor ? {
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '16 / 9',
                            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
                        } : livePreview ? {
                            // Render at the real 1920×1080 size and scale-to-fit so
                            // every element matches its OBS proportions (fixed-px
                            // fonts don't overflow tiny %-boxes). Centered, letterboxed.
                            position: 'absolute',
                            top: '50%', left: '50%',
                            width: BASE_W, height: BASE_H,
                            transform: `translate(-50%, -50%) scale(${fitScale})`,
                            transformOrigin: 'center center',
                        } : {
                            position: 'absolute',
                            inset: 0,
                        }),
                    }}
                >
                    {(() => {
                        const transType = exitStage?.transition?.type ?? activeTransition.type;
                        const transSec = (exitStage?.transition?.durationMs ?? activeTransition.durationMs) / 1000;
                        const spec = SCENE_TRANSITIONS[transType] ?? SCENE_TRANSITIONS.fade;
                        const animating = !!exitStage && transSec > 0;
                        const enterBgOpaque = !!background && background.type !== 'transparent';
                        const solidExitUnderOpaqueFade = transType === 'fade' && enterBgOpaque;
                        const enterZ = spec.enterTop || solidExitUnderOpaqueFade ? 20 : 10;
                        const exitZ = spec.enterTop || solidExitUnderOpaqueFade ? 10 : 15;

                        return (
                            <>
                                {/* Exiting frozen scene layer during scene transition */}
                                {animating && (
                                    <MotionDiv
                                        key={exitStage.key}
                                        initial={solidExitUnderOpaqueFade ? { opacity: 1 } : spec.exit.initial}
                                        animate={solidExitUnderOpaqueFade ? { opacity: 1 } : spec.exit.animate}
                                        transition={solidExitUnderOpaqueFade ? { duration: 0 } : {
                                            duration: transSec,
                                            ease: spec.ease,
                                            ...(spec.exit.times ? { times: spec.exit.times } : {}),
                                        }}
                                        style={{ position: 'absolute', inset: 0, zIndex: exitZ, pointerEvents: 'none', willChange: 'transform, opacity, clip-path' }}
                                    >
                                        <FrozenSceneLayer stage={exitStage} />
                                    </MotionDiv>
                                )}

                                {/* Entering / Active live scene layer */}
                                <MotionDiv
                                    key={sceneEpoch}
                                    data-canvas-stage="1"
                                    initial={sceneEpoch > 0 && transSec > 0 ? spec.enter.initial : false}
                                    animate={spec.enter.animate}
                                    transition={sceneEpoch > 0 && transSec > 0 ? {
                                        duration: transSec,
                                        ease: spec.ease,
                                        ...(spec.enter.times ? { times: spec.enter.times } : {}),
                                    } : { duration: 0 }}
                                    onAnimationComplete={animating ? () => finishSceneTransition(exitStage.token) : undefined}
                                    style={{ position: 'absolute', inset: 0, zIndex: enterZ, willChange: 'transform, opacity, clip-path' }}
                                >
                                    {inEditor && background && background.type !== 'transparent' && (
                                        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', ...editorCheckerBg }} />
                                    )}
                                    {canvasBgLayer && (
                                        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', ...canvasBgLayer }} />
                                    )}
                                    {!inEditor && captureHoles.map(h => (
                                        <div
                                            key={`veil_${h.id}`}
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: `${h.box.x}%`,
                                                top: `${h.box.y}%`,
                                                width: `${h.box.w}%`,
                                                height: `${h.box.h}%`,
                                                borderRadius: h.radius || 0,
                                                background: '#070712',
                                                zIndex: 1,
                                                opacity: camVeil.holes ? 1 : 0,
                                                transition: camVeil.holes ? 'none' : 'opacity 160ms ease-out',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    ))}

                                    {/* ── Custom elements ── */}
                                    {elements.map((el, i) => {
                                        if (el.hidden) return null;
                                        return (
                                            <ElementBox
                                                key={el.id}
                                                element={el}
                                                zIndex={100 + (elements.length - 1 - i) + (selectedElementId === el.id ? 50 : 0)}
                                                selected={selectedElementId === el.id}
                                                onSelect={selectElement}
                                                onBoxChange={updateElementBox}
                                                onLayerUp={elementUp}
                                                onLayerDown={elementDown}
                                                onUploadLogo={onUploadLogo}
                                                onElementUpdate={updateElement}
                                                editMode={editMode}
                                                canvasRef={canvasRef}
                                                theme={theme}
                                                mood={currentMood}
                                                channel={twitchChannel}
                                                holes={el.type === 'backdrop' ? camHoles : undefined}
                                                liveState={liveState}
                                                serverOffsetMs={serverOffsetMs}
                                                onLiveAction={handleLiveAction}
                                            />
                                        );
                                    })}

                                    {shouldRenderBox('faceCam') && <DraggableBox id="faceCam" title="Face Cam" box={boxes.faceCam} zIndex={getZIndex('faceCam')} selected={selectedBox === 'faceCam'} onSelect={selectBox} onLayerUp={layerUp} onLayerDown={layerDown} onBoxChange={updateBox} editMode={editMode} canvasRef={canvasRef}>{faceCamChild}</DraggableBox>}
                                    {shouldRenderBox('aiCompanion') && <DraggableBox id="aiCompanion" title="AI Companion" box={boxes.aiCompanion} zIndex={getZIndex('aiCompanion')} selected={selectedBox === 'aiCompanion'} onSelect={selectBox} onLayerUp={layerUp} onLayerDown={layerDown} onBoxChange={updateBox} editMode={editMode} canvasRef={canvasRef}>{aiCompanionChild}</DraggableBox>}
                                    {shouldRenderBox('handCam') && <DraggableBox id="handCam" title="Hand Cam" box={boxes.handCam} zIndex={getZIndex('handCam')} selected={selectedBox === 'handCam'} onSelect={selectBox} onLayerUp={layerUp} onLayerDown={layerDown} onBoxChange={updateBox} editMode={editMode} canvasRef={canvasRef}>{handCamChild}</DraggableBox>}
                                    {shouldRenderBox('roomCam') && <DraggableBox id="roomCam" title="Room Cam" box={boxes.roomCam} zIndex={getZIndex('roomCam')} selected={selectedBox === 'roomCam'} onSelect={selectBox} onLayerUp={layerUp} onLayerDown={layerDown} onBoxChange={updateBox} editMode={editMode} canvasRef={canvasRef}>{roomCamChild}</DraggableBox>}
                                    {shouldRenderBox('currentTask') && <DraggableBox id="currentTask" title="Current Task" box={boxes.currentTask} zIndex={getZIndex('currentTask')} selected={selectedBox === 'currentTask'} onSelect={selectBox} onLayerUp={layerUp} onLayerDown={layerDown} onBoxChange={updateBox} editMode={editMode} canvasRef={canvasRef}>{currentTaskChild}</DraggableBox>}
                                </MotionDiv>

                                {/* Dip-to-black curtain overlay for 'fade-dip' */}
                                {animating && spec.dip && (
                                    <MotionDiv
                                        key={`dip_${exitStage.key}`}
                                        aria-hidden
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 1, 1, 0] }}
                                        transition={{ duration: transSec, times: [0, 0.34, 0.66, 1], ease: 'easeInOut' }}
                                        style={{ position: 'absolute', inset: 0, zIndex: 450, background: '#050510', pointerEvents: 'none' }}
                                    />
                                )}

                                {/* Subtle leading-edge accent beam for 'wipe' */}
                                {animating && spec.wipeEdge && (
                                    <MotionDiv
                                        key={`edge_${exitStage.key}`}
                                        aria-hidden
                                        initial={{ left: '0%', opacity: 0.9 }}
                                        animate={{ left: '100%', opacity: 0 }}
                                        transition={{ duration: transSec, ease: spec.ease }}
                                        style={{
                                            position: 'absolute', top: 0, bottom: 0, width: 3, zIndex: 450, pointerEvents: 'none',
                                            background: `linear-gradient(180deg, transparent, ${theme.accent ?? '#ff7956'}, transparent)`,
                                            boxShadow: `0 0 18px ${theme.accent ?? '#ff7956'}`,
                                        }}
                                    />
                                )}
                            </>
                        );
                    })()}

                    {/* ── Placement layer — click to drop / drag to draw a new element ── */}
                    {inEditor && placingType && (
                        <div
                            onPointerDown={onPlacePointerDown}
                            onContextMenu={(e) => { e.preventDefault(); setPlacingType(null); }}
                            style={{ position: 'absolute', inset: 0, zIndex: 500, cursor: 'crosshair', touchAction: 'none' }}
                        >
                            <div ref={placePreviewRef} style={{
                                position: 'absolute', display: 'none', pointerEvents: 'none',
                                border: '1px dashed rgba(165,180,252,0.9)', background: 'rgba(255,121,86,0.15)', borderRadius: 4,
                            }} />
                            <div style={{
                                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none',
                                background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,121,86,0.4)', borderRadius: 8,
                                padding: '5px 12px', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
                                color: '#ff7956', whiteSpace: 'nowrap',
                            }}>
                                Click or drag to place {placingType} · Esc to cancel
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Current layers — fills the free space under the 16:9 canvas ── */}
                {inEditor && (
                    <div style={{ position: 'relative' }}>
                        <LayerStrip
                            narrow={isNarrow}
                            boxVisibility={boxVisibility}
                            zOrder={zOrder}
                            elements={elements}
                            selectedBox={selectedBox}
                            selectedElementId={selectedElementId}
                            onSelectBox={selectBox}
                            onLayerUp={layerUp}
                            onLayerDown={layerDown}
                            onRemoveBuiltin={removeBuiltin}
                            onSelectElement={selectElement}
                            onToggleElement={toggleElementVisibility}
                            onElementUp={elementUp}
                            onElementDown={elementDown}
                            onDeleteElement={deleteElement}
                        />
                    </div>
                )}
            </div>

            {/* ── LIVE MODE DOCK — minimal pill; hidden while recording or in ?obs clean mode ── */}
            {!editMode && !isRecording && !CLEAN_MODE && (
                <div style={{ position: 'absolute', bottom: 16, width: 'max-content', maxWidth: 'calc(100% - 16px)', left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
                    {dockCollapsed ? (
                        <button
                            onClick={() => setDockCollapsed(false)}
                            title="Show controls"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 44, padding: 0, cursor: 'pointer', background: 'rgba(6,6,16,0.7)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: 'rgba(255,255,255,0.4)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(6,6,16,0.92)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'rgba(6,6,16,0.7)'; }}
                        >
                            <GripHorizontal size={14} />
                        </button>
                    ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center', background: 'rgba(6,6,16,0.88)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: isNarrow ? '6px 8px' : '5px 7px', boxShadow: '0 8px 40px rgba(0,0,0,0.72)', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 24px)' }}>
                        {/* Tools (icon-only, Go Live keeps its label) ┃ content: layouts + current scene */}
                        <DockBtn icon onClick={() => { window.location.href = '/'; }} title="Home">
                            <Home size={13} />
                        </DockBtn>
                        <DockBtn icon onClick={() => setEditMode(true)} title="Edit layout">
                            <Pencil size={13} />
                        </DockBtn>
                        <DockBtn onClick={goLive} active={!isDefaultRoom()} title={isPreviewMode() ? 'Entre para salvar na conta e gerar o link do OBS' : isProjectMode() ? 'Publicar o rascunho no OBS link' : isDefaultRoom() ? 'Go Live — create a private room & copy the OBS link' : `Live in room ${getRoom()} — copy the OBS link again`}>
                            <Play size={12} style={{ marginRight: 4 }} />{isPreviewMode() ? 'Salvar e publicar' : isProjectMode() ? 'Publicar' : isDefaultRoom() ? 'Go Live' : 'Copy Link'}
                        </DockBtn>
                        <DockBtn icon onClick={() => openHelp('dock', 'dock')} title="How the studio works">
                            <HelpCircle size={13} />
                        </DockBtn>
                        <DockBtn icon onClick={() => setDockCollapsed(true)} title="Hide controls for a clean view">
                            <ChevronUp size={13} style={{ transform: 'rotate(180deg)' }} />
                        </DockBtn>
                        <div style={{ width: 1, height: 18, margin: '0 4px', background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />
                        <DockBtn icon onClick={() => setShowGallery(true)} title={activeLayout ? `Layouts — current: ${activeLayout.name}` : 'Layouts & templates'}>
                            <LayoutGrid size={13} />
                        </DockBtn>
                        {/* Scene switcher — change scene without entering edit mode */}
                        {activeLayout && activeLayout.scenes.length > 0 && (
                            <div style={{ position: 'relative' }}>
                                <DockBtn icon={isNarrow} active={dockScenesOpen} onClick={() => setDockScenesOpen(o => !o)} title="Switch scene">
                                    <Film size={12} style={{ marginRight: isNarrow ? 0 : 4 }} />
                                    {!isNarrow && (activeScene?.name ?? 'Scene')}
                                    <ChevronUp size={11} style={{ marginLeft: isNarrow ? 1 : 4, transform: dockScenesOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.15s', opacity: 0.6 }} />
                                </DockBtn>
                                <AnimatePresence>
                                    {dockScenesOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.14 }}
                                            style={{
                                                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, minWidth: 168,
                                                background: 'rgba(6,6,16,0.96)', backdropFilter: 'blur(24px)',
                                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 5,
                                                boxShadow: '0 8px 40px rgba(0,0,0,0.72)', display: 'flex', flexDirection: 'column', gap: 1,
                                            }}
                                        >
                                            {activeLayout.scenes.map(s => {
                                                const isActive = s.id === activeLayout.activeSceneId;
                                                return (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => { switchScene(s.id); setDockScenesOpen(false); }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '6px 9px', borderRadius: 6,
                                                            background: isActive ? 'rgba(255,121,86,0.2)' : 'transparent', border: 'none', cursor: 'pointer',
                                                            color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase',
                                                            letterSpacing: 1, textAlign: 'left', whiteSpace: 'nowrap',
                                                        }}
                                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#ff7956' : '#64748b', flexShrink: 0 }} />
                                                        <span style={{ flex: 1 }}>{s.name}</span>
                                                        {isActive && <Check size={11} color="#ff7956" />}
                                                    </button>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                    )}
                </div>
            )}

            {/* Save / sync error banner */}
            {syncError && !CLEAN_MODE && (
                <div
                    role="alert"
                    style={{
                        position: 'absolute', bottom: editMode ? 18 : 70, left: '50%', transform: 'translateX(-50%)', zIndex: 420,
                        display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'min(420px, calc(100vw - 24px))',
                        background: 'rgba(69,10,10,0.95)', border: '1px solid rgba(248,113,113,0.45)', borderRadius: 10,
                        padding: '8px 12px', color: '#fecaca', fontFamily: 'monospace', fontSize: 11, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
                    }}
                >
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{syncError}</span>
                    <button
                        type="button"
                        onClick={() => setSyncError(null)}
                        aria-label="Dismiss error"
                        style={{ background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer', padding: 2, display: 'flex' }}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* Free preview notice: nothing is saved outside this browser. */}
            {isPreviewMode() && !CLEAN_MODE && (
                <div role="status" style={{
                    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 390,
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
                    width: 'max-content', maxWidth: 'calc(100vw - 24px)', padding: '8px 10px 8px 14px',
                    background: 'rgba(21,23,20,0.94)', border: '1px solid rgba(215,247,123,0.35)', borderRadius: 10,
                    color: '#f0f0e9', fontFamily: 'Inter, sans-serif', fontSize: 13, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                }}>
                    <span><strong style={{ color: '#d7f77b' }}>Preview grátis.</strong> Suas alterações ficam só neste navegador.</span>
                    <button type="button" onClick={goLive} style={{
                        font: 'inherit', fontWeight: 600, minHeight: 32, padding: '0 12px',
                        background: '#d7f77b', color: '#151714', border: 0, borderRadius: 6, cursor: 'pointer',
                    }}>Entrar e salvar</button>
                </div>
            )}

            {/* Go Live confirmation toast — bottom-center, above the dock */}
            <AnimatePresence>
                {liveToast && !CLEAN_MODE && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.18 }}
                        style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 400, width: 'min(380px, calc(100vw - 24px))', background: 'rgba(6,6,16,0.96)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,121,86,0.35)', borderRadius: 12, padding: '12px 16px', boxShadow: '0 8px 40px rgba(0,0,0,0.72)', color: 'rgba(255,255,255,0.9)', fontFamily: 'monospace' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#ff7956' }}>
                                <Check size={13} />{liveToast.published ? 'Publicado' : liveToast.fresh ? 'Room created' : 'Live'} · {liveToast.room}
                            </div>
                            <button
                                type="button"
                                onClick={() => { clearTimeout(liveToastTimerRef.current); setLiveToast(null); }}
                                aria-label="Dismiss notification"
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 2, display: 'flex' }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)' }}>
                            {liveToast.published && !liveToast.obs
                                ? 'O OBS mostra esta versão em poucos segundos. O link do OBS continua o mesmo; para gerar outro, use a página da conta.'
                                : liveToast.published
                                    ? `${liveToast.copied ? 'Link do OBS copiado.' : 'Copie o link do OBS abaixo.'} Cole no OBS como Fonte de navegador 1920×1080. Ele só aparece agora: guarde-o.`
                                    : `${liveToast.copied ? 'OBS link copied to clipboard.' : 'Copy the OBS link below.'} Paste it into OBS as a Browser Source.`}
                        </div>
                        {liveToast.obs && <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: 'rgba(255,255,255,0.8)', wordBreak: 'break-all', userSelect: 'all' }}>
                            {liveToast.obs}
                        </div>}
                    </motion.div>
                )}
            </AnimatePresence>

            {helpTab && <HelpPanel key={helpTab} initialTab={helpTab} onClose={closeHelp} />}

            {/* Layouts gallery (the show/collection switcher) — both modes */}
            {showGallery && (
                <LayoutGallery
                    layouts={layouts}
                    activeLayoutId={activeLayoutId}
                    starters={STARTER_LAYOUTS}
                    onAddStarter={(s) => { addStarterLayout(s); setShowGallery(false); }}
                    onClose={() => setShowGallery(false)}
                    onCreate={createLayout}
                    onSwitch={(id) => { switchLayout(id); setShowGallery(false); }}
                    onRename={renameLayout}
                    onDelete={deleteLayout}
                />
            )}
        </div>
    );
};

const HdrBtn = ({ children, active, icon, title, onClick }) => (
    <button onClick={onClick} title={title} aria-label={title} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', padding: icon ? '0 8px' : '0 10px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.1s', ...(active ? { background: 'rgba(255,121,86,0.2)', borderColor: 'rgba(255,121,86,0.4)', color: '#ff7956' } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.38)' }) }}>
        {children}
    </button>
);

const HdrSep = () => <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />;

const DockBtn = ({ children, active, icon, disabled, onClick, title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={icon ? title : undefined}
        style={{
            minHeight: 44,
            minWidth: 44,
            justifyContent: 'center',
            padding: icon ? '0 10px' : '0 12px',
            borderRadius: 8,
            fontSize: 11,
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: 1,
            border: '1px solid',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.45 : 1,
            transition: 'all 0.12s',
            display: 'flex', alignItems: 'center', gap: 4,
            lineHeight: 1,
            ...(active
                ? { background: 'rgba(242,96,56,0.52)', borderColor: 'rgba(255,121,86,0.5)', color: '#fff' }
                : { background: 'transparent', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }
            ),
        }}
    >
        {children}
    </button>
);

export default OverlayLayout;
