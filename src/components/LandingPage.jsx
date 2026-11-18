import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleCheck, Link2, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../i18n';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { GALLERY_THEMES, HERO_THEMES } from './homeThemes';
import { getKitTier } from '../theme/entitlements';
import { PLATFORMS } from './platformIcons';
import './LandingPage.css';

const ROTATE_MS = 4500;
const FLOW_ICONS = [SlidersHorizontal, Link2, CircleCheck];

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Hero stage as a TV channel: on-screen display (LIVE, CH 0n, theme name),
// a burst of static when the channel changes, and a hard offset shadow in the
// theme colour. Flips channels on its own until the visitor takes the remote.
const STATIC_MS = 320;

function ThemeStage({ lang, t }) {
    const [active, setActive] = useState(0);
    const [switching, setSwitching] = useState(false);
    const [auto, setAuto] = useState(() => !prefersReducedMotion());
    const [paused, setPaused] = useState(false);
    const total = HERO_THEMES.length;

    const tune = useCallback((next, manual) => {
        if (manual) setAuto(false);
        if (prefersReducedMotion()) { setActive(next); return; }
        setSwitching(true);
        setTimeout(() => setActive(next), STATIC_MS / 2);
        setTimeout(() => setSwitching(false), STATIC_MS);
    }, []);

    useEffect(() => {
        if (!auto || paused) return undefined;
        const id = setInterval(() => tune((active + 1) % total), ROTATE_MS);
        return () => clearInterval(id);
    }, [auto, paused, active, total, tune]);

    const theme = HERO_THEMES[active];
    const channel = String(active + 1).padStart(2, '0');
    return (
        <div
            className="qh-tv"
            style={{ '--theme-accent': theme.accent }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <figure className={`qh-tv-screen${switching ? ' is-switching' : ''}`}>
                {HERO_THEMES.map((item, i) => (
                    <img
                        key={item.id}
                        src={item.image(lang)}
                        width="1600" height="900"
                        alt={i === active ? `${t('home.heroAlt')} — ${item.name}` : ''}
                        aria-hidden={i !== active}
                        className={i === active ? 'is-active' : undefined}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        fetchPriority={i === 0 ? 'high' : 'auto'}
                    />
                ))}
                <span className="qh-osd qh-osd-live" aria-hidden="true">● LIVE</span>
                <span className="qh-osd qh-osd-ch" aria-hidden="true">CH {channel}</span>
                <span className="qh-osd qh-osd-name" aria-hidden="true">{theme.name}</span>
                <span className="qh-static" aria-hidden="true" />
            </figure>

            <div className="qh-remote" role="group" aria-label={t('home.themePicker')}>
                <button type="button" className="qh-remote-step" aria-label={t('home.prevChannel')} onClick={() => tune((active - 1 + total) % total, true)}>◀</button>
                <span className="qh-remote-label" aria-live="polite">CH {channel} · {theme.name}</span>
                <div className="qh-ticks">
                    {HERO_THEMES.map((item, i) => (
                        <button
                            key={item.id} type="button"
                            aria-label={item.name}
                            aria-pressed={i === active}
                            style={{ '--tick': item.accent }}
                            onClick={() => i !== active && tune(i, true)}
                        >
                            {i === active && auto && !paused && <span className="qh-tick-fill" key={active} />}
                        </button>
                    ))}
                </div>
                <button type="button" className="qh-remote-step" aria-label={t('home.nextChannel')} onClick={() => tune((active + 1) % total, true)}>▶</button>
            </div>
        </div>
    );
}

export default function LandingPage() {
    const { t, locale } = useI18n();
    const lang = locale === 'en' ? 'en' : 'pt';
    return (
        <div className="qorp-home">
            <SiteHeader />
            <main>
                <section className="qorp-home-main qh-hero">
                    <div className="qh-hero-copy">
                        <p className="qh-eyebrow"><span className="qh-dot" aria-hidden="true" />{t('home.eyebrow')}</p>
                        <h1>{t('home.title')}</h1>
                        <p className="qorp-home-lede">{t('home.lede')}</p>
                        <div className="qorp-home-actions">
                            <a className="qorp-home-button" href="/?studio">{t('common.tryFree')} <ArrowUpRight size={19} aria-hidden="true" /></a>
                            <a className="qorp-home-secondary" href="#como-funciona">{t('home.secondary')} <ArrowDown size={16} aria-hidden="true" /></a>
                        </div>
                        <p className="qorp-home-note">{t('home.note')}</p>
                    </div>
                    <ThemeStage lang={lang} t={t} />
                </section>

                <section className="qh-ticker" aria-label={t('home.worksWith')}>
                    <div className="qh-ticker-tag"><span className="qh-ticker-dot" aria-hidden="true" />{t('home.worksWith')}</div>
                    <div className="qh-ticker-track">
                        {[0, 1].map(copy => (
                            <ul key={copy} className="qh-ticker-list" aria-hidden={copy === 1 || undefined}>
                                {PLATFORMS.map(p => (
                                    <li key={p.label} style={{ '--brand': p.color }}>
                                        {p.path && (
                                            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d={p.path} fill="currentColor" /></svg>
                                        )}
                                        <span>{p.label}</span>
                                    </li>
                                ))}
                            </ul>
                        ))}
                    </div>
                </section>

                <section className="qorp-home-main qh-section qh-flow-section" id="como-funciona">
                    <p className="qorp-home-label">{t('home.flowLabel')}</p>
                    <h2>{t('home.stepsTitle')}</h2>
                    <ol className="qh-flow">
                        {t('home.steps').map((step, index) => {
                            const Icon = FLOW_ICONS[index];
                            return (
                                <li key={step.title} className={index === 2 ? 'is-done' : undefined}>
                                    <span className="qh-flow-icon"><Icon size={26} aria-hidden="true" /></span>
                                    <span className="qh-step-number">{index + 1}</span>
                                    <h3>{step.title}</h3>
                                    <p>{step.text}</p>
                                </li>
                            );
                        })}
                    </ol>
                </section>

                <section className="qorp-home-main qh-section" id="temas">
                    <div className="qh-section-head">
                        <div>
                            <h2>{t('home.themesTitle')}</h2>
                            <p className="qorp-home-lede">{t('home.themesLede')}</p>
                        </div>
                        <a className="qorp-home-secondary" href="/?studio">{t('home.allThemes')} <ArrowRight size={16} aria-hidden="true" /></a>
                    </div>
                    <ul className="qh-gallery">
                        {GALLERY_THEMES.map(theme => (
                            <li key={theme.id} style={{ '--card-accent': theme.accent }}>
                                <a href={`/?studio&kit=${theme.kit}`} className="qh-card">
                                    <span className="qh-card-media">
                                        <img src={`/screens/themes/${theme.id}.jpg`} width="1280" height="720" alt="" loading="lazy" />
                                    </span>
                                    <span className="qh-card-body">
                                        <span className="qh-card-head">
                                            <span className="qh-card-name">{theme.name}</span>
                                            {getKitTier(theme.kit) === 'pro' && <span className="qh-pro-pill">{t('home.proBadge')}</span>}
                                        </span>
                                        <span className="qh-card-tag">{t(`home.themeTags.${theme.id}`)}</span>
                                        <span className="qh-card-cta">{t('home.useTheme')} <ArrowRight size={14} aria-hidden="true" /></span>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>


                <section className="qorp-home-main qh-section qh-features">
                    <div>
                        <h2>{t('home.featuresTitle')}</h2>
                        <ul>
                            {t('home.features').map(feature => (
                                <li key={feature.title}>
                                    <Check size={18} aria-hidden="true" />
                                    <div><h3>{feature.title}</h3><p>{feature.text}</p></div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <figure className="qh-frame">
                        <img src="/screens/editor.jpg" width="1600" height="1000" alt={t('home.featuresAlt')} loading="lazy" />
                    </figure>
                </section>

                <section className="qorp-home-main qh-section">
                    <div className="qh-cta">
                        <div>
                            <h2>{t('home.ctaTitle')}</h2>
                            <p>{t('home.ctaText')}</p>
                        </div>
                        <div className="qorp-home-actions">
                            <a className="qorp-home-button" href="/?studio">{t('common.tryFree')} <ArrowUpRight size={19} aria-hidden="true" /></a>
                            <a className="qorp-home-button qorp-home-outline" href="/?conta">{t('home.ctaSecondary')}</a>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
