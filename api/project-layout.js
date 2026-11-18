import {
    assertProjectWritable,
    bodyOf,
    check,
    database,
    draftVersion,
    endpoint,
    getUserEntitlements,
    hashToken,
    HttpError,
    identity,
    ownedProject,
    projectId,
} from '../server/qorp.js';
import { assertDraftAllowed, liveView, mergeDraft, playbackPayload } from '../server/project-layout.js';

export default endpoint(async (req, res) => {
    const db = database();
    const id = projectId(req.query.project);
    if (req.query.mode === 'play') {
        if (req.method !== 'GET') throw new HttpError(405, 'A saída OBS permite apenas leitura.');
        const token = req.headers['x-overlay-token'];
        if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw new HttpError(401, 'Link de reprodução inválido.');
        const project = check(await db.from('qorp_projects').select('published,live,runtime_version').eq('id', id).eq('playback_hash', hashToken(token)).is('deleted_at', null).maybeSingle());
        if (!project) throw new HttpError(403, 'Link revogado ou projeto indisponível.');
        if (!project.published) throw new HttpError(404, 'Este projeto ainda não foi publicado.');
        const version = `p${project.runtime_version}.0`;
        if (req.query.v === version) return res.status(204).end();
        return res.json({ ...playbackPayload(liveView(project.published, project.live)), _v: version, serverNow: Date.now() });
    }
    const user = await identity(req, db);
    const project = await ownedProject(db, user.id, id);
    if (req.method === 'GET') {
        if (req.query.v === draftVersion(project)) return res.status(204).end();
        return res.json({ ...project.draft, _v: draftVersion(project), serverNow: Date.now() });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const body = bodyOf(req);
    const entitlements = await getUserEntitlements(db, user);
    await assertProjectWritable(db, user.id, project, entitlements);
    if (body._baseVersion !== draftVersion(project)) return res.status(409).json({ error: 'O rascunho mudou em outra aba. Suas alterações locais foram preservadas.', _v: draftVersion(project) });
    const draft = mergeDraft(project.draft, body);
    assertDraftAllowed(draft, entitlements);
    const rows = check(await db.from('qorp_projects').update({ draft, revision: project.revision + 1, updated_at: new Date().toISOString() })
        .eq('id', id).eq('owner_id', user.id).eq('revision', project.revision).is('deleted_at', null).select('revision'));
    if (!rows.length) throw new HttpError(409, 'O rascunho mudou em outra aba.');
    res.json({ ok: true, _v: draftVersion(rows[0]), live: draft.live, serverNow: Date.now() });
});
