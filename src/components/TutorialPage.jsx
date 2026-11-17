// Tutorial em português: do preview ao OBS. Rota: /?tutorial
import { ArrowUpRight } from 'lucide-react';
import './LandingPage.css';
import './TutorialPage.css';

const sections = [
    { id: 'preview', title: '1. Teste no preview' },
    { id: 'conta', title: '2. Crie sua conta e salve' },
    { id: 'editar', title: '3. Edite suas cenas' },
    { id: 'publicar', title: '4. Publique' },
    { id: 'obs', title: '5. Adicione ao OBS' },
    { id: 'camera', title: '6. Câmera' },
    { id: 'widgets', title: '7. Alertas e doações de outros serviços' },
    { id: 'link', title: '8. Cuide do link do OBS' },
    { id: 'problemas', title: 'Problemas comuns' },
];

export default function TutorialPage() {
    return (
        <div className="qorp-home">
            <header className="qorp-home-bar">
                <a className="qorp-home-brand" href="/">
                    <img src="/favicon.svg" alt="" width="32" height="32" />
                    qorpStreamer
                </a>
                <nav aria-label="Navegação principal">
                    <a href="/?conta">Entrar</a>
                    <a className="qorp-home-button" href="/?studio">Experimentar grátis <ArrowUpRight size={16} aria-hidden="true" /></a>
                </nav>
            </header>

            <main className="qorp-home-main qt-layout">
                <aside className="qt-toc" aria-label="Neste tutorial">
                    <p className="qorp-home-label">Neste tutorial</p>
                    <ol>
                        {sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
                    </ol>
                </aside>

                <article className="qt-body">
                    <p className="qorp-home-label">Tutorial</p>
                    <h1>Do preview à sua live no OBS</h1>
                    <p className="qorp-home-lede">
                        Em uns 10 minutos você monta um overlay, salva na conta e coloca no OBS.
                        Você só precisa do navegador e do OBS Studio instalado.
                    </p>

                    <section id="preview">
                        <h2>1. Teste no preview</h2>
                        <p>Abra o <a href="/?studio">estúdio</a>. Não precisa de cadastro.</p>
                        <ul>
                            <li>Escolha um kit de cenas na galeria (abertura, gameplay, conversa, pausa e encerramento).</li>
                            <li>Tudo o que você faz no preview fica salvo <strong>só neste navegador</strong>. Ninguém mais vê.</li>
                            <li>No preview não existe link para o OBS. Para isso, salve na conta.</li>
                        </ul>
                    </section>

                    <section id="conta">
                        <h2>2. Crie sua conta e salve</h2>
                        <p>
                            No estúdio, clique em <strong>Salvar e publicar</strong> (ou em <strong>Entrar e salvar</strong>, na faixa do topo).
                            Entre com <strong>Google</strong> ou com <strong>e-mail e senha</strong>.
                        </p>
                        <ul>
                            <li>O que você montou no preview vira um projeto na sua conta e abre de novo no estúdio.</li>
                            <li>Seus projetos ficam em <a href="/?conta">Meus projetos</a> e abrem em qualquer computador.</li>
                            <li>Esqueceu a senha? Use <strong>Esqueci a senha</strong> na tela de entrada. Seus projetos continuam lá.</li>
                            <li>Durante o beta a conta é grátis, com até 2 projetos.</li>
                        </ul>
                    </section>

                    <section id="editar">
                        <h2>3. Edite suas cenas</h2>
                        <ul>
                            <li><strong>Adicionar:</strong> escolha um elemento (texto, imagem, meta, relógio, chat…) e clique ou arraste no canvas.</li>
                            <li><strong>Mover e redimensionar:</strong> arraste o elemento e use os cantos.</li>
                            <li><strong>Camadas:</strong> mude a ordem, oculte ou exclua elementos na lista de camadas.</li>
                            <li><strong>Temas:</strong> troque as cores e o estilo do overlay inteiro de uma vez.</li>
                            <li><strong>Cenas:</strong> cada cena do kit é uma tela da sua live. Selecione uma para editá-la.</li>
                        </ul>
                        <p className="qt-note">
                            O estúdio salva sozinho enquanto você edita. Essas mudanças ficam no <strong>rascunho</strong> e ainda não aparecem no OBS.
                        </p>
                    </section>

                    <section id="publicar">
                        <h2>4. Publique</h2>
                        <p>Quando o rascunho estiver pronto, clique em <strong>Publicar</strong> no estúdio.</p>
                        <ul>
                            <li>Na primeira publicação, o estúdio copia o <strong>link do OBS</strong>. Guarde-o: ele só aparece nessa hora.</li>
                            <li>Nas próximas publicações o link continua o mesmo, e o OBS atualiza sozinho em poucos segundos.</li>
                            <li>Editar o rascunho nunca muda a sua live até você publicar de novo.</li>
                        </ul>
                    </section>

                    <section id="obs">
                        <h2>5. Adicione ao OBS</h2>
                        <ol>
                            <li>No OBS, em <strong>Fontes</strong>, clique em <strong>+ → Navegador</strong>.</li>
                            <li>Cole o link do OBS no campo <strong>URL</strong>.</li>
                            <li>Use <strong>Largura 1920</strong> e <strong>Altura 1080</strong>.</li>
                            <li>Deixe o campo <strong>CSS personalizado</strong> vazio.</li>
                            <li>Clique em <strong>OK</strong> e coloque essa fonte <strong>acima</strong> do jogo e da câmera.</li>
                        </ol>
                        <p className="qt-note">
                            Funciona também no Streamlabs Desktop, XSplit, Meld Studio e qualquer programa com fonte de navegador.
                        </p>
                    </section>

                    <section id="camera">
                        <h2>6. Câmera</h2>
                        <p>
                            A câmera é uma fonte do próprio OBS. Adicione um <strong>Dispositivo de captura de vídeo</strong> <strong>abaixo</strong> do overlay
                            e posicione-a dentro da moldura da câmera.
                        </p>
                        <p>
                            <strong>Encaixe automático (opcional):</strong> no OBS, ligue <strong>Ferramentas → Configurações do servidor WebSocket</strong>
                            (porta 4455). No estúdio, selecione a moldura da câmera e clique em <strong>Conectar ao OBS</strong>.
                            A câmera passa a se encaixar sozinha na moldura quando a cena muda.
                        </p>
                    </section>

                    <section id="widgets">
                        <h2>7. Alertas e doações de outros serviços</h2>
                        <p>
                            Se você usa alertas, metas ou chat de serviços como LivePix, Streamlabs ou StreamElements, adicione o link do widget
                            como <strong>outra Fonte de navegador</strong> no OBS, posicionada sobre o overlay.
                        </p>
                        <p className="qt-note">
                            Estamos testando a incorporação desses widgets direto no estúdio. Enquanto isso, as metas do qorpStreamer são atualizadas
                            manualmente no painel do elemento.
                        </p>
                    </section>

                    <section id="link">
                        <h2>8. Cuide do link do OBS</h2>
                        <ul>
                            <li>O link dá acesso apenas para <strong>ver</strong> o overlay publicado. Ele não permite editar nem entrar na sua conta.</li>
                            <li>Mesmo assim, não compartilhe o link: quem tiver o link vê o seu overlay.</li>
                            <li>Se o link vazar ou se perder, abra <a href="/?conta">Meus projetos</a> e clique em <strong>Novo link do OBS</strong>.
                                O link antigo para na hora; cole o novo no OBS.</li>
                        </ul>
                    </section>

                    <section id="problemas">
                        <h2>Problemas comuns</h2>
                        <dl>
                            <dt>O overlay aparece cortado ou pequeno no OBS</dt>
                            <dd>Confira se a fonte de navegador está em 1920 × 1080 e se a tela base do OBS também está em 1920 × 1080.</dd>
                            <dt>Editei, mas o OBS não mudou</dt>
                            <dd>As edições ficam no rascunho. Clique em <strong>Publicar</strong> no estúdio.</dd>
                            <dt>O OBS mostra uma tela vazia</dt>
                            <dd>O projeto pode não ter sido publicado ainda, ou o link foi trocado. Publique e, se gerou um link novo, atualize a URL no OBS.</dd>
                            <dt>Perdi o que fiz no preview</dt>
                            <dd>O preview fica só no navegador onde foi feito. Limpar os dados do site ou usar outro navegador começa do zero. Salve na conta para não perder.</dd>
                            <dt>Aparecem erros de “WebSocket 4455” no navegador</dt>
                            <dd>É o encaixe automático da câmera tentando falar com o OBS. Ligue o servidor WebSocket no OBS ou clique em <strong>Desligar</strong> no painel da câmera.</dd>
                        </dl>
                        <p>Ainda com dúvida? Escreva para <a href="mailto:contato@qorp.com.br">contato@qorp.com.br</a>.</p>
                    </section>

                    <div className="qorp-home-actions">
                        <a className="qorp-home-button" href="/?studio">Abrir o estúdio <ArrowUpRight size={19} aria-hidden="true" /></a>
                        <a className="qorp-home-button qorp-home-outline" href="/?conta&criar">Criar conta grátis</a>
                    </div>
                </article>
            </main>

            <footer className="qorp-home-bar">
                <span>qorpStreamer · Qorp</span>
                <nav aria-label="Links do produto">
                    <a href="/">Início</a>
                    <a href="mailto:contato@qorp.com.br">Contato</a>
                    <a href="https://github.com/Peterson047/overlay-studio" target="_blank" rel="noreferrer">Código-fonte (AGPL-3.0)</a>
                </nav>
            </footer>
        </div>
    );
}
