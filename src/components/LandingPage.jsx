import { ArrowDown, ArrowUpRight, Layers, Monitor, SlidersHorizontal } from 'lucide-react';
import './LandingPage.css';

const workflow = [
    { icon: Layers, title: 'Escolha suas cenas', description: 'Comece com um kit de cenas para abertura, gameplay, pausa e encerramento.' },
    { icon: SlidersHorizontal, title: 'Personalize no estúdio', description: 'Posicione câmeras, textos e widgets no canvas e ajuste as cores do seu overlay.' },
    { icon: Monitor, title: 'Adicione ao OBS', description: 'Copie o link do estúdio e cole em uma fonte de navegador no OBS ou Streamlabs.' },
];

export default function LandingPage() {
    return (
        <div className="qorp-home">
            <header className="qorp-home-bar">
                <a className="qorp-home-brand" href="/">
                    <img src="/favicon.svg" alt="" width="32" height="32" />
                    qorpStreamer
                </a>
                <nav aria-label="Navegação principal">
                    <a href="/templates/">Templates</a>
                    <a className="qorp-home-button qorp-home-outline" href="/?studio">Estúdio <ArrowUpRight size={16} aria-hidden="true" /></a>
                </nav>
            </header>
            <main className="qorp-home-main">
                <section className="qorp-home-hero">
                    <div>
                        <p className="qorp-home-label">Editor de overlays para OBS</p>
                        <h1>Crie o visual da sua live<span>.</span></h1>
                        <p className="qorp-home-lede">Monte cenas com câmeras, alertas e metas no navegador. Leve seu overlay para o OBS com um link.</p>
                        <div className="qorp-home-actions">
                            <a className="qorp-home-button" href="/?studio">Abrir estúdio <ArrowUpRight size={19} aria-hidden="true" /></a>
                            <a className="qorp-home-secondary" href="#como-funciona">Como funciona <ArrowDown size={16} aria-hidden="true" /></a>
                        </div>
                    </div>
                    <figure className="qorp-home-preview">
                        <img src="/screens/editor.jpg" width="1384" height="868" alt="Estúdio com ferramentas de edição ao lado de uma cena de gameplay" />
                        <figcaption>Editor de cenas do qorpStreamer</figcaption>
                    </figure>
                </section>

                <section className="qorp-home-workflow" id="como-funciona">
                    <h2>Do estúdio à transmissão</h2>
                    <div className="qorp-home-steps">
                        {workflow.map(({ icon: Icon, title, description }) => (
                            <article key={title}>
                                <Icon size={23} aria-hidden="true" />
                                <h3>{title}</h3>
                                <p>{description}</p>
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
                    <a className="qorp-home-button" href="/?studio&kit=kit-xaxinim">Usar este kit <ArrowUpRight size={19} aria-hidden="true" /></a>
                </section>
            </main>
            <footer className="qorp-home-bar">
                <span>qorpStreamer · Qorp</span>
                <nav aria-label="Links do produto">
                    <a href="/guides/add-overlay-to-obs/">Guia do OBS</a>
                    <a href="mailto:contato@qorp.com.br">Contato</a>
                    <a href="https://github.com/abhayraghuwanshi/overlay-studio" target="_blank" rel="noreferrer">Baseado no Overlay Studio</a>
                    <a href="https://github.com/Peterson047/overlay-studio" target="_blank" rel="noreferrer">Código-fonte (AGPL-3.0)</a>
                </nav>
            </footer>
        </div>
    );
}
