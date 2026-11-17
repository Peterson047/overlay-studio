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
    try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function takeImport() {
    try {
        const raw = localStorage.getItem(KEY);
        localStorage.removeItem(KEY);
        const data = raw ? JSON.parse(raw) : null;
        return data && Date.now() - data.at < MAX_AGE_MS ? data.draft : null;
    } catch {
        return null;
    }
}

export function createProjectFrom(draft, name = 'Meu overlay') {
    return apiFetch('/api/projects', { method: 'POST', body: { action: 'create', name, draft } });
}
