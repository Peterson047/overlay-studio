import {
    activeProjectRows,
    bodyOf,
    database,
    endpoint,
    getUserBilling,
    HttpError,
    identity,
    isOwnerUser,
} from '../server/qorp.js';
import { PLAN_LIMITS, resolveBillingEntitlement } from '../src/theme/entitlements.js';
import {
    createCheckoutSession,
    createPortalSession,
    getStripeClient,
    isStripeConfigured,
    reconcileCheckoutSession,
    resolveSiteOrigin,
} from '../server/stripe.js';

export default endpoint(async (req, res) => {
    const db = database();
    const user = await identity(req, db);

    if (req.method === 'GET') {
        const sessionId = typeof req.query?.session_id === 'string' ? req.query.session_id.trim() : '';
        if (sessionId && isStripeConfigured()) {
            try {
                const stripe = getStripeClient();
                await reconcileCheckoutSession({ db, stripe, user, sessionId });
            } catch {
                // Best-effort reconciliation on return from Checkout; webhook remains source of truth.
            }
        }
        const [billingRow, activeRows] = await Promise.all([
            getUserBilling(db, user.id),
            activeProjectRows(db, user.id),
        ]);
        const entitlement = resolveBillingEntitlement(billingRow);
        const isOwner = isOwnerUser(user);
        const limits = PLAN_LIMITS[entitlement.plan] || PLAN_LIMITS.free;

        return res.json({
            ...entitlement,
            isOwner,
            limits,
            activeProjectCount: activeRows.length,
            stripeConfigured: isStripeConfigured(),
        });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

    const body = bodyOf(req);
    const stripe = getStripeClient();
    const origin = resolveSiteOrigin(req);

    if (body.action === 'checkout') {
        const result = await createCheckoutSession({
            db,
            stripe,
            user,
            plan: body.plan,
            origin,
            locale: body.locale,
        });
        return res.json(result);
    }

    if (body.action === 'portal') {
        const result = await createPortalSession({
            db,
            stripe,
            user,
            origin,
            locale: body.locale,
        });
        return res.json(result);
    }

    throw new HttpError(400, 'Operação inválida.');
});
