import Stripe from 'stripe';
import { check, HttpError } from './qorp.js';
import { PORTS } from '../ports.config.js';

export const BILLING_PLANS = new Set(['monthly', 'yearly', 'pix_annual']);

export function validateStripeSecretKey(rawKey = process.env.STRIPE_SECRET_KEY) {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, reason: 'missing', key: '' };
    const allowLive = process.env.STRIPE_ALLOW_LIVE === 'true';
    if ((key.startsWith('sk_live_') || key.startsWith('rk_live_')) && !allowLive) {
        return { ok: false, reason: 'live_blocked', key: '' };
    }
    if (!allowLive && !key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
        return { ok: false, reason: 'invalid_prefix', key: '' };
    }
    return { ok: true, key };
}

export function isStripeConfigured() {
    return validateStripeSecretKey().ok;
}

let _stripeCache = null;

export function getStripeClient(StripeCtor = Stripe) {
    const v = validateStripeSecretKey();
    if (!v.ok) {
        if (v.reason === 'live_blocked') {
            throw new HttpError(503, 'Chave Stripe de produção bloqueada no modo sandbox.');
        }
        throw new HttpError(503, 'Cobrança Stripe não configurada no servidor.');
    }
    if (_stripeCache && _stripeCache.key === v.key && _stripeCache.ctor === StripeCtor) {
        return _stripeCache.client;
    }
    const client = new StripeCtor(v.key);
    _stripeCache = { key: v.key, ctor: StripeCtor, client };
    return client;
}

export function resolveSiteOrigin(req) {
    const siteUrl = String(process.env.SITE_URL || '').trim();
    if (siteUrl) {
        try {
            const parsed = new URL(siteUrl);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
        } catch {
            // fall through to Vercel / host headers
        }
    }

    const vercelHost = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').trim();
    if (vercelHost) {
        try {
            const normalized = vercelHost.replace(/^https?:\/\//i, '');
            const parsed = new URL(`https://${normalized}`);
            if (parsed.protocol === 'https:') return parsed.origin;
        } catch {
            // fall through
        }
    }

    const rawHost = String(req?.headers?.host || '').trim();
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(rawHost)) {
        try {
            return new URL(`http://${rawHost}`).origin;
        } catch {
            // fall through
        }
    }

    return `http://localhost:${PORTS.FRONTEND}`;
}

export function safeAccountUrls(origin, returnPath = '/?conta') {
    let safePath = '/?conta';
    if (typeof returnPath === 'string' && returnPath.startsWith('/') && !returnPath.startsWith('//')) {
        try {
            const resolved = new URL(returnPath, origin);
            if (resolved.origin === origin) safePath = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        } catch {
            safePath = '/?conta';
        }
    }
    return {
        successUrl: `${origin}/?conta&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/?conta&checkout=cancel`,
        portalReturnUrl: new URL(safePath, origin).toString(),
    };
}

export function buildCheckoutSessionParams({ plan, customerId, ownerId, origin, locale = 'pt-BR' }) {
    if (!BILLING_PLANS.has(plan)) {
        throw new HttpError(400, 'Plano inválido.');
    }
    const stripeLocale = locale === 'en' ? 'en' : 'pt-BR';
    const { successUrl, cancelUrl } = safeAccountUrls(origin);

    const base = {
        customer: customerId,
        client_reference_id: ownerId,
        locale: stripeLocale,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { owner_id: ownerId, plan },
    };

    if (plan === 'monthly' || plan === 'yearly') {
        const priceId = String(
            plan === 'monthly'
                ? (process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '')
                : (process.env.STRIPE_PRO_YEARLY_PRICE_ID || '')
        ).trim();
        if (!priceId) {
            throw new HttpError(503, 'Preço do plano não configurado no ambiente.');
        }
        return {
            ...base,
            mode: 'subscription',
            allowed_payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            subscription_data: {
                metadata: { owner_id: ownerId, plan },
            },
        };
    }

    const pixPriceId = String(process.env.STRIPE_PRO_PIX_PRICE_ID || '').trim();
    const lineItems = pixPriceId
        ? [{ price: pixPriceId, quantity: 1 }]
        : [{
            price_data: {
                currency: 'brl',
                unit_amount: 24900,
                product_data: {
                    name: 'qorpStreamer Pro — 12 meses (Pix)',
                    description: 'Acesso ao plano Pro por 12 meses, pagamento único sem renovação automática.',
                },
            },
            quantity: 1,
        }];

    return {
        ...base,
        mode: 'payment',
        allowed_payment_method_types: ['pix'],
        line_items: lineItems,
        payment_method_options: {
            pix: { expires_after_seconds: 86400 },
        },
        metadata: { owner_id: ownerId, plan: 'pix_annual', duration_months: '12' },
        payment_intent_data: {
            metadata: { owner_id: ownerId, plan: 'pix_annual', duration_months: '12' },
        },
    };
}

export async function ensureStripeCustomer(db, stripe, user) {
    const existing = check(
        await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
    );
    if (existing?.customer_id) {
        return { customerId: existing.customer_id, billingRow: existing };
    }

    const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.user_metadata?.full_name || undefined,
        metadata: { owner_id: user.id },
    });

    if (!existing) {
        const inserted = await db.from('qorp_billing').insert({
            owner_id: user.id,
            customer_id: customer.id,
            status: 'free',
            updated_at: new Date().toISOString(),
        }).select('*').single();

        if (!inserted.error && inserted.data) {
            return { customerId: inserted.data.customer_id, billingRow: inserted.data };
        }
        if (inserted.error && inserted.error.code !== '23505' && !/duplicate/i.test(inserted.error.message || '')) {
            check(inserted);
        }
        const raced = check(
            await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
        );
        if (raced?.customer_id) {
            return { customerId: raced.customer_id, billingRow: raced };
        }
        return { customerId: customer.id, billingRow: raced };
    }

    const updated = check(
        await db.from('qorp_billing')
            .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
            .eq('owner_id', user.id)
            .is('customer_id', null)
            .select('*')
            .maybeSingle()
    );
    if (updated?.customer_id) {
        return { customerId: updated.customer_id, billingRow: updated };
    }
    const reread = check(
        await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
    );
    return { customerId: reread?.customer_id || customer.id, billingRow: reread };
}

export async function createCheckoutSession({ db, stripe, user, plan, origin, locale }) {
    if (!BILLING_PLANS.has(plan)) {
        throw new HttpError(400, 'Plano inválido.');
    }
    const { customerId, billingRow } = await ensureStripeCustomer(db, stripe, user);
    const hasActiveCardSubscription = Boolean(
        billingRow?.subscription_id
        && ['active', 'trialing', 'past_due'].includes(billingRow.status)
    );
    if ((plan === 'monthly' || plan === 'yearly') && hasActiveCardSubscription) {
        throw new HttpError(409, 'Você já possui uma assinatura ativa. Gerencie seu plano pelo Portal do Cliente.');
    }
    if (plan === 'pix_annual' && hasActiveCardSubscription && !billingRow.cancel_at_period_end) {
        throw new HttpError(409, 'Você já possui uma assinatura ativa no cartão. Cancele a renovação automática pelo Portal do Cliente antes de contratar por Pix.');
    }

    const params = buildCheckoutSessionParams({
        plan,
        customerId,
        ownerId: user.id,
        origin,
        locale,
    });
    const session = await stripe.checkout.sessions.create(params);
    return { url: session.url, sessionId: session.id };
}

async function upsertBillingRow(db, row) {
    const res = await db.from('qorp_billing').upsert(row, { onConflict: 'owner_id' });
    if (res.error && /column .* does not exist|Could not find the .* column/i.test(res.error.message || '')) {
        const baseRow = {
            owner_id: row.owner_id,
            customer_id: row.customer_id ?? null,
            subscription_id: row.subscription_id ?? null,
            status: row.status ?? 'free',
            paid_until: row.paid_until ?? null,
            cancel_at_period_end: Boolean(row.cancel_at_period_end),
            updated_at: row.updated_at || new Date().toISOString(),
        };
        check(await db.from('qorp_billing').upsert(baseRow, { onConflict: 'owner_id' }));
        return;
    }
    check(res);
}

export async function reconcileCheckoutSession({ db, stripe, user, sessionId }) {
    const cleanId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!cleanId.startsWith('cs_')) return null;
    const session = await stripe.checkout.sessions.retrieve(cleanId);
    if (!session) return null;

    const existingRow = check(
        await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
    );
    const sessionOwner = session.metadata?.owner_id || session.client_reference_id || null;
    const customerId = idOf(session.customer);
    const belongsToUser = (
        sessionOwner === user.id
        || (customerId && existingRow?.customer_id && customerId === existingRow.customer_id)
    );
    if (!belongsToUser) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(idOf(session.subscription));
        if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
            const periodEndIso = toIso(subscriptionPeriodEnd(sub));
            await upsertBillingRow(db, {
                owner_id: user.id,
                customer_id: customerId || existingRow?.customer_id || null,
                subscription_id: sub.id,
                status: sub.status,
                paid_until: periodEndIso || existingRow?.paid_until || null,
                grace_until: null,
                cancel_at_period_end: Boolean(sub.cancel_at_period_end),
                payment_kind: 'card',
                last_event_created: Math.max(Number(existingRow?.last_event_created || 0), nowSec),
                updated_at: new Date().toISOString(),
            });
        }
    } else if (session.mode === 'payment' && session.payment_status === 'paid') {
        if (existingRow?.last_pix_session_id === session.id) return existingRow;
        const nowMs = Date.now();
        const baseMs = (
            existingRow?.status === 'active'
            && !existingRow?.subscription_id
            && existingRow?.paid_until
            && Date.parse(existingRow.paid_until) > nowMs
        )
            ? Date.parse(existingRow.paid_until)
            : nowMs;
        const durationMonths = Math.max(1, Number(session.metadata?.duration_months || 12) || 12);
        await upsertBillingRow(db, {
            owner_id: user.id,
            customer_id: customerId || existingRow?.customer_id || null,
            subscription_id: null,
            status: 'active',
            paid_until: addMonthsIso(baseMs, durationMonths),
            grace_until: null,
            cancel_at_period_end: false,
            payment_kind: 'pix_annual',
            last_pix_session_id: session.id,
            last_event_created: Math.max(Number(existingRow?.last_event_created || 0), nowSec),
            updated_at: new Date().toISOString(),
        });
    }
    return check(
        await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
    );
}

export async function createPortalSession({ db, stripe, user, origin, locale }) {
    const row = check(
        await db.from('qorp_billing').select('*').eq('owner_id', user.id).maybeSingle()
    );
    if (!row?.customer_id) {
        throw new HttpError(400, 'Nenhum cadastro de cobrança encontrado para esta conta.');
    }
    const { portalReturnUrl } = safeAccountUrls(origin);
    const session = await stripe.billingPortal.sessions.create({
        customer: row.customer_id,
        return_url: portalReturnUrl,
        locale: locale === 'en' ? 'en' : 'pt-BR',
    });
    return { url: session.url };
}

export async function readRawBody(req, maxBytes = 1_000_000) {
    if (Buffer.isBuffer(req?.body)) {
        if (req.body.length > maxBytes) throw new HttpError(413, 'Payload acima do limite.');
        return req.body;
    }
    if (typeof req?.body === 'string') {
        if (Buffer.byteLength(req.body) > maxBytes) throw new HttpError(413, 'Payload acima do limite.');
        return req.body;
    }
    if (Buffer.isBuffer(req?.rawBody)) {
        if (req.rawBody.length > maxBytes) throw new HttpError(413, 'Payload acima do limite.');
        return req.rawBody;
    }
    if (typeof req?.rawBody === 'string') {
        if (Buffer.byteLength(req.rawBody) > maxBytes) throw new HttpError(413, 'Payload acima do limite.');
        return req.rawBody;
    }
    if (req && typeof req[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        let total = 0;
        for await (const chunk of req) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > maxBytes) throw new HttpError(413, 'Payload acima do limite.');
            chunks.push(buf);
        }
        return Buffer.concat(chunks);
    }
    throw new HttpError(400, 'Corpo bruto da requisição indisponível para verificação.');
}

function idOf(val) {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val.id || null;
    return null;
}

function toIso(unixSec) {
    const n = Number(unixSec);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function addMonthsIso(baseMs, months) {
    const d = new Date(baseMs);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString();
}

function subscriptionPeriodEnd(sub) {
    const items = sub?.items?.data;
    if (Array.isArray(items) && items.length > 0) {
        const ends = items
            .map(item => Number(item?.current_period_end))
            .filter(n => Number.isFinite(n) && n > 0);
        if (ends.length > 0) return Math.max(...ends);
    }
    return sub?.current_period_end ?? null;
}

function invoiceSubscriptionId(invoice) {
    return idOf(invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription);
}

async function resolveBillingTarget(db, { ownerId, customerId }) {
    if (ownerId) {
        const byOwner = check(
            await db.from('qorp_billing').select('*').eq('owner_id', ownerId).maybeSingle()
        );
        return { ownerId, existingRow: byOwner || null };
    }
    if (customerId) {
        const byCustomer = check(
            await db.from('qorp_billing').select('*').eq('customer_id', customerId).maybeSingle()
        );
        if (byCustomer?.owner_id) {
            return { ownerId: byCustomer.owner_id, existingRow: byCustomer };
        }
    }
    return { ownerId: null, existingRow: null };
}

export async function handleStripeWebhook({
    db,
    stripe,
    rawBody,
    signature,
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
}) {
    if (!String(webhookSecret || '').trim()) {
        throw new HttpError(503, 'Webhook Stripe não configurado.');
    }
    if (typeof signature !== 'string' || !signature.trim()) {
        throw new HttpError(400, 'Cabeçalho stripe-signature ausente.');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
        throw new HttpError(400, 'Assinatura do webhook inválida.');
    }

    if (event.livemode === true && process.env.STRIPE_ALLOW_LIVE !== 'true') {
        throw new HttpError(503, 'Eventos Stripe de produção bloqueados no modo sandbox.');
    }

    const eventCreated = Number(event.created || 0);
    const { error: insertErr } = await db.from('qorp_stripe_events').insert({
        id: event.id,
        created: eventCreated,
    });
    if (insertErr) {
        if (insertErr.code === '23505' || /duplicate/i.test(insertErr.message || '')) {
            return { received: true, duplicate: true, eventId: event.id };
        }
        check({ error: insertErr });
    }

    const eventMs = eventCreated > 0 ? eventCreated * 1000 : Date.now();

    const applyBillingWrite = async (ownerId, existingRow, patch) => {
        if (existingRow && Number(existingRow.last_event_created || 0) > eventCreated) {
            return { received: true, skipped: 'stale_event' };
        }
        await upsertBillingRow(db, {
            owner_id: ownerId,
            ...patch,
            last_event_created: eventCreated,
            updated_at: new Date().toISOString(),
        });
        return { received: true };
    };

    const syncSubscription = async (sub, explicitOwnerId = null) => {
        const customerId = idOf(sub?.customer);
        const { ownerId, existingRow } = await resolveBillingTarget(db, {
            ownerId: explicitOwnerId || sub?.metadata?.owner_id || null,
            customerId,
        });
        if (!ownerId) return { received: true, ignored: 'unknown_owner' };

        const existingPaidUntilMs = existingRow?.paid_until ? Date.parse(existingRow.paid_until) : NaN;
        const hasActiveUnexpiredPix = (
            existingRow?.payment_kind === 'pix_annual'
            && existingRow?.status === 'active'
            && !existingRow?.subscription_id
            && Number.isFinite(existingPaidUntilMs)
            && existingPaidUntilMs > eventMs
        );
        if (
            hasActiveUnexpiredPix
            && ['canceled', 'incomplete_expired', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(sub?.status)
        ) {
            return { received: true, ignored: 'active_pix_entitlement' };
        }

        if (
            existingRow?.subscription_id
            && sub?.id
            && existingRow.subscription_id !== sub.id
            && (
                ['canceled', 'incomplete_expired'].includes(sub.status)
                || (
                    ['active', 'trialing', 'past_due'].includes(existingRow.status)
                    && ['past_due', 'unpaid', 'incomplete'].includes(sub.status)
                )
            )
        ) {
            return { received: true, ignored: 'stale_subscription' };
        }

        const sameSub = Boolean(existingRow?.subscription_id && sub?.id && existingRow.subscription_id === sub.id);
        const sameSecond = Number(existingRow?.last_event_created || 0) === eventCreated;
        if (
            sameSub
            && sub?.status === 'incomplete'
            && ['active', 'trialing', 'past_due', 'canceled', 'incomplete_expired', 'refunded'].includes(existingRow?.status)
        ) {
            return { received: true, skipped: 'stale_status' };
        }
        if (
            sameSub
            && sameSecond
            && ['canceled', 'incomplete_expired', 'refunded'].includes(existingRow?.status)
            && sub?.status !== existingRow?.status
        ) {
            return { received: true, skipped: 'stale_status' };
        }

        const periodEndIso = toIso(subscriptionPeriodEnd(sub));
        const sharedCustomerId = customerId || existingRow?.customer_id || null;

        if (sub.status === 'active' || sub.status === 'trialing') {
            return applyBillingWrite(ownerId, existingRow, {
                customer_id: sharedCustomerId,
                subscription_id: sub.id,
                status: sub.status,
                paid_until: periodEndIso || existingRow?.paid_until || null,
                grace_until: null,
                cancel_at_period_end: Boolean(sub.cancel_at_period_end),
                payment_kind: 'card',
            });
        }

        if (sub.status === 'past_due') {
            const graceUntil = (existingRow?.status === 'past_due' && existingRow?.grace_until)
                ? existingRow.grace_until
                : new Date(eventMs + 7 * 86_400_000).toISOString();
            return applyBillingWrite(ownerId, existingRow, {
                customer_id: sharedCustomerId,
                subscription_id: sub.id,
                status: 'past_due',
                paid_until: periodEndIso || existingRow?.paid_until || null,
                grace_until: graceUntil,
                cancel_at_period_end: Boolean(sub.cancel_at_period_end),
                payment_kind: 'card',
            });
        }

        if (sub.status === 'incomplete') {
            return applyBillingWrite(ownerId, existingRow, {
                customer_id: sharedCustomerId,
                subscription_id: sub.id,
                status: 'incomplete',
                paid_until: null,
                grace_until: null,
                cancel_at_period_end: false,
                payment_kind: 'card',
            });
        }

        const endedIso = sub.status === 'canceled'
            ? new Date(Math.min(Date.now(), (sub.ended_at || eventCreated || Math.floor(Date.now() / 1000)) * 1000)).toISOString()
            : (periodEndIso || existingRow?.paid_until || null);

        return applyBillingWrite(ownerId, existingRow, {
            customer_id: sharedCustomerId,
            subscription_id: sub.status === 'canceled' ? sub.id : (existingRow?.subscription_id || sub.id),
            status: sub.status || 'canceled',
            paid_until: endedIso,
            grace_until: null,
            cancel_at_period_end: false,
            payment_kind: 'card',
        });
    };

    const activatePixPurchase = async (session) => {
        const sessionId = typeof session?.id === 'string' && session.id.trim() ? session.id.trim() : null;
        const customerId = idOf(session?.customer);
        const { ownerId, existingRow } = await resolveBillingTarget(db, {
            ownerId: session?.metadata?.owner_id || session?.client_reference_id || null,
            customerId,
        });
        if (!ownerId) return { received: true, ignored: 'unknown_owner' };
        if (sessionId && existingRow?.last_pix_session_id === sessionId) {
            return { received: true, duplicate: true, sessionId };
        }

        const baseMs = (
            existingRow?.status === 'active'
            && !existingRow?.subscription_id
            && existingRow?.paid_until
            && Date.parse(existingRow.paid_until) > eventMs
        )
            ? Date.parse(existingRow.paid_until)
            : eventMs;

        const durationMonths = Math.max(1, Number(session?.metadata?.duration_months || 12) || 12);

        return applyBillingWrite(ownerId, existingRow, {
            customer_id: customerId || existingRow?.customer_id || null,
            subscription_id: null,
            status: 'active',
            paid_until: addMonthsIso(baseMs, durationMonths),
            grace_until: null,
            cancel_at_period_end: false,
            payment_kind: 'pix_annual',
            ...(sessionId ? { last_pix_session_id: sessionId } : {}),
        });
    };

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object || {};
                const customerId = idOf(session.customer);
                const ownerHint = session.metadata?.owner_id || session.client_reference_id || null;
                const { ownerId, existingRow } = await resolveBillingTarget(db, { ownerId: ownerHint, customerId });
                if (!ownerId) return { received: true, ignored: 'unknown_owner' };

                if (session.mode === 'subscription' && session.subscription) {
                    const sub = await stripe.subscriptions.retrieve(idOf(session.subscription));
                    return await syncSubscription(sub, ownerId);
                }

                if (session.mode === 'payment') {
                    if (session.payment_status === 'paid') {
                        return await activatePixPurchase(session);
                    }
                    return await applyBillingWrite(ownerId, existingRow, {
                        customer_id: customerId || existingRow?.customer_id || null,
                        subscription_id: existingRow?.subscription_id ?? null,
                        status: existingRow?.status || 'free',
                        paid_until: existingRow?.paid_until ?? null,
                        grace_until: existingRow?.grace_until ?? null,
                        cancel_at_period_end: Boolean(existingRow?.cancel_at_period_end),
                        payment_kind: existingRow?.payment_kind ?? null,
                    });
                }

                return { received: true };
            }

            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object || {};
                if (session.mode === 'payment' || session.metadata?.plan === 'pix_annual') {
                    return await activatePixPurchase(session);
                }
                return { received: true };
            }

            case 'checkout.session.async_payment_failed': {
                const session = event.data.object || {};
                const customerId = idOf(session.customer);
                const { ownerId, existingRow } = await resolveBillingTarget(db, {
                    ownerId: session.metadata?.owner_id || session.client_reference_id || null,
                    customerId,
                });
                if (!ownerId) return { received: true, ignored: 'unknown_owner' };

                const hasExistingPaid = existingRow && ['active', 'trialing', 'past_due'].includes(existingRow.status);
                if (hasExistingPaid) {
                    return await applyBillingWrite(ownerId, existingRow, {
                        customer_id: customerId || existingRow.customer_id || null,
                        subscription_id: existingRow.subscription_id ?? null,
                        status: existingRow.status,
                        paid_until: existingRow.paid_until ?? null,
                        grace_until: existingRow.grace_until ?? null,
                        cancel_at_period_end: Boolean(existingRow.cancel_at_period_end),
                        payment_kind: existingRow.payment_kind ?? null,
                    });
                }
                return await applyBillingWrite(ownerId, existingRow, {
                    customer_id: customerId || existingRow?.customer_id || null,
                    subscription_id: null,
                    status: 'free',
                    paid_until: null,
                    grace_until: null,
                    cancel_at_period_end: false,
                    payment_kind: null,
                });
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                return await syncSubscription(event.data.object || {});

            case 'customer.subscription.deleted':
                return await syncSubscription({ ...(event.data.object || {}), status: 'canceled' });

            case 'invoice.paid':
            case 'invoice.payment_failed': {
                const subId = invoiceSubscriptionId(event.data.object);
                if (!subId) return { received: true, ignored: 'no_subscription' };
                const sub = await stripe.subscriptions.retrieve(subId);
                return await syncSubscription(sub);
            }

            case 'charge.refunded': {
                const charge = event.data.object || {};
                if (charge.refunded !== true) {
                    return { received: true, ignored: 'partial_refund' };
                }
                const customerId = idOf(charge.customer);
                const { ownerId, existingRow } = await resolveBillingTarget(db, {
                    ownerId: charge.metadata?.owner_id || null,
                    customerId,
                });
                if (!ownerId) return { received: true, ignored: 'unknown_owner' };

                return await applyBillingWrite(ownerId, existingRow, {
                    customer_id: customerId || existingRow?.customer_id || null,
                    subscription_id: existingRow?.subscription_id ?? null,
                    status: 'refunded',
                    paid_until: new Date(eventMs).toISOString(),
                    grace_until: null,
                    cancel_at_period_end: false,
                    payment_kind: existingRow?.payment_kind ?? null,
                });
            }

            default:
                return { received: true, ignored: 'unhandled_event' };
        }
    } catch (err) {
        await db.from('qorp_stripe_events').delete().eq('id', event.id);
        throw err;
    }
}
