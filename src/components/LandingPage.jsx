import { ArrowDown, ArrowUpRight, Check, CloudUpload, Layers, Monitor, SlidersHorizontal } from 'lucide-react';
import './LandingPage.css';

const workflow = [
    { icon: Layers, title: 'Teste sem cadastro', description: 'Abra o estúdio, escolha um kit de cenas e mexa à vontade. O preview fica salvo no seu navegador.' },
    { icon: SlidersHorizontal, title: 'Personalize', description: 'Posicione câmeras, textos, metas e widgets no canvas e ajuste as cores ao seu canal.' },
    { icon: CloudUpload, title: 'Salve na conta', description: 'Entre com Google ou e-mail. O que você montou vira um projeto que abre em qualquer computador.' },
    { icon: Monitor, title: 'Publique no OBS', description: 'Gere o link privado e cole como Fonte de navegador. Cada nova publicação chega sozinha ao OBS.' },
];

const plans = [
    {
        name: 'Preview',
        price: 'Sem conta',
        items: ['Estúdio completo para testar', 'Kits de cenas e temas', 'Salvo só neste navegador'],
        cta: { href: '/?studio', label: 'Experimentar agora' },
    },
    {
        name: 'Conta grátis',
        price: 'Grátis no beta',
        highlight: true,
        items: ['Projetos salvos na conta', 'Link privado e fixo para o OBS', 'Publicar com um clique', 'Até 2 projetos', 'Entrar com Google ou e-mail'],
        cta: { href: '/?conta&criar', label: 'Criar conta grátis' },
    },
];

// Supabase keeps the session in localStorage as sb-<project>-auth-token.
// Reading the key avoids loading the auth library on the home page.
function hasStoredSession() {
    try {
        return Object.keys(localStorage).some(key => /^sb-.+-auth-token$/.test(key));
    } catch {
        return false;
    }
}

export default function LandingPage() {
    const signedIn = hasStoredSession();
    return (
        <div className="qorp-home">
            <header className="qorp-home-bar">
                <a className="qorp-home-brand" href="/">
                    <img src="/favicon.svg" alt="" width="32" height="32" />
                    qorpStreamer
                </a>
                <nav aria-label="Navegação principal">
                    <a className="qorp-home-hide-sm" href="/?tutorial">Tutorial</a>
                    <a className="qorp-home-hide-sm" href="/templates/">Templates</a>
                    {signedIn
                        ? <a className="qorp-home-button" href="/?conta">Meus projetos <ArrowUpRight size={16} aria-hidden="true" /></a>
                        : <>
                            <a href="/?conta">Entrar</a>
                            <a className="qorp-home-button qorp-home-outline" href="/?conta&criar">Criar conta</a>
                        </>}
                </nav>
            </header>
            <main className="qorp-home-main">
                <section className="qorp-home-hero">
                    <div>
                        <p className="qorp-home-label">Editor de overlays para OBS</p>
                        <h1>Crie o visual da sua live<span>.</span></h1>
                        <p className="qorp-home-lede">Monte cenas com câmeras, alertas e metas no navegador. Leve seu overlay para o OBS com um link.</p>
                        <div className="qorp-home-actions">
                            <a className="qorp-home-button" href="/?studio">Experimentar grátis <ArrowUpRight size={19} aria-hidden="true" /></a>
                            <a className="qorp-home-secondary" href="#como-funciona">Como funciona <ArrowDown size={16} aria-hidden="true" /></a>
                        </div>
                        <p className="qorp-home-note">Sem cadastro para testar. Para salvar e levar ao OBS, crie sua conta: é grátis durante o beta.</p>
                    </div>
                    <figure className="qorp-home-preview">
                        <img src="/screens/editor.jpg" width="1384" height="868" alt="Estúdio com ferramentas de edição ao lado de uma cena de gameplay" />
                        <figcaption>Editor de cenas do qorpStreamer</figcaption>
                    </figure>
                </section>

                <section className="qorp-home-workflow" id="como-funciona">
                    <h2>Do preview à transmissão</h2>
                    <div className="qorp-home-steps">
                        {workflow.map(({ icon: Icon, title, description }, index) => (
                            <article key={title}>
                                <Icon size={23} aria-hidden="true" />
                                <h3><span className="qorp-home-step">{index + 1}</span>{title}</h3>
                                <p>{description}</p>
                            </article>
                        ))}
                    </div>
                    <a className="qorp-home-secondary" href="/?tutorial">Ver o tutorial completo <ArrowUpRight size={16} aria-hidden="true" /></a>
                </section>

                <section className="qorp-home-plans" aria-labelledby="planos">
                    <h2 id="planos">Comece sem pagar nada</h2>
                    <div className="qorp-home-plan-grid">
                        {plans.map(plan => (
                            <article key={plan.name} className={plan.highlight ? 'is-highlight' : undefined}>
                                <p className="qorp-home-label">{plan.name}</p>
                                <h3>{plan.price}</h3>
                                <ul>
                                    {plan.items.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}
                                </ul>
                                <a className={plan.highlight ? 'qorp-home-button' : 'qorp-home-button qorp-home-outline'} href={plan.cta.href}>
                                    {plan.cta.label} <ArrowUpRight size={18} aria-hidden="true" />
                                </a>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="qorp-home-template">
                    <img className="qorp-home-channel-logo" src="/brand/xaxinim.png" alt="" width="112" height="112" loading="lazy" />
                    <div>
                        <p className="qorp-home-label">Kit de cenas</p>
                        <h2>Xaxinim · Vice Beach</h2>
                        <p>Pôr do sol neon e cenas prontas para personalizar.</p>
                    </div>
                    <a className="qorp-home-button" href="/?studio&kit=kit-xaxinim">Testar este kit <ArrowUpRight size={19} aria-hidden="true" /></a>
                </section>
            </main>
            <footer className="qorp-home-bar">
                <span>qorpStreamer · Qorp</span>
                <nav aria-label="Links do produto">
                    <a href="/?tutorial">Tutorial</a>
                    <a href="/guides/add-overlay-to-obs/">Guia do OBS</a>
                    <a href="mailto:contato@qorp.com.br">Contato</a>
                    <a href="https://github.com/abhayraghuwanshi/overlay-studio" target="_blank" rel="noreferrer">Baseado no Overlay Studio</a>
                    <a href="https://github.com/Peterson047/overlay-studio" target="_blank" rel="noreferrer">Código-fonte (AGPL-3.0)</a>
                </nav>
            </footer>
        </div>
    );
}
