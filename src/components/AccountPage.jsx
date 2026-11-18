// Conta qorp: entrar com Google, administrar plano Pro (Stripe), projetos, lixeira, versões e painel ao vivo. Rota: /?conta
import { useEffect, useRef, useState } from 'react';
import { accountUrl, supabase } from '../auth/supabase';
import { useSession } from '../auth/useSession';
import { apiFetch } from '../auth/api';
import { projectObsLink } from '../sync/transport';
import { clearImport, createProjectFrom, hasPendingImport, peekImport } from '../auth/pendingImport';
import { useI18n } from '../i18n';
import { LanguageSwitch, Wordmark } from './SiteChrome';
import './AccountPage.css';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

const friendly = (t, error) => (error?.message === 'Unsupported provider: provider is not enabled'
    ? t('account.errors.googleDisabled')
    : error?.message || t('account.errors.generic'));

function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Login is Google-only: no passwords to store, recover or leak. A first
// Google login also creates the account.
function SignIn() {
    const { t, locale } = useI18n();
    const importing = hasPendingImport();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const google = async () => {
        setError('');
        setBusy(true);
        const { error: err } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: accountUrl() },
        });
        if (err) { setError(friendly(t, err)); setBusy(false); }
    };

    return (
        <div className="qa-card">
            <h1>{t(importing ? 'account.titleImport' : 'account.titleSignIn')}</h1>
            <p className="qa-muted">{t(importing ? 'account.ledeImport' : 'account.lede')}</p>
            <button type="button" className="qa-google" onClick={google} disabled={busy}>
                <GoogleIcon /> {busy ? t('account.wait') : t('account.google')}
            </button>
            {error && <p role="alert" className="qa-error">{error}</p>}
            <p className="qa-muted qa-legal">
                {locale === 'en'
                    ? <>By signing in you agree to the <a href="/?termos">Terms of Use</a> and the <a href="/?privacidade">Privacy Policy</a>.</>
                    : <>Ao entrar, você concorda com os <a href="/?termos">Termos de Uso</a> e a <a href="/?privacidade">Política de Privacidade</a>.</>}
            </p>
        </div>
    );
}

function BillingSection({ billing, onError }) {
    const { t, locale } = useI18n();
    const [busyAction, setBusyAction] = useState('');

    const isPro = !!billing?.isPro;
    const status = billing?.status || 'free';
    const paymentKind = billing?.paymentKind || null;
    const cancelAtPeriodEnd = !!billing?.cancelAtPeriodEnd;
    const hasCustomer = !!billing?.hasCustomer;
    const maxProjects = billing?.limits?.maxProjects ?? (isPro ? 15 : 2);
    const activeCount = billing?.activeProjectCount ?? 0;

    const formatDate = (iso) => {
        if (!iso) return '';
        try { return new Date(iso).toLocaleDateString(locale); } catch { return iso; }
    };

    const startCheckout = async (plan) => {
        setBusyAction(plan);
        onError?.('');
        try {
            const res = await apiFetch('/api/billing', {
                method: 'POST',
                body: { action: 'checkout', plan, locale },
            });
            if (res?.url) window.location.assign(res.url);
        } catch (err) {
            onError?.(err.message);
        } finally {
            setBusyAction('');
        }
    };

    const openPortal = async () => {
        setBusyAction('portal');
        onError?.('');
        try {
            const res = await apiFetch('/api/billing', {
                method: 'POST',
                body: { action: 'portal', locale },
            });
            if (res?.url) window.location.assign(res.url);
        } catch (err) {
            onError?.(err.message);
        } finally {
            setBusyAction('');
        }
    };

    const canSubscribeCard = !isPro || paymentKind === 'pix_annual';

    return (
        <section className="qa-billing" aria-label={t('account.billing.title')}>
            <div className="qa-row qa-billing-head">
                <div className="qa-billing-title">
                    <h2>{t('account.billing.title')}</h2>
                    <span className="qa-badge qa-badge--beta">{t('account.billing.betaBadge')}</span>
                    <span className={`qa-badge ${isPro ? 'qa-badge--pro' : 'qa-badge--free'}`}>
                        {t(isPro ? 'account.billing.planPro' : 'account.billing.planFree')}
                    </span>
                </div>
                <span className="qa-muted">
                    {t('account.billing.usage', { active: activeCount, max: maxProjects })}
                </span>
            </div>

            <p className="qa-muted">
                {t(isPro ? 'account.billing.proDesc' : 'account.billing.freeDesc')}
            </p>

            {status === 'past_due' && billing?.graceUntil && (
                <p role="status" className="qa-warning">
                    {t('account.billing.graceUntil', { date: formatDate(billing.graceUntil) })}
                </p>
            )}
            {isPro && status !== 'past_due' && paymentKind === 'pix_annual' && billing?.paidUntil && (
                <p className="qa-notice">
                    {t('account.billing.pixUntil', { date: formatDate(billing.paidUntil) })}
                </p>
            )}
            {isPro && status !== 'past_due' && paymentKind !== 'pix_annual' && cancelAtPeriodEnd && billing?.paidUntil && (
                <p className="qa-warning">
                    {t('account.billing.cancelingUntil', { date: formatDate(billing.paidUntil) })}
                </p>
            )}
            {isPro && status !== 'past_due' && paymentKind !== 'pix_annual' && !cancelAtPeriodEnd && billing?.paidUntil && (
                <p className="qa-notice">
                    {t('account.billing.activeUntil', { date: formatDate(billing.paidUntil) })}
                </p>
            )}

            <div className="qa-billing-actions">
                {canSubscribeCard && (
                    <button
                        type="button"
                        className="qa-primary"
                        disabled={!!busyAction}
                        onClick={() => startCheckout('monthly')}
                    >
                        {busyAction === 'monthly' ? t('account.wait') : t('account.billing.subscribeMonthly')}
                    </button>
                )}
                {(hasCustomer || (isPro && paymentKind === 'card')) && (
                    <button
                        type="button"
                        className="qa-secondary"
                        disabled={!!busyAction}
                        onClick={openPortal}
                    >
                        {busyAction === 'portal' ? t('account.wait') : t('account.billing.managePortal')}
                    </button>
                )}
            </div>
        </section>
    );
}

function LiveScenesPanel({ projectId, onError }) {
    const { t } = useI18n();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [switchingId, setSwitchingId] = useState('');
    const [toast, setToast] = useState('');

    useEffect(() => {
        let alive = true;
        apiFetch(`/api/projects?id=${encodeURIComponent(projectId)}`)
            .then(data => {
                if (!alive) return;
                setDetail(data);
                setLoading(false);
            })
            .catch(err => {
                if (!alive) return;
                setLoading(false);
                onError?.(err.message);
            });
        return () => { alive = false; };
    }, [projectId, onError]);

    const switchScene = async (scene) => {
        setSwitchingId(scene.id);
        setToast('');
        onError?.('');
        try {
            const res = await apiFetch('/api/projects', {
                method: 'POST',
                body: { action: 'scene', id: projectId, sceneId: scene.id },
            });
            setDetail(prev => prev ? { ...prev, activeSceneId: res.activeSceneId || scene.id } : prev);
            setToast(t('account.liveSwitchedToast', { name: scene.name }));
        } catch (err) {
            onError?.(err.message);
        } finally {
            setSwitchingId('');
        }
    };

    const scenes = detail?.scenes || [];
    const activeSceneId = detail?.activeSceneId || scenes[0]?.id || null;

    return (
        <div className="qa-subpanel" role="region" aria-label={t('account.livePanelTitle')}>
            <div className="qa-subpanel-head">
                <strong>{t('account.livePanelTitle')}</strong>
                <span className="qa-muted">{t('account.livePanelDesc')}</span>
            </div>
            {loading && <p className="qa-muted">{t('account.loading')}</p>}
            {!loading && scenes.length === 0 && <p className="qa-muted">{t('account.liveNoScenes')}</p>}
            {!loading && scenes.length > 0 && (
                <div className="qa-live-grid">
                    {scenes.map(sc => {
                        const isActive = sc.id === activeSceneId;
                        return (
                            <button
                                key={sc.id}
                                type="button"
                                className={`qa-live-scene ${isActive ? 'is-active' : ''}`}
                                aria-pressed={isActive}
                                disabled={!!switchingId}
                                onClick={() => switchScene(sc)}
                            >
                                <span className="qa-live-scene-name">{sc.name}</span>
                                {isActive && <span className="qa-badge qa-badge--live">{t('account.liveActiveBadge')}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            {toast && <p role="status" className="qa-notice">{toast}</p>}
        </div>
    );
}

function RevisionHistoryPanel({ project, onRestored, onError }) {
    const { t, locale } = useI18n();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busyRev, setBusyRev] = useState(null);
    const [toast, setToast] = useState('');

    useEffect(() => {
        let alive = true;
        apiFetch(`/api/projects?id=${encodeURIComponent(project.id)}`)
            .then(data => {
                if (!alive) return;
                setDetail(data);
                setLoading(false);
            })
            .catch(err => {
                if (!alive) return;
                setLoading(false);
                onError?.(err.message);
            });
        return () => { alive = false; };
    }, [project.id, onError]);

    const rollbackTo = async (rev) => {
        if (!window.confirm(t('account.confirmRollback', { revision: rev.revision }))) return;
        setBusyRev(rev.revision);
        setToast('');
        onError?.('');
        try {
            const res = await apiFetch('/api/projects', {
                method: 'POST',
                body: {
                    action: 'rollback',
                    id: project.id,
                    revision: detail?.revision ?? project.revision,
                    restoreRevision: rev.revision,
                },
            });
            setDetail(prev => prev ? { ...prev, publishedRevision: res.publishedRevision, revision: res.revision } : prev);
            setToast(t('account.restoredToast', { revision: rev.revision }));
            onRestored?.();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setBusyRev(null);
        }
    };

    const revisions = detail?.revisions || [];
    const currentPublished = detail?.publishedRevision ?? project.publishedRevision;

    return (
        <div className="qa-subpanel" role="region" aria-label={t('account.historyTitle')}>
            <div className="qa-subpanel-head">
                <strong>{t('account.historyTitle')}</strong>
                <span className="qa-muted">{t('account.historyDesc')}</span>
            </div>
            {loading && <p className="qa-muted">{t('account.loading')}</p>}
            {!loading && revisions.length === 0 && <p className="qa-muted">{t('account.noRevisions')}</p>}
            {!loading && revisions.length > 0 && (
                <ul className="qa-revisions">
                    {revisions.map(rev => {
                        const isCurrent = rev.revision === currentPublished;
                        return (
                            <li key={rev.revision} className="qa-revision-row">
                                <div className="qa-revision-meta">
                                    <strong>{t('account.historyRevisionLabel', { revision: rev.revision })}</strong>
                                    {isCurrent && <span className="qa-badge qa-badge--beta">{t('account.historyCurrentBadge')}</span>}
                                    {rev.created_at && (
                                        <span className="qa-muted">
                                            {new Date(rev.created_at).toLocaleString(locale)}
                                        </span>
                                    )}
                                </div>
                                {!isCurrent && !project.readOnly && (
                                    <button
                                        type="button"
                                        className="qa-secondary qa-btn-sm"
                                        disabled={busyRev !== null}
                                        onClick={() => rollbackTo(rev)}
                                    >
                                        {busyRev === rev.revision ? t('account.wait') : t('account.restoreRevision')}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {toast && <p role="status" className="qa-notice">{toast}</p>}
        </div>
    );
}

function ProjectItem({ project, initialLiveOpen = false, onChanged, onError }) {
    const { t, locale } = useI18n();
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(project.name);
    const [showLive, setShowLive] = useState(initialLiveOpen);
    const [showHistory, setShowHistory] = useState(false);

    const newLink = async () => {
        if (project.hasPlaybackToken && !window.confirm(t('account.confirmRotate'))) return;
        setBusy(true);
        setNotice('');
        onError('');
        try {
            const result = await apiFetch('/api/projects', { method: 'POST', body: { action: 'rotate', id: project.id } });
            const url = projectObsLink(project.id, result.token);
            setLink(url);
            try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    const revokeLink = async () => {
        if (!window.confirm(t('account.confirmRevoke'))) return;
        setBusy(true);
        setLink('');
        setNotice('');
        onError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'revoke', id: project.id } });
            setNotice(t('account.linkRevoked'));
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    const saveRename = async (e) => {
        e?.preventDefault?.();
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === project.name) {
            setRenaming(false);
            setNameDraft(project.name);
            return;
        }
        setBusy(true);
        onError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'rename', id: project.id, name: trimmed } });
            setRenaming(false);
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    const duplicateProject = async () => {
        setBusy(true);
        onError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'duplicate', id: project.id } });
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    const exportProject = async () => {
        setBusy(true);
        onError('');
        try {
            const data = await apiFetch('/api/projects', { method: 'POST', body: { action: 'export', id: project.id } });
            const slug = (project.name || 'overlay').toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'overlay';
            downloadJsonFile(`${slug}.qorp.json`, data);
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    const moveToTrash = async () => {
        if (!window.confirm(t('account.confirmTrash'))) return;
        setBusy(true);
        onError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'trash', id: project.id } });
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    return (
        <li>
            <div className="qa-row qa-item">
                <div>
                    {renaming ? (
                        <form className="qa-rename-form" onSubmit={saveRename}>
                            <input
                                autoFocus
                                value={nameDraft}
                                maxLength={100}
                                onChange={e => setNameDraft(e.target.value)}
                                aria-label={t('account.rename')}
                            />
                            <button type="submit" className="qa-primary qa-btn-sm" disabled={busy}>
                                {t('account.saveName')}
                            </button>
                            <button
                                type="button"
                                className="qa-secondary qa-btn-sm"
                                onClick={() => { setRenaming(false); setNameDraft(project.name); }}
                            >
                                {t('account.cancelRename')}
                            </button>
                        </form>
                    ) : (
                        <div className="qa-project-title">
                            <strong>{project.name}</strong>
                            {project.readOnly && <span className="qa-badge qa-badge--readonly">{t('account.readOnlyBadge')}</span>}
                        </div>
                    )}
                    <p className="qa-muted">
                        {project.published ? t('account.published', { revision: project.publishedRevision }) : t('account.notPublished')}
                        {' · '}{t('account.changedAt', { date: new Date(project.updatedAt).toLocaleString(locale) })}
                    </p>
                </div>
                <div className="qa-actions">
                    <a className="qa-primary" href={`/?project=${project.id}`}>{t('account.openStudio')}</a>
                    {project.published && (
                        <button
                            type="button"
                            className={`qa-secondary ${showLive ? 'is-active' : ''}`}
                            onClick={() => { setShowLive(v => !v); setShowHistory(false); }}
                        >
                            {t('account.livePanelButton')}
                        </button>
                    )}
                    <button type="button" className="qa-secondary" onClick={newLink} disabled={busy}>
                        {t(project.hasPlaybackToken ? 'account.newObsLink' : 'account.makeObsLink')}
                    </button>
                </div>
            </div>

            <div className="qa-project-tools">
                {!project.readOnly && !renaming && (
                    <button type="button" className="qa-tool-link" onClick={() => { setNameDraft(project.name); setRenaming(true); }} disabled={busy}>
                        {t('account.rename')}
                    </button>
                )}
                <button type="button" className="qa-tool-link" onClick={duplicateProject} disabled={busy}>
                    {t('account.duplicate')}
                </button>
                <button type="button" className="qa-tool-link" onClick={exportProject} disabled={busy}>
                    {t('account.exportJson')}
                </button>
                {project.published && (
                    <button
                        type="button"
                        className="qa-tool-link"
                        onClick={() => { setShowHistory(v => !v); setShowLive(false); }}
                        disabled={busy}
                    >
                        {t('account.historyOpenButton')}
                    </button>
                )}
                {project.hasPlaybackToken && (
                    <button type="button" className="qa-tool-link qa-tool-link--danger" onClick={revokeLink} disabled={busy}>
                        {t('account.revokeObsLink')}
                    </button>
                )}
                <button type="button" className="qa-tool-link qa-tool-link--danger" onClick={moveToTrash} disabled={busy}>
                    {t('account.moveToTrash')}
                </button>
            </div>

            {notice && <p role="status" className="qa-notice">{notice}</p>}

            {link && (
                <div className="qa-link">
                    <p className="qa-notice">
                        {t(copied ? 'account.linkCopied' : 'account.copyLink')} {t('account.linkHint')}
                    </p>
                    <code>{link}</code>
                </div>
            )}

            {showLive && project.published && (
                <LiveScenesPanel projectId={project.id} onError={onError} />
            )}

            {showHistory && project.published && (
                <RevisionHistoryPanel project={project} onRestored={onChanged} onError={onError} />
            )}
        </li>
    );
}

function TrashedProjectItem({ project, onChanged, onError }) {
    const { t, locale } = useI18n();
    const [busy, setBusy] = useState(false);

    const restore = async () => {
        setBusy(true);
        onError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'restore', id: project.id } });
            onChanged();
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    return (
        <li className="qa-trashed-item">
            <div className="qa-row qa-item">
                <div>
                    <strong>{project.name}</strong>
                    <p className="qa-muted">
                        {t('account.deletedAt', { date: new Date(project.deletedAt).toLocaleDateString(locale) })}
                    </p>
                </div>
                <div className="qa-actions">
                    <button type="button" className="qa-secondary" onClick={restore} disabled={busy}>
                        {busy ? t('account.wait') : t('account.restoreProject')}
                    </button>
                </div>
            </div>
        </li>
    );
}

function Projects({ session }) {
    const { t } = useI18n();
    const [projects, setProjects] = useState(null);
    const [billing, setBilling] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const fileInputRef = useRef(null);

    const params = new URLSearchParams(window.location.search);
    const checkoutParam = params.get('checkout');
    const checkoutSessionId = params.get('session_id') || '';
    const liveProjectParam = params.get('ao-vivo') || '';

    useEffect(() => {
        let alive = true;
        const billingUrl = checkoutSessionId
            ? `/api/billing?session_id=${encodeURIComponent(checkoutSessionId)}`
            : '/api/billing';
        apiFetch(billingUrl)
            .catch(() => null)
            .then(async (billData) => {
                const projData = await apiFetch('/api/projects');
                if (!alive) return;
                setProjects(projData.projects || []);
                setBilling(billData || projData.entitlements || { plan: 'free', isPro: false, status: 'free' });
                setError('');
            })
            .catch(err => { if (alive) setError(err.message); });
        return () => { alive = false; };
    }, [reload, checkoutSessionId]);

    const create = async () => {
        setBusy(true);
        setError('');
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'create', name: t('account.defaultProjectName') } });
            setReload(n => n + 1);
        } catch (err) {
            setError(err.message);
        }
        setBusy(false);
    };

    const onImportJsonFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        setError('');
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(t('account.invalidImportJson'));
            }
            const draft = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : parsed;
            const name = String(parsed.name || file.name.replace(/\.qorp\.json$|\.json$/i, '') || t('account.defaultProjectName')).trim().slice(0, 100);
            await apiFetch('/api/projects', {
                method: 'POST',
                body: { action: 'create', name, draft },
            });
            setReload(n => n + 1);
        } catch (err) {
            setError(err?.message || t('account.invalidImportJson'));
        }
        setBusy(false);
    };

    const user = session.user;
    const providers = user.app_metadata?.providers || [user.app_metadata?.provider].filter(Boolean);
    const activeProjects = (projects || []).filter(p => !p.deletedAt);
    const trashedProjects = (projects || []).filter(p => !!p.deletedAt);

    return (
        <div className="qa-card qa-wide">
            <header className="qa-account">
                {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />}
                <div>
                    <h1>{user.user_metadata?.full_name || t('account.yourAccount')}</h1>
                    <p className="qa-muted">{user.email} · {t('account.signsInWith', { providers: providers.map(p => (p === 'google' ? 'Google' : t('account.providerEmail'))).join(t('account.and')) })}</p>
                </div>
                <button type="button" className="qa-secondary" onClick={() => supabase.auth.signOut()}>{t('account.signOut')}</button>
            </header>

            {checkoutParam === 'success' && (
                <p role="status" className="qa-notice">{t('account.billing.checkoutSuccess')}</p>
            )}
            {checkoutParam === 'cancel' && (
                <p role="status" className="qa-muted">{t('account.billing.checkoutCancel')}</p>
            )}

            <BillingSection billing={billing} onError={setError} />

            <section>
                <div className="qa-row">
                    <h2>{t('account.projects')}</h2>
                    <div className="qa-actions">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            style={{ display: 'none' }}
                            onChange={onImportJsonFile}
                        />
                        <button
                            type="button"
                            className="qa-secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={busy}
                        >
                            {t('account.importJson')}
                        </button>
                        <button type="button" className="qa-primary" onClick={create} disabled={busy}>
                            {t('account.newProject')}
                        </button>
                    </div>
                </div>
                {error && <p role="alert" className="qa-error">{error}</p>}
                {!projects && !error && <p className="qa-muted">{t('account.loading')}</p>}
                {projects && activeProjects.length === 0 && <p className="qa-muted">{t('account.noProjects')}</p>}
                {activeProjects.length > 0 && (
                    <ul className="qa-projects">
                        {activeProjects.map(p => (
                            <ProjectItem
                                key={p.id}
                                project={p}
                                initialLiveOpen={liveProjectParam === p.id}
                                onChanged={() => setReload(n => n + 1)}
                                onError={setError}
                            />
                        ))}
                    </ul>
                )}
            </section>

            {trashedProjects.length > 0 && (
                <section className="qa-trash-section">
                    <div className="qa-row">
                        <h2>{t('account.trashTitle')}</h2>
                        <span className="qa-muted">{t('account.trashHint')}</span>
                    </div>
                    <ul className="qa-projects">
                        {trashedProjects.map(p => (
                            <TrashedProjectItem
                                key={p.id}
                                project={p}
                                onChanged={() => setReload(n => n + 1)}
                                onError={setError}
                            />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

// After login, turns the stashed preview design into a project and opens it.
// If the design requires Pro (403 PRO_REQUIRED), the draft stays in localStorage
// so the user can upgrade right here or return to /?studio without losing work.
function ImportPending() {
    const { t } = useI18n();
    const [error, setError] = useState('');
    const [errorCode, setErrorCode] = useState('');
    const [billing, setBilling] = useState(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const draft = peekImport();
        if (!draft) { window.location.replace('/?conta'); return; }
        createProjectFrom(draft)
            .then(project => {
                clearImport();
                window.location.replace(`/?project=${project.id}`);
            })
            .catch(err => {
                setError(err.message);
                setErrorCode(err.code || '');
                apiFetch('/api/billing').then(setBilling).catch(() => {});
            });
    }, [attempt]);

    const retryImport = () => {
        setError('');
        setErrorCode('');
        setAttempt(n => n + 1);
    };

    const discardAndContinue = () => {
        clearImport();
        window.location.replace('/?conta');
    };

    return (
        <div className="qa-card qa-wide">
            <h1>{t(error ? 'account.importFailed' : 'account.importing')}</h1>
            {error && (
                <>
                    <p role="alert" className="qa-error">
                        {errorCode === 'PRO_REQUIRED' ? t('account.importProRequired') : error}
                    </p>
                    <BillingSection billing={billing} onError={setError} />
                    <div className="qa-actions">
                        <a className="qa-primary" href="/?studio">{t('account.backToStudio')}</a>
                        <button type="button" className="qa-secondary" onClick={retryImport}>
                            {t('account.retryImport')}
                        </button>
                        <button type="button" className="qa-secondary" onClick={discardAndContinue}>
                            {t('account.discardImport')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AccountPage() {
    const { loading, session } = useSession();
    const { t } = useI18n();

    let body;
    if (!supabase) body = <div className="qa-card"><h1>{t('account.unavailableTitle')}</h1><p className="qa-muted">{t('account.unavailableText')}</p></div>;
    else if (loading) body = <p role="status" className="qa-muted">{t('account.loading')}</p>;
    else if (session && hasPendingImport()) body = <ImportPending />;
    else if (session) body = <Projects session={session} />;
    else body = <SignIn />;

    return (
        <div className="qa-page">
            <div className="qa-top">
                <a href="/" className="qa-brand" aria-label="qorpStreamer"><Wordmark size={34} /></a>
                <LanguageSwitch />
            </div>
            <main>{body}</main>
        </div>
    );
}
