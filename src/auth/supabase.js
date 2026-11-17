import { createClient } from '@supabase/supabase-js';

// Browser client: only the public URL and publishable key. Everything that
// needs the secret key runs in api/ on the server.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;

// Where Supabase sends the browser back after Google or an e-mail link.
// Must be listed in Supabase → Authentication → URL Configuration.
export const accountUrl = () => `${window.location.origin}/?conta`;
