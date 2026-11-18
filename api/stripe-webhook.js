import { database, HttpError } from '../server/qorp.js';
import { getStripeClient, handleStripeWebhook } from '../server/stripe.js';

// Web-standard handler on purpose: Stripe signs the exact request bytes, and
// the Node helper `req.body` on Vercel hands back parsed JSON instead.
// `request.arrayBuffer()` gives the untouched raw body.
// https://vercel.com/docs/functions/functions-api-reference#read-the-raw-request-body
const MAX_BYTES = 1_000_000;

export async function POST(request) {
    const headers = { 'Cache-Control': 'no-store' };
    try {
        const rawBody = Buffer.from(await request.arrayBuffer());
        if (rawBody.length > MAX_BYTES) throw new HttpError(413, 'Payload acima do limite.');
        const result = await handleStripeWebhook({
            db: database(),
            stripe: getStripeClient(),
            rawBody,
            signature: request.headers.get('stripe-signature') ?? undefined,
        });
        return Response.json(result, { headers });
    } catch (error) {
        const status = error?.status || 500;
        if (status >= 500) console.error('[stripe-webhook]', error);
        return Response.json(
            { error: error?.status ? error.message : 'Não foi possível processar o evento.' },
            { status, headers },
        );
    }
}
