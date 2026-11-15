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
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Create the client lazily so a missing env var doesn't spam warnings at import
// time and we can return one clear error instead.
let _redis;
function getRedis() {
    if (!REDIS_URL || !REDIS_TOKEN) {
        throw new Error('KV not configured: set KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) for this environment.');
    }
    if (!_redis) _redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
    return _redis;
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
async function splitLegacy(redis, keys, main) {
    if (!main || !('layouts' in main)) return main;
    const { layouts, ...rest } = main;
    const p = redis.pipeline();
    p.set(keys.libKey, layouts ?? []);
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
        const ok = Array.isArray(res) ? Number(res[0]) === 1 : true;
        return ok;
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
                ver = formatVer(newTag('d'), newTag('l'));
                await redis.set(keys.verKey, ver);
            }
            ver = String(ver);

            const lite = req.query.lite !== undefined || isShared;
            const result = await buildLayoutGetResponse({
                reqVer: req.query.v,
                curVer: ver,
                lite,
                isShared,
                getMain: async () => splitLegacy(redis, keys, await redis.get(keys.key)),
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
            const body =
                typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

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
        res.status(500).json({ error: e.message });
    }
}
