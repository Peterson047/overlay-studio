import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { PLAN_LIMITS, resolveBillingEntitlement } from '../src/theme/entitlements.js';

export class HttpError extends Error {
    constructor(status, message, code = null) {
        super(message);
        this.status = status;
        if (code) this.code = code;
    }
}

export function database() {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpError(503, 'Configure o Supabase no ambiente do servidor.');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function identity(req, db) {
    const token = String(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new HttpError(401, 'Entre na sua conta para continuar.');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    return data.user;
}

export function bodyOf(req) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw) > 2_000_000) throw new HttpError(413, 'Projeto acima de 2 MB. Reduza as imagens incorporadas.');
    let data;
    try { data = JSON.parse(raw); } catch { throw new HttpError(400, 'Dados inválidos.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Dados inválidos.');
    return data;
}

export function projectId(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) throw new HttpError(400, 'Projeto inválido.');
    return value;
}

export function check(result) {
    if (!result.error) return result.data;
    const message = result.error.message || '';
    if (message.includes('PROJECT_LIMIT')) throw new HttpError(403, 'Você atingiu o limite de projetos ativos do seu plano.', 'PROJECT_LIMIT');
    if (message.includes('NOT_FOUND')) throw new HttpError(404, 'Projeto ou revisão não encontrado.');
    if (message.includes('CONFLICT')) throw new HttpError(409, 'O projeto mudou em outra aba. Recarregue antes de publicar.');
    throw new HttpError(503, 'Não foi possível acessar os dados. Confira a configuração e a migração do banco.');
}

export async function ownedProject(db, owner, id, includeDeleted = false) {
    let query = db.from('qorp_projects').select('*').eq('id', projectId(id)).eq('owner_id', owner);
    if (!includeDeleted) query = query.is('deleted_at', null);
    const result = check(await query.maybeSingle());
    if (!result) throw new HttpError(404, 'Projeto não encontrado.');
    return result;
}

export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const mintToken = () => randomBytes(32).toString('base64url');
export const draftVersion = row => `d${row.revision}.0`;
export const metadata = row => ({ id: row.id, name: row.name, revision: row.revision,
    publishedRevision: row.published_revision, published: !!row.published,
    hasPlaybackToken: !!row.playback_hash, updatedAt: row.updated_at, deletedAt: row.deleted_at });

function parseEnvList(value, { lower = false } = {}) {
    return new Set(
        String(value || '')
            .split(',')
            .map(entry => (lower ? entry.trim().toLowerCase() : entry.trim()))
            .filter(Boolean)
    );
}

export function isOwnerUser(user) {
    if (!user || typeof user !== 'object') return false;
    const ownerIds = parseEnvList(process.env.QORP_OWNER_USER_IDS, { lower: true });
    const userId = String(user.id || '').trim().toLowerCase();
    if (userId && ownerIds.has(userId)) return true;

    if (
        user.email_confirmed_at !== undefined &&
        (!user.email_confirmed_at || (typeof user.email_confirmed_at === 'string' && !user.email_confirmed_at.trim()))
    ) {
        return false;
    }
    const ownerEmails = parseEnvList(process.env.QORP_OWNER_EMAILS, { lower: true });
    const email = String(user.email || '').trim().toLowerCase();
    return Boolean(email && ownerEmails.has(email));
}

export async function getUserBilling(db, userId) {
    return check(
        await db.from('qorp_billing').select('*').eq('owner_id', userId).maybeSingle()
    ) || null;
}

export async function getUserEntitlements(db, user, { now = Date.now() } = {}) {
    const billingRow = await getUserBilling(db, user.id);
    const billing = resolveBillingEntitlement(billingRow, now);
    const isOwner = isOwnerUser(user);
    const limits = PLAN_LIMITS[billing.plan] || PLAN_LIMITS.free;
    return {
        ...billing,
        isOwner,
        limits,
    };
}

export async function activeProjectRows(db, userId) {
    return check(
        await db.from('qorp_projects')
            .select('id,updated_at')
            .eq('owner_id', userId)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
    ) || [];
}

export function writableProjectIds(activeRows, maxProjects) {
    if (!Number.isFinite(maxProjects) || maxProjects < 0) {
        return new Set((activeRows || []).map(row => row.id));
    }
    return new Set((activeRows || []).slice(0, maxProjects).map(row => row.id));
}

export async function assertProjectWritable(db, userId, project, entitlements) {
    if (!project || project.deleted_at) return;
    const activeRows = await activeProjectRows(db, userId);
    const writable = writableProjectIds(activeRows, entitlements.limits.maxProjects);
    if (!writable.has(project.id)) {
        throw new HttpError(
            403,
            'Este projeto está somente leitura porque excede o limite de projetos ativos do plano Gratuito.',
            'PROJECT_READ_ONLY'
        );
    }
}

export function endpoint(handler) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try { await handler(req, res); }
        catch (error) {
            const payload = { error: error.status ? error.message : 'Não foi possível concluir a operação.' };
            if (error.status && error.code) payload.code = error.code;
            res.status(error.status || 500).json(payload);
        }
    };
}
