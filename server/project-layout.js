import { applyLayoutWrite } from '../layout.store.js';
import { validateWidgetUrl } from '../src/utils/widgetLab.js';
import { HttpError } from './qorp.js';

export function validateLayout(layout) {
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new HttpError(400, 'Layout inválido.');
    if (Buffer.byteLength(JSON.stringify(layout)) > 2_000_000) throw new HttpError(413, 'Projeto acima de 2 MB.');
    const visit = snapshot => {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (snapshot.elements !== undefined && !Array.isArray(snapshot.elements)) throw new HttpError(400, 'Lista de elementos inválida.');
        for (const element of snapshot.elements || []) {
            if (element.type === 'external' && element.widgetUrl) {
                const error = validateWidgetUrl(element.widgetUrl);
                if (error) throw new HttpError(400, error);
            }
        }
        for (const layout of snapshot.layouts || []) for (const scene of layout.scenes || []) visit(scene.snapshot);
    };
    visit(layout);
    return layout;
}

export function mergeDraft(draft, patch) {
    const { _baseVersion: _version, ...body } = patch;
    void _version;
    const { layouts, live, ...main } = draft || {};
    const plan = applyLayoutWrite({ existingMain: main, existingLib: layouts, existingLive: live, curVer: 'd0.0' }, body);
    return validateLayout({ ...plan.nextMain, layouts: plan.nextLib || [], live: plan.nextLive });
}

export function playbackPayload(snapshot) {
    // Allowlist: never send private libraries, account data or billing to OBS.
    const allowed = ['elements', 'boxes', 'boxVisibility', 'zOrder', 'background', 'theme', 'camStyles',
        'showFaceCam', 'showHandCam', 'showRoomCam', 'twitchChannel', 'tasks', 'sceneTransition', 'live'];
    return Object.fromEntries(allowed.filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]]));
}

// What OBS should show right now: the immutable published revision, with the
// live scene chosen in the control panel (qorp_projects.live) applied on top.
// The published revision itself is never rewritten by live operations.
export function liveView(published, live) {
    const base = published || {};
    const state = { ...(base.live || {}), ...(live || {}) };
    const sceneId = live?.scene?.activeSceneId;
    const scene = sceneId
        ? (base.layouts || []).flatMap(layout => layout.scenes || []).find(item => item.id === sceneId)
        : null;
    return { ...base, ...(scene?.snapshot || {}), live: state };
}

export function sanitizeExport(draft) {
    const copy = structuredClone(draft);
    const visit = snapshot => {
        for (const element of snapshot.elements || []) {
            if (element.type === 'external') { element.widgetUrl = ''; element.previewEnabled = false; }
        }
        for (const layout of snapshot.layouts || []) for (const scene of layout.scenes || []) visit(scene.snapshot || {});
        delete snapshot.live;
    };
    visit(copy);
    return copy;
}
