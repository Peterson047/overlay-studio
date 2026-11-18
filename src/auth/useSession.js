import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Current Supabase session plus whether the user arrived from a
// password-reset e-mail and must choose a new password.
export function useSession() {
    const [state, setState] = useState({ loading: !!supabase, session: null, recovering: false });

    useEffect(() => {
        if (!supabase) return undefined;
        let alive = true;
        supabase.auth.getSession().then(({ data }) => {
            if (alive) setState(s => ({ ...s, loading: false, session: data.session }));
        });
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            setState(s => ({
                loading: false,
                session,
                recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovering,
            }));
        });
        return () => { alive = false; data.subscription.unsubscribe(); };
    }, []);

    return {
        ...state,
        finishRecovery: () => setState(s => ({ ...s, recovering: false })),
    };
}
