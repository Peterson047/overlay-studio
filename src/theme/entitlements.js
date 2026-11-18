// Shared catalog tiering, layout requirement inspection, and billing entitlement
// resolution. Pure ES module with zero DOM/Node dependencies so frontend (src/)
// and serverless/Node scripts (server/, api/, scripts/) share one policy.

export const FREE_THEME_IDS = new Set([
    'midnight',
    'neon',
    'minimal',
    'warm',
    'aurora',
]);

export const FREE_KIT_IDS = new Set([
    'aurora-glow',
    'neon-arcade',
    'midnight-pro',
    'mono-podcast',
    'warm-studio',
    'midnight',
    'neon',
    'minimal',
    'warm',
    'aurora',
]);

export const OWNER_ONLY_THEME_IDS = new Set(['xaxinim-vice']);
export const OWNER_ONLY_KIT_IDS = new Set(['kit-xaxinim']);
export const OWNER_ONLY_BACKDROPS = new Set(['vicedusk']);
export const OWNER_ONLY_ASSET_PATHS = ['/brand/xaxinim.png'];

export const PLAN_LIMITS = {
    free: { maxProjects: 2, maxScenes: 6, maxRevisions: 5, maxObsLinks: 1 },
    pro: { maxProjects: 15, maxScenes: Infinity, maxRevisions: 50, maxObsLinks: 3 },
};

export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function extractThemeId(themeOrId) {
    if (typeof themeOrId === 'string') return themeOrId.trim().toLowerCase();
    if (themeOrId && typeof themeOrId === 'object' && typeof themeOrId.id === 'string') {
        return themeOrId.id.trim().toLowerCase();
    }
    return '';
}

export function isOwnerOnlyTheme(themeId) {
    const id = extractThemeId(themeId);
    return Boolean(id && OWNER_ONLY_THEME_IDS.has(id));
}

export function isOwnerOnlyKit(kitId) {
    const id = typeof kitId === 'object' && kitId !== null ? kitId.id : kitId;
    return typeof id === 'string' && OWNER_ONLY_KIT_IDS.has(id.trim().toLowerCase());
}

export function isOwnerOnlyBackdrop(backdropId) {
    return typeof backdropId === 'string' && OWNER_ONLY_BACKDROPS.has(backdropId.trim().toLowerCase());
}

export function getThemeTier(themeId) {
    const id = extractThemeId(themeId);
    if (!id) return 'free';
    if (OWNER_ONLY_THEME_IDS.has(id)) return 'owner';
    if (FREE_THEME_IDS.has(id)) return 'free';
    return 'pro';
}

export function getKitTier(kitOrThemeId) {
    if (kitOrThemeId && typeof kitOrThemeId === 'object') {
        const kitId = typeof kitOrThemeId.id === 'string' ? kitOrThemeId.id.trim().toLowerCase() : '';
        const themeId = extractThemeId(kitOrThemeId.themeId ?? kitOrThemeId.theme);
        if ((kitId && OWNER_ONLY_KIT_IDS.has(kitId)) || isOwnerOnlyTheme(themeId) || isOwnerOnlyTheme(kitId)) {
            return 'owner';
        }
        if (!kitId && !themeId) return 'free';
        if ((!kitId || FREE_KIT_IDS.has(kitId)) && (!themeId || FREE_THEME_IDS.has(themeId))) {
            return 'free';
        }
        return 'pro';
    }
    const id = typeof kitOrThemeId === 'string' ? kitOrThemeId.trim().toLowerCase() : '';
    if (!id) return 'free';
    if (OWNER_ONLY_KIT_IDS.has(id) || OWNER_ONLY_THEME_IDS.has(id)) return 'owner';
    if (FREE_KIT_IDS.has(id)) return 'free';
    return 'pro';
}

function decodePercentBounded(input, maxPasses = 4) {
    let candidate = input;
    for (let i = 0; i < maxPasses; i += 1) {
        const decoded = candidate.replace(/(?:%[0-9a-fA-F]{2})+/g, (match) => {
            try {
                return decodeURIComponent(match);
            } catch {
                return match.replace(/%([0-7][0-9a-fA-F])/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            }
        });
        if (decoded === candidate) break;
        candidate = decoded;
    }
    return candidate;
}

function stripControlsAndTrim(input) {
    let out = '';
    for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        if (code >= 0x20 && code !== 0x7f) out += input[i];
    }
    return out.trim();
}

export function isOwnerOnlyAssetUrl(value) {
    if (typeof value !== 'string' || !value) return false;
    let candidate = stripControlsAndTrim(value);
    if (!candidate) return false;
    candidate = candidate.split(/[?#]/, 1)[0];
    candidate = decodePercentBounded(candidate);
    candidate = stripControlsAndTrim(candidate).split(/[?#]/, 1)[0];
    candidate = candidate.replace(/\\/g, '/').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '/');
    const segments = [];
    for (const seg of candidate.toLowerCase().split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') {
            segments.pop();
            continue;
        }
        segments.push(seg);
    }
    const normalizedPath = `/${segments.join('/')}`;
    return OWNER_ONLY_ASSET_PATHS.some((assetPath) => normalizedPath.includes(assetPath));
}

export function inspectLayoutRequirements(layout) {
    const proReasons = new Set();
    const ownerReasons = new Set();

    const inspectThemeEntry = (entry) => {
        if (!entry) return;
        if (typeof entry === 'object' && isOwnerOnlyBackdrop(entry.backdrop)) {
            ownerReasons.add(`backdrop:${entry.backdrop.trim().toLowerCase()}`);
        }
        const id = extractThemeId(entry);
        if (id) {
            const tier = getThemeTier(id);
            if (tier === 'owner') ownerReasons.add(`theme:${id}`);
            else if (tier === 'pro') proReasons.add(`theme:${id}`);
        }
    };

    const inspectThemeRef = (themeValue, fallbackThemeId) => {
        inspectThemeEntry(themeValue);
        inspectThemeEntry(fallbackThemeId);
    };

    const inspectKitRef = (kitRef) => {
        if (typeof kitRef !== 'string' || !kitRef.trim()) return;
        const id = kitRef.trim().toLowerCase();
        const tier = getKitTier(id);
        if (tier === 'owner') ownerReasons.add(`kit:${id}`);
        else if (tier === 'pro') proReasons.add(`kit:${id}`);
    };

    const inspectAssetFields = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const field of ['src', 'logoUrl', 'url', 'image']) {
            if (isOwnerOnlyAssetUrl(obj[field])) {
                ownerReasons.add('asset:/brand/xaxinim.png');
            }
        }
    };

    const inspectBackground = (background) => {
        if (!background) return;
        if (typeof background === 'string') {
            if (isOwnerOnlyAssetUrl(background)) {
                ownerReasons.add('asset:/brand/xaxinim.png');
            }
            return;
        }
        if (typeof background === 'object') {
            if (isOwnerOnlyBackdrop(background.backdrop)) {
                ownerReasons.add(`backdrop:${background.backdrop.trim().toLowerCase()}`);
            }
            inspectAssetFields(background);
        }
    };

    const inspectElement = (element) => {
        if (!element || typeof element !== 'object') return;
        if (element.type === 'backdrop' && isOwnerOnlyBackdrop(element.variant)) {
            ownerReasons.add(`backdrop:${element.variant.trim().toLowerCase()}`);
        }
        if (isOwnerOnlyBackdrop(element.backdrop)) {
            ownerReasons.add(`backdrop:${element.backdrop.trim().toLowerCase()}`);
        }
        inspectAssetFields(element);
        inspectBackground(element.background);
    };

    const inspectSnapshot = (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (isOwnerOnlyKit(snapshot.id)) {
            ownerReasons.add(`kit:${snapshot.id.trim().toLowerCase()}`);
        }
        inspectKitRef(snapshot.kitId);
        inspectKitRef(snapshot.starterId);
        if (isOwnerOnlyBackdrop(snapshot.backdrop)) {
            ownerReasons.add(`backdrop:${snapshot.backdrop.trim().toLowerCase()}`);
        }
        inspectThemeRef(snapshot.theme, snapshot.themeId);
        inspectBackground(snapshot.background);
        if (Array.isArray(snapshot.elements)) {
            for (const element of snapshot.elements) inspectElement(element);
        }
        if (Array.isArray(snapshot.scenes)) {
            for (const scene of snapshot.scenes) {
                if (scene?.snapshot) inspectSnapshot(scene.snapshot);
            }
        }
        if (Array.isArray(snapshot.layouts)) {
            for (const item of snapshot.layouts) {
                if (!item || typeof item !== 'object') continue;
                if (isOwnerOnlyKit(item.id)) {
                    ownerReasons.add(`kit:${item.id.trim().toLowerCase()}`);
                }
                inspectKitRef(item.kitId);
                inspectKitRef(item.starterId);
                if (isOwnerOnlyBackdrop(item.backdrop)) {
                    ownerReasons.add(`backdrop:${item.backdrop.trim().toLowerCase()}`);
                }
                inspectThemeRef(item.theme, item.themeId);
                inspectBackground(item.background);
                if (Array.isArray(item.elements)) {
                    for (const element of item.elements) inspectElement(element);
                }
                if (item.snapshot) inspectSnapshot(item.snapshot);
                if (Array.isArray(item.scenes)) {
                    for (const scene of item.scenes) {
                        if (scene?.snapshot) inspectSnapshot(scene.snapshot);
                    }
                }
            }
        }
    };

    inspectSnapshot(layout);

    return {
        requiresPro: proReasons.size > 0,
        requiresOwner: ownerReasons.size > 0,
        proReasons: [...proReasons],
        ownerReasons: [...ownerReasons],
    };
}

function parseTimestampMs(value) {
    if (value == null) return null;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}

export function resolveBillingEntitlement(billingRow, now = Date.now()) {
    const nowMs = parseTimestampMs(now) ?? Date.now();
    if (!billingRow || typeof billingRow !== 'object') {
        return {
            plan: 'free',
            status: 'free',
            isPro: false,
            paidUntil: null,
            graceUntil: null,
            cancelAtPeriodEnd: false,
            paymentKind: null,
            hasCustomer: false,
        };
    }

    const status = String(billingRow.status || 'free').trim().toLowerCase() || 'free';
    const paidUntilMs = parseTimestampMs(billingRow.paid_until);
    const updatedAtMs = parseTimestampMs(billingRow.updated_at);
    const explicitGraceMs = parseTimestampMs(billingRow.grace_until);
    const cancelAtPeriodEnd = Boolean(billingRow.cancel_at_period_end);
    const hasCustomer = Boolean(billingRow.customer_id);

    let paymentKind = billingRow.payment_kind || null;
    if (!paymentKind) {
        if (billingRow.subscription_id) paymentKind = 'card';
        else if (status === 'active' && paidUntilMs !== null) paymentKind = 'pix_annual';
    }

    let graceUntilMs = null;
    let isPro = false;

    if (status === 'active' || status === 'trialing') {
        isPro = paidUntilMs !== null && paidUntilMs > nowMs;
    } else if (status === 'past_due') {
        if (explicitGraceMs !== null) {
            graceUntilMs = explicitGraceMs;
        } else {
            const anchorMs = paidUntilMs ?? updatedAtMs;
            graceUntilMs = anchorMs !== null ? anchorMs + PAST_DUE_GRACE_MS : null;
        }
        isPro = graceUntilMs !== null && graceUntilMs > nowMs;
    }

    return {
        plan: isPro ? 'pro' : 'free',
        status,
        isPro,
        paidUntil: paidUntilMs !== null ? new Date(paidUntilMs).toISOString() : null,
        graceUntil: graceUntilMs !== null ? new Date(graceUntilMs).toISOString() : null,
        cancelAtPeriodEnd,
        paymentKind,
        hasCustomer,
    };
}
