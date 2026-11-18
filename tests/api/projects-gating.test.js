import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callHandler, createFakeSupabase } from './fakeSupabase.js';
import { hashToken } from '../../server/qorp.js';

let fakeDb;

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => fakeDb,
}));

const { default: projectsHandler } = await import('../../api/projects.js');
const { default: projectLayoutHandler } = await import('../../api/project-layout.js');

const USER_FREE = { id: 'user-free-1', email: 'free@example.com' };
const USER_PRO = { id: 'user-pro-1', email: 'pro@example.com' };
const USER_OWNER = { id: 'user-owner-1', email: 'owner@example.com' };

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
    const future = new Date(Date.now() + 14 * 86_400_000).toISOString();
    fakeDb = createFakeSupabase({
        users: {
            'tok-free': USER_FREE,
            'tok-pro': USER_PRO,
            'tok-owner': USER_OWNER,
        },
        billing: [
            {
                owner_id: USER_PRO.id,
                customer_id: 'cus_pro_1',
                subscription_id: 'sub_pro_1',
                status: 'active',
                paid_until: future,
                payment_kind: 'card',
            },
        ],
    });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service_role_fake');
    vi.stubEnv('QORP_OWNER_EMAILS', 'owner@example.com');
});

describe('Pro theme/kit gating & owner-only Xaxinim server enforcement', () => {
    it('allows all 5 free themes for Free users and rejects Pro themes/kits with 403 PRO_REQUIRED', async () => {
        for (const theme of ['midnight', 'neon', 'minimal', 'warm', 'aurora']) {
            const dbSingle = createFakeSupabase({ users: { 'tok-free': USER_FREE } });
            fakeDb = dbSingle;
            const res = await callHandler(projectsHandler, {
                method: 'POST',
                headers: { authorization: 'Bearer tok-free' },
                body: { action: 'create', name: `Proj ${theme}`, draft: { theme, elements: [] } },
            });
            expect(res.status).toBe(201);
        }

        const proCreate = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'create', name: 'Pro Attempt', draft: { theme: 'cyberhud', elements: [] } },
        });
        expect(proCreate.status).toBe(403);
        expect(proCreate.body.code).toBe('PRO_REQUIRED');

        const nestedProCreate = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: {
                action: 'create',
                name: 'Nested Pro Attempt',
                draft: {
                    theme: 'midnight',
                    elements: [],
                    layouts: [{ id: 'layout_1', scenes: [{ id: 's1', snapshot: { theme: 'valorant', elements: [] } }] }],
                },
            },
        });
        expect(nestedProCreate.status).toBe(403);
        expect(nestedProCreate.body.code).toBe('PRO_REQUIRED');

        // Seed a writable free project and attempt to save/publish Pro draft onto it
        fakeDb.tables.projects.push({
            id: UUID_1,
            owner_id: USER_FREE.id,
            name: 'Free Project',
            draft: { theme: 'midnight', elements: [] },
            revision: 1,
            published: null,
            published_revision: null,
            playback_hash: null,
            live: {},
            runtime_version: 0,
            updated_at: '2026-11-17T10:00:00.000Z',
            deleted_at: null,
        });

        const savePro = await callHandler(projectLayoutHandler, {
            method: 'POST',
            query: { project: UUID_1 },
            headers: { authorization: 'Bearer tok-free' },
            body: { _baseVersion: 'd1.0', theme: 'cyberhud' },
        });
        expect(savePro.status).toBe(403);
        expect(savePro.body.code).toBe('PRO_REQUIRED');

        // Seed a project whose draft was saved while Pro and attempt to publish after downgrade
        fakeDb.tables.projects.find(p => p.id === UUID_1).draft = { theme: 'cyberhud', elements: [] };
        const publishPro = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'publish', id: UUID_1, revision: 1 },
        });
        expect(publishPro.status).toBe(403);
        expect(publishPro.body.code).toBe('PRO_REQUIRED');
    });

    it('grants Pro theme access during active subscription, past_due 7-day grace, and 12-month Pix', async () => {
        const resPro = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-pro' },
            body: { action: 'create', name: 'Pro Allowed', draft: { theme: 'cyberhud', elements: [] } },
        });
        expect(resPro.status).toBe(201);

        // Free user enters past_due within 7-day grace
        fakeDb.tables.billing.push({
            owner_id: USER_FREE.id,
            customer_id: 'cus_grace',
            subscription_id: 'sub_grace',
            status: 'past_due',
            paid_until: new Date(Date.now() - 86_400_000).toISOString(),
            grace_until: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        });
        const resGrace = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'create', name: 'Grace Allowed', draft: { theme: 'valorant', elements: [] } },
        });
        expect(resGrace.status).toBe(201);

        // 12-month Pix active
        fakeDb.tables.billing[1] = {
            owner_id: USER_FREE.id,
            customer_id: 'cus_pix',
            subscription_id: null,
            status: 'active',
            payment_kind: 'pix_annual',
            paid_until: new Date(Date.now() + 300 * 86_400_000).toISOString(),
        };
        const resPix = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'create', name: 'Pix Allowed', draft: { theme: 'gta6', elements: [] } },
        });
        expect(resPix.status).toBe(201);
    });

    it('rejects Xaxinim for both Free and Pro non-owners with 403 OWNER_ONLY, while allowing owner even on Free plan', async () => {
        const payloads = [
            { theme: 'xaxinim-vice', elements: [] },
            { kitId: 'kit-xaxinim', theme: 'midnight', elements: [] },
            { theme: { id: 'midnight', backdrop: 'vicedusk' }, elements: [] },
            { theme: 'midnight', elements: [{ id: 'l1', type: 'logo', src: '/brand/xaxinim.png' }] },
        ];

        for (const draft of payloads) {
            const freeDeny = await callHandler(projectsHandler, {
                method: 'POST',
                headers: { authorization: 'Bearer tok-free' },
                body: { action: 'create', name: 'No Xaxinim', draft },
            });
            expect(freeDeny.status).toBe(403);
            expect(freeDeny.body.code).toBe('OWNER_ONLY');

            const proDeny = await callHandler(projectsHandler, {
                method: 'POST',
                headers: { authorization: 'Bearer tok-pro' },
                body: { action: 'create', name: 'No Xaxinim Pro', draft },
            });
            expect(proDeny.status).toBe(403);
            expect(proDeny.body.code).toBe('OWNER_ONLY');
        }

        const ownerCreate = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-owner' },
            body: {
                action: 'create',
                name: 'Xaxinim Stream',
                draft: {
                    theme: 'xaxinim-vice',
                    elements: [{ id: 'l1', type: 'logo', src: '/brand/xaxinim.png' }],
                },
            },
        });
        expect(ownerCreate.status).toBe(201);
    });
});

describe('project limits, revision history limits, post-downgrade read-only enforcement & OBS survival', () => {
    it('enforces Free limit of 2 active projects on create & restore, and unlocks after trash', async () => {
        fakeDb.tables.projects.push(
            {
                id: UUID_1,
                owner_id: USER_FREE.id,
                name: 'P1',
                draft: { theme: 'midnight', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T08:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_2,
                owner_id: USER_FREE.id,
                name: 'P2',
                draft: { theme: 'neon', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T09:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_3,
                owner_id: USER_FREE.id,
                name: 'P3 Trashed',
                draft: { theme: 'warm', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T07:00:00.000Z',
                deleted_at: new Date().toISOString(),
            },
        );

        const overCreate = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'create', name: 'P4', draft: { theme: 'aurora', elements: [] } },
        });
        expect(overCreate.status).toBe(403);
        expect(overCreate.body.code).toBe('PROJECT_LIMIT');

        const overRestore = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'restore', id: UUID_3 },
        });
        expect(overRestore.status).toBe(403);
        expect(overRestore.body.code).toBe('PROJECT_LIMIT');

        const trashRes = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'trash', id: UUID_1 },
        });
        expect(trashRes.status).toBe(200);

        const restoreOk = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'restore', id: UUID_3 },
        });
        expect(restoreOk.status).toBe(200);
    });

    it('marks excess downgraded projects readOnly, protects updated_at on revoke/rotate/scene, and keeps ?mode=play OBS working', async () => {
        const obsToken = 'A'.repeat(43);
        fakeDb.tables.projects.push(
            {
                id: UUID_1,
                owner_id: USER_FREE.id,
                name: 'Oldest Excess',
                draft: { theme: 'cyberhud', elements: [] },
                published: { theme: 'cyberhud', elements: [{ id: 'e1', type: 'text', content: 'Live Pro' }] },
                published_revision: 1,
                playback_hash: hashToken(obsToken),
                revision: 1,
                live: {},
                runtime_version: 2,
                updated_at: '2026-11-17T08:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_2,
                owner_id: USER_FREE.id,
                name: 'Middle Writable',
                draft: { theme: 'midnight', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T09:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_3,
                owner_id: USER_FREE.id,
                name: 'Newest Writable',
                draft: { theme: 'neon', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T10:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_4,
                owner_id: USER_FREE.id,
                name: 'Trashed Project',
                draft: { theme: 'warm', elements: [] },
                revision: 0,
                runtime_version: 0,
                updated_at: '2026-11-17T11:00:00.000Z',
                deleted_at: '2026-11-17T11:00:00.000Z',
            },
        );

        const listRes = await callHandler(projectsHandler, {
            method: 'GET',
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(listRes.status).toBe(200);
        expect(listRes.body.entitlements.activeProjectCount).toBe(3);
        const byId = Object.fromEntries(listRes.body.projects.map(p => [p.id, p]));
        expect(byId[UUID_1].readOnly).toBe(true);
        expect(byId[UUID_2].readOnly).toBe(false);
        expect(byId[UUID_3].readOnly).toBe(false);
        expect(byId[UUID_4].readOnly).toBe(false);

        // Excess read-only project cannot edit, publish, rollback, or rename
        const writeBlocked = await callHandler(projectLayoutHandler, {
            method: 'POST',
            query: { project: UUID_1 },
            headers: { authorization: 'Bearer tok-free' },
            body: { _baseVersion: 'd1.0', theme: 'midnight' },
        });
        expect(writeBlocked.status).toBe(403);
        expect(writeBlocked.body.code).toBe('PROJECT_READ_ONLY');

        const publishBlocked = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'publish', id: UUID_1, revision: 1 },
        });
        expect(publishBlocked.status).toBe(403);
        expect(publishBlocked.body.code).toBe('PROJECT_READ_ONLY');

        const renameBlocked = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'rename', id: UUID_1, name: 'New Name' },
        });
        expect(renameBlocked.status).toBe(403);
        expect(renameBlocked.body.code).toBe('PROJECT_READ_ONLY');

        // Read, export, and OBS playback continue working!
        const readDraft = await callHandler(projectLayoutHandler, {
            method: 'GET',
            query: { project: UUID_1 },
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(readDraft.status).toBe(200);

        const exportRes = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'export', id: UUID_1 },
        });
        expect(exportRes.status).toBe(200);

        const obsPlay = await callHandler(projectLayoutHandler, {
            method: 'GET',
            query: { project: UUID_1, mode: 'play' },
            headers: { 'x-overlay-token': obsToken },
        });
        expect(obsPlay.status).toBe(200);
        expect(obsPlay.body.theme).toBe('cyberhud');

        // Rotating token on UUID_1 must NOT bump updated_at or steal a writable slot
        const rotateRes = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'rotate', id: UUID_1 },
        });
        expect(rotateRes.status).toBe(200);
        expect(fakeDb.tables.projects.find(p => p.id === UUID_1).updated_at).toBe('2026-11-17T08:00:00.000Z');

        // Trashing UUID_3 promotes UUID_1 to writable
        await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'trash', id: UUID_3 },
        });
        const renameNowOk = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'rename', id: UUID_1, name: 'Promoted Project' },
        });
        expect(renameNowOk.status).toBe(200);
    });

    it('limits revision history & rollback to 5 on Free and 50 on Pro', async () => {
        fakeDb.tables.projects.push(
            {
                id: UUID_1,
                owner_id: USER_FREE.id,
                name: 'Free Revs',
                draft: { theme: 'midnight', elements: [] },
                revision: 10,
                runtime_version: 1,
                updated_at: '2026-11-17T10:00:00.000Z',
                deleted_at: null,
            },
            {
                id: UUID_2,
                owner_id: USER_PRO.id,
                name: 'Pro Revs',
                draft: { theme: 'midnight', elements: [] },
                revision: 10,
                runtime_version: 1,
                updated_at: '2026-11-17T10:00:00.000Z',
                deleted_at: null,
            },
        );
        for (let r = 0; r < 10; r += 1) {
            fakeDb.tables.revisions.push(
                { project_id: UUID_1, revision: r, snapshot: { theme: 'midnight', elements: [] }, created_at: new Date(1000 + r).toISOString() },
                { project_id: UUID_2, revision: r, snapshot: { theme: 'midnight', elements: [] }, created_at: new Date(1000 + r).toISOString() },
            );
        }

        const freeDetail = await callHandler(projectsHandler, {
            method: 'GET',
            query: { id: UUID_1 },
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(freeDetail.status).toBe(200);
        expect(freeDetail.body.revisions).toHaveLength(5);
        expect(freeDetail.body.revisions.map(r => r.revision)).toEqual([9, 8, 7, 6, 5]);

        const freeOldRollback = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'rollback', id: UUID_1, revision: 10, restoreRevision: 2 },
        });
        expect(freeOldRollback.status).toBe(403);
        expect(freeOldRollback.body.code).toBe('PRO_REQUIRED');

        const proDetail = await callHandler(projectsHandler, {
            method: 'GET',
            query: { id: UUID_2 },
            headers: { authorization: 'Bearer tok-pro' },
        });
        expect(proDetail.status).toBe(200);
        expect(proDetail.body.revisions).toHaveLength(10);

        const proOldRollback = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-pro' },
            body: { action: 'rollback', id: UUID_2, revision: 10, restoreRevision: 2 },
        });
        expect(proOldRollback.status).toBe(200);
    });

    it('supports project duplication, live scene switching, and activeSceneId reconciliation on publish/rollback', async () => {
        const draftWithScenes = {
            theme: 'midnight',
            activeLayoutId: 'l1',
            layouts: [{
                id: 'l1',
                name: 'Show Principal',
                activeSceneId: 's1',
                scenes: [
                    { id: 's1', name: 'Abertura', snapshot: { theme: 'midnight', elements: [] } },
                    { id: 's2', name: 'Gameplay', snapshot: { theme: 'midnight', elements: [] } },
                ],
            }],
        };
        fakeDb.tables.projects.push({
            id: UUID_1,
            owner_id: USER_FREE.id,
            name: 'Canal Original',
            draft: draftWithScenes,
            published: draftWithScenes,
            published_revision: 1,
            revision: 1,
            live: { scene: { activeSceneId: 's2', seq: 1 } },
            runtime_version: 2,
            updated_at: '2026-11-17T10:00:00.000Z',
            deleted_at: null,
        });
        fakeDb.tables.revisions.push({
            project_id: UUID_1,
            revision: 0,
            snapshot: {
                theme: 'midnight',
                activeLayoutId: 'l1',
                layouts: [{
                    id: 'l1',
                    name: 'Show Principal',
                    activeSceneId: 's1',
                    scenes: [
                        { id: 's1', name: 'Abertura', snapshot: { theme: 'midnight', elements: [] } },
                    ],
                }],
            },
            created_at: '2026-11-17T09:00:00.000Z',
        });

        // Duplicate creates a second project with '(cópia)'
        const dupRes = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'duplicate', id: UUID_1 },
        });
        expect(dupRes.status).toBe(201);
        expect(dupRes.body.name).toBe('Canal Original (cópia)');

        // Third duplicate hits Free limit of 2 active projects
        const dupBlocked = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'duplicate', id: UUID_1 },
        });
        expect(dupBlocked.status).toBe(403);
        expect(dupBlocked.body.code).toBe('PROJECT_LIMIT');

        // Detail GET returns scenes and current activeSceneId ('s2')
        const detailRes = await callHandler(projectsHandler, {
            method: 'GET',
            query: { id: UUID_1 },
            headers: { authorization: 'Bearer tok-free' },
        });
        expect(detailRes.status).toBe(200);
        expect(detailRes.body.scenes).toEqual([
            { id: 's1', name: 'Abertura', layoutName: 'Show Principal' },
            { id: 's2', name: 'Gameplay', layoutName: 'Show Principal' },
        ]);
        expect(detailRes.body.activeSceneId).toBe('s2');

        // Rollback to revision 0 (where 's2' does not exist) reconciles activeSceneId to 's1'
        const rollbackRes = await callHandler(projectsHandler, {
            method: 'POST',
            headers: { authorization: 'Bearer tok-free' },
            body: { action: 'rollback', id: UUID_1, revision: 1, restoreRevision: 0 },
        });
        expect(rollbackRes.status).toBe(200);
        expect(rollbackRes.body.activeSceneId).toBe('s1');
        expect(fakeDb.tables.projects.find(p => p.id === UUID_1).live.scene.activeSceneId).toBe('s1');
    });
});
