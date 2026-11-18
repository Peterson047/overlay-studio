// Minimal i18n: pt-BR and en, chosen automatically from the browser and
// overridable by the user (saved in localStorage). No library needed.
import { useCallback, useSyncExternalStore } from 'react';
import ptBR from './pt-BR';
import en from './en';

export const LOCALES = { 'pt-BR': ptBR, en };
const STORAGE_KEY = 'qorp_lang';

export function detectLocale() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && LOCALES[saved]) return saved;
    } catch { /* storage blocked */ }
    const langs = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
    return langs.some(l => /^pt\b/i.test(l || '')) ? 'pt-BR' : 'en';
}

let current = typeof window === 'undefined' ? 'pt-BR' : detectLocale();
const listeners = new Set();

function apply(locale) {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
}
apply(current);

export function setLocale(locale) {
    if (!LOCALES[locale] || locale === current) return;
    current = locale;
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
    apply(locale);
    listeners.forEach(fn => fn());
}

export const getLocale = () => current;

// t('home.hero.title') → string; {name} placeholders are filled from vars.
export function translate(locale, key, vars) {
    const pick = dict => key.split('.').reduce((node, part) => node?.[part], dict);
    let value = pick(LOCALES[locale]) ?? pick(ptBR) ?? key;
    if (vars && typeof value === 'string') {
        value = value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
    }
    return value;
}

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function useI18n() {
    const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
    const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);
    return { locale, t, setLocale };
}
