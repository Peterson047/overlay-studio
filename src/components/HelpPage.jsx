// Help center: quick start, documentation and FAQ, with search. Route: /?ajuda
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Link2, Search } from 'lucide-react';
import { useI18n } from '../i18n';
import { SiteFooter, SiteHeader } from './SiteChrome';
import CONTENT from './help/content';
import { Block, Rich } from './help/rich';
import { plain } from './help/text';
import { useHashScroll } from './help/useHashScroll';
import './LandingPage.css';
import './TutorialPage.css';
import './HelpPage.css';

const blockText = blocks => blocks.map(b => b.p || b.note || (b.ul || b.ol || []).join(' ')).join(' ');

export default function HelpPage() {
    useHashScroll();
    const { locale } = useI18n();
    const c = CONTENT[locale] || CONTENT['pt-BR'];
    const [query, setQuery] = useState('');
    const [active, setActive] = useState('guia');
    const searchRef = useRef(null);
    const q = plain(query.trim());

    // "/" focuses the search, like most docs sites.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Highlight the table-of-contents entry for the section on screen.
    useEffect(() => {
        const targets = [...document.querySelectorAll('.qhelp [data-toc]')];
        if (!targets.length || typeof IntersectionObserver === 'undefined') return undefined;
        const io = new IntersectionObserver((entries) => {
            const visible = entries.filter(e => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
            if (visible[0]) setActive(visible[0].target.id);
        }, { rootMargin: '-96px 0px -65% 0px' });
        targets.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, [q, locale]);

    const docs = useMemo(
        () => (q ? c.docs.filter(d => plain(`${d.title} ${blockText(d.blocks)}`).includes(q)) : c.docs),
        [c, q],
    );
    const faq = useMemo(
        () => (q ? c.faq.filter(([question, answer]) => plain(`${question} ${answer}`).includes(q)) : c.faq),
        [c, q],
    );
    const nothing = q && docs.length === 0 && faq.length === 0;

    return (
        <div className="qorp-home">
            <SiteHeader />
            <main className="qorp-home-main qt-layout qhelp">
                <aside className="qt-toc" aria-label={c.meta.onThisPage}>
                    <p className="qorp-home-label">{c.meta.onThisPage}</p>
                    <ol>
                        <li><a href="#guia" aria-current={active === 'guia' ? 'location' : undefined}>{c.meta.quickTitle}</a></li>
                        <li><a href="#docs">{c.meta.docsTitle}</a>
                            <ol className="qhelp-sub">
                                {c.docs.map(d => (
                                    <li key={d.id}><a href={`#${d.id}`} aria-current={active === d.id ? 'location' : undefined}>{d.title}</a></li>
                                ))}
                            </ol>
                        </li>
                        <li><a href="#faq" aria-current={active === 'faq' ? 'location' : undefined}>{c.meta.faqTitle}</a></li>
                    </ol>
                </aside>

                <div className="qt-body qhelp-body">
                    <p className="qorp-home-label">{c.meta.eyebrow}</p>
                    <h1>{c.meta.title}</h1>
                    <p className="qorp-home-lede">{c.meta.lede}</p>

                    <label className="qhelp-search">
                        <span className="qhelp-sr">{c.meta.search}</span>
                        <Search size={18} aria-hidden="true" />
                        <input
                            ref={searchRef}
                            type="search" value={query} onChange={e => setQuery(e.target.value)}
                            placeholder={c.meta.searchPlaceholder} aria-label={c.meta.search}
                        />
                        {!query && <kbd aria-hidden="true">/</kbd>}
                    </label>

                    {nothing && <p className="qt-note" role="status"><Rich text={c.meta.noResults.replace('{q}', query.trim())} /></p>}

                    {!q && (
                        <section id="guia" data-toc>
                            <h2>{c.meta.quickTitle}</h2>
                            <ol className="qhelp-quick">
                                {c.quick.map((step, i) => (
                                    <li key={step.title}>
                                        <span className="qhelp-num">{i + 1}</span>
                                        <div><h3>{step.title}</h3><p><Rich text={step.text} /></p></div>
                                    </li>
                                ))}
                            </ol>
                            <a className="qorp-home-secondary" href="/?tutorial">{c.meta.fullTutorial} <ArrowUpRight size={16} aria-hidden="true" /></a>
                        </section>
                    )}

                    {docs.length > 0 && (
                        <section id="docs">
                            <h2>{c.meta.docsTitle}</h2>
                            {docs.map(d => (
                                <article key={d.id} id={d.id} className="qhelp-doc" data-toc>
                                    <h3>
                                        {d.title}
                                        <a className="qhelp-anchor" href={`#${d.id}`} aria-label={`${c.meta.linkTo} ${d.title}`}><Link2 size={16} aria-hidden="true" /></a>
                                    </h3>
                                    {d.blocks.map((block, i) => <Block key={i} block={block} />)}
                                </article>
                            ))}
                        </section>
                    )}

                    {faq.length > 0 && (
                        <section id="faq" data-toc>
                            <h2>{c.meta.faqTitle}</h2>
                            <div className="qhelp-faq">
                                {faq.map(([question, answer]) => (
                                    <details key={question} open={!!q}>
                                        <summary>{question}</summary>
                                        <p><Rich text={answer} /></p>
                                    </details>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="qhelp-contact">
                        <h2>{c.meta.stillStuck}</h2>
                        <p><Rich text={c.meta.stillStuckText} /></p>
                        <p className="qhelp-legal"><Rich text={c.meta.legal} /></p>
                        <div className="qorp-home-actions">
                            <a className="qorp-home-button" href="/?studio">{c.meta.openStudio} <ArrowUpRight size={18} aria-hidden="true" /></a>
                        </div>
                    </section>
                </div>
            </main>
            <SiteFooter />
        </div>
    );
}
