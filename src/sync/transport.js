// Where the studio and the OBS player read and write the layout.
//
//   /?studio (no room/project)  free preview, this browser  → localStorage only
//   ?room=<id>                  legacy anonymous room       → /api/layout
//   ?project=<uuid>             account project draft       → /api/project-layout (Bearer session)
//   ?obs&project=<uuid>#t=<tk>  published output for OBS    → /api/project-layout?mode=play (read-only token)
//
// The playback token lives in the URL fragment so it never reaches server
// logs, analytics or Referer headers.
import { LAYOUT_API, getRoom, layoutUrl } from '../config';
import { supabase } from '../auth/supabase';
import { applyLayoutWrite, buildLayoutGetResponse } from '../../layout.store.js';

const params = () => new URLSearchParams(window.location.search);

export const projectIdFromUrl = () => params().get('project');
export const isProjectMode = () => !!projectIdFromUrl();
export const isPlayMode = () => isProjectMode() && (params().has('obs') || params().has('clean'));
const playToken = () => new URLSearchParams(window.location.hash.slice(1)).get('t') || '';

// Free preview: no account, no room. Nothing is sent to the server, so
// visitors never see or overwrite each other's work on the shared slot.
export const isPreviewMode = () =>
    !isProjectMode() && !params().has('obs') && !params().has('clean') && getRoom() === 'default';

const PREVIEW_KEY = 'qorp_preview_layout';
const readPreview = () => {
    try { return JSON.parse(localStorage.getItem(PREVIEW_KEY)) || {}; } catch { return {}; }
};
const json = (body, status = 200) => status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Current preview design, used to move it into an account project.
export const previewDraft = () => {
    const { main = {}, live = {} } = readPreview();
    return { ...main, live };
};

async function previewGet(v) {
    const store = readPreview();
    const result = await buildLayoutGetResponse({
        reqVer: v,
        curVer: store.ver || 'd0.l0',
        isShared: true,
        getMain: async () => store.main || {},
        getLive: async () => store.live || {},
        getLib: async () => undefined,
    });
    return json(result.body, result.status);
}

function previewSave(body) {
    const store = readPreview();
    const plan = applyLayoutWrite(
        { existingMain: store.main, existingLib: null, existingLive: store.live, curVer: store.ver || '' },
        body,
        { isShared: true },
    );
    try {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify({ main: plan.nextMain, live: plan.nextLive, ver: plan.nextVer }));
    } catch {
        return json({ error: 'O navegador não tem espaço para salvar este preview. Entre para salvar na conta.' }, 413);
    }
    return json({ ok: true, _v: plan.nextVer, serverNow: plan.nowMs, ...(plan.writeLive ? { live: plan.nextLive } : {}) });
}

export const projectObsLink = (projectId, token) =>
    `${window.location.origin}/?obs&project=${encodeURIComponent(projectId)}#t=${token}`;

async function sessionHeader() {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function projectUrl(extra = {}) {
    const q = new URLSearchParams({ project: projectIdFromUrl(), ...extra });
    return `${LAYOUT_API}/project-layout?${q}`;
}

export async function fetchLayout({ v, lite, signal } = {}) {
    if (isPreviewMode()) return previewGet(v);
    if (!isProjectMode()) {
        let url = layoutUrl();
        if (v) url += `&v=${encodeURIComponent(v)}`;
        if (lite) url += '&lite=1';
        return fetch(url, { cache: 'no-store', signal });
    }
    const extra = v ? { v } : {};
    if (isPlayMode()) {
        return fetch(projectUrl({ ...extra, mode: 'play' }), {
            cache: 'no-store', signal, headers: { 'x-overlay-token': playToken() },
        });
    }
    return fetch(projectUrl(extra), { cache: 'no-store', signal, headers: await sessionHeader() });
}

// Returns null when the current mode is read-only (the OBS player never writes).
export async function saveLayout(body, baseVersion) {
    if (isPreviewMode()) return previewSave(body);
    if (!isProjectMode()) {
        return fetch(layoutUrl(), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
    }
    if (isPlayMode()) return null;
    return fetch(projectUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await sessionHeader()) },
        body: JSON.stringify({ ...body, _baseVersion: baseVersion }),
    });
}

// Draft versions look like `d<revision>.0`.
export const revisionFromVersion = (v) => {
    const m = /^d(\d+)\./.exec(String(v || ''));
    return m ? Number(m[1]) : null;
};
