import OBSWebSocket from 'obs-websocket-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { frameHoleGeometry } from '../components/graphics';

const OBSContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useOBS = () => useContext(OBSContext);

const INITIAL_RETRY_INTERVAL = 5000; // ms before first reconnect attempt
const MAX_RETRY_INTERVAL = 30000;
const CONFIG_STORAGE_KEY = 'obs_ws_config';
const CAPTURE_SCALED_KEY = 'obs_capture_scaled';
const BASELINE_STORAGE_KEY = 'obs_transform_baselines';
const DEFAULT_URLS = ['ws://127.0.0.1:4455', 'ws://localhost:4455'];

// Input kinds that are physical cameras (dshow = Windows, v4l2 = Linux,
// av_capture/avcapture = macOS). Exclude screen/window/desktop captures so
// PipeWire Wayland captures (e.g. pipewire-screen-capture-source) are never
// mistaken for a webcam.
const CAMERA_KIND = /dshow|v4l2|av_capture|avcapture|video_capture|camera|pipewire[-_]?camera|droidcam|ivcam/i;
const NON_CAMERA_KIND = /screen|desktop|window|monitor|display|game|xshm|xcomposite|browser|image|color|text|wasapi|pulse|coreaudio|alsa|jack|ffmpeg_source|vlc_source|slideshow|syphon|group|scene/i;
const EXPLICIT_CAMERA_NAME = /(?:^|[^a-z0-9])(web ?cam|face ?cam|hand ?cam|room ?cam|cam ?link|stream ?cam|camera|c[aâ]mera|cam|face)(?:$|[^a-z])/i;
const NON_CAMERA_NAME = /(?:^|[^a-z0-9])(game ?capture|capture ?card|placa de captura|captura de (?:jogo|tela|janela|monitor|display)|desktop|tela|monitor|display|screen|janela|window|game|jogo|console|elgato|avermedia|magewell|ps4|ps5|xbox|switch|hdmi)(?:$|[^a-z0-9])|(?:^|[^a-z0-9])(?:hd|4k) ?60/i;

const CAPTURE_KIND = /game_capture|window_capture|monitor_capture|display_capture|screen_capture|desktop_capture|pipewire[-_]?(screen|desktop|window)|xshm|xcomposite|macos[-_]?screen|sck_video/i;
const CAPTURE_NAME = /(?:^|[^a-z0-9])(game|jogo|desktop|screen|tela|monitor|window|janela|display|capture|captura|console|elgato|avermedia|magewell|ps4|ps5|xbox|switch|hdmi)(?:$|[^a-z0-9])|(?:^|[^a-z0-9])(?:hd|4k) ?60/i;
const NON_CAPTURE_KIND = /wasapi_|pulse_|coreaudio_|alsa_|jack|ffmpeg_source|vlc_source|image_source|slideshow|text_|color_source|browser_source|ndi_source|syphon|(?:^|[_-])(?:group|scene)(?:$|[_-])/i;

const isCameraItem = (name, kind) => {
    const n = name ?? '';
    const k = kind ?? '';
    if (NON_CAMERA_KIND.test(k)) return false;
    // Explicit cam/webcam/face/cam link names win even on capture-card brands (e.g. Elgato Cam Link / Facecam).
    if (EXPLICIT_CAMERA_NAME.test(n)) return true;
    // Exclude capture cards & screen/console names so dshow/v4l2/av_capture cards aren't mistaken for webcams.
    if (NON_CAMERA_NAME.test(n)) return false;
    return CAMERA_KIND.test(k);
};

const isCaptureItem = (name, kind) => {
    const n = name ?? '';
    const k = kind ?? '';
    if (isCameraItem(n, k)) return false;
    if (NON_CAPTURE_KIND.test(k)) return false;
    return CAPTURE_KIND.test(k) || CAPTURE_NAME.test(n);
};

const findCaptureHoles = (elements = [], theme) =>
    elements
        .filter((e) => e?.type === 'frame' && e?.hole && !e?.hidden && e?.box)
        .map((e) => ({
            ...e,
            box: frameHoleGeometry(e, theme).box,
        }));

const sourceKey = (sceneName, sceneItemId, sourceName) =>
    `${sceneName}::${sceneItemId ?? ''}::${sourceName}`;

const isLikelyOverlayFittedCapture = (t, baseWidth, baseHeight) =>
    Boolean(
        t &&
        t.boundsType === 'OBS_BOUNDS_SCALE_INNER' &&
        (t.alignment === 5 || t.alignment === undefined) &&
        t.cropToBounds === false &&
        Number(t.cropLeft ?? 0) === 0 &&
        Number(t.cropRight ?? 0) === 0 &&
        Number(t.cropTop ?? 0) === 0 &&
        Number(t.cropBottom ?? 0) === 0 &&
        Number(t.rotation ?? 0) === 0 &&
        Number(t.boundsWidth ?? 0) > 0 &&
        Number(t.boundsHeight ?? 0) > 0 &&
        (Number(t.boundsWidth) < baseWidth - 4 || Number(t.boundsHeight) < baseHeight - 4),
    );

const readJsonMap = (storageKey) => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw || raw === '1') return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const writeJsonMap = (storageKey, map) => {
    try {
        if (map && Object.keys(map).length > 0) localStorage.setItem(storageKey, JSON.stringify(map));
        else localStorage.removeItem(storageKey);
    } catch {
        // Ignore storage errors
    }
};

// The OBS player (?obs / ?clean) runs inside OBS itself, where nobody can
// click a button, so it always tries to connect. The editor only connects
// after the user opts in, so a studio without OBS open stays quiet.
const CLEAN_MODE = (() => {
    try {
        const p = new URLSearchParams(window.location.search);
        return p.has('obs') || p.has('clean');
    } catch {
        return false;
    }
})();

const loadObsConfig = () => {
    try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (!raw) return { url: '', password: '', enabled: false };
        const parsed = JSON.parse(raw);
        return {
            url: typeof parsed?.url === 'string' ? parsed.url : '',
            password: typeof parsed?.password === 'string' ? parsed.password : '',
            // Configs saved before this flag existed came from users who set
            // up the WebSocket on purpose, so they stay enabled.
            enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : true,
        };
    } catch {
        return { url: '', password: '', enabled: false };
    }
};

const saveObsConfig = (config) => {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
        // Ignore storage quota / privacy mode failures
    }
    return config;
};

const normalizeWsUrl = (raw) => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return '';
    const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
    try {
        const parsed = new URL(withScheme);
        if (!parsed.port) parsed.port = '4455';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return withScheme;
    }
};

const classifyObsError = (err, attemptedUrl) => {
    const code = err?.code ?? null;
    const message = String(err?.message ?? err ?? 'Erro desconhecido');
    if (code === 4009 || /auth|password|authentication/i.test(message)) {
        return { kind: 'auth', code: code ?? 4009, message, url: attemptedUrl };
    }
    if (err?.name === 'SecurityError' || /mixed content|insecure websocket/i.test(message)) {
        return { kind: 'mixed-content', code, message, url: attemptedUrl };
    }
    if (code === 1006 || /ECONNREFUSED|timeout|failed|network/i.test(message) || !code) {
        return { kind: 'unreachable', code: code ?? 1006, message, url: attemptedUrl };
    }
    return { kind: 'other', code, message, url: attemptedUrl };
};

// Map OBS camera sources to overlay cam slots. Source names win when they hint
// at a slot ("hand cam", "room cam", "face cam"); any remaining cameras fill
// the leftover slots in faceCam → handCam → roomCam order, so a single unnamed
// webcam lands on faceCam.
const assignCamSlots = (cams) => {
    const slots = ['faceCam', 'handCam', 'roomCam'];
    const out = {};
    const rest = [];
    for (const cam of cams) {
        const name = cam.sourceName ?? '';
        const named =
            (/hand/i.test(name) && 'handCam') ||
            (/room/i.test(name) && 'roomCam') ||
            (/face/i.test(name) && 'faceCam');
        if (named && !out[named]) out[named] = cam;
        else rest.push(cam);
    }
    for (const cam of rest) {
        const free = slots.find(s => !out[s]);
        if (!free) break;
        out[free] = cam;
    }
    return out;
};

const FULLSCREEN_BOX = { x: 0, y: 0, w: 100, h: 100 };

const extractBaseline = (t) => {
    if (!t || typeof t !== 'object') return null;
    const out = {
        cropLeft: Number(t.cropLeft ?? 0),
        cropRight: Number(t.cropRight ?? 0),
        cropTop: Number(t.cropTop ?? 0),
        cropBottom: Number(t.cropBottom ?? 0),
        rotation: Number(t.rotation ?? 0),
    };
    if (typeof t.boundsType === 'string') {
        out.boundsType = t.boundsType;
        out.positionX = Number(t.positionX ?? 0);
        out.positionY = Number(t.positionY ?? 0);
        out.alignment = t.alignment ?? 5;
        out.boundsAlignment = t.boundsAlignment ?? 0;
        out.boundsWidth = Number(t.boundsWidth ?? 0);
        out.boundsHeight = Number(t.boundsHeight ?? 0);
        out.scaleX = Number(t.scaleX ?? 1);
        out.scaleY = Number(t.scaleY ?? 1);
        if (typeof t.cropToBounds === 'boolean') out.cropToBounds = t.cropToBounds;
    }
    return out;
};

const getSceneItemTransformSafe = async (obs, sceneName, sceneItemId, fallbackTransform) => {
    try {
        const res = await obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
        if (res?.sceneItemTransform) return res.sceneItemTransform;
    } catch {
        // Fall back to transform attached to GetSceneItemList item if available.
    }
    return fallbackTransform ?? null;
};

const setSceneItemTransformSafe = async (obs, sceneName, sceneItemId, sceneItemTransform) => {
    try {
        await obs.call('SetSceneItemTransform', {
            sceneName,
            sceneItemId,
            sceneItemTransform,
        });
    } catch (err) {
        if ('cropToBounds' in sceneItemTransform) {
            // cropToBounds needs OBS 30.2+ — retry without it on older OBS.
            const { cropToBounds: _c, ...legacy } = sceneItemTransform;
            await obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId,
                sceneItemTransform: legacy,
            });
            return;
        }
        throw err;
    }
};

const applyBoundsTransform = async (
    obs,
    sceneName,
    sceneItemId,
    box,
    baseWidth,
    baseHeight,
    { fill, sourceName, key: explicitKey, baselinesMap, captureScaledMap, saveBaselines, existingTransform } = {},
) => {
    const key = explicitKey || sourceKey(sceneName, sceneItemId, sourceName);
    if (sourceName && baselinesMap) {
        if (!baselinesMap[key]) {
            const orig = await getSceneItemTransformSafe(obs, sceneName, sceneItemId, existingTransform);
            const alreadyScaledByUs = !!captureScaledMap?.[key];
            if (!fill && (alreadyScaledByUs || isLikelyOverlayFittedCapture(orig, baseWidth, baseHeight))) {
                // Never snapshot an already overlay-shrunk box (e.g. after a reload or from
                // another Browser Source session) as the user's "original" fullscreen baseline.
                baselinesMap[key] = {
                    boundsType: 'OBS_BOUNDS_SCALE_INNER',
                    positionX: 0,
                    positionY: 0,
                    alignment: 5,
                    boundsAlignment: 0,
                    boundsWidth: Math.max(1, baseWidth),
                    boundsHeight: Math.max(1, baseHeight),
                    cropToBounds: false,
                    cropLeft: 0,
                    cropRight: 0,
                    cropTop: 0,
                    cropBottom: 0,
                    rotation: 0,
                };
                saveBaselines?.();
            } else {
                const baseline = extractBaseline(orig);
                if (baseline) {
                    baselinesMap[key] = baseline;
                    saveBaselines?.();
                }
            }
        }
    }

    const sceneItemTransform = {
        positionX: (box.x / 100) * baseWidth,
        positionY: (box.y / 100) * baseHeight,
        alignment: 5, // top-left anchor → position == box origin
        // Cameras fill-crop; game/desktop windows fit inside without cropping.
        boundsType: fill ? 'OBS_BOUNDS_SCALE_OUTER' : 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 0,
        boundsWidth: Math.max(1, (box.w / 100) * baseWidth),
        boundsHeight: Math.max(1, (box.h / 100) * baseHeight),
        cropToBounds: fill,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        rotation: 0,
    };
    await setSceneItemTransformSafe(obs, sceneName, sceneItemId, sceneItemTransform);
};

const restoreItemBaseline = async (
    obs,
    sceneName,
    sceneItemId,
    sourceName,
    { isCapture = false, key: explicitKey, existingTransform, baseWidth = 1920, baseHeight = 1080, baselinesMap, captureScaledMap, saveState } = {},
) => {
    if (!sourceName) return false;
    const key = explicitKey || sourceKey(sceneName, sceneItemId, sourceName);
    const legacyKey = `${sceneName}::${sourceName}`;
    const saved = baselinesMap?.[key] ?? baselinesMap?.[legacyKey];
    const wasScaled = !!(captureScaledMap?.[key] || captureScaledMap?.[legacyKey]);

    let liveTransform = existingTransform ?? null;
    if (isCapture && !saved && !wasScaled) {
        liveTransform = await getSceneItemTransformSafe(obs, sceneName, sceneItemId, existingTransform);
        if (!isLikelyOverlayFittedCapture(liveTransform, baseWidth, baseHeight)) {
            return false;
        }
    } else if (!saved && !(isCapture && wasScaled)) {
        return false;
    }

    const cropRotation = {
        cropLeft: saved?.cropLeft ?? 0,
        cropRight: saved?.cropRight ?? 0,
        cropTop: saved?.cropTop ?? 0,
        cropBottom: saved?.cropBottom ?? 0,
        rotation: saved?.rotation ?? 0,
    };

    const fullscreenRestore = {
        positionX: (FULLSCREEN_BOX.x / 100) * baseWidth,
        positionY: (FULLSCREEN_BOX.y / 100) * baseHeight,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 0,
        boundsWidth: Math.max(1, baseWidth),
        boundsHeight: Math.max(1, baseHeight),
        cropToBounds: false,
        ...cropRotation,
    };

    let restoredOk = false;
    try {
        if (saved && typeof saved.boundsType === 'string') {
            const restoreTransform = {
                alignment: saved.alignment ?? 5,
                positionX: saved.positionX ?? 0,
                positionY: saved.positionY ?? 0,
                boundsType: saved.boundsType,
                boundsAlignment: saved.boundsAlignment ?? 0,
                ...cropRotation,
            };
            if (saved.boundsType === 'OBS_BOUNDS_NONE') {
                if (typeof saved.scaleX === 'number' && saved.scaleX > 0) restoreTransform.scaleX = saved.scaleX;
                if (typeof saved.scaleY === 'number' && saved.scaleY > 0) restoreTransform.scaleY = saved.scaleY;
            } else {
                restoreTransform.boundsWidth = Math.max(1, saved.boundsWidth || baseWidth);
                restoreTransform.boundsHeight = Math.max(1, saved.boundsHeight || baseHeight);
                if (typeof saved.cropToBounds === 'boolean') restoreTransform.cropToBounds = saved.cropToBounds;
            }
            try {
                await setSceneItemTransformSafe(obs, sceneName, sceneItemId, restoreTransform);
                restoredOk = true;
            } catch {
                await setSceneItemTransformSafe(obs, sceneName, sceneItemId, isCapture ? fullscreenRestore : cropRotation);
                restoredOk = true;
            }
        } else if (isCapture) {
            await setSceneItemTransformSafe(obs, sceneName, sceneItemId, fullscreenRestore);
            restoredOk = true;
        } else if (saved) {
            await setSceneItemTransformSafe(obs, sceneName, sceneItemId, cropRotation);
            restoredOk = true;
        }
    } finally {
        if (restoredOk) {
            if (baselinesMap) {
                delete baselinesMap[key];
                delete baselinesMap[legacyKey];
            }
            if (captureScaledMap) {
                delete captureScaledMap[key];
                delete captureScaledMap[legacyKey];
            }
            saveState?.();
        }
    }
    return restoredOk;
};

const assignCaptureHoles = (captures, captureHoles) => {
    const assignments = new Map();
    if (!captureHoles.length || !captures.length) return assignments;

    // Prefer enabled capture items so disabled backup sources don't steal open holes.
    const ordered = [...captures].sort((a, b) => Number(b.sceneItemEnabled !== false) - Number(a.sceneItemEnabled !== false));
    const usedCaptureKeys = new Set();
    const captureItemKey = (it) => `${it.targetSceneName || ''}::${it.sceneItemId}`;
    const openHoles = [];

    for (const hole of captureHoles) {
        const wanted = typeof hole.captureSource === 'string' ? hole.captureSource.trim() : '';
        if (!wanted) {
            openHoles.push(hole);
            continue;
        }
        const lower = wanted.toLowerCase();
        const match =
            ordered.find((c) => !usedCaptureKeys.has(captureItemKey(c)) && c.sourceName === wanted) ||
            ordered.find((c) => !usedCaptureKeys.has(captureItemKey(c)) && (c.sourceName ?? '').trim().toLowerCase() === lower);
        if (match) {
            assignments.set(match, hole);
            usedCaptureKeys.add(captureItemKey(match));
        }
    }

    // Strict 1-to-1 assignment for remaining open holes: never cram duplicate/secondary
    // capture items in the same scene into a single small hole box.
    const remainingCaptures = ordered.filter((c) => !usedCaptureKeys.has(captureItemKey(c)));
    for (let i = 0; i < remainingCaptures.length && i < openHoles.length; i++) {
        assignments.set(remainingCaptures[i], openHoles[i]);
    }

    return assignments;
};

const placeCamerasInScene = async (
    obs,
    sceneName,
    targetBoxes,
    targetVisibility,
    captureHoles,
    baseWidth,
    baseHeight,
    { skipHide = false, baselinesMap, captureScaledMap, activeFittedMap, saveState } = {},
) => {
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });

    const cameras = [];
    const captures = [];
    const mixedGroups = [];
    const enabledParentGroups = new Set();
    const classify = (it, targetSceneName, inGroup, parentGroupItem = null) => {
        if (it?.isGroup) return;
        const kind = it?.inputKind || (it?.sourceType === 'OBS_SOURCE_TYPE_SCENE' ? 'scene' : '');
        if (isCameraItem(it?.sourceName, kind)) cameras.push({ ...it, targetSceneName, inGroup, parentGroupItem });
        else if (isCaptureItem(it?.sourceName, kind)) captures.push({ ...it, targetSceneName, inGroup, parentGroupItem });
    };

    const ensureParentGroupEnabled = async (item) => {
        const pg = item?.parentGroupItem;
        if (!pg || pg.sceneItemEnabled !== false || enabledParentGroups.has(pg.sceneItemId)) return;
        enabledParentGroups.add(pg.sceneItemId);
        await obs.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: pg.sceneItemId,
            sceneItemEnabled: true,
        });
    };

    for (const it of sceneItems) {
        if (!it.isGroup) {
            classify(it, sceneName, false, null);
        } else {
            try {
                const { sceneItems: groupItems } = await obs.call('GetGroupSceneItemList', {
                    sceneName: it.sourceName,
                });
                const gCams = groupItems.filter((git) => !git?.isGroup && isCameraItem(git?.sourceName, git?.inputKind || (git?.sourceType === 'OBS_SOURCE_TYPE_SCENE' ? 'scene' : '')));
                const gCaps = groupItems.filter((git) => !git?.isGroup && !isCameraItem(git?.sourceName, git?.inputKind || '') && isCaptureItem(git?.sourceName, git?.inputKind || (git?.sourceType === 'OBS_SOURCE_TYPE_SCENE' ? 'scene' : '')));
                // When a group holds only captures (no cameras), scale the group item in THIS
                // OBS scene instead of reaching inside and mutating the shared group globally.
                if (gCaps.length > 0 && gCams.length === 0) {
                    captures.push({ ...it, targetSceneName: sceneName, inGroup: false, parentGroupItem: null });
                } else {
                    if (gCams.length > 0 && gCaps.length > 0) {
                        mixedGroups.push(it.sourceName);
                        console.warn(`[obs] Mixed camera+capture group "${it.sourceName}" in scene "${sceneName}" — nested source transforms apply globally across scenes sharing that group.`);
                    }
                    for (const git of groupItems) classify(git, it.sourceName, true, it);
                }
            } catch {
                // Ignore inaccessible groups
            }
        }
    }

    const bySlot = assignCamSlots(cameras);
    const matched = [];

    for (const [slot, item] of Object.entries(bySlot)) {
        const visible = !!targetVisibility?.[slot];
        const targetScene = item.targetSceneName || sceneName;
        const key = sourceKey(targetScene, item.sceneItemId, item.sourceName);
        matched.push({
            slot,
            sourceName: item.sourceName,
            visible,
            inGroup: !!item.inGroup,
        });
        if (!visible) {
            if (!skipHide) {
                await obs.call('SetSceneItemEnabled', {
                    sceneName: targetScene,
                    sceneItemId: item.sceneItemId,
                    sceneItemEnabled: false,
                });
                await restoreItemBaseline(obs, targetScene, item.sceneItemId, item.sourceName, {
                    isCapture: false,
                    key,
                    existingTransform: item.sceneItemTransform,
                    baseWidth,
                    baseHeight,
                    baselinesMap,
                    captureScaledMap,
                    saveState,
                });
                activeFittedMap?.delete(key);
            }
            continue;
        }
        await ensureParentGroupEnabled(item);
        await obs.call('SetSceneItemEnabled', {
            sceneName: targetScene,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: true,
        });
        const b = targetBoxes?.[slot];
        if (!b) continue;
        await applyBoundsTransform(obs, targetScene, item.sceneItemId, b, baseWidth, baseHeight, {
            fill: true,
            sourceName: item.sourceName,
            key,
            baselinesMap,
            captureScaledMap,
            saveBaselines: saveState,
            existingTransform: item.sceneItemTransform,
        });
        activeFittedMap?.set(key, {
            key,
            sceneName: targetScene,
            sceneItemId: item.sceneItemId,
            sourceName: item.sourceName,
            isCapture: false,
            baseWidth,
            baseHeight,
        });
    }

    const captureAssignments = assignCaptureHoles(captures, captureHoles);
    const matchedCaptures = [];
    for (const item of captures) {
        const targetScene = item.targetSceneName || sceneName;
        const key = sourceKey(targetScene, item.sceneItemId, item.sourceName);
        const hole = captureAssignments.get(item);
        if (hole) {
            await ensureParentGroupEnabled(item);
            await applyBoundsTransform(obs, targetScene, item.sceneItemId, hole.box, baseWidth, baseHeight, {
                fill: false,
                sourceName: item.sourceName,
                key,
                baselinesMap,
                captureScaledMap,
                saveBaselines: saveState,
                existingTransform: item.sceneItemTransform,
            });
            if (captureScaledMap) {
                captureScaledMap[key] = true;
                saveState?.();
            }
            activeFittedMap?.set(key, {
                key,
                sceneName: targetScene,
                sceneItemId: item.sceneItemId,
                sourceName: item.sourceName,
                isCapture: true,
                baseWidth,
                baseHeight,
            });
            matchedCaptures.push({ sourceName: item.sourceName, inGroup: !!item.inGroup });
        } else if (!skipHide) {
            await restoreItemBaseline(obs, targetScene, item.sceneItemId, item.sourceName, {
                isCapture: true,
                key,
                existingTransform: item.sceneItemTransform,
                baseWidth,
                baseHeight,
                baselinesMap,
                captureScaledMap,
                saveState,
            });
            activeFittedMap?.delete(key);
        }
    }

    return { matched, matchedCaptures, totalItems: sceneItems.length, warnings: mixedGroups };
};

export const OBSProvider = ({ children }) => {
    const obsRef = useRef(null);
    const [obsClient, setObsClient] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [obsConfig, setObsConfig] = useState(loadObsConfig);
    const [connectionError, setConnectionError] = useState(null);
    const [camStatus, setCamStatus] = useState(null);
    const [connectNonce, setConnectNonce] = useState(0);
    const retryRef = useRef(null);
    const mountedRef = useRef(true);
    // Mirror isConnected into a ref so placeCameras stays referentially stable
    // (callers keep it in useCallback deps) while still seeing live state.
    const isConnectedRef = useRef(false);
    const lastPlaceRef = useRef({ boxes: null, visibility: null, elements: undefined, theme: undefined });
    const placeChainRef = useRef(Promise.resolve());
    const captureScaledRef = useRef(readJsonMap(CAPTURE_SCALED_KEY));
    const baselinesRef = useRef(readJsonMap(BASELINE_STORAGE_KEY));
    const activeFittedRef = useRef(new Map());

    const persistTransformState = useCallback(() => {
        writeJsonMap(CAPTURE_SCALED_KEY, captureScaledRef.current);
        writeJsonMap(BASELINE_STORAGE_KEY, baselinesRef.current);
    }, []);

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    const updateObsConfig = useCallback((patch) => {
        setObsConfig((prev) => saveObsConfig({ ...prev, enabled: true, ...patch }));
        setConnectionError(null);
        setConnectNonce((n) => n + 1);
    }, []);

    // Also the "Connect to OBS" opt-in.
    const reconnect = useCallback(() => {
        setObsConfig((prev) => (prev.enabled ? prev : saveObsConfig({ ...prev, enabled: true })));
        setConnectionError(null);
        setConnectNonce((n) => n + 1);
    }, []);

    const disableObs = useCallback(() => {
        setObsConfig((prev) => saveObsConfig({ ...prev, enabled: false }));
        setConnectionError(null);
        setIsConnected(false);
        setIsRecording(false);
        setCamStatus(null);
    }, []);

    // Auto-place native OBS camera sources to match the overlay's cam boxes.
    // boxes/visibility use the overlay's percent coordinates on its 16:9 canvas;
    // we convert them to OBS canvas pixels and pin each camera into its frame
    // with fill-crop bounds (so circles/odd aspect frames are filled, overflow
    // cropped), and enable/disable it to match the scene. No-op when OBS isn't
    // connected, so it's always safe to call.
    const placeCameras = useCallback((boxes, visibility, elements, options = {}) => {
        const optTheme = options?.theme;
        if (boxes !== undefined || visibility !== undefined || elements !== undefined || optTheme !== undefined) {
            lastPlaceRef.current = {
                boxes: boxes ?? lastPlaceRef.current.boxes,
                visibility: visibility ?? lastPlaceRef.current.visibility,
                elements: elements !== undefined ? elements : lastPlaceRef.current.elements,
                theme: optTheme !== undefined ? optTheme : lastPlaceRef.current.theme,
            };
        }
        const targetBoxes = boxes ?? lastPlaceRef.current.boxes;
        const targetVisibility = visibility ?? lastPlaceRef.current.visibility;
        const targetElements = elements !== undefined ? elements : lastPlaceRef.current.elements;
        const targetTheme = optTheme !== undefined ? optTheme : lastPlaceRef.current.theme;
        if (!isConnectedRef.current || !targetBoxes) return Promise.resolve();

        const { skipHide = false, syncPreview = false } = options ?? {};
        const captureHoles = findCaptureHoles(targetElements, targetTheme);

        const run = async () => {
            const sessionObs = obsRef.current;
            if (!sessionObs || !isConnectedRef.current || !targetBoxes) return;

            try {
                const { baseWidth, baseHeight } = await sessionObs.call('GetVideoSettings');
                if (obsRef.current !== sessionObs) return;
                const { currentProgramSceneName: sceneName } = await sessionObs.call('GetCurrentProgramScene');
                if (obsRef.current !== sessionObs) return;

                let studioModeEnabled = false;
                let previewSceneName = null;
                try {
                    const studio = await sessionObs.call('GetStudioModeEnabled');
                    studioModeEnabled = !!studio?.studioModeEnabled;
                    if (studioModeEnabled) {
                        const prev = await sessionObs.call('GetCurrentPreviewScene');
                        previewSceneName = prev?.currentPreviewSceneName ?? null;
                    }
                } catch {
                    // Ignore if Studio Mode query is unsupported
                }

                const ctxOpts = {
                    skipHide,
                    baselinesMap: baselinesRef.current,
                    captureScaledMap: captureScaledRef.current,
                    activeFittedMap: activeFittedRef.current,
                    saveState: persistTransformState,
                };

                const primary = await placeCamerasInScene(
                    sessionObs,
                    sceneName,
                    targetBoxes,
                    targetVisibility,
                    captureHoles,
                    baseWidth,
                    baseHeight,
                    ctxOpts,
                );
                // Studio Mode safety: never mutate an unrelated staged Preview scene
                // automatically; only sync it on explicit Sync OBS requests.
                if (syncPreview && previewSceneName && previewSceneName !== sceneName && obsRef.current === sessionObs) {
                    await placeCamerasInScene(
                        sessionObs,
                        previewSceneName,
                        targetBoxes,
                        targetVisibility,
                        captureHoles,
                        baseWidth,
                        baseHeight,
                        ctxOpts,
                    );
                }

                if (mountedRef.current && obsRef.current === sessionObs) {
                    setCamStatus({
                        sceneName,
                        previewSceneName,
                        studioModeEnabled,
                        matched: primary.matched,
                        matchedCaptures: primary.matchedCaptures,
                        hasCaptureHole: captureHoles.length > 0,
                        totalItems: primary.totalItems,
                        warnings: primary.warnings,
                        error: null,
                    });
                }
            } catch (e) {
                const errMsg = e?.message ?? String(e);
                console.warn('[obs] camera auto-place failed:', errMsg);
                if (mountedRef.current && obsRef.current === sessionObs) {
                    setCamStatus((prev) => ({
                        sceneName: prev?.sceneName ?? '',
                        matched: prev?.matched ?? [],
                        totalItems: prev?.totalItems ?? 0,
                        error: errMsg,
                    }));
                }
            }
        };

        const queued = placeChainRef.current.then(run, run);
        placeChainRef.current = queued;
        return queued;
    }, [persistTransformState]);

    const autoConnect = obsConfig.enabled || CLEAN_MODE;

    useEffect(() => {
        mountedRef.current = true;
        if (!autoConnect) return undefined;
        let cancelled = false;
        const sessionObs = new OBSWebSocket();
        obsRef.current = sessionObs;
        setObsClient(sessionObs);
        const activeFittedMap = activeFittedRef.current;
        const baselinesMap = baselinesRef.current;
        const captureScaledMap = captureScaledRef.current;
        // Guard against overlapping connect attempts. A single failed connection
        // both rejects connect() AND emits ConnectionClosed; without these guards
        // each failure would schedule TWO retries, doubling every interval into a
        // storm of dead WebSockets (ERR_INSUFFICIENT_RESOURCES + memory growth).
        let connecting = false;
        let retryDelay = INITIAL_RETRY_INTERVAL;
        let retryBlocked = false;

        const customUrl = normalizeWsUrl(obsConfig.url);
        const candidates = customUrl ? [customUrl] : DEFAULT_URLS;

        // Only ever one pending retry: clearing first means duplicate callers
        // collapse to a single scheduled attempt with capped exponential backoff.
        const scheduleRetry = () => {
            if (!mountedRef.current || cancelled || retryBlocked || obsRef.current !== sessionObs) return;
            clearTimeout(retryRef.current);
            const waitMs = retryDelay;
            retryDelay = Math.min(MAX_RETRY_INTERVAL, retryDelay * 2);
            retryRef.current = setTimeout(connect, waitMs);
        };

        const connect = async () => {
            if (!mountedRef.current || cancelled || connecting || obsRef.current !== sessionObs) return;
            connecting = true;
            retryBlocked = false;
            let lastErr = null;
            let lastUrl = candidates[0];

            try {
                for (const url of candidates) {
                    if (!mountedRef.current || cancelled || obsRef.current !== sessionObs) return;
                    lastUrl = url;
                    try {
                        await sessionObs.connect(url, obsConfig.password || '');
                        if (!mountedRef.current || cancelled || obsRef.current !== sessionObs) {
                            await sessionObs.disconnect().catch(() => {});
                            return;
                        }
                        isConnectedRef.current = true;
                        retryDelay = INITIAL_RETRY_INTERVAL;
                        setIsConnected(true);
                        setConnectionError(null);

                        const status = await sessionObs.call('GetRecordStatus');
                        if (mountedRef.current && !cancelled && obsRef.current === sessionObs) {
                            setIsRecording(status.outputActive);
                        }
                        if (lastPlaceRef.current.boxes && obsRef.current === sessionObs) {
                            placeCameras(lastPlaceRef.current.boxes, lastPlaceRef.current.visibility);
                        }
                        return;
                    } catch (err) {
                        lastErr = err;
                        await sessionObs.disconnect().catch(() => {});
                        if (obsRef.current === sessionObs) {
                            isConnectedRef.current = false;
                        }
                        if (err?.code === 4009 || err?.name === 'SecurityError') break;
                    }
                }
                if (!mountedRef.current || cancelled || obsRef.current !== sessionObs) return;
                isConnectedRef.current = false;
                setIsConnected(false);
                setCamStatus(null);
                const errInfo = classifyObsError(lastErr, lastUrl);
                setConnectionError(errInfo);
                // Don't spin background retries on wrong password or blocked ws:// mixed content;
                // Wait for user action (updateObsConfig / reconnect) instead.
                if (errInfo.kind === 'auth' || errInfo.kind === 'mixed-content') {
                    retryBlocked = true;
                } else {
                    scheduleRetry();
                }
            } finally {
                connecting = false;
            }
        };

        const onRecordStateChanged = (data) => {
            if (obsRef.current !== sessionObs || cancelled) return;
            setIsRecording(data.outputActive);
        };

        const onSceneChanged = () => {
            if (obsRef.current !== sessionObs || cancelled) return;
            if (isConnectedRef.current && lastPlaceRef.current.boxes) {
                placeCameras(lastPlaceRef.current.boxes, lastPlaceRef.current.visibility);
            }
        };

        const onPreviewSceneChanged = (data) => {
            if (!mountedRef.current || cancelled || obsRef.current !== sessionObs) return;
            setCamStatus((prev) => (prev ? { ...prev, previewSceneName: data?.sceneName ?? prev.previewSceneName } : prev));
        };

        const onConnectionClosed = () => {
            if (!mountedRef.current || cancelled || obsRef.current !== sessionObs) return;
            isConnectedRef.current = false;
            setIsConnected(false);
            setIsRecording(false);
            setCamStatus(null);
            if (!connecting && !retryBlocked) scheduleRetry();
        };

        sessionObs.on('RecordStateChanged', onRecordStateChanged);
        sessionObs.on('CurrentProgramSceneChanged', onSceneChanged);
        sessionObs.on('CurrentPreviewSceneChanged', onPreviewSceneChanged);
        sessionObs.on('StudioModeStateChanged', onSceneChanged);
        sessionObs.on('ConnectionClosed', onConnectionClosed);

        connect();

        return () => {
            cancelled = true;
            mountedRef.current = false;
            clearTimeout(retryRef.current);
            sessionObs.off('RecordStateChanged', onRecordStateChanged);
            sessionObs.off('CurrentProgramSceneChanged', onSceneChanged);
            sessionObs.off('CurrentPreviewSceneChanged', onPreviewSceneChanged);
            sessionObs.off('StudioModeStateChanged', onSceneChanged);
            sessionObs.off('ConnectionClosed', onConnectionClosed);
            const wasConnected = isConnectedRef.current && obsRef.current === sessionObs;
            if (obsRef.current === sessionObs) {
                isConnectedRef.current = false;
                obsRef.current = null;
            }
            const entries = Array.from(activeFittedMap.values());
            activeFittedMap.clear();
            const cleanup = async () => {
                if (wasConnected && entries.length > 0) {
                    const restores = entries.map((entry) =>
                        restoreItemBaseline(sessionObs, entry.sceneName, entry.sceneItemId, entry.sourceName, {
                            key: entry.key,
                            isCapture: entry.isCapture,
                            baseWidth: entry.baseWidth,
                            baseHeight: entry.baseHeight,
                            baselinesMap,
                            captureScaledMap,
                            saveState: persistTransformState,
                        }).catch(() => {})
                    );
                    await Promise.race([
                        Promise.allSettled(restores),
                        new Promise((resolve) => setTimeout(resolve, 600)),
                    ]);
                }
                await sessionObs.disconnect().catch(() => {
                    // Ignore disconnect errors when socket was never open
                });
            };
            cleanup();
        };
    }, [autoConnect, obsConfig.url, obsConfig.password, connectNonce, placeCameras, persistTransformState]);

    return (
        <OBSContext.Provider
            value={{
                obs: obsClient,
                isConnected,
                isRecording,
                connectionError,
                camStatus,
                obsConfig,
                updateObsConfig,
                reconnect,
                disableObs,
                placeCameras,
            }}
        >
            {children}
        </OBSContext.Provider>
    );
};
