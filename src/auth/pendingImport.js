import { apiFetch } from './api';

// Carries a preview design across the login redirect (Google leaves the page),
// so "Salvar e publicar" turns what the visitor built into an account project.
const KEY = 'qorp_pending_import';
const MAX_AGE_MS = 60 * 60 * 1000;

export function stashImport(draft) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ draft, at: Date.now() }));
        return true;
    } catch {
        return false;
    }
}

export function hasPendingImport() {
    return !!peekImport();
}

export function peekImport() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || Date.now() - data.at >= MAX_AGE_MS) {
            localStorage.removeItem(KEY);
            return null;
        }
        return data.draft ?? null;
    } catch {
        return null;
    }
}

export function clearImport() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function takeImport() {
    const draft = peekImport();
    clearImport();
    return draft;
}

export function createProjectFrom(draft, name = 'Meu overlay') {
    return apiFetch('/api/projects', { method: 'POST', body: { action: 'create', name, draft } });
}
