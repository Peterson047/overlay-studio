// Conta qorp: entrar com Google e ver os projetos da conta. Rota: /?conta
import { useEffect, useState } from 'react';
import { accountUrl, supabase } from '../auth/supabase';
import { useSession } from '../auth/useSession';
import { apiFetch } from '../auth/api';
import { projectObsLink } from '../sync/transport';
import { createProjectFrom, hasPendingImport, takeImport } from '../auth/pendingImport';
import { useI18n } from '../i18n';
import { LanguageSwitch, Wordmark } from './SiteChrome';
import './AccountPage.css';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

const friendly = (t, error) => (error?.message === 'Unsupported provider: provider is not enabled'
    ? t('account.errors.googleDisabled')
    : error?.message || t('account.errors.generic'));

// Login is Google-only: no passwords to store, recover or leak. A first
// Google login also creates the account.
function SignIn() {
    const { t } = useI18n();
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
        // On success the browser leaves the page; only errors land here.
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
        </div>
    );
}

function ProjectItem({ project, onError }) {
    const { t, locale } = useI18n();
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);

    const newLink = async () => {
        if (project.hasPlaybackToken && !window.confirm(t('account.confirmRotate'))) return;
        setBusy(true);
        try {
            const result = await apiFetch('/api/projects', { method: 'POST', body: { action: 'rotate', id: project.id } });
            const url = projectObsLink(project.id, result.token);
            setLink(url);
            try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
        } catch (err) {
            onError(err.message);
        }
        setBusy(false);
    };

    return (
        <li>
            <div className="qa-row qa-item">
                <div>
                    <strong>{project.name}</strong>
                    <p className="qa-muted">
                        {project.published ? t('account.published', { revision: project.publishedRevision }) : t('account.notPublished')}
                        {' · '}{t('account.changedAt', { date: new Date(project.updatedAt).toLocaleString(locale) })}
                    </p>
                </div>
                <div className="qa-actions">
                    <a className="qa-primary" href={`/?project=${project.id}`}>{t('account.openStudio')}</a>
                    <button type="button" className="qa-secondary" onClick={newLink} disabled={busy}>
                        {t(project.hasPlaybackToken ? 'account.newObsLink' : 'account.makeObsLink')}
                    </button>
                </div>
            </div>
            {link && (
                <div className="qa-link">
                    <p className="qa-notice">
                        {t(copied ? 'account.linkCopied' : 'account.copyLink')} {t('account.linkHint')}
                    </p>
                    <code>{link}</code>
                </div>
            )}
        </li>
    );
}

function Projects({ session }) {
    const { t } = useI18n();
    const [projects, setProjects] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [reload, setReload] = useState(0);

    useEffect(() => {
        let alive = true;
        apiFetch('/api/projects')
            .then(data => { if (alive) { setProjects(data.projects); setError(''); } })
            .catch(err => { if (alive) setError(err.message); });
        return () => { alive = false; };
    }, [reload]);

    const create = async () => {
        setBusy(true);
        try {
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'create', name: t('account.defaultProjectName') } });
            setReload(n => n + 1);
        } catch (err) {
            setError(err.message);
        }
        setBusy(false);
    };

    const user = session.user;
    const providers = user.app_metadata?.providers || [user.app_metadata?.provider].filter(Boolean);

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

            <section>
                <div className="qa-row">
                    <h2>{t('account.projects')}</h2>
                    <button type="button" className="qa-primary" onClick={create} disabled={busy}>{t('account.newProject')}</button>
                </div>
                {error && <p role="alert" className="qa-error">{error}</p>}
                {!projects && !error && <p className="qa-muted">{t('account.loading')}</p>}
                {projects?.length === 0 && <p className="qa-muted">{t('account.noProjects')}</p>}
                {projects?.length > 0 && (
                    <ul className="qa-projects">
                        {projects.filter(p => !p.deletedAt).map(p => (
                            <ProjectItem key={p.id} project={p} onError={setError} />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

// After login, turns the stashed preview design into a project and opens it.
function ImportPending() {
    const { t } = useI18n();
    const [error, setError] = useState('');
    useEffect(() => {
        const draft = takeImport();
        if (!draft) { window.location.replace('/?conta'); return; }
        createProjectFrom(draft)
            .then(project => window.location.replace(`/?project=${project.id}`))
            .catch(err => setError(err.message));
    }, []);
    return (
        <div className="qa-card">
            <h1>{t(error ? 'account.importFailed' : 'account.importing')}</h1>
            {error && <>
                <p role="alert" className="qa-error">{error}</p>
                <a className="qa-primary" href="/?conta">{t('common.myProjects')}</a>
            </>}
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
