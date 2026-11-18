import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    FREE_KIT_IDS,
    FREE_THEME_IDS,
    getKitTier,
    getThemeTier,
    inspectLayoutRequirements,
    isOwnerOnlyBackdrop,
    isOwnerOnlyKit,
    isOwnerOnlyTheme,
    PAST_DUE_GRACE_MS,
    PLAN_LIMITS,
    resolveBillingEntitlement,
} from '../../src/theme/entitlements.js';
import { getTheme, getVisibleThemes, THEMES } from '../../src/theme/themes.js';
import { THEME_PACKS } from '../../src/scenes/packs.js';
import { getStarterLayout, getVisibleStarters, STARTER_LAYOUTS } from '../../src/scenes/starterLayouts.js';
import { BACKDROPS, getBackdrop, getVisibleBackdrops } from '../../src/components/graphics.jsx';
import { HERO_THEMES } from '../../src/components/homeThemes.js';
import { isOwnerUser } from '../../server/qorp.js';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('catalog tier classification & Xaxinim isolation', () => {
    it('classifies exactly the 5 base themes and their packs/starters as free', () => {
        expect([...FREE_THEME_IDS].sort()).toEqual(['aurora', 'midnight', 'minimal', 'neon', 'warm']);
        expect(THEMES).toHaveLength(62);
        expect(STARTER_LAYOUTS).toHaveLength(64);
        expect(THEME_PACKS).toHaveLength(5);
        expect(THEME_PACKS.map(p => p.id).sort()).toEqual(['aurora', 'midnight', 'minimal', 'neon', 'warm']);

        for (const id of FREE_THEME_IDS) {
            expect(getThemeTier(id)).toBe('free');
        }
        const proThemes = THEMES.filter(t => !FREE_THEME_IDS.has(t.id));
        expect(proThemes).toHaveLength(57);
        for (const th of proThemes) {
            expect(getThemeTier(th.id)).toBe('pro');
        }

        expect(getThemeTier('xaxinim-vice')).toBe('owner');
        expect(isOwnerOnlyTheme('xaxinim-vice')).toBe(true);
        expect(getKitTier('kit-xaxinim')).toBe('owner');
        expect(isOwnerOnlyKit('kit-xaxinim')).toBe(true);
        expect(isOwnerOnlyBackdrop('vicedusk')).toBe(true);
        expect(isOwnerOnlyBackdrop('vicebeach')).toBe(false);

        for (const id of ['aurora-glow', 'neon-arcade', 'midnight-pro', 'mono-podcast', 'warm-studio']) {
            expect(FREE_KIT_IDS.has(id)).toBe(true);
            expect(getKitTier(id)).toBe('free');
        }
        for (const id of ['kit-valorant', 'kit-gta6', 'battle-station', 'sunset-irl']) {
            expect(getKitTier(id)).toBe('pro');
        }
    });

    it('excludes Xaxinim from public catalogs and reveals it only for owners', () => {
        expect(THEMES.some(t => t.id === 'xaxinim-vice')).toBe(false);
        expect(STARTER_LAYOUTS.some(s => s.id === 'kit-xaxinim')).toBe(false);
        expect(BACKDROPS.some(b => b.id === 'vicedusk')).toBe(false);
        expect(HERO_THEMES.some(h => h.id === 'vice')).toBe(false);

        expect(getVisibleThemes({ isOwner: false }).some(t => t.id === 'xaxinim-vice')).toBe(false);
        expect(getVisibleThemes({ isOwner: true }).some(t => t.id === 'xaxinim-vice')).toBe(true);

        expect(getVisibleStarters({ isOwner: false }).some(s => s.id === 'kit-xaxinim')).toBe(false);
        expect(getVisibleStarters({ isOwner: true }).some(s => s.id === 'kit-xaxinim')).toBe(true);

        expect(getVisibleBackdrops({ isOwner: false }).some(b => b.id === 'vicedusk')).toBe(false);
        expect(getVisibleBackdrops({ isOwner: true }).some(b => b.id === 'vicedusk')).toBe(true);

        expect(getTheme('xaxinim-vice').id).toBe('midnight');
        expect(getTheme({ id: 'xaxinim-vice', backdrop: 'vicedusk' }).id).toBe('midnight');
        expect(getTheme('xaxinim-vice', { includeOwner: true }).id).toBe('xaxinim-vice');

        expect(getStarterLayout('kit-xaxinim')).toBeUndefined();
        expect(getStarterLayout('kit-xaxinim', { includeOwner: true })?.id).toBe('kit-xaxinim');

        const fallbackBackdrop = getBackdrop('vicedusk');
        const ownerBackdrop = getBackdrop('vicedusk', { includeOwner: true });
        expect(ownerBackdrop).not.toBe(fallbackBackdrop);
    });
});

describe('inspectLayoutRequirements', () => {
    it('allows empty and free base themes without Pro or owner access', () => {
        expect(inspectLayoutRequirements({})).toEqual({
            requiresPro: false,
            requiresOwner: false,
            proReasons: [],
            ownerReasons: [],
        });
        expect(inspectLayoutRequirements({ theme: 'midnight' }).requiresPro).toBe(false);
        expect(inspectLayoutRequirements({ theme: { id: 'aurora', backdrop: 'waves' } }).requiresPro).toBe(false);
    });

    it('detects Pro themes at top level and inside nested scenes', () => {
        expect(inspectLayoutRequirements({ theme: 'cyberhud' })).toMatchObject({
            requiresPro: true,
            requiresOwner: false,
        });
        expect(inspectLayoutRequirements({ theme: { id: 'valorant', backdrop: 'shards' } })).toMatchObject({
            requiresPro: true,
            requiresOwner: false,
        });
        const nested = inspectLayoutRequirements({
            theme: 'midnight',
            layouts: [{
                id: 'layout_123',
                scenes: [{ id: 's1', snapshot: { theme: 'valorant', elements: [] } }],
            }],
        });
        expect(nested.requiresPro).toBe(true);
        expect(nested.requiresOwner).toBe(false);
    });

    it('detects owner-only Xaxinim themes, kits, backdrops, and logo assets across all fields', () => {
        expect(inspectLayoutRequirements({ theme: 'xaxinim-vice' })).toMatchObject({
            requiresPro: false,
            requiresOwner: true,
        });
        expect(inspectLayoutRequirements({ kitId: 'kit-xaxinim' })).toMatchObject({
            requiresPro: false,
            requiresOwner: true,
        });
        expect(inspectLayoutRequirements({ theme: { id: 'midnight', backdrop: 'vicedusk' } })).toMatchObject({
            requiresPro: false,
            requiresOwner: true,
        });
        expect(inspectLayoutRequirements({
            elements: [{ id: 'bg', type: 'backdrop', variant: 'vicedusk', hidden: true }],
        }).requiresOwner).toBe(true);
        expect(inspectLayoutRequirements({
            layouts: [{
                id: 'layout_99',
                scenes: [{
                    id: 's1',
                    snapshot: {
                        theme: 'midnight',
                        elements: [{ id: 'logo', type: 'logo', src: '/brand/xaxinim.png' }],
                    },
                }],
            }],
        }).requiresOwner).toBe(true);
    });

    it('detects path traversal, percent-encoding, background.src, and mixed theme/themeId smuggling', () => {
        expect(inspectLayoutRequirements({
            elements: [{ id: 'l1', type: 'logo', src: '/brand/./xaxinim.png' }],
        }).requiresOwner).toBe(true);
        expect(inspectLayoutRequirements({
            elements: [{ id: 'l2', type: 'logo', src: '/brand/xaxinim%2epng' }],
        }).requiresOwner).toBe(true);
        expect(inspectLayoutRequirements({
            background: { type: 'image', src: '/brand/xaxinim.png' },
        }).requiresOwner).toBe(true);
        expect(inspectLayoutRequirements({
            theme: 'midnight',
            themeId: 'cyberhud',
        }).requiresPro).toBe(true);
        expect(inspectLayoutRequirements({
            theme: 'midnight',
            themeId: 'xaxinim-vice',
        }).requiresOwner).toBe(true);
    });
});

describe('resolveBillingEntitlement & PLAN_LIMITS', () => {
    const now = Date.parse('2026-11-17T12:00:00.000Z');

    it('exposes documented Free and Pro limits', () => {
        expect(PLAN_LIMITS.free).toEqual({ maxProjects: 2, maxScenes: 6, maxRevisions: 5, maxObsLinks: 1 });
        expect(PLAN_LIMITS.pro).toEqual({ maxProjects: 15, maxScenes: Infinity, maxRevisions: 50, maxObsLinks: 3 });
    });

    it('resolves active, trialing, incomplete, canceled, past_due grace, and 12-month Pix states', () => {
        expect(resolveBillingEntitlement(null, now)).toMatchObject({ plan: 'free', isPro: false, status: 'free' });
        expect(resolveBillingEntitlement({ status: 'free' }, now)).toMatchObject({ plan: 'free', isPro: false });

        const future = new Date(now + 10 * 86_400_000).toISOString();
        const past = new Date(now - 86_400_000).toISOString();

        expect(resolveBillingEntitlement({ status: 'active', paid_until: future, subscription_id: 'sub_1' }, now))
            .toMatchObject({ plan: 'pro', isPro: true, paymentKind: 'card' });
        expect(resolveBillingEntitlement({ status: 'trialing', paid_until: future, subscription_id: 'sub_1' }, now))
            .toMatchObject({ plan: 'pro', isPro: true });
        expect(resolveBillingEntitlement({ status: 'active', paid_until: past, subscription_id: 'sub_1' }, now))
            .toMatchObject({ plan: 'free', isPro: false });
        expect(resolveBillingEntitlement({ status: 'incomplete', paid_until: future, subscription_id: 'sub_1' }, now))
            .toMatchObject({ plan: 'free', isPro: false });

        // cancel_at_period_end keeps Pro until paid_until
        expect(resolveBillingEntitlement({
            status: 'active',
            paid_until: future,
            cancel_at_period_end: true,
            subscription_id: 'sub_1',
        }, now)).toMatchObject({ plan: 'pro', isPro: true, cancelAtPeriodEnd: true });
        expect(resolveBillingEntitlement({
            status: 'active',
            paid_until: past,
            cancel_at_period_end: true,
            subscription_id: 'sub_1',
        }, now)).toMatchObject({ plan: 'free', isPro: false, cancelAtPeriodEnd: true });

        // past_due 7-day grace window
        const graceFuture = new Date(now + 3 * 86_400_000).toISOString();
        const graceExpired = new Date(now - 1000).toISOString();
        expect(resolveBillingEntitlement({
            status: 'past_due',
            paid_until: past,
            grace_until: graceFuture,
            subscription_id: 'sub_1',
        }, now)).toMatchObject({ plan: 'pro', isPro: true, graceUntil: graceFuture });
        expect(resolveBillingEntitlement({
            status: 'past_due',
            paid_until: past,
            grace_until: graceExpired,
            subscription_id: 'sub_1',
        }, now)).toMatchObject({ plan: 'free', isPro: false });

        // Fallback grace calculation when grace_until is absent
        expect(resolveBillingEntitlement({
            status: 'past_due',
            paid_until: new Date(now - PAST_DUE_GRACE_MS + 60_000).toISOString(),
            subscription_id: 'sub_1',
        }, now).isPro).toBe(true);
        expect(resolveBillingEntitlement({
            status: 'past_due',
            paid_until: new Date(now - PAST_DUE_GRACE_MS - 60_000).toISOString(),
            subscription_id: 'sub_1',
        }, now).isPro).toBe(false);

        // 12-month one-off Pix
        expect(resolveBillingEntitlement({
            status: 'active',
            subscription_id: null,
            payment_kind: 'pix_annual',
            paid_until: future,
        }, now)).toMatchObject({ plan: 'pro', isPro: true, paymentKind: 'pix_annual' });
        expect(resolveBillingEntitlement({
            status: 'active',
            subscription_id: null,
            payment_kind: 'pix_annual',
            paid_until: past,
        }, now)).toMatchObject({ plan: 'free', isPro: false, paymentKind: 'pix_annual' });
    });
});

describe('isOwnerUser env authorization', () => {
    it('matches configured owner emails and IDs dynamically without hardcoded identities', () => {
        expect(isOwnerUser({ id: 'u1', email: 'creator@example.com' })).toBe(false);
        expect(isOwnerUser(null)).toBe(false);

        vi.stubEnv('QORP_OWNER_EMAILS', ' Owner@Example.com , other@example.com ');
        vi.stubEnv('QORP_OWNER_USER_IDS', 'uuid-owner-1');

        expect(isOwnerUser({ id: 'u2', email: 'owner@example.com' })).toBe(true);
        expect(isOwnerUser({ id: 'u2', email: 'owner@example.com', email_confirmed_at: null })).toBe(false);
        expect(isOwnerUser({ id: 'UUID-OWNER-1', email: 'random@example.com' })).toBe(true);
        expect(isOwnerUser({ id: 'u3', email: 'nobody@example.com' })).toBe(false);
    });
});
