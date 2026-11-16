// In-memory stand-in for @upstash/redis. Mirrors the behaviour the API relies
// on: values are stored serialized and parsed back on read (Upstash does this
// automatically), `set` supports `nx`, and `eval` runs the CAS commit script.
export function createFakeRedis() {
    const store = new Map()
    const serialize = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
    const parse = (raw) => {
        if (raw === undefined) return null
        try { return JSON.parse(raw) } catch { return raw }
    }
    const redis = {
        store,
        failNextCas: 0,
        async get(k) { return parse(store.get(k)) },
        async set(k, v, opts = {}) {
            if (opts.nx && store.has(k)) return null
            store.set(k, serialize(v))
            return 'OK'
        },
        async mget(...keys) { return keys.map((k) => parse(store.get(k))) },
        pipeline() {
            const ops = []
            const p = {
                set(k, v) { ops.push(() => redis.set(k, v)); return p },
                async exec() { for (const op of ops) await op(); return ops.map(() => 'OK') },
            }
            return p
        },
        // Emulates CAS_COMMIT_LUA in api/layout.js.
        async eval(_script, keys, argv) {
            const cur = store.get(keys[0]) ?? ''
            if (redis.failNextCas > 0) {
                redis.failNextCas -= 1
                return [0, cur]
            }
            if (cur !== argv[0]) return [0, cur]
            store.set(keys[0], argv[1])
            if (argv[2] === '1') store.set(keys[1], argv[3])
            if (argv[4] === '1') store.set(keys[2], argv[5])
            if (argv[6] === '1') store.set(keys[3], argv[7])
            return [1, argv[1]]
        },
    }
    return redis
}
