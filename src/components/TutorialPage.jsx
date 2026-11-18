// Tutorial (pt-BR / en): from the free preview to OBS. Route: /?tutorial
import { Fragment } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../i18n';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './LandingPage.css';
import './TutorialPage.css';

// Tiny inline markup used by the dictionaries: **bold** and [text](href).
function Rich({ text }) {
    const parts = String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const bold = /^\*\*(.+)\*\*$/.exec(part);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const link = /^\[(.+)\]\((.+)\)$/.exec(part);
        if (link) return <a key={i} href={link[2]}>{link[1]}</a>;
        return <Fragment key={i}>{part}</Fragment>;
    });
}

function Block({ block }) {
    if (block.p) return <p><Rich text={block.p} /></p>;
    if (block.note) return <p className="qt-note"><Rich text={block.note} /></p>;
    if (block.ul) return <ul>{block.ul.map(item => <li key={item}><Rich text={item} /></li>)}</ul>;
    if (block.ol) return <ol>{block.ol.map(item => <li key={item}><Rich text={item} /></li>)}</ol>;
    if (block.dl) {
        return (
            <dl>
                {block.dl.map(([term, detail]) => (
                    <Fragment key={term}><dt>{term}</dt><dd><Rich text={detail} /></dd></Fragment>
                ))}
            </dl>
        );
    }
    return null;
}

export default function TutorialPage() {
    const { t } = useI18n();
    const sections = t('tutorial.sections');
    return (
        <div className="qorp-home">
            <SiteHeader showTutorial={false} />
            <main className="qorp-home-main qt-layout">
                <aside className="qt-toc" aria-label={t('tutorial.toc')}>
                    <p className="qorp-home-label">{t('tutorial.toc')}</p>
                    <ol>{sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
                </aside>

                <article className="qt-body">
                    <p className="qorp-home-label">{t('tutorial.label')}</p>
                    <h1>{t('tutorial.title')}</h1>
                    <p className="qorp-home-lede">{t('tutorial.lede')}</p>

                    {sections.map(section => (
                        <section key={section.id} id={section.id}>
                            <h2>{section.title}</h2>
                            {section.blocks.map((block, i) => <Block key={i} block={block} />)}
                        </section>
                    ))}
                    <p className="qt-help"><Rich text={t('tutorial.help')} /></p>

                    <div className="qorp-home-actions">
                        <a className="qorp-home-button" href="/?studio">{t('tutorial.openStudio')} <ArrowUpRight size={19} aria-hidden="true" /></a>
                        <a className="qorp-home-button qorp-home-outline" href="/?conta">{t('home.ctaSecondary')}</a>
                    </div>
                </article>
            </main>
            <SiteFooter />
        </div>
    );
}
