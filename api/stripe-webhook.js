import { database, endpoint, HttpError } from '../server/qorp.js';
import { getStripeClient, handleStripeWebhook, readRawBody } from '../server/stripe.js';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default endpoint(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const rawBody = await readRawBody(req);
    const db = database();
    const stripe = getStripeClient();
    const result = await handleStripeWebhook({
        db,
        stripe,
        rawBody,
        signature: req.headers?.['stripe-signature'],
    });
    return res.json(result);
});
