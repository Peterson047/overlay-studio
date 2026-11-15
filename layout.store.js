// Shared pure layout versioning, patch merging, and live-state helpers used by
// both `api/layout.js` (Upstash Redis) and `vite.config.js` (local dev server).

export const roomOf = (room) =>
    String(room || 'default').slice(0, 64).replace(/[^\w.-]/g, '_');

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
    const timers = { ...(prevTimers || {}) };
    for (const [id, val] of Object.entries(patchTimers)) {
        if (val === null) {
            delete timers[id];
            continue;
        }
        if (!val || typeof val !== 'object') continue;
        const prev = timers[id] && typeof timers[id] === 'object' ? timers[id] : {};
        const merged = { ...prev, ...val };
        // If transitioning running -> paused without an explicit remainingSec,
        // settle elapsed wall-clock time on the server clock.
        if (
            val.state === 'paused' &&
            prev.state === 'running' &&
            val.remainingSec === undefined &&
            typeof prev.remainingSec === 'number' &&
            typeof prev.anchorAt === 'number'
        ) {
            merged.remainingSec = Math.max(0, Math.round(prev.remainingSec - (nowMs - prev.anchorAt) / 1000));
        }
        if (val.state === 'running' && typeof val.anchorAt !== 'number') {
            merged.anchorAt = nowMs;
        }
        merged.updatedAt = nowMs;
        timers[id] = merged;
    }
    return timers;
}

function mergeTriggers(prevTriggers, patchTriggers, nowMs) {
    const triggers = { ...(prevTriggers || {}) };
    for (const [id, val] of Object.entries(patchTriggers)) {
        if (val === null) {
            delete triggers[id];
            continue;
        }
        if (!val || typeof val !== 'object') continue;
        const prev = triggers[id] && typeof triggers[id] === 'object' ? triggers[id] : {};
        triggers[id] = {
            ...prev,
            ...val,
            seq: (prev.seq || 0) + 1,
            at: nowMs,
        };
    }
    return triggers;
}

function mergeCounters(prevCounters, patchCounters, nowMs) {
    const counters = { ...(prevCounters || {}) };
    for (const [id, val] of Object.entries(patchCounters)) {
        if (val === null) {
            delete counters[id];
            continue;
        }
        if (!val || typeof val !== 'object') continue;
        const prev = counters[id] && typeof counters[id] === 'object' ? counters[id] : {};
        counters[id] = { ...prev, ...val, updatedAt: nowMs };
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
        ...patch
    } = body || {};
    void _clientId;
    void _v;

    const layouts = isShared ? undefined : sentLayouts;
    const rawMain = existingMain && typeof existingMain === 'object' ? existingMain : {};
    const hasLegacy = 'layouts' in rawMain;
    const { layouts: legacyLayouts, ...baseMain } = rawMain;

    const hasPatch = Object.keys(patch).length > 0;
    let nextMain = hasPatch ? { ...baseMain, ...patch } : baseMain;
    let designChanged = hasPatch || hasLegacy;
    let writeMain = hasPatch || hasLegacy;

    const epList = Array.isArray(elementPatch)
        ? elementPatch
        : elementPatch && typeof elementPatch === 'object'
            ? [elementPatch]
            : [];

    if (epList.length > 0) {
        const els = Array.isArray(nextMain.elements) ? [...nextMain.elements] : [];
        let patchedAny = false;
        for (const item of epList) {
            if (!item?.id || !item?.changes || typeof item.changes !== 'object') continue;
            const idx = els.findIndex((el) => el?.id === item.id);
            if (idx === -1) continue;
            els[idx] = { ...els[idx], ...item.changes };
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

    let nextLive = existingLive && typeof existingLive === 'object' ? { ...existingLive } : {};
    let liveChanged = false;

    if (livePatch && typeof livePatch === 'object') {
        if ('scene' in livePatch) {
            if (livePatch.scene === null) {
                delete nextLive.scene;
                liveChanged = true;
            } else if (livePatch.scene && typeof livePatch.scene === 'object') {
                const prevScene = nextLive.scene && typeof nextLive.scene === 'object' ? nextLive.scene : {};
                nextLive.scene = {
                    ...prevScene,
                    ...livePatch.scene,
                    seq: (prevScene.seq || 0) + 1,
                    at: nowMs,
                };
                liveChanged = true;
            }
        }
        if (livePatch.timers && typeof livePatch.timers === 'object') {
            nextLive.timers = mergeTimers(nextLive.timers, livePatch.timers, nowMs);
            liveChanged = true;
        }
        if (livePatch.triggers && typeof livePatch.triggers === 'object') {
            nextLive.triggers = mergeTriggers(nextLive.triggers, livePatch.triggers, nowMs);
            liveChanged = true;
        }
        if (livePatch.counters && typeof livePatch.counters === 'object') {
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
