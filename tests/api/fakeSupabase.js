import { randomUUID } from 'node:crypto';

function clone(val) {
    return val === undefined ? undefined : structuredClone(val);
}

function projectColumns(row, cols) {
    if (!row) return null;
    if (!cols || cols === '*') return clone(row);
    const list = String(cols).split(',').map(s => s.trim()).filter(Boolean);
    const out = {};
    for (const key of list) {
        if (key in row) out[key] = clone(row[key]);
    }
    return out;
}

export function createFakeSupabase({
    users = {},
    projects = [],
    revisions = [],
    billing = [],
    stripeEvents = [],
} = {}) {
    const tables = {
        projects: projects.map(clone),
        revisions: revisions.map(clone),
        billing: billing.map(clone),
        stripeEvents: stripeEvents.map(clone),
    };

    const tableStore = (name) => {
        if (name === 'qorp_projects') return tables.projects;
        if (name === 'qorp_revisions') return tables.revisions;
        if (name === 'qorp_billing') return tables.billing;
        if (name === 'qorp_stripe_events') return tables.stripeEvents;
        throw new Error(`Unknown fake table: ${name}`);
    };

    const from = (tableName) => {
        const state = {
            op: 'select',
            cols: '*',
            payload: null,
            upsertOpts: null,
            filters: [],
            orderBy: null,
            limitCount: null,
            mode: 'many',
        };

        const matches = (row) => state.filters.every((f) => {
            if (f.type === 'eq') return row[f.col] === f.val;
            if (f.type === 'is') return f.val === null ? (row[f.col] === null || row[f.col] === undefined) : row[f.col] === f.val;
            if (f.type === 'in') return f.val.includes(row[f.col]);
            return true;
        });

        const execute = () => {
            const store = tableStore(tableName);

            if (state.op === 'insert') {
                const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
                const inserted = [];
                for (const rawRow of rows) {
                    const row = clone(rawRow);
                    if (tableName === 'qorp_stripe_events') {
                        if (store.some(r => r.id === row.id)) {
                            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
                        }
                        if (!row.processed_at) row.processed_at = new Date().toISOString();
                    }
                    if (tableName === 'qorp_billing') {
                        if (store.some(r => r.owner_id === row.owner_id)) {
                            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
                        }
                        if (row.customer_id && store.some(r => r.customer_id === row.customer_id)) {
                            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
                        }
                    }
                    store.push(row);
                    inserted.push(projectColumns(row, state.cols));
                }
                if (state.mode === 'single') return { data: inserted[0] ?? null, error: null };
                if (state.mode === 'maybeSingle') return { data: inserted[0] ?? null, error: null };
                return { data: inserted, error: null };
            }

            if (state.op === 'upsert') {
                const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
                const conflictKey = state.upsertOpts?.onConflict || (tableName === 'qorp_billing' ? 'owner_id' : 'id');
                const upserted = [];
                for (const rawRow of rows) {
                    const row = clone(rawRow);
                    const idx = store.findIndex(r => r[conflictKey] === row[conflictKey]);
                    if (idx >= 0) {
                        store[idx] = { ...store[idx], ...row };
                        upserted.push(projectColumns(store[idx], state.cols));
                    } else {
                        store.push(row);
                        upserted.push(projectColumns(row, state.cols));
                    }
                }
                if (state.mode === 'single' || state.mode === 'maybeSingle') {
                    return { data: upserted[0] ?? null, error: null };
                }
                return { data: upserted, error: null };
            }

            if (state.op === 'update') {
                const updated = [];
                for (let i = 0; i < store.length; i += 1) {
                    if (matches(store[i])) {
                        store[i] = { ...store[i], ...clone(state.payload) };
                        updated.push(projectColumns(store[i], state.cols));
                    }
                }
                if (state.mode === 'single') {
                    if (!updated.length) return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
                    return { data: updated[0], error: null };
                }
                if (state.mode === 'maybeSingle') return { data: updated[0] ?? null, error: null };
                return { data: updated, error: null };
            }

            if (state.op === 'delete') {
                const remaining = [];
                const deleted = [];
                for (const row of store) {
                    if (matches(row)) deleted.push(projectColumns(row, state.cols));
                    else remaining.push(row);
                }
                store.length = 0;
                store.push(...remaining);
                return { data: deleted, error: null };
            }

            let results = store.filter(matches);
            if (state.orderBy) {
                const { col, ascending } = state.orderBy;
                results = [...results].sort((a, b) => {
                    const va = a[col];
                    const vb = b[col];
                    if (va === vb) return 0;
                    if (va == null) return 1;
                    if (vb == null) return -1;
                    if (va < vb) return ascending ? -1 : 1;
                    return ascending ? 1 : -1;
                });
            }
            if (typeof state.limitCount === 'number') {
                results = results.slice(0, state.limitCount);
            }
            const mapped = results.map(r => projectColumns(r, state.cols));
            if (state.mode === 'single') {
                if (!mapped.length) return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
                return { data: mapped[0], error: null };
            }
            if (state.mode === 'maybeSingle') return { data: mapped[0] ?? null, error: null };
            return { data: mapped, error: null };
        };

        const builder = {
            select(cols = '*') {
                state.cols = cols;
                return builder;
            },
            insert(payload) {
                state.op = 'insert';
                state.payload = payload;
                return builder;
            },
            upsert(payload, opts = {}) {
                state.op = 'upsert';
                state.payload = payload;
                state.upsertOpts = opts;
                return builder;
            },
            update(payload) {
                state.op = 'update';
                state.payload = payload;
                return builder;
            },
            delete() {
                state.op = 'delete';
                return builder;
            },
            eq(col, val) {
                state.filters.push({ type: 'eq', col, val });
                return builder;
            },
            is(col, val) {
                state.filters.push({ type: 'is', col, val });
                return builder;
            },
            in(col, val) {
                state.filters.push({ type: 'in', col, val });
                return builder;
            },
            order(col, { ascending = true } = {}) {
                state.orderBy = { col, ascending };
                return builder;
            },
            limit(n) {
                state.limitCount = n;
                return builder;
            },
            single() {
                state.mode = 'single';
                return builder;
            },
            maybeSingle() {
                state.mode = 'maybeSingle';
                return builder;
            },
            then(resolve, reject) {
                return Promise.resolve().then(() => execute()).then(resolve, reject);
            },
        };

        return builder;
    };

    const rpc = async (fn, params = {}) => {
        if (fn === 'qorp_create_project') {
            const now = Date.now();
            const bill = tables.billing.find(b => b.owner_id === params.p_owner);
            let limit = 2;
            if (bill) {
                const paidMs = bill.paid_until ? Date.parse(bill.paid_until) : NaN;
                const graceMs = bill.grace_until
                    ? Date.parse(bill.grace_until)
                    : (Number.isFinite(paidMs) ? paidMs + 7 * 86_400_000 : (bill.updated_at ? Date.parse(bill.updated_at) + 7 * 86_400_000 : NaN));
                if (
                    ((bill.status === 'active' || bill.status === 'trialing') && Number.isFinite(paidMs) && paidMs > now)
                    || (bill.status === 'past_due' && Number.isFinite(graceMs) && graceMs > now)
                ) {
                    limit = 15;
                }
            }
            const activeCount = tables.projects.filter(p => p.owner_id === params.p_owner && !p.deleted_at).length;
            if (activeCount >= limit) {
                return { data: null, error: { message: 'PROJECT_LIMIT' } };
            }
            const ts = new Date().toISOString();
            const row = {
                id: randomUUID(),
                owner_id: params.p_owner,
                name: params.p_name,
                draft: clone(params.p_draft || {}),
                revision: 0,
                published: null,
                published_revision: null,
                playback_hash: null,
                live: {},
                runtime_version: 0,
                created_at: ts,
                updated_at: ts,
                deleted_at: null,
            };
            tables.projects.push(row);
            return { data: clone(row), error: null };
        }

        if (fn === 'qorp_publish_project') {
            const project = tables.projects.find(
                p => p.id === params.p_project && p.owner_id === params.p_owner && !p.deleted_at
            );
            if (!project) return { data: null, error: { message: 'NOT_FOUND' } };
            if (project.revision !== params.p_expected) return { data: null, error: { message: 'CONFLICT' } };

            let payload;
            let publishedRev;
            if (params.p_restore == null) {
                payload = clone(project.draft);
                publishedRev = project.revision;
                const exists = tables.revisions.some(
                    r => r.project_id === project.id && r.revision === publishedRev
                );
                if (!exists) {
                    tables.revisions.push({
                        project_id: project.id,
                        revision: publishedRev,
                        snapshot: clone(payload),
                        created_at: new Date().toISOString(),
                    });
                }
            } else {
                const rev = tables.revisions.find(
                    r => r.project_id === project.id && r.revision === params.p_restore
                );
                if (!rev) return { data: null, error: { message: 'NOT_FOUND' } };
                payload = clone(rev.snapshot);
                publishedRev = params.p_restore;
            }

            project.published = payload;
            project.published_revision = publishedRev;
            if (!project.playback_hash && params.p_hash) {
                project.playback_hash = params.p_hash;
            }
            project.runtime_version += 1;
            project.updated_at = new Date().toISOString();
            return { data: clone(project), error: null };
        }

        return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    };

    return {
        tables,
        auth: {
            async getUser(token) {
                const user = users[token] || null;
                if (!user) return { data: { user: null }, error: { message: 'Invalid token' } };
                return { data: { user: clone(user) }, error: null };
            },
        },
        from,
        rpc,
    };
}

export function callHandler(handler, { method = 'GET', query = {}, body, headers = {} } = {}) {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
    }
    return new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            headers: {},
            setHeader(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { resolve({ status: this.statusCode, body: data, headers: this.headers }); },
            end(data) { resolve({ status: this.statusCode, body: data, headers: this.headers }); },
        };
        Promise.resolve(handler({ method, query, body, headers: normalizedHeaders }, res)).catch(reject);
    });
}
