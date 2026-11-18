// Studio strings use the English text as the key: tx('Font size') returns it
// as-is in English and looks it up in studio-pt.js for pt-BR. Missing entries
// fall back to English, so wrapping a string never breaks the UI. Components
// that render tx() should also call useI18n() so they re-render on a switch.
import { getLocale } from './index';
import PT from './studio-pt';

export function tx(en, vars) {
    let out = getLocale() === 'pt-BR' ? (PT[en] ?? en) : en;
    if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return out;
}
