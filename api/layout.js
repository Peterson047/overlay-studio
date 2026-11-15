import { Redis } from '@upstash/redis';
import {
    applyLayoutWrite,
    buildLayoutGetResponse,
    formatVer,
    keysFor,
    newTag,
    roomOf,
} from '../layout.store.js';

// One small KV store holds the overlay design, keyed per `room`. This replaces
// the old local Node server's layout-settings.json so OBS can load the design
// from an always-on URL with nothing running on your machine.
//
// Env vars (set in the Vercel dashboard — both Upstash-direct and Vercel-KV
// marketplace naming are accepted):
//   UPSTASH_REDIS_REST_URL / KV_REST_API_URL
//   UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN
// Create the client lazily so a missing env var doesn't spam warnings at import
// time and we can return one clear error instead. Reading env vars inside
// getRedis() also picks up runtime/test updates dynamically.
let _redisCache = null;
function getRedis() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
        throw new Error('KV not configured: set KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) for this environment.');
    }
    if (!_redisCache || _redisCache.url !== url || _redisCache.token !== token) {
        _redisCache = { url, token, client: new Redis({ url, token }) };
    }
    return _redisCache.client;
}

// Atomic Compare-And-Swap Lua commit so concurrent writes (e.g. a widget
// `livePatch` timer/wheel trigger racing a design edit) never clobber each other
// while keeping JSON serialization cleanly in JS (avoids Lua cjson `[]` -> `{}`).
const CAS_COMMIT_LUA = `
local cur = redis.call('GET', KEYS[1])
if not cur then cur = '' end
if cur ~= ARGV[1] then
  return {0, cur}
end
redis.call('SET', KEYS[1], ARGV[2])
if ARGV[3] == '1' then redis.call('SET', KEYS[2], ARGV[4]) end
if ARGV[5] == '1' then redis.call('SET', KEYS[3], ARGV[6]) end
if ARGV[7] == '1' then redis.call('SET', KEYS[4], ARGV[8]) end
return {1, ARGV[2]}
`;

// Older rooms stored `layouts` inside the main blob. Move it to its own key the
// first time we touch the room; returns the main blob without it.
async function splitLegacy(redis, keys, main, isShared) {
    if (!main || typeof main !== 'object' || !('layouts' in main)) return main;
    const { layouts, ...rest } = main;
    const existingLib = isShared ? 'skip' : await redis.get(keys.libKey);
    const p = redis.pipeline();
    if (!isShared && existingLib == null) {
        p.set(keys.libKey, layouts ?? []);
    }
    p.set(keys.key, rest);
    await p.exec();
    return rest;
}

async function commitWrite(redis, keys, expectedVer, plan) {
    if (typeof redis.eval === 'function') {
        const res = await redis.eval(
            CAS_COMMIT_LUA,
            [keys.verKey, keys.key, keys.libKey, keys.liveKey],
            [
                expectedVer ?? '',
                plan.nextVer,
                plan.writeMain ? '1' : '0',
                plan.writeMain ? JSON.stringify(plan.nextMain) : '',
                plan.writeLib ? '1' : '0',
                plan.writeLib ? JSON.stringify(plan.nextLib) : '',
                plan.writeLive ? '1' : '0',
                plan.writeLive ? JSON.stringify(plan.nextLive) : '',
            ],
        );
        return Array.isArray(res) && Number(res[0]) === 1;
    }

    const p = redis.pipeline();
    if (plan.writeMain) p.set(keys.key, plan.nextMain);
    if (plan.writeLib) p.set(keys.libKey, plan.nextLib);
    if (plan.writeLive) p.set(keys.liveKey, plan.nextLive);
    p.set(keys.verKey, plan.nextVer);
    await p.exec();
    return true;
}

export default async function handler(req, res) {
    // The overlay and editor are same-origin in production, but keep CORS open
    // so a separately-hosted frontend (or `vite` dev) can talk to this too.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const keys = keysFor(req.query.room);
    // Every anonymous visitor lands on `default`; its library had grown to
    // 200+ strangers' layouts (~1 MB per editor load), so it isn't stored there.
    const isShared = roomOf(req.query.room) === 'default';

    try {
        const redis = getRedis();

        if (req.method === 'GET') {
            // ?v=<version> — check only the tiny version key first so unchanged
            // polls answer with an empty 204 and timer/trigger updates read only live:<room>.
            let ver = await redis.get(keys.verKey);
            if (ver == null) {
                const candidate = formatVer(newTag('d'), newTag('l'));
                await redis.set(keys.verKey, candidate, { nx: true });
                ver = (await redis.get(keys.verKey)) ?? candidate;
            }
            ver = String(ver);

            const lite = req.query.lite !== undefined || isShared;
            const result = await buildLayoutGetResponse({
                reqVer: req.query.v,
                curVer: ver,
                lite,
                isShared,
                getMain: async () => splitLegacy(redis, keys, await redis.get(keys.key), isShared),
                getLive: () => redis.get(keys.liveKey),
                getLib: () => redis.get(keys.libKey),
            });

            if (result.status === 204) {
                res.status(204).end();
                return;
            }
            res.status(200).json(result.body);
            return;
        }

        if (req.method === 'POST') {
            const MAX_BYTES = 2_000_000;
            if (typeof req.body === 'string' && req.body.length > MAX_BYTES) {
                res.status(413).json({ error: 'Payload too large' });
                return;
            }
            let body;
            try {
                body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
            } catch {
                res.status(400).json({ error: 'Invalid JSON body' });
                return;
            }
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                res.status(400).json({ error: 'Request body must be a JSON object' });
                return;
            }
            if (typeof req.body !== 'string' && JSON.stringify(body).length > MAX_BYTES) {
                res.status(413).json({ error: 'Payload too large' });
                return;
            }

            const MAX_RETRIES = 6;
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                const [curVerRaw, existingMain, existingLib, existingLive] =
                    typeof redis.mget === 'function'
                        ? await redis.mget(keys.verKey, keys.key, keys.libKey, keys.liveKey)
                        : await Promise.all([
                              redis.get(keys.verKey),
                              redis.get(keys.key),
                              redis.get(keys.libKey),
                              redis.get(keys.liveKey),
                          ]);

                const expectedVer = curVerRaw == null ? '' : String(curVerRaw);
                const plan = applyLayoutWrite(
                    {
                        existingMain,
                        existingLib,
                        existingLive,
                        curVer: expectedVer,
                    },
                    body,
                    { isShared, nowMs: Date.now() },
                );

                const committed = await commitWrite(redis, keys, expectedVer, plan);
                if (committed) {
                    res.status(200).json({
                        ok: true,
                        _v: plan.nextVer,
                        serverNow: plan.nowMs,
                        ...(plan.writeLive ? { live: plan.nextLive } : {}),
                    });
                    return;
                }
            }

            res.status(409).json({ error: 'Concurrent layout write conflict; please retry.' });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[api/layout]', e);
        res.status(500).json({ error: 'Internal server error' });
    }
}
