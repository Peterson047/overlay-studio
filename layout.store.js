// Shared pure layout versioning, patch merging, and live-state helpers used by
// both `api/layout.js` (Upstash Redis) and `vite.config.js` (local dev server).

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RESERVED_ROOMS = new Set(['__ver', '__live', '__lib', '_all']);
const isSafeKey = (k) => typeof k === 'string' && k.length > 0 && !FORBIDDEN_KEYS.has(k);
const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const pickSafeObj = (obj) => {
    if (!isPlainObject(obj)) return {};
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (isSafeKey(k)) out[k] = v;
    }
    return out;
};

export const roomOf = (room) => {
    const cleaned = String(room || '').trim().slice(0, 64).replace(/[^\w.-]/g, '_');
    if (!cleaned || FORBIDDEN_KEYS.has(cleaned) || RESERVED_ROOMS.has(cleaned)) return 'default';
    return cleaned;
};

export const keysFor = (room) => {
    const r = roomOf(room);
    return {
        key: `layout:${r}`,
        libKey: `layoutlib:${r}`,
        verKey: `layoutver:${r}`,
        liveKey: `live:${r}`,
    };
};

export const newTag = (prefix = 'v') =>
    `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Compound version `<designVer>.<liveVer>` lets polling clients detect whether
// only ephemeral live state (`live:<room>`) changed so Redis/dev skips reading
// the heavy layout blob (`layout:<room>`) on timers, triggers, and transitions.
export const splitVer = (ver) => {
    if (!ver) return { d: '', l: '' };
    const s = String(ver);
    const dot = s.indexOf('.');
    if (dot === -1) return { d: s, l: '0' };
    return { d: s.slice(0, dot), l: s.slice(dot + 1) };
};

export const formatVer = (d, l) => `${d || newTag('d')}.${l || newTag('l')}`;

function mergeTimers(prevTimers, patchTimers, nowMs) {
    const timers = pickSafeObj(prevTimers);
    for (const [id, val] of Object.entries(patchTimers)) {
        if (!isSafeKey(id)) continue;
        if (val === null) {
            delete timers[id];
            continue;
        }
        if (!isPlainObject(val)) continue;
        const prev = isPlainObject(timers[id]) ? timers[id] : {};
        const safeVal = pickSafeObj(val);
        const merged = { ...prev, ...safeVal };
        // If transitioning running -> paused without an explicit remainingSec,
        // settle elapsed wall-clock time on the server clock.
        if (
            safeVal.state === 'paused' &&
            prev.state === 'running' &&
            safeVal.remainingSec === undefined &&
            typeof prev.remainingSec === 'number' &&
            typeof prev.anchorAt === 'number'
        ) {
            merged.remainingSec = Math.max(0, Math.ceil(prev.remainingSec - (nowMs - prev.anchorAt) / 1000));
        }
        if (safeVal.state === 'running' && typeof safeVal.anchorAt !== 'number') {
            merged.anchorAt = nowMs;
        }
        merged.updatedAt = nowMs;
        timers[id] = merged;
    }
    return timers;
}

function mergeTriggers(prevTriggers, patchTriggers, nowMs) {
    const triggers = pickSafeObj(prevTriggers);
    for (const [id, val] of Object.entries(patchTriggers)) {
        if (!isSafeKey(id)) continue;
        if (val === null) {
            delete triggers[id];
            continue;
        }
        if (!isPlainObject(val)) continue;
        const prev = isPlainObject(triggers[id]) ? triggers[id] : {};
        triggers[id] = {
            ...prev,
            ...pickSafeObj(val),
            seq: (prev.seq || 0) + 1,
            at: nowMs,
        };
    }
    return triggers;
}

function mergeCounters(prevCounters, patchCounters, nowMs) {
    const counters = pickSafeObj(prevCounters);
    for (const [id, val] of Object.entries(patchCounters)) {
        if (!isSafeKey(id)) continue;
        if (val === null) {
            delete counters[id];
            continue;
        }
        if (!isPlainObject(val)) continue;
        const prev = isPlainObject(counters[id]) ? counters[id] : {};
        counters[id] = { ...prev, ...pickSafeObj(val), updatedAt: nowMs };
    }
    return counters;
}

export function applyLayoutWrite(
    { existingMain, existingLib, existingLive, curVer },
    body,
    { isShared = false, nowMs = Date.now() } = {},
) {
    const {
        _clientId,
        _v,
        layouts: sentLayouts,
        elementPatch,
        livePatch,
        ...rawPatch
    } = pickSafeObj(body);
    void _clientId;
    void _v;

    const patch = pickSafeObj(rawPatch);
    const layouts = isShared ? undefined : sentLayouts;
    const rawMain = isPlainObject(existingMain) ? existingMain : {};
    const hasLegacy = 'layouts' in rawMain;
    const { layouts: legacyLayouts, ...baseMainRest } = rawMain;
    const baseMain = pickSafeObj(baseMainRest);

    const hasPatch = Object.keys(patch).length > 0;
    let nextMain = hasPatch ? { ...baseMain, ...patch } : baseMain;
    let designChanged = hasPatch || hasLegacy;
    let writeMain = hasPatch || hasLegacy;

    const epList = Array.isArray(elementPatch)
        ? elementPatch
        : isPlainObject(elementPatch)
            ? [elementPatch]
            : [];

    if (epList.length > 0) {
        const els = Array.isArray(nextMain.elements) ? [...nextMain.elements] : [];
        let patchedAny = false;
        for (const item of epList) {
            if (!isPlainObject(item) || !item.id || !isPlainObject(item.changes)) continue;
            const idx = els.findIndex((el) => el?.id === item.id);
            if (idx === -1) continue;
            els[idx] = { ...els[idx], ...pickSafeObj(item.changes) };
            patchedAny = true;
        }
        if (patchedAny) {
            nextMain = { ...nextMain, elements: els };
            designChanged = true;
            writeMain = true;
        }
    }

    let writeLib = false;
    let nextLib = existingLib;
    if (layouts !== undefined) {
        nextLib = layouts;
        writeLib = true;
        designChanged = true;
    } else if (hasLegacy && existingLib == null) {
        nextLib = legacyLayouts ?? [];
        writeLib = true;
    }

    let nextLive = isPlainObject(existingLive) ? pickSafeObj(existingLive) : {};
    let liveChanged = false;

    if (isPlainObject(livePatch)) {
        if ('scene' in livePatch) {
            if (livePatch.scene === null) {
                delete nextLive.scene;
                liveChanged = true;
            } else if (isPlainObject(livePatch.scene)) {
                const prevScene = isPlainObject(nextLive.scene) ? nextLive.scene : {};
                nextLive.scene = {
                    ...prevScene,
                    ...pickSafeObj(livePatch.scene),
                    seq: (prevScene.seq || 0) + 1,
                    at: nowMs,
                };
                liveChanged = true;
            }
        }
        if (isPlainObject(livePatch.timers)) {
            nextLive.timers = mergeTimers(nextLive.timers, livePatch.timers, nowMs);
            liveChanged = true;
        }
        if (isPlainObject(livePatch.triggers)) {
            nextLive.triggers = mergeTriggers(nextLive.triggers, livePatch.triggers, nowMs);
            liveChanged = true;
        }
        if (isPlainObject(livePatch.counters)) {
            nextLive.counters = mergeCounters(nextLive.counters, livePatch.counters, nowMs);
            liveChanged = true;
        }
    }

    const parsed = splitVer(curVer);
    const dVer = designChanged || !parsed.d ? newTag('d') : parsed.d;
    const lVer = liveChanged || !parsed.l || parsed.l === '0' ? newTag('l') : parsed.l;
    const nextVer = formatVer(dVer, lVer);

    return {
        nextMain,
        writeMain,
        nextLib,
        writeLib,
        nextLive,
        writeLive: liveChanged,
        nextVer,
        designChanged,
        liveChanged,
        nowMs,
    };
}

export async function buildLayoutGetResponse({
    reqVer,
    curVer,
    lite = false,
    isShared = false,
    getMain,
    getLib,
    getLive,
    nowMs = Date.now(),
}) {
    if (reqVer && String(reqVer) === String(curVer)) {
        return { status: 204 };
    }

    if (reqVer) {
        const clientV = splitVer(reqVer);
        const serverV = splitVer(curVer);
        if (clientV.d && serverV.d && clientV.d === serverV.d && clientV.l !== serverV.l) {
            const live = (await getLive()) || {};
            return {
                status: 200,
                body: { _v: curVer, _liveOnly: true, serverNow: nowMs, live },
            };
        }
    }

    const [main, live, lib] = await Promise.all([
        getMain(),
        getLive(),
        !lite && !isShared ? getLib() : Promise.resolve(undefined),
    ]);

    const out = {
        ...(main || {}),
        ...(lib != null ? { layouts: lib } : {}),
        live: live || {},
        _v: curVer,
        serverNow: nowMs,
    };
    return { status: 200, body: out };
}
