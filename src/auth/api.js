import { supabase } from './supabase';

// Calls an authenticated qorp API route with the current session token.
export async function apiFetch(path, { method = 'GET', body } = {}) {
    const { data } = (await supabase?.auth?.getSession?.()) || {};
    const token = data?.session?.access_token;
    const res = await fetch(path, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(payload.error || `Erro ${res.status}`);
        err.status = res.status;
        if (payload.code) err.code = payload.code;
        throw err;
    }
    return payload;
}
