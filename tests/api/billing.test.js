import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callHandler, createFakeSupabase } from './fakeSupabase.js';

let fakeDb;
let fakeStripe;

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => fakeDb,
}));

vi.mock('stripe', () => {
    const MockStripe = vi.fn(function FakeStripe() {
        return fakeStripe;
    });
    return { default: MockStripe };
});

const { default: billingHandler } = await import('../../api/billing.js');
const { default: webhookHandler } = await import('../../api/stripe-webhook.js');

const USER_FREE = { id: 'user-free-1', email: 'free@example.com' };
const USER_OWNER = { id: 'user-owner-1', email: 'owner@example.com' };

function makeFakeStripe() {
    return {
        customers: {
            create: vi.fn(async ({ metadata }) => ({ id: `cus_${metadata.owner_id}` })),
        },
        checkout: {
            sessions: {
                create: vi.fn(async (params) => ({
                    id: 'cs_test_123',
                    url: `https://checkout.stripe.test/pay/${params.mode}`,
                    params,
                })),
            },
        },
        billingPortal: {
            sessions: {
                create: vi.fn(async ({ customer, return_url }) => ({
                    url: `https://billing.stripe.test/portal/${customer}?ret=${encodeURIComponent(return_url)}`,
                })),
            },
        },
        subscriptions: {
            retrieve: vi.fn(async (id) => ({ id, status: 'active', items: { data: [] } })),
        },
        webhooks: {
            constructEvent: vi.fn((rawBody, signature, secret) => {
                if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) {
                    throw new Error('Raw payload required');
                }
                if (signature !== 'sig_valid' || secret !== 'whsec_fake') {
                    throw new Error('Invalid signature');
                }
                return JSON.parse(rawBody.toString());
            }),
        },
    };
}

let stripeKeySeq = 0;

beforeEach(() => {
    fakeDb = createFakeSupabase({
        users: {
            'tok-free': USER_FREE,
            'tok-owner': USER_OWNER,
        },
    });
    fakeStripe = makeFakeStripe();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service_role_fake');
    vi.stubEnv('STRIPE_SECRET_KEY', `sk_test_fake_${++stripeKeySeq}`);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fake');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_monthly_test');
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_yearly_test');
    vi.stubEnv('STRIPE_PRO_PIX_PRICE_ID', '');
    vi.stubEnv('STRIPE_ALLOW_LIVE', 'false');
    vi.stubEnv('QORP_OWNER_EMAILS', 'owner@example.com');
    vi.stubEnv('SITE_URL', 'https://qorp.test');
});

describe('api/billing GET & sandbox guard', () => {
    it('rejects unauthenticated GET and returns entitlements + owner flag for authenticated users', async () => {
        const unauth = await callHandler(billingHandler, { method: 'GET' });
        expect(unauth.status).toBe(401);

        const freeRes = await callHandler(billingHandler, {
            method: 'GET',
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(freeRes.status).toBe(200);
        expect(freeRes.body).toMatchObject({
            plan: 'free',
            isPro: false,
            isOwner: false,
            activeProjectCount: 0,
            stripeConfigured: true,
            limits: { maxProjects: 2, maxScenes: 6, maxRevisions: 5, maxObsLinks: 1 },
        });

        const ownerRes = await callHandler(billingHandler, {
            method: 'GET',
            headers: { authorization: 'Bearer tok-owner' },
        });
        expect(ownerRes.status).toBe(200);
        expect(ownerRes.body.isOwner).toBe(true);
    });

    it('blocks live Stripe secret keys unless STRIPE_ALLOW_LIVE is true', async () => {
        const livePrefix = ['sk', 'live', 'blocked_test'].join('_');
        vi.stubEnv('STRIPE_SECRET_KEY', livePrefix);
        vi.stubEnv('STRIPE_ALLOW_LIVE', 'false');

        const getRes = await callHandler(billingHandler, {
            method: 'GET',
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(getRes.status).toBe(200);
        expect(getRes.body.stripeConfigured).toBe(false);

        const postRes = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'monthly' },
        });
        expect(postRes.status).toBe(503);
        expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });
});

describe('api/billing POST checkout & portal', () => {
    it('creates monthly & yearly card subscription sessions with server price IDs and allowed_payment_method_types', async () => {
        const resMonthly = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: {
                action: 'checkout',
                plan: 'monthly',
                locale: 'pt-BR',
                priceId: 'price_tampered',
                userId: 'other-user',
                amount: 1,
            },
        });
        expect(resMonthly.status).toBe(200);
        expect(resMonthly.body).toMatchObject({ sessionId: 'cs_test_123' });

        const params = fakeStripe.checkout.sessions.create.mock.calls[0][0];
        expect(params).toMatchObject({
            mode: 'subscription',
            customer: 'cus_user-free-1',
            client_reference_id: 'user-free-1',
            allowed_payment_method_types: ['card'],
            line_items: [{ price: 'price_monthly_test', quantity: 1 }],
            success_url: 'https://qorp.test/?conta&checkout=success&session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://qorp.test/?conta&checkout=cancel',
            metadata: { owner_id: 'user-free-1', plan: 'monthly' },
            subscription_data: { metadata: { owner_id: 'user-free-1', plan: 'monthly' } },
        });

        const resYearly = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'yearly', locale: 'en' },
        });
        expect(resYearly.status).toBe(200);
        expect(fakeStripe.checkout.sessions.create.mock.calls[1][0]).toMatchObject({
            mode: 'subscription',
            allowed_payment_method_types: ['card'],
            line_items: [{ price: 'price_yearly_test', quantity: 1 }],
            locale: 'en',
        });
    });

    it('creates 12-month one-off Pix checkout session in BRL', async () => {
        const resPix = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'pix_annual', locale: 'pt-BR' },
        });
        expect(resPix.status).toBe(200);
        const params = fakeStripe.checkout.sessions.create.mock.calls[0][0];
        expect(params).toMatchObject({
            mode: 'payment',
            allowed_payment_method_types: ['pix'],
            payment_method_options: { pix: { expires_after_seconds: 86400 } },
            metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' },
            payment_intent_data: { metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' } },
        });
        expect(params.line_items[0].price_data).toMatchObject({
            currency: 'brl',
            unit_amount: 24900,
        });
    });

    it('rejects pix_annual checkout with 409 when an active non-canceling card subscription exists, and allows it when cancel_at_period_end is true', async () => {
        const future = new Date(Date.now() + 20 * 86_400_000).toISOString();
        fakeDb.tables.billing.push({
            owner_id: 'user-free-1',
            customer_id: 'cus_active_card',
            subscription_id: 'sub_active_card',
            status: 'active',
            payment_kind: 'card',
            paid_until: future,
            cancel_at_period_end: false,
        });

        const blockedPix = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'pix_annual', locale: 'pt-BR' },
        });
        expect(blockedPix.status).toBe(409);
        expect(blockedPix.body.error).toMatch(/assinatura ativa no cartão/i);

        fakeDb.tables.billing[0].cancel_at_period_end = true;
        const allowedPix = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'pix_annual', locale: 'pt-BR' },
        });
        expect(allowedPix.status).toBe(200);
    });

    it('rejects invalid plans and creates Customer Portal session only when customer_id exists', async () => {
        const invalidPlan = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'checkout', plan: 'free_forever' },
        });
        expect(invalidPlan.status).toBe(400);

        const noCustomerPortal = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'portal' },
        });
        expect(noCustomerPortal.status).toBe(400);

        fakeDb.tables.billing.push({
            owner_id: 'user-free-1',
            customer_id: 'cus_existing_1',
            status: 'active',
            paid_until: new Date(Date.now() + 86_400_000).toISOString(),
        });
        const portalRes = await callHandler(billingHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'portal', locale: 'pt-BR' },
        });
        expect(portalRes.status).toBe(200);
        expect(portalRes.body.url).toContain('cus_existing_1');
        expect(fakeStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
            customer: 'cus_existing_1',
            return_url: 'https://qorp.test/?conta',
            locale: 'pt-BR',
        });
    });
});

describe('api/stripe-webhook signature, idempotency, out-of-order & lifecycle transitions', () => {
    const sendWebhook = (event, signature = 'sig_valid') => callHandler(webhookHandler, {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: JSON.stringify(event),
    });

    it('rejects missing or invalid signatures', async () => {
        const missing = await sendWebhook({ id: 'evt_1' }, '');
        expect(missing.status).toBe(400);

        const invalid = await sendWebhook({ id: 'evt_2' }, 'sig_bad');
        expect(invalid.status).toBe(400);
    });

    it('activates subscription via checkout.session.completed (Stripe 2026-10-28 items.data[0].current_period_end) and deduplicates replays', async () => {
        const periodEndSec = Math.floor(Date.now() / 1000) + 30 * 86400;
        fakeStripe.subscriptions.retrieve.mockResolvedValueOnce({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { owner_id: 'user-free-1' },
            items: { data: [{ current_period_end: periodEndSec }] },
        });

        const evt = {
            id: 'evt_checkout_sub_1',
            type: 'checkout.session.completed',
            created: 1_800_000_100,
            data: {
                object: {
                    mode: 'subscription',
                    customer: 'cus_123',
                    subscription: 'sub_123',
                    client_reference_id: 'user-free-1',
                    metadata: { owner_id: 'user-free-1', plan: 'monthly' },
                },
            },
        };

        const first = await sendWebhook(evt);
        expect(first.status).toBe(200);
        expect(first.body).toEqual({ received: true });
        expect(fakeDb.tables.billing[0]).toMatchObject({
            owner_id: 'user-free-1',
            customer_id: 'cus_123',
            subscription_id: 'sub_123',
            status: 'active',
            payment_kind: 'card',
            last_event_created: 1_800_000_100,
        });

        const replay = await sendWebhook(evt);
        expect(replay.status).toBe(200);
        expect(replay.body).toMatchObject({ received: true, duplicate: true });
        expect(fakeStripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    });

    it('ignores out-of-order stale events without regressing billing state', async () => {
        fakeDb.tables.billing.push({
            owner_id: 'user-free-1',
            customer_id: 'cus_123',
            subscription_id: 'sub_new',
            status: 'active',
            paid_until: new Date(Date.now() + 20 * 86_400_000).toISOString(),
            last_event_created: 1_800_000_500,
        });

        const staleEvent = {
            id: 'evt_stale_1',
            type: 'customer.subscription.updated',
            created: 1_800_000_200,
            data: {
                object: {
                    id: 'sub_new',
                    customer: 'cus_123',
                    status: 'canceled',
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        };

        const res = await sendWebhook(staleEvent);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ received: true, skipped: 'stale_event' });
        expect(fakeDb.tables.billing[0].status).toBe('active');
        expect(fakeDb.tables.stripeEvents.some(e => e.id === 'evt_stale_1')).toBe(true);
    });

    it('handles Pix paid, unpaid/async success, and async failure', async () => {
        const unpaidRes = await sendWebhook({
            id: 'evt_pix_unpaid',
            type: 'checkout.session.completed',
            created: 1_800_000_010,
            data: {
                object: {
                    mode: 'payment',
                    payment_status: 'unpaid',
                    customer: 'cus_pix_1',
                    metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' },
                },
            },
        });
        expect(unpaidRes.status).toBe(200);
        expect(fakeDb.tables.billing[0].status).toBe('free');

        const asyncFailRes = await sendWebhook({
            id: 'evt_pix_fail',
            type: 'checkout.session.async_payment_failed',
            created: 1_800_000_020,
            data: {
                object: {
                    mode: 'payment',
                    customer: 'cus_pix_1',
                    metadata: { owner_id: 'user-free-1', plan: 'pix_annual' },
                },
            },
        });
        expect(asyncFailRes.status).toBe(200);
        expect(fakeDb.tables.billing[0].status).toBe('free');

        const asyncOkRes = await sendWebhook({
            id: 'evt_pix_ok',
            type: 'checkout.session.async_payment_succeeded',
            created: 1_800_000_030,
            data: {
                object: {
                    mode: 'payment',
                    payment_status: 'paid',
                    customer: 'cus_pix_1',
                    metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' },
                },
            },
        });
        expect(asyncOkRes.status).toBe(200);
        expect(fakeDb.tables.billing[0]).toMatchObject({
            status: 'active',
            subscription_id: null,
            payment_kind: 'pix_annual',
        });
        const paidUntilMs = Date.parse(fakeDb.tables.billing[0].paid_until);
        expect(paidUntilMs - 1_800_000_030 * 1000).toBeGreaterThan(360 * 86_400_000);
    });

    it('deduplicates repeated Pix webhooks for the same session.id and protects active pix_annual from stale card webhooks or same-second incomplete races', async () => {
        const res1 = await sendWebhook({
            id: 'evt_pix_dedup_1',
            type: 'checkout.session.completed',
            created: 1_800_001_000,
            data: {
                object: {
                    id: 'cs_pix_same_1',
                    mode: 'payment',
                    payment_status: 'paid',
                    customer: 'cus_pix_2',
                    metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' },
                },
            },
        });
        expect(res1.status).toBe(200);
        const firstPaidUntil = fakeDb.tables.billing[0].paid_until;

        // Second webhook event (e.g. async_payment_succeeded) for the same session must not add another 12 months
        const res2 = await sendWebhook({
            id: 'evt_pix_dedup_2',
            type: 'checkout.session.async_payment_succeeded',
            created: 1_800_001_005,
            data: {
                object: {
                    id: 'cs_pix_same_1',
                    mode: 'payment',
                    payment_status: 'paid',
                    customer: 'cus_pix_2',
                    metadata: { owner_id: 'user-free-1', plan: 'pix_annual', duration_months: '12' },
                },
            },
        });
        expect(res2.status).toBe(200);
        expect(fakeDb.tables.billing[0].paid_until).toBe(firstPaidUntil);

        // Stale canceled card subscription webhook while pix_annual is still active must not overwrite pix_annual
        const staleSubCancel = await sendWebhook({
            id: 'evt_card_cancel_during_pix',
            type: 'customer.subscription.deleted',
            created: 1_800_002_000,
            data: {
                object: {
                    id: 'sub_old_card',
                    customer: 'cus_pix_2',
                    status: 'canceled',
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        });
        expect(staleSubCancel.status).toBe(200);
        expect(staleSubCancel.body).toMatchObject({ received: true, ignored: 'active_pix_entitlement' });
        expect(fakeDb.tables.billing[0]).toMatchObject({
            status: 'active',
            payment_kind: 'pix_annual',
            paid_until: firstPaidUntil,
        });

        // Switch user to active card subscription at T=1_900_000_000, then send same-second incomplete event
        fakeDb.tables.billing[0] = {
            owner_id: 'user-free-1',
            customer_id: 'cus_card_race',
            subscription_id: 'sub_race',
            status: 'active',
            payment_kind: 'card',
            paid_until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            last_event_created: 1_900_000_000,
        };
        const sameSecIncomplete = await sendWebhook({
            id: 'evt_same_sec_incomplete',
            type: 'customer.subscription.created',
            created: 1_900_000_000,
            data: {
                object: {
                    id: 'sub_race',
                    customer: 'cus_card_race',
                    status: 'incomplete',
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        });
        expect(sameSecIncomplete.status).toBe(200);
        expect(sameSecIncomplete.body).toMatchObject({ received: true, skipped: 'stale_status' });
        expect(fakeDb.tables.billing[0].status).toBe('active');
    });

    it('handles invoice.payment_failed (2026-10-28 parent.subscription_details), past_due grace, cancellation, and charge.refunded downgrade', async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        fakeStripe.subscriptions.retrieve.mockResolvedValueOnce({
            id: 'sub_grace',
            customer: 'cus_grace',
            status: 'past_due',
            current_period_end: nowSec - 60,
            metadata: { owner_id: 'user-free-1' },
        });

        const failInvoiceRes = await sendWebhook({
            id: 'evt_inv_fail_1',
            type: 'invoice.payment_failed',
            created: nowSec,
            data: {
                object: {
                    parent: { subscription_details: { subscription: 'sub_grace' } },
                },
            },
        });
        expect(failInvoiceRes.status).toBe(200);
        expect(fakeDb.tables.billing[0].status).toBe('past_due');
        const initialGrace = fakeDb.tables.billing[0].grace_until;
        expect(Date.parse(initialGrace)).toBeGreaterThan(Date.now() + 6 * 86_400_000);

        // Retry event must not extend the grace window
        const retryRes = await sendWebhook({
            id: 'evt_sub_past_due_retry',
            type: 'customer.subscription.updated',
            created: nowSec + 86400,
            data: {
                object: {
                    id: 'sub_grace',
                    customer: 'cus_grace',
                    status: 'past_due',
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        });
        expect(retryRes.status).toBe(200);
        expect(fakeDb.tables.billing[0].grace_until).toBe(initialGrace);

        // Refund downgrades immediately
        const refundRes = await sendWebhook({
            id: 'evt_refund_1',
            type: 'charge.refunded',
            created: nowSec + 90000,
            data: {
                object: {
                    id: 'ch_1',
                    customer: 'cus_grace',
                    refunded: true,
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        });
        expect(refundRes.status).toBe(200);
        expect(fakeDb.tables.billing[0]).toMatchObject({
            status: 'refunded',
            grace_until: null,
        });

        // Subscription deleted sets canceled
        const deletedRes = await sendWebhook({
            id: 'evt_sub_del',
            type: 'customer.subscription.deleted',
            created: nowSec + 95000,
            data: {
                object: {
                    id: 'sub_grace',
                    customer: 'cus_grace',
                    ended_at: nowSec + 95000,
                    metadata: { owner_id: 'user-free-1' },
                },
            },
        });
        expect(deletedRes.status).toBe(200);
        expect(fakeDb.tables.billing[0].status).toBe('canceled');
    });
});
