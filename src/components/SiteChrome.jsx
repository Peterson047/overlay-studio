// Header and footer shared by the public pages (home, tutorial).
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../i18n';
import './SiteChrome.css';

// Supabase keeps the session in localStorage as sb-<project>-auth-token.
// Reading the key avoids loading the auth library on public pages.
function hasStoredSession() {
    try {
        return Object.keys(localStorage).some(key => /^sb-.+-auth-token$/.test(key));
    } catch {
        return false;
    }
}

// Brand lockup: the logo plus "qorp" + "Streamer" in the logo's red.
export function Wordmark({ size = 36, className = '' }) {
    return (
        <span className={`qorp-wordmark ${className}`.trim()} style={{ '--mark': `${size}px` }}>
            <img src="/brand/qorp-logo-light.svg" alt="" width={size} height={size} />
            <span><b>qorp</b><i>Streamer</i></span>
        </span>
    );
}

export function LanguageSwitch() {
    const { locale, setLocale, t } = useI18n();
    return (
        <div className="qorp-lang" role="group" aria-label={t('common.language')}>
            {[['pt-BR', 'PT'], ['en', 'EN']].map(([code, label]) => (
                <button
                    key={code} type="button" lang={code}
                    aria-pressed={locale === code}
                    onClick={() => setLocale(code)}
                >{label}</button>
            ))}
        </div>
    );
}

export function SiteHeader({ showTutorial = true }) {
    const { t } = useI18n();
    const signedIn = hasStoredSession();
    return (
        <header className="qorp-home-bar">
            <a className="qorp-home-brand" href="/" aria-label="qorpStreamer">
                <Wordmark size={42} />
            </a>
            <nav aria-label={t('common.mainNav')}>
                {showTutorial && <a className="qorp-home-hide-sm" href="/?tutorial">{t('common.tutorial')}</a>}
                <LanguageSwitch />
                {signedIn
                    ? <a className="qorp-home-button" href="/?conta">{t('common.myProjects')} <ArrowUpRight size={16} aria-hidden="true" /></a>
                    : <a className="qorp-home-button qorp-home-outline" href="/?conta">{t('common.signIn')}</a>}
            </nav>
        </header>
    );
}

export function SiteFooter() {
    const { t } = useI18n();
    return (
        <footer className="qorp-home-bar">
            <div className="qorp-footer-brand">
                <Wordmark size={44} />
                <p>{t('common.footerTagline')}</p>
            </div>
            <nav aria-label="Links">
                <a href="/?tutorial">{t('common.tutorial')}</a>
                <a href="mailto:contato@qorp.com.br">{t('common.contact')}</a>
                <a href="https://github.com/abhayraghuwanshi/overlay-studio" target="_blank" rel="noreferrer">{t('common.basedOn')}</a>
                <a href="https://github.com/Peterson047/overlay-studio" target="_blank" rel="noreferrer">{t('common.sourceCode')}</a>
            </nav>
        </footer>
    );
}
