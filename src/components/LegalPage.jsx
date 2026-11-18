// Termos de Uso (/?termos) e Política de Privacidade (/?privacidade).
import { useI18n } from '../i18n';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { Block, Rich } from './help/rich';
import { LEGAL, UPDATED } from './legal/content';
import { useHashScroll } from './help/useHashScroll';
import './LandingPage.css';
import './TutorialPage.css';
import './HelpPage.css';

const LABELS = {
    'pt-BR': { updated: 'Última atualização', onThisPage: 'Nesta página', other: { terms: 'Política de Privacidade', privacy: 'Termos de Uso' }, eyebrow: 'Legal' },
    en: { updated: 'Last updated', onThisPage: 'On this page', other: { terms: 'Privacy Policy', privacy: 'Terms of Use' }, eyebrow: 'Legal' },
};

export default function LegalPage({ doc }) {
    useHashScroll();
    const { locale } = useI18n();
    const page = LEGAL[doc][locale] || LEGAL[doc]['pt-BR'];
    const l = LABELS[locale] || LABELS['pt-BR'];
    const otherHref = doc === 'terms' ? '/?privacidade' : '/?termos';

    return (
        <div className="qorp-home">
            <SiteHeader />
            <main className="qorp-home-main qt-layout qhelp">
                <aside className="qt-toc" aria-label={l.onThisPage}>
                    <p className="qorp-home-label">{l.onThisPage}</p>
                    <ol>{page.sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
                    <p className="qlegal-other"><a href={otherHref}>{l.other[doc]} →</a></p>
                </aside>
                <article className="qt-body qlegal">
                    <p className="qorp-home-label">{l.eyebrow}</p>
                    <h1>{page.title}</h1>
                    <p className="qlegal-updated">{l.updated}: {UPDATED}</p>
                    <p className="qorp-home-lede"><Rich text={page.intro} /></p>
                    {page.sections.map(s => (
                        <section key={s.id} id={s.id}>
                            <h2>{s.title}</h2>
                            {s.blocks.map((block, i) => <Block key={i} block={block} />)}
                        </section>
                    ))}
                </article>
            </main>
            <SiteFooter />
        </div>
    );
}
