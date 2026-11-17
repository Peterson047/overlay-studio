// Conta qorp: entrar (Google ou e-mail e senha), recuperar a senha e ver os
// projetos da conta. Rota: /?conta
import { useEffect, useState } from 'react';
import { accountUrl, supabase } from '../auth/supabase';
import { useSession } from '../auth/useSession';
import { apiFetch } from '../auth/api';
import { projectObsLink } from '../sync/transport';
import './AccountPage.css';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

const MESSAGES = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar. Procure a mensagem na caixa de entrada.',
    'User already registered': 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
    'Unsupported provider: provider is not enabled': 'O login com Google ainda não foi ativado no Supabase.',
};
const friendly = (error) => MESSAGES[error?.message] || error?.message || 'Algo deu errado. Tente de novo.';

function SignIn() {
    const [mode, setMode] = useState('entrar'); // entrar | criar | recuperar
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const google = async () => {
        setError('');
        setBusy(true);
        const { error: err } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: accountUrl() },
        });
        // On success the browser leaves the page; only errors land here.
        if (err) { setError(friendly(err)); setBusy(false); }
    };

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setNotice('');
        setBusy(true);
        let result;
        if (mode === 'entrar') {
            result = await supabase.auth.signInWithPassword({ email, password });
        } else if (mode === 'criar') {
            result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: accountUrl() } });
            if (!result.error) setNotice('Enviamos um link de confirmação para o seu e-mail.');
        } else {
            result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: accountUrl() });
            if (!result.error) setNotice('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.');
        }
        if (result.error) setError(friendly(result.error));
        setBusy(false);
    };

    const switchTo = (next) => { setMode(next); setError(''); setNotice(''); };

    return (
        <div className="qa-card">
            <h1>{mode === 'criar' ? 'Criar conta' : mode === 'recuperar' ? 'Recuperar acesso' : 'Entrar no qorpStreamer'}</h1>
            <p className="qa-muted">Seus projetos ficam salvos na conta e abrem em qualquer computador.</p>

            {mode !== 'recuperar' && (
                <>
                    <button type="button" className="qa-google" onClick={google} disabled={busy}>
                        <GoogleIcon /> Continuar com Google
                    </button>
                    <div className="qa-divider"><span>ou com e-mail</span></div>
                </>
            )}

            <form onSubmit={submit} className="qa-form">
                <label>E-mail
                    <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                {mode !== 'recuperar' && (
                    <label>Senha
                        <input
                            type="password" required minLength={8}
                            autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
                            value={password} onChange={e => setPassword(e.target.value)}
                        />
                    </label>
                )}
                {error && <p role="alert" className="qa-error">{error}</p>}
                {notice && <p role="status" className="qa-notice">{notice}</p>}
                <button type="submit" className="qa-primary" disabled={busy}>
                    {busy ? 'Aguarde…' : mode === 'criar' ? 'Criar conta' : mode === 'recuperar' ? 'Enviar link' : 'Entrar'}
                </button>
            </form>

            <nav className="qa-links" aria-label="Opções de acesso">
                {mode === 'entrar' && <>
                    <button type="button" onClick={() => switchTo('criar')}>Criar conta</button>
                    <button type="button" onClick={() => switchTo('recuperar')}>Esqueci a senha</button>
                </>}
                {mode !== 'entrar' && <button type="button" onClick={() => switchTo('entrar')}>Já tenho conta</button>}
            </nav>
        </div>
    );
}

function NewPassword({ onDone }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error: err } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (err) setError(friendly(err)); else onDone();
    };
    return (
        <form className="qa-card qa-form" onSubmit={submit}>
            <h1>Criar nova senha</h1>
            <label>Nova senha
                <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            {error && <p role="alert" className="qa-error">{error}</p>}
            <button type="submit" className="qa-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
        </form>
    );
}

function ProjectItem({ project, onError }) {
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);

    const newLink = async () => {
        if (project.hasPlaybackToken && !window.confirm('Gerar um novo link desativa o link atual no OBS. Continuar?')) return;
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
                        {project.published ? `Publicado (versão ${project.publishedRevision})` : 'Ainda não publicado'}
                        {' · '}alterado em {new Date(project.updatedAt).toLocaleString('pt-BR')}
                    </p>
                </div>
                <div className="qa-actions">
                    <a className="qa-primary" href={`/?project=${project.id}`}>Abrir no estúdio</a>
                    <button type="button" className="qa-secondary" onClick={newLink} disabled={busy}>
                        {project.hasPlaybackToken ? 'Novo link do OBS' : 'Gerar link do OBS'}
                    </button>
                </div>
            </div>
            {link && (
                <div className="qa-link">
                    <p className="qa-notice">
                        {copied ? 'Link copiado.' : 'Copie o link.'} Cole no OBS como Fonte de navegador 1920×1080. Ele só aparece agora.
                    </p>
                    <code>{link}</code>
                </div>
            )}
        </li>
    );
}

function Projects({ session }) {
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
            await apiFetch('/api/projects', { method: 'POST', body: { action: 'create', name: 'Meu canal' } });
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
                    <h1>{user.user_metadata?.full_name || 'Sua conta'}</h1>
                    <p className="qa-muted">{user.email} · entra com {providers.map(p => p === 'google' ? 'Google' : 'e-mail').join(' e ')}</p>
                </div>
                <button type="button" className="qa-secondary" onClick={() => supabase.auth.signOut()}>Sair</button>
            </header>

            <section>
                <div className="qa-row">
                    <h2>Meus projetos</h2>
                    <button type="button" className="qa-primary" onClick={create} disabled={busy}>Novo projeto</button>
                </div>
                {error && <p role="alert" className="qa-error">{error}</p>}
                {!projects && !error && <p className="qa-muted">Carregando…</p>}
                {projects?.length === 0 && <p className="qa-muted">Você ainda não tem projetos.</p>}
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

export default function AccountPage() {
    const { loading, session, recovering, finishRecovery } = useSession();

    let body;
    if (!supabase) body = <div className="qa-card"><h1>Contas indisponíveis</h1><p className="qa-muted">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</p></div>;
    else if (loading) body = <p role="status" className="qa-muted">Carregando…</p>;
    else if (recovering && session) body = <NewPassword onDone={finishRecovery} />;
    else if (session) body = <Projects session={session} />;
    else body = <SignIn />;

    return (
        <div className="qa-page">
            <a href="/" className="qa-brand">qorpStreamer</a>
            <main>{body}</main>
        </div>
    );
}
