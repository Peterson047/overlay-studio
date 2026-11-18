import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { PORTS } from './ports.config.js'
import { SAMPLE_MATCHES, fetchMatches } from './scores.data.js'
import {
  applyLayoutWrite,
  buildLayoutGetResponse,
  formatVer,
  newTag,
  roomOf,
} from './layout.store.js'

// Dev-only stand-in for the Vercel serverless function `api/layout.js`. Vite's
// dev server doesn't run `/api` functions, so without this every save 404s and
// state is lost on reload. This middleware mirrors the function's behaviour
// (`?v=` 204s, `<design>.<live>` versions, `_liveOnly`, `elementPatch`,
// `livePatch`, serialized writes) using a local JSON file (per `room`).
function localLayoutApi() {
  const file = path.resolve('.dev-layouts.json')
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} } }
  const write = (data) => {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)) } catch (err) { console.error('[localLayoutApi]', err) }
  }
  let writeChain = Promise.resolve()
  const MAX_BYTES = 2_000_000

  return {
    name: 'local-layout-api',
    configureServer(server) {
      server.middlewares.use('/api/layout', async (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }

        const parsedUrl = new URL(req.originalUrl || req.url || '/', 'http://localhost')
        const room = roomOf(parsedUrl.searchParams.get('room'))
        const isShared = room === 'default'

        if (req.method === 'GET') {
          writeChain = writeChain.then(async () => {
            const store = read()
            store.__ver ??= {}
            store.__live ??= {}
            store.__lib ??= {}

            let ver = store.__ver[room]
            if (!ver) {
              ver = formatVer(newTag('d'), newTag('l'))
              store.__ver[room] = ver
              write(store)
            }

            const lite = parsedUrl.searchParams.has('lite') || isShared
            const reqVer = parsedUrl.searchParams.get('v')

            const result = await buildLayoutGetResponse({
              reqVer,
              curVer: String(ver),
              lite,
              isShared,
              getMain: async () => {
                const raw = store[room]
                if (raw && typeof raw === 'object' && 'layouts' in raw) {
                  const { layouts, ...rest } = raw
                  if (!isShared && store.__lib[room] === undefined) store.__lib[room] = layouts ?? []
                  store[room] = rest
                  write(store)
                  return rest
                }
                return raw || {}
              },
              getLive: async () => store.__live[room] || {},
              getLib: async () => store.__lib[room] ?? store[room]?.layouts,
            })

            if (result.status === 204) {
              res.statusCode = 204
              return res.end()
            }
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify(result.body))
          }).catch((err) => {
            console.error('[localLayoutApi GET]', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal server error' }))
          })
          return
        }

        if (req.method === 'POST') {
          let body = ''
          let tooLarge = false
          req.on('data', c => {
            if (tooLarge) return
            body += c
            if (body.length > MAX_BYTES) tooLarge = true
          })
          req.on('end', () => {
            if (tooLarge) {
              res.statusCode = 413
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'Payload too large' }))
            }
            let data = {}
            try { data = JSON.parse(body || '{}') } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            }
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'Request body must be a JSON object' }))
            }
            writeChain = writeChain.then(() => {
              const store = read()
              store.__ver ??= {}
              store.__live ??= {}
              store.__lib ??= {}

              const plan = applyLayoutWrite(
                {
                  existingMain: store[room] || {},
                  existingLib: store.__lib[room],
                  existingLive: store.__live[room],
                  curVer: store.__ver[room] || '',
                },
                data,
                { isShared, nowMs: Date.now() },
              )

              if (plan.writeMain) store[room] = plan.nextMain
              if (plan.writeLib) store.__lib[room] = plan.nextLib
              if (plan.writeLive) store.__live[room] = plan.nextLive
              store.__ver[room] = plan.nextVer
              write(store)

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                ok: true,
                _v: plan.nextVer,
                serverNow: plan.nowMs,
                ...(plan.writeLive ? { live: plan.nextLive } : {}),
              }))
            }).catch((err) => {
              console.error('[localLayoutApi POST]', err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Internal server error' }))
            })
          })
          return
        }

        next()
      })
    },
  }
}

// Dev-only stand-in for api/scores.js — same reason as localLayoutApi: Vite's
// dev server doesn't run `/api` functions. Fetches live matches when a token is
// set (FOOTBALL_DATA_TOKEN in .env.local), else serves the sample fixtures so
// the match picker works fully offline.
function localScoresApi(token, competition) {
  let cache = null // { at, payload } — shared 10s snapshot, mirrors api/scores.js KV cache
  const TTL = 10_000
  const SAMPLE_UPDATED_AT = 1
  return {
    name: 'local-scores-api',
    configureServer(server) {
      server.middlewares.use('/api/scores', async (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
        if (req.method !== 'GET') return next()
        const parsedUrl = new URL(req.originalUrl || req.url || '/', 'http://localhost')
        const clientVer = parsedUrl.searchParams.get('v') || ''
        if (!token) {
          if (clientVer === String(SAMPLE_UPDATED_AT)) { res.statusCode = 204; return res.end() }
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ configured: false, updatedAt: SAMPLE_UPDATED_AT, matches: SAMPLE_MATCHES }))
        }
        const now = Date.now()
        if (cache && now - cache.at < TTL) {
          if (clientVer && String(cache.payload.updatedAt) === clientVer) { res.statusCode = 204; return res.end() }
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(cache.payload))
        }
        res.setHeader('Content-Type', 'application/json')
        try {
          const matches = await fetchMatches(token, competition)
          const payload = { configured: true, updatedAt: now, matches }
          cache = { at: now, payload }
          res.end(JSON.stringify(payload))
        } catch (e) {
          console.error('[localScoresApi]', e)
          if (cache) return res.end(JSON.stringify(cache.payload)) // serve stale on error
          res.end(JSON.stringify({ configured: true, error: 'Failed to load match feed', updatedAt: now, matches: [] }))
        }
      })
    },
  }
}

// Dev-only stand-in for api/usage.js — same reason as the others. File-backed
// (.dev-usage.json) so `npm run dev` counts work offline without touching the
// production KV; uniques use a plain id set here instead of HyperLogLog.
function localUsageApi() {
  const file = path.resolve('.dev-usage.json')
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { loads: {}, uniq: {}, rooms: [] } } }
  const write = (d) => {
    try { fs.writeFileSync(file, JSON.stringify(d, null, 2)) } catch (err) { console.error('[localUsageApi]', err) }
  }
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', '_all'])
  const clean = (r) => {
    const c = String(r || '').trim().slice(0, 64).replace(/[^\w.-]/g, '_')
    return !c || FORBIDDEN.has(c) ? 'default' : c
  }
  const day = () => new Date().toISOString().slice(0, 10)
  let usageChain = Promise.resolve()
  const MAX_BYTES = 100_000
  return {
    name: 'local-usage-api',
    configureServer(server) {
      server.middlewares.use('/api/usage', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'POST') {
          let body = ''
          let tooLarge = false
          req.on('data', c => {
            if (tooLarge) return
            body += c
            if (body.length > MAX_BYTES) tooLarge = true
          })
          req.on('end', () => {
            if (tooLarge) { res.statusCode = 413; return res.end(JSON.stringify({ error: 'Payload too large' })) }
            let d = {}
            try { d = JSON.parse(body || '{}') } catch {
              res.statusCode = 400
              return res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            }
            if (!d || typeof d !== 'object' || Array.isArray(d)) {
              res.statusCode = 400
              return res.end(JSON.stringify({ error: 'Invalid request body' }))
            }
            usageChain = usageChain.then(() => {
              const store = read()
              store.loads ??= {}; store.uniq ??= {}; store.rooms ??= []
              const room = clean(d.room), today = day()
              for (const scope of [room, '_all']) {
                const lk = `${scope}:${today}`
                store.loads[lk] = (store.loads[lk] || 0) + 1
                if (d.uid) { store.uniq[lk] ??= []; if (!store.uniq[lk].includes(d.uid)) store.uniq[lk].push(d.uid) }
              }
              if (!store.rooms.includes(room)) store.rooms.push(room)
              write(store)
              res.end(JSON.stringify({ ok: true }))
            }).catch(() => {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Internal server error' }))
            })
          })
          return
        }

        if (req.method === 'GET') {
          const url = new URL(req.originalUrl || req.url || '/', 'http://localhost')
          const store = read()
          store.loads ??= {}; store.uniq ??= {}; store.rooms ??= []
          const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 14))
          const dates = []
          for (let i = days - 1; i >= 0; i--) { const dt = new Date(); dt.setUTCDate(dt.getUTCDate() - i); dates.push(dt.toISOString().slice(0, 10)) }
          if (url.searchParams.has('summary')) {
            let totalLoads = 0; const byDay = {}
            for (const d of dates) {
              const loads = store.loads[`_all:${d}`] || 0
              byDay[d] = { loads, uniques: (store.uniq[`_all:${d}`] || []).length }
              totalLoads += loads
            }
            res.end(JSON.stringify({ rooms: store.rooms.length, days, totalLoads, today: byDay[dates[dates.length - 1]], byDay }))
            return
          }
          const targets = ['_all', ...store.rooms.filter(r => r && !FORBIDDEN.has(r))]
          const rooms = {}
          for (const room of targets) {
            const byDay = {}; let total = 0
            for (const d of dates) {
              const lk = `${room}:${d}`
              const loads = store.loads[lk] || 0
              byDay[d] = { loads, uniques: (store.uniq[lk] || []).length }
              total += loads
            }
            rooms[room] = { total, byDay }
          }
          res.end(JSON.stringify({ days: dates, rooms }))
          return
        }
        next()
      })
    },
  }
}

// Dev-only adapter that runs the Vercel functions backed by Supabase
// (api/projects.js, api/project-layout.js) inside Vite, with a minimal
// req/res shim matching what Vercel passes. Server-only secrets come from
// .env.local via loadEnv and never reach the browser bundle.
function localServerlessApi(env, routes) {
  for (const [k, v] of Object.entries(env)) {
    if (/^(SUPABASE_|VITE_SUPABASE_|STRIPE_|QORP_|SITE_URL$)/.test(k) && process.env[k] === undefined) process.env[k] = v
  }
  return {
    name: 'local-serverless-api',
    configureServer(server) {
      for (const route of routes) {
        server.middlewares.use(`/api/${route}`, async (req, res) => {
          const url = new URL(req.originalUrl || req.url || '/', 'http://localhost')
          const chunks = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const rawBuf = Buffer.concat(chunks)
          const vreq = {
            method: req.method,
            headers: req.headers,
            query: Object.fromEntries(url.searchParams),
            body: rawBuf.length ? rawBuf.toString('utf8') : undefined,
          }
          const vres = {
            status(code) { res.statusCode = code; return this },
            setHeader(k, v) { res.setHeader(k, v); return this },
            json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return this },
            end(data) { res.end(data); return this },
          }
          try {
            const mod = await server.ssrLoadModule(`/api/${route}.js`)
            // Web-standard handlers (export function POST/GET) get a real Request,
            // like on Vercel; classic (req, res) handlers get the shim above.
            const webHandler = mod[req.method]
            if (typeof webHandler === 'function' && typeof mod.default !== 'function') {
              const response = await webHandler(new Request(url, {
                method: req.method, headers: req.headers,
                body: rawBuf.length && !['GET', 'HEAD'].includes(req.method) ? rawBuf : undefined,
              }))
              res.statusCode = response.status
              response.headers.forEach((v, k) => res.setHeader(k, v))
              res.end(Buffer.from(await response.arrayBuffer()))
              return
            }
            if (typeof mod.default !== 'function') { res.statusCode = 405; res.end(); return }
            await mod.default(vreq, vres)
          } catch (err) {
            console.error(`[local ${route}]`, err)
            if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Internal server error' })) }
          }
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      localLayoutApi(),
      localScoresApi(env.FOOTBALL_DATA_TOKEN, env.FOOTBALL_DATA_COMPETITION || 'WC'),
      localUsageApi(),
      localServerlessApi(env, ['projects', 'project-layout', 'billing', 'stripe-webhook']),
    ],
    // Keep the browser target used by the previous build for OBS browser sources.
    build: {
      target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
    },
    server: {
      port: PORTS.FRONTEND,
      strictPort: true, // Fail if port is already in use instead of silently picking another
      watch: {
        ignored: ['**/backend/layout-settings.json', '**/.dev-layouts.json', '**/.dev-usage.json'],
      },
    },
  }
})
