import { Redis } from '@upstash/redis';

// Free per-room usage tracking in the same Upstash KV as layouts — Vercel's own
// custom-event analytics are Pro-only, so we count it ourselves.
//   POST { room, uid }  → bump today's load + unique-visitor counters for the room
//   GET  ?days=14[&room=x] → daily { loads, uniques } per room (+ "_all" site total)
// Unique visitors use Redis HyperLogLog (PFADD/PFCOUNT): ~exact, tiny, no PII.
const TTL = 100 * 24 * 60 * 60; // keep ~100 days of daily counters, then auto-expire
const MAX_POST_BYTES = 16_384;

let _redisCache = null;
function getRedis() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('KV not configured');
    if (!_redisCache || _redisCache.url !== url || _redisCache.token !== token) {
        _redisCache = { url, token, client: new Redis({ url, token }) };
    }
    return _redisCache.client;
}

const FORBIDDEN_ROOMS = new Set(['__proto__', 'constructor', 'prototype', '_all']);
const cleanRoom = (r) => {
    const cleaned = String(r || '').trim().slice(0, 64).replace(/[^\w.-]/g, '_');
    return !cleaned || FORBIDDEN_ROOMS.has(cleaned) ? 'default' : cleaned;
};
const dayUTC = (d = new Date()) => d.toISOString().slice(0, 10);
const lastNDays = (n) => {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        out.push(dayUTC(d));
    }
    return out;
};

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    try {
        const redis = getRedis();

        if (req.method === 'POST') {
            if (typeof req.body === 'string' && Buffer.byteLength(req.body, 'utf8') > MAX_POST_BYTES) {
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
                res.status(400).json({ error: 'Invalid request body' });
                return;
            }
            if (typeof req.body !== 'string' && Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_POST_BYTES) {
                res.status(413).json({ error: 'Payload too large' });
                return;
            }
            const room = cleanRoom(body.room);
            const day = dayUTC();
            const p = redis.pipeline();
            for (const scope of [room, '_all']) {
                const lk = `u:loads:${scope}:${day}`;
                p.incr(lk); p.expire(lk, TTL);
                if (body.uid) {
                    const uk = `u:uniq:${scope}:${day}`;
                    p.pfadd(uk, String(body.uid).slice(0, 64)); p.expire(uk, TTL);
                }
            }
            p.sadd('u:rooms', room);
            await p.exec();
            res.status(200).json({ ok: true });
            return;
        }

        if (req.method === 'GET') {
            // Public aggregate for the landing page — site totals only, never the
            // per-room breakdown or room ids, so no key is required.
            if (req.query.summary !== undefined) {
                const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
                const dates = lastNDays(days);
                const p = redis.pipeline();
                p.scard('u:rooms');
                for (const d of dates) { p.get(`u:loads:_all:${d}`); p.pfcount(`u:uniq:_all:${d}`); }
                const flat = await p.exec();
                const rooms = Number(flat[0]) || 0;
                let i = 1, totalLoads = 0; const byDay = {};
                for (const d of dates) {
                    const loads = Number(flat[i++]) || 0;
                    const uniques = Number(flat[i++]) || 0;
                    byDay[d] = { loads, uniques };
                    totalLoads += loads;
                }
                res.status(200).json({ rooms, days, totalLoads, today: byDay[dates[dates.length - 1]], byDay });
                return;
            }

            // Room ids are meant to be hard to guess, so never expose the full room list
            // or per-room stats unless USAGE_KEY is configured and matched via ?key=.
            if (!process.env.USAGE_KEY) {
                res.status(403).json({ error: 'Room stats endpoint requires USAGE_KEY configuration' });
                return;
            }
            if (req.query.key !== process.env.USAGE_KEY) {
                res.status(401).json({ error: 'unauthorized — pass ?key=' });
                return;
            }
            const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
            const dates = lastNDays(days);
            const roomSet = await redis.smembers('u:rooms');
            const only = req.query.room ? cleanRoom(req.query.room) : null;
            const targets = ['_all', ...(only ? [only] : roomSet.filter(r => r && r !== '_all' && !FORBIDDEN_ROOMS.has(r)))];

            const p = redis.pipeline();
            for (const room of targets) for (const d of dates) {
                p.get(`u:loads:${room}:${d}`);
                p.pfcount(`u:uniq:${room}:${d}`);
            }
            const flat = await p.exec();

            const rooms = {};
            let idx = 0;
            for (const room of targets) {
                const byDay = {};
                let loadsTotal = 0;
                for (const d of dates) {
                    const loads = Number(flat[idx++]) || 0;
                    const uniques = Number(flat[idx++]) || 0;
                    byDay[d] = { loads, uniques };
                    loadsTotal += loads;
                }
                rooms[room] = { total: loadsTotal, byDay };
            }
            res.status(200).json({ days: dates, rooms });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[api/usage]', e);
        res.status(500).json({ error: 'Internal server error' });
    }
}
