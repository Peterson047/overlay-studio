import {
    activeProjectRows,
    assertProjectWritable,
    bodyOf,
    check,
    database,
    endpoint,
    getUserEntitlements,
    hashToken,
    HttpError,
    identity,
    metadata,
    mintToken,
    ownedProject,
    writableProjectIds,
} from '../server/qorp.js';
import { assertDraftAllowed, sanitizeExport, validateLayout } from '../server/project-layout.js';

function extractPublishedScenes(published) {
    return (published?.layouts || []).flatMap(layout =>
        (layout.scenes || []).map(scene => ({
            id: scene.id,
            name: scene.name,
            layoutName: layout.name || '',
        }))
    );
}

function resolveActivePublishedSceneId(published, live) {
    const scenes = extractPublishedScenes(published);
    const liveSceneId = live?.scene?.activeSceneId;
    if (liveSceneId && scenes.some(s => s.id === liveSceneId)) return liveSceneId;
    const activeLayout = (published?.layouts || []).find(l => l.id === published?.activeLayoutId) || published?.layouts?.[0];
    const fallbackId = published?.live?.scene?.activeSceneId || activeLayout?.activeSceneId || scenes[0]?.id || null;
    return scenes.some(s => s.id === fallbackId) ? fallbackId : (scenes[0]?.id || null);
}

export default endpoint(async (req, res) => {
    const db = database();
    const user = await identity(req, db);
    const entitlements = await getUserEntitlements(db, user);

    if (req.method === 'GET') {
        if (req.query.id) {
            const project = await ownedProject(db, user.id, req.query.id, true);
            const maxRevisions = entitlements.limits.maxRevisions;
            const revisions = (check(
                await db.from('qorp_revisions')
                    .select('revision,created_at')
                    .eq('project_id', project.id)
                    .order('revision', { ascending: false })
                    .limit(maxRevisions)
            ) || []).slice(0, maxRevisions);
            const activeRows = await activeProjectRows(db, user.id);
            const writable = writableProjectIds(activeRows, entitlements.limits.maxProjects);
            const readOnly = !project.deleted_at && !writable.has(project.id);
            const scenes = extractPublishedScenes(project.published);
            const activeSceneId = resolveActivePublishedSceneId(project.published, project.live);
            return res.json({
                ...metadata(project),
                readOnly,
                entitlements: { ...entitlements, activeProjectCount: activeRows.length },
                revisions,
                scenes,
                activeSceneId,
            });
        }
        const rows = check(await db.from('qorp_projects')
            .select('id,name,revision,published_revision,playback_hash,updated_at,deleted_at')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false }));
        const activeRows = rows.filter(row => !row.deleted_at);
        const writable = writableProjectIds(activeRows, entitlements.limits.maxProjects);
        return res.json({
            projects: rows.map(row => ({
                ...metadata(row),
                published: row.published_revision !== null,
                readOnly: !row.deleted_at && !writable.has(row.id),
            })),
            entitlements: {
                ...entitlements,
                activeProjectCount: activeRows.length,
            },
        });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const body = bodyOf(req);

    if (body.action === 'create') {
        const name = String(body.name || 'Meu canal').trim().slice(0, 100);
        if (!name) throw new HttpError(400, 'Informe o nome do projeto.');
        const draft = validateLayout(body.draft || {});
        assertDraftAllowed(draft, entitlements);
        const activeRows = await activeProjectRows(db, user.id);
        if (activeRows.length >= entitlements.limits.maxProjects) {
            throw new HttpError(403, 'Você atingiu o limite de projetos ativos do seu plano.', 'PROJECT_LIMIT');
        }
        const created = check(await db.rpc('qorp_create_project', { p_owner: user.id, p_name: name, p_draft: draft }));
        return res.status(201).json(metadata(created));
    }

    const project = await ownedProject(db, user.id, body.id, body.action === 'restore');
    if (body.action === 'export') return res.json({ name: project.name, schemaVersion: 1, draft: sanitizeExport(project.draft) });

    if (body.action === 'duplicate') {
        const activeRows = await activeProjectRows(db, user.id);
        if (activeRows.length >= entitlements.limits.maxProjects) {
            throw new HttpError(403, 'Você atingiu o limite de projetos ativos do seu plano.', 'PROJECT_LIMIT');
        }
        const draft = validateLayout(sanitizeExport(project.draft || {}));
        assertDraftAllowed(draft, entitlements);
        const dupName = String(body.name || `${project.name} (cópia)`).trim().slice(0, 100) || 'Meu canal (cópia)';
        const created = check(await db.rpc('qorp_create_project', { p_owner: user.id, p_name: dupName, p_draft: draft }));
        return res.status(201).json(metadata(created));
    }

    if (body.action === 'publish' || body.action === 'rollback') {
        await assertProjectWritable(db, user.id, project, entitlements);
        if (body.revision !== project.revision) throw new HttpError(409, 'O projeto mudou. Confira a versão atual antes de publicar.');
        let restoreRevision = null;
        if (body.action === 'rollback') {
            restoreRevision = Number(body.restoreRevision);
            if (!Number.isInteger(restoreRevision) || restoreRevision < 0) {
                throw new HttpError(400, 'Revisão inválida para restauração.');
            }
            const maxRevisions = entitlements.limits.maxRevisions;
            const allowedRevs = (check(
                await db.from('qorp_revisions')
                    .select('revision,snapshot')
                    .eq('project_id', project.id)
                    .order('revision', { ascending: false })
                    .limit(maxRevisions)
            ) || []).slice(0, maxRevisions);
            const targetRev = allowedRevs.find(r => r.revision === restoreRevision);
            if (!targetRev) {
                const older = check(
                    await db.from('qorp_revisions')
                        .select('revision')
                        .eq('project_id', project.id)
                        .eq('revision', restoreRevision)
                        .maybeSingle()
                );
                if (older) throw new HttpError(403, 'O histórico completo de revisões faz parte do plano Pro.', 'PRO_REQUIRED');
                throw new HttpError(404, 'Projeto ou revisão não encontrado.');
            }
            assertDraftAllowed(targetRev.snapshot || {}, entitlements);
        } else {
            assertDraftAllowed(project.draft || {}, entitlements);
        }
        const token = project.playback_hash ? null : mintToken();
        let updated = check(await db.rpc('qorp_publish_project', {
            p_owner: user.id,
            p_project: project.id,
            p_expected: project.revision,
            p_hash: token ? hashToken(token) : null,
            p_restore: restoreRevision,
        }));
        const validSceneId = resolveActivePublishedSceneId(updated.published, updated.live);
        if (updated.live?.scene?.activeSceneId && updated.live.scene.activeSceneId !== validSceneId) {
            const nextLive = { ...(updated.live || {}) };
            if (validSceneId) {
                nextLive.scene = {
                    activeSceneId: validSceneId,
                    seq: (nextLive.scene?.seq || 0) + 1,
                    at: Date.now(),
                };
            } else {
                delete nextLive.scene;
            }
            const reconciledRows = check(
                await db.from('qorp_projects')
                    .update({ live: nextLive, runtime_version: updated.runtime_version + 1 })
                    .eq('id', project.id)
                    .eq('owner_id', user.id)
                    .select('*')
            );
            if (reconciledRows?.length) updated = reconciledRows[0];
        }
        return res.json({
            ...metadata(updated),
            token,
            scenes: extractPublishedScenes(updated.published),
            activeSceneId: validSceneId,
        });
    }

    let patch;
    let token;
    if (body.action === 'rename') {
        await assertProjectWritable(db, user.id, project, entitlements);
        const name = String(body.name || '').trim().slice(0, 100);
        if (!name) throw new HttpError(400, 'Informe o nome do projeto.');
        patch = { name };
    } else if (body.action === 'trash') {
        patch = { deleted_at: new Date().toISOString(), playback_hash: null };
    } else if (body.action === 'restore') {
        if (!project.deleted_at || Date.now() - Date.parse(project.deleted_at) > 30 * 86400000) {
            throw new HttpError(400, 'O prazo de restauração terminou.');
        }
        const activeRows = await activeProjectRows(db, user.id);
        if (activeRows.length >= entitlements.limits.maxProjects) {
            throw new HttpError(403, 'Você atingiu o limite de projetos ativos do seu plano.', 'PROJECT_LIMIT');
        }
        patch = { deleted_at: null };
    } else if (body.action === 'revoke') {
        patch = { playback_hash: null };
    } else if (body.action === 'rotate') {
        token = mintToken();
        patch = { playback_hash: hashToken(token) };
    } else if (body.action === 'scene') {
        const scene = (project.published?.layouts || []).flatMap(layout => layout.scenes || []).find(scene => scene.id === body.sceneId);
        if (!scene) throw new HttpError(404, 'Cena publicada não encontrada.');
        // Live state only: the published revision stays immutable.
        const live = project.live || {};
        patch = { live: { ...live, scene: { activeSceneId: scene.id, seq: (live.scene?.seq || 0) + 1, at: Date.now() } } };
    } else throw new HttpError(400, 'Operação inválida.');

    const bumpUpdatedAt = body.action === 'rename' || body.action === 'restore' || body.action === 'trash';
    const rows = check(await db.from('qorp_projects').update({
        ...patch,
        ...(bumpUpdatedAt ? { updated_at: new Date().toISOString() } : {}),
        runtime_version: project.runtime_version + 1,
    }).eq('id', project.id).eq('owner_id', user.id).eq('runtime_version', project.runtime_version).select('*'));
    if (!rows.length) throw new HttpError(409, 'O projeto mudou. Atualize e tente novamente.');
    return res.json({
        ...metadata(rows[0]),
        token,
        ...(body.action === 'scene' ? { activeSceneId: body.sceneId } : {}),
    });
});
