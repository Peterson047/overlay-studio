import { bodyOf, check, database, endpoint, HttpError, identity, metadata, mintToken, hashToken, ownedProject } from '../server/qorp.js';
import { sanitizeExport, validateLayout } from '../server/project-layout.js';

export default endpoint(async (req, res) => {
    const db = database();
    const user = await identity(req, db);
    if (req.method === 'GET') {
        if (req.query.id) {
            const project = await ownedProject(db, user.id, req.query.id, true);
            const revisions = check(await db.from('qorp_revisions').select('revision,created_at').eq('project_id', project.id).order('revision', { ascending: false }).limit(50));
            return res.json({ ...metadata(project), revisions, scenes: (project.published?.layouts || []).flatMap(layout => layout.scenes || []).map(scene => ({ id: scene.id, name: scene.name })) });
        }
        const rows = check(await db.from('qorp_projects').select('id,name,revision,published_revision,playback_hash,updated_at,deleted_at').eq('owner_id', user.id).order('updated_at', { ascending: false }));
        return res.json({ projects: rows.map(row => ({ ...metadata(row), published: row.published_revision !== null })) });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const body = bodyOf(req);
    if (body.action === 'create') {
        const name = String(body.name || 'Meu canal').trim().slice(0, 100);
        if (!name) throw new HttpError(400, 'Informe o nome do projeto.');
        const draft = validateLayout(body.draft || {});
        const created = check(await db.rpc('qorp_create_project', { p_owner: user.id, p_name: name, p_draft: draft }));
        return res.status(201).json(metadata(created));
    }
    const project = await ownedProject(db, user.id, body.id, body.action === 'restore');
    if (body.action === 'export') return res.json({ name: project.name, schemaVersion: 1, draft: sanitizeExport(project.draft) });
    if (body.action === 'publish' || body.action === 'rollback') {
        if (body.revision !== project.revision) throw new HttpError(409, 'O projeto mudou. Confira a versão atual antes de publicar.');
        const token = project.playback_hash ? null : mintToken();
        const updated = check(await db.rpc('qorp_publish_project', { p_owner: user.id, p_project: project.id,
            p_expected: project.revision, p_hash: token ? hashToken(token) : null,
            p_restore: body.action === 'rollback' ? body.restoreRevision : null }));
        return res.json({ ...metadata(updated), token });
    }
    let patch;
    let token;
    if (body.action === 'rename') {
        const name = String(body.name || '').trim().slice(0, 100);
        if (!name) throw new HttpError(400, 'Informe o nome do projeto.');
        patch = { name };
    } else if (body.action === 'trash') patch = { deleted_at: new Date().toISOString(), playback_hash: null };
    else if (body.action === 'restore') {
        if (!project.deleted_at || Date.now() - Date.parse(project.deleted_at) > 30 * 86400000) throw new HttpError(400, 'O prazo de restauração terminou.');
        patch = { deleted_at: null };
    } else if (body.action === 'revoke') patch = { playback_hash: null };
    else if (body.action === 'rotate') { token = mintToken(); patch = { playback_hash: hashToken(token) }; }
    else if (body.action === 'scene') {
        const scene = (project.published?.layouts || []).flatMap(layout => layout.scenes || []).find(scene => scene.id === body.sceneId);
        if (!scene) throw new HttpError(404, 'Cena publicada não encontrada.');
        // Live state only: the published revision stays immutable.
        const live = project.live || {};
        patch = { live: { ...live, scene: { activeSceneId: scene.id, seq: (live.scene?.seq || 0) + 1, at: Date.now() } } };
    } else throw new HttpError(400, 'Operação inválida.');
    const rows = check(await db.from('qorp_projects').update({ ...patch, updated_at: new Date().toISOString(), runtime_version: project.runtime_version + 1 })
        .eq('id', project.id).eq('owner_id', user.id).eq('runtime_version', project.runtime_version).select('*'));
    if (!rows.length) throw new HttpError(409, 'O projeto mudou. Atualize e tente novamente.');
    return res.json({ ...metadata(rows[0]), token });
});
