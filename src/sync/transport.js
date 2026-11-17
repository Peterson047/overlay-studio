// Where the studio and the OBS player read and write the layout.
//
//   ?room=<id>                  legacy anonymous room       → /api/layout
//   ?project=<uuid>             account project draft       → /api/project-layout (Bearer session)
//   ?obs&project=<uuid>#t=<tk>  published output for OBS    → /api/project-layout?mode=play (read-only token)
//
// The playback token lives in the URL fragment so it never reaches server
// logs, analytics or Referer headers.
import { LAYOUT_API, layoutUrl } from '../config';
import { supabase } from '../auth/supabase';

const params = () => new URLSearchParams(window.location.search);

export const projectIdFromUrl = () => params().get('project');
export const isProjectMode = () => !!projectIdFromUrl();
export const isPlayMode = () => isProjectMode() && (params().has('obs') || params().has('clean'));
const playToken = () => new URLSearchParams(window.location.hash.slice(1)).get('t') || '';

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
