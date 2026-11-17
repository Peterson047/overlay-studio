import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
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
    if (message.includes('PROJECT_LIMIT')) throw new HttpError(403, 'Você atingiu o limite de projetos ativos do seu plano.');
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

export function endpoint(handler) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try { await handler(req, res); }
        catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível concluir a operação.' }); }
    };
}
