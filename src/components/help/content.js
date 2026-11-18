// Help center content (pt-BR / en). Inline markup: **bold** and [text](href).
// Keep every answer true to what ships today; mark future things as such.

const pt = {
    meta: {
        eyebrow: 'Central de ajuda',
        title: 'Como usar o qorpStreamer',
        lede: 'Guia rápido, documentação e respostas para as dúvidas mais comuns.',
        search: 'Buscar na ajuda',
        searchPlaceholder: 'Ex.: link do OBS, câmera, publicar…',
        noResults: 'Nada encontrado para “{q}”. Tente outra palavra ou escreva para [contato@qorp.com.br](mailto:contato@qorp.com.br).',
        onThisPage: 'Nesta página',
        quickTitle: 'Guia rápido',
        docsTitle: 'Documentação',
        faqTitle: 'Perguntas frequentes',
        fullTutorial: 'Ver o tutorial passo a passo',
        stillStuck: 'Não achou o que precisava?',
        stillStuckText: 'Escreva para [contato@qorp.com.br](mailto:contato@qorp.com.br). Respondemos em português.',
        openStudio: 'Abrir o estúdio',
        linkTo: 'Link para',
        legal: 'Leia também os [Termos de Uso](/?termos) e a [Política de Privacidade](/?privacidade).',
    },
    quick: [
        { title: 'Abra o estúdio', text: 'Entre em [/?studio](/?studio). Não precisa de conta para testar. Escolha um kit de cenas na galeria.' },
        { title: 'Personalize', text: 'Clique em **Editar layout**, adicione elementos pela lista e arraste no canvas. Tudo salva sozinho.' },
        { title: 'Entre com Google', text: 'Clique em **Salvar e publicar**. Depois do login, o que você montou vira um projeto na sua conta.' },
        { title: 'Publique', text: 'Clique em **Publicar**. Na primeira vez, o link do OBS é copiado. Guarde-o.' },
        { title: 'Adicione ao OBS', text: 'Em **Fontes → + → Navegador**, cole o link e use **1920 × 1080**.' },
    ],
    docs: [
        {
            id: 'preview',
            title: 'Preview e projetos',
            blocks: [
                { p: 'O estúdio abre como **preview grátis**, sem conta. O preview fica salvo **só neste navegador** e não tem link do OBS.' },
                { p: 'Ao entrar, o preview vira um **projeto** da sua conta. Projetos abrem em qualquer computador, em [Meus projetos](/?conta).' },
                { note: 'No plano **Gratuito**, cada conta tem até **2 projetos** e acesso aos **5 temas e kits base**. No plano **Pro**, você cria até **15 projetos** e usa todos os temas e kits.' },
            ],
        },
        {
            id: 'cenas',
            title: 'Kits e cenas',
            blocks: [
                { p: 'Um **kit** é um conjunto de cenas com o mesmo visual: abertura, gameplay, conversa, pausa, encerramento e outras.' },
                { p: 'Troque de cena no seletor de cenas, na barra inferior do estúdio. Cada cena tem seus próprios elementos.' },
            ],
        },
        {
            id: 'editor',
            title: 'Editar',
            blocks: [
                { ul: [
                    '**Adicionar:** clique num elemento da lista e depois clique ou arraste no canvas.',
                    '**Mover e redimensionar:** arraste o elemento e use os cantos.',
                    '**Camadas:** mude a ordem, oculte ou exclua elementos na lista de camadas.',
                    '**Temas e fundos:** troque o visual da cena inteira de uma vez.',
                ] },
                { p: 'O estúdio salva sozinho enquanto você edita. Essas mudanças ficam no **rascunho**.' },
            ],
        },
        {
            id: 'publicar',
            title: 'Rascunho e publicação',
            blocks: [
                { p: 'O OBS mostra sempre a **última versão publicada**, nunca o rascunho. Assim você pode editar durante a live sem que nada mude na tela.' },
                { p: 'Quando estiver pronto, clique em **Publicar** no estúdio. O OBS atualiza sozinho em poucos segundos, sem trocar o link.' },
            ],
        },
        {
            id: 'link',
            title: 'Link do OBS',
            blocks: [
                { ul: [
                    'Cada projeto tem **um link do OBS**. Ele só permite **ver** o overlay publicado: não edita nada e não dá acesso à sua conta.',
                    'O link aparece **uma única vez**, quando é gerado. Guarde-o.',
                    'Perdeu ou vazou? Em [Meus projetos](/?conta), clique em **Novo link do OBS**. O antigo para na hora; cole o novo no OBS.',
                    'O mesmo link funciona em mais de um computador.',
                ] },
            ],
        },
        {
            id: 'obs',
            title: 'Configurar o OBS',
            blocks: [
                { ol: [
                    'Em **Fontes**, clique em **+ → Navegador**.',
                    'Cole o link no campo **URL**.',
                    'Use **Largura 1920** e **Altura 1080**, e deixe o **CSS personalizado** vazio.',
                    'Coloque a fonte **acima** do jogo e da câmera.',
                ] },
                { note: 'Também funciona no Streamlabs Desktop, XSplit, Meld Studio e em qualquer programa com fonte de navegador.' },
            ],
        },
        {
            id: 'camera',
            title: 'Câmera',
            blocks: [
                { p: 'A câmera é uma fonte do próprio OBS (**Dispositivo de captura de vídeo**), colocada **abaixo** do overlay, dentro da moldura.' },
                { p: '**Encaixe automático (opcional):** ligue no OBS **Ferramentas → Configurações do servidor WebSocket** (porta 4455). No estúdio, selecione a moldura da câmera e clique em **Conectar ao OBS**.' },
            ],
        },
        {
            id: 'widgets',
            title: 'Chat, alertas e metas',
            blocks: [
                { ul: [
                    '**Chat e alertas da Twitch:** informe o nome do canal no elemento. É só leitura e não pede login na Twitch.',
                    '**Metas:** o valor é atualizado à mão no painel do elemento.',
                    '**Widgets de outros serviços** (LivePix, Streamlabs, StreamElements): adicione o link deles como **outra fonte de navegador** no OBS, sobre o overlay.',
                ] },
                { note: 'Estamos testando como colocar widgets de outros serviços direto no estúdio.' },
            ],
        },
        {
            id: 'conta',
            title: 'Conta e login',
            blocks: [
                { p: 'O login é **só com Google**. O primeiro login cria a conta. Não há senha para lembrar ou vazar.' },
                { p: 'Guardamos o e-mail, o nome e a foto da sua conta Google, e os seus projetos. O link do OBS não dá acesso a nada disso.' },
            ],
        },
        {
            id: 'planos',
            title: 'Planos',
            blocks: [
                { p: 'O qorpStreamer está em **beta** e oferece o plano **Gratuito** (5 temas e kits base: Midnight, Neon, Minimal, Warm e Aurora; até 2 projetos ativos; histórico das últimas 5 revisões) e o plano **Pro** (todos os temas e kits; até 15 projetos ativos; histórico de 50 revisões).' },
                { p: 'Você pode testar qualquer tema ou kit Pro no preview grátis em [/?studio](/?studio). Para salvar na conta ou publicar no OBS um projeto com tema Pro, assine o **Pro mensal** pelo cartão (**R$ 24,90/mês**). Se um dia você cancelar, seus projetos continuam na conta e o link do OBS não para.' },
            ],
        },
        {
            id: 'codigo',
            title: 'Código aberto',
            blocks: [
                { p: 'O qorpStreamer é um fork do [Overlay Studio](https://github.com/abhayraghuwanshi/overlay-studio), de Abhay Raghuwanshi, e é distribuído sob a licença **AGPL-3.0**. O [código-fonte](https://github.com/Peterson047/overlay-studio) é público.' },
            ],
        },
    ],
    faq: [
        ['É grátis?', 'Sim: o plano Gratuito inclui 5 temas e kits base e até 2 projetos ativos. Todos os demais temas e kits podem ser testados no preview e fazem parte do plano Pro mensal (R$ 24,90/mês). Nada é cobrado sem você assinar.'],
        ['Preciso instalar alguma coisa?', 'Não. O estúdio roda no navegador e o overlay entra no OBS por uma fonte de navegador.'],
        ['Funciona na Twitch, YouTube e Kick?', 'Sim. O overlay vai para o OBS, então funciona em qualquer plataforma para a qual o OBS transmite.'],
        ['Funciona no Streamlabs Desktop, XSplit ou Meld?', 'Sim, em qualquer programa que tenha fonte de navegador.'],
        ['Por que o login é só com Google?', 'Assim não existe senha para esquecer, vazar ou recuperar. Outras formas de entrar podem vir no futuro.'],
        ['Editei, mas o OBS não mudou.', 'As edições ficam no rascunho. Clique em **Publicar** no estúdio.'],
        ['Perdi o link do OBS.', 'Em [Meus projetos](/?conta), clique em **Novo link do OBS** e cole o novo no OBS. O antigo deixa de funcionar.'],
        ['O OBS mostra uma tela vazia.', 'O projeto pode não ter sido publicado, ou o link foi trocado. Publique de novo e, se gerou um link novo, atualize a URL no OBS.'],
        ['O overlay aparece cortado ou pequeno.', 'Confira se a fonte de navegador está em **1920 × 1080** e se a tela base do OBS também está em 1920 × 1080.'],
        ['Perdi o que fiz no preview.', 'O preview fica só no navegador onde foi feito. Limpar os dados do site ou usar outro navegador começa do zero. Entre para salvar na conta.'],
        ['Posso usar o mesmo link em dois computadores?', 'Sim. O link do OBS funciona em quantos computadores você quiser.'],
        ['Aparecem erros de “WebSocket 4455” no navegador.', 'É o encaixe automático da câmera tentando falar com o OBS. Ligue o servidor WebSocket no OBS ou clique em **Desligar** no painel da câmera.'],
        ['Posso compartilhar meu overlay com outra pessoa?', 'Ainda não existe compartilhamento de modelos. Não envie o link do OBS: ele mostra o seu overlay para quem tiver o link.'],
        ['Como excluo minha conta?', 'Por enquanto, escreva para [contato@qorp.com.br](mailto:contato@qorp.com.br) a partir do e-mail da conta. A exclusão pela própria conta está a caminho.'],
        ['O que acontece com meus dados?', 'Guardamos só o necessário para a conta funcionar: e-mail, nome e foto do Google, e seus projetos. Não vendemos dados. Detalhes na [Política de Privacidade](/?privacidade).'],
        ['Quem é dono do overlay que eu crio?', 'Você. Seus projetos, textos e imagens continuam sendo seus. Veja os [Termos de Uso](/?termos).'],
        ['Posso usar imagens e músicas de outras pessoas?', 'Só se você tiver o direito de usá-las. Você é responsável pelo que aparece na sua live.'],
    ],
};

const en = {
    meta: {
        eyebrow: 'Help center',
        title: 'How to use qorpStreamer',
        lede: 'Quick start, documentation and answers to common questions.',
        search: 'Search help',
        searchPlaceholder: 'e.g. OBS link, camera, publish…',
        noResults: 'Nothing found for “{q}”. Try another word or email [contato@qorp.com.br](mailto:contato@qorp.com.br).',
        onThisPage: 'On this page',
        quickTitle: 'Quick start',
        docsTitle: 'Documentation',
        faqTitle: 'FAQ',
        fullTutorial: 'See the step-by-step tutorial',
        stillStuck: "Didn't find what you need?",
        stillStuckText: 'Email [contato@qorp.com.br](mailto:contato@qorp.com.br).',
        openStudio: 'Open the studio',
        linkTo: 'Link to',
        legal: 'See also the [Terms of Use](/?termos) and the [Privacy Policy](/?privacidade).',
    },
    quick: [
        { title: 'Open the studio', text: 'Go to [/?studio](/?studio). No account needed to try it. Pick a scene kit from the gallery.' },
        { title: 'Customize', text: 'Click **Edit layout**, add elements from the list and drag them on the canvas. It saves by itself.' },
        { title: 'Sign in with Google', text: 'Click **Save and publish**. After signing in, what you built becomes a project in your account.' },
        { title: 'Publish', text: 'Click **Publish**. The first time, the OBS link is copied. Keep it.' },
        { title: 'Add it to OBS', text: 'In **Sources → + → Browser**, paste the link and use **1920 × 1080**.' },
    ],
    docs: [
        {
            id: 'preview',
            title: 'Preview and projects',
            blocks: [
                { p: 'The studio opens as a **free preview**, no account needed. The preview is saved **only in this browser** and has no OBS link.' },
                { p: 'When you sign in, the preview becomes a **project** in your account. Projects open on any computer from [My projects](/?conta).' },
                { note: 'On the **Free** plan each account has up to **2 projects** with the **5 base themes and kits**. The **Pro** plan unlocks up to **15 projects** and all themes and kits.' },
            ],
        },
        {
            id: 'cenas',
            title: 'Kits and scenes',
            blocks: [
                { p: 'A **kit** is a set of scenes with the same look: starting, gameplay, chatting, break, ending and more.' },
                { p: 'Switch scenes with the scene picker in the studio bottom bar. Each scene has its own elements.' },
            ],
        },
        {
            id: 'editor',
            title: 'Editing',
            blocks: [
                { ul: [
                    '**Add:** click an element in the list, then click or drag on the canvas.',
                    '**Move and resize:** drag the element and use its corners.',
                    '**Layers:** reorder, hide or delete elements in the layer list.',
                    '**Themes and backgrounds:** change the look of the whole scene at once.',
                ] },
                { p: 'The studio saves by itself while you edit. Those changes go to the **draft**.' },
            ],
        },
        {
            id: 'publicar',
            title: 'Draft and publishing',
            blocks: [
                { p: 'OBS always shows the **latest published version**, never the draft. You can edit during a stream and nothing changes on screen.' },
                { p: 'When it is ready, click **Publish** in the studio. OBS updates by itself within seconds, with the same link.' },
            ],
        },
        {
            id: 'link',
            title: 'OBS link',
            blocks: [
                { ul: [
                    'Each project has **one OBS link**. It can only **show** the published overlay: it edits nothing and gives no access to your account.',
                    'The link is shown **only once**, when it is created. Keep it.',
                    'Lost or leaked? In [My projects](/?conta), click **New OBS link**. The old one stops right away; paste the new one into OBS.',
                    'The same link works on more than one computer.',
                ] },
            ],
        },
        {
            id: 'obs',
            title: 'Setting up OBS',
            blocks: [
                { ol: [
                    'In **Sources**, click **+ → Browser**.',
                    'Paste the link into **URL**.',
                    'Use **Width 1920** and **Height 1080**, and leave **Custom CSS** empty.',
                    'Place the source **above** your game and camera.',
                ] },
                { note: 'Also works in Streamlabs Desktop, XSplit, Meld Studio and any app with a browser source.' },
            ],
        },
        {
            id: 'camera',
            title: 'Camera',
            blocks: [
                { p: 'Your camera is an OBS source (**Video Capture Device**) placed **below** the overlay, inside the frame.' },
                { p: '**Auto-fit (optional):** in OBS, turn on **Tools → WebSocket Server Settings** (port 4455). In the studio, select the camera frame and click **Connect to OBS**.' },
            ],
        },
        {
            id: 'widgets',
            title: 'Chat, alerts and goals',
            blocks: [
                { ul: [
                    '**Twitch chat and alerts:** enter the channel name on the element. Read-only, no Twitch login needed.',
                    '**Goals:** the value is updated by hand in the element panel.',
                    '**Widgets from other services** (LivePix, Streamlabs, StreamElements): add their link as **another browser source** in OBS, above the overlay.',
                ] },
                { note: 'We are testing how to bring other services’ widgets straight into the studio.' },
            ],
        },
        {
            id: 'conta',
            title: 'Account and sign-in',
            blocks: [
                { p: 'Sign-in is **Google only**. Your first sign-in creates the account. There is no password to remember or leak.' },
                { p: 'We store your Google email, name and photo, and your projects. The OBS link gives no access to any of that.' },
            ],
        },
        {
            id: 'planos',
            title: 'Plans',
            blocks: [
                { p: 'qorpStreamer is in **beta** and offers a **Free** plan (5 base themes and kits: Midnight, Neon, Minimal, Warm and Aurora; up to 2 active projects; last 5 revisions) and a **Pro** plan (all themes and kits; up to 15 active projects; last 50 revisions).' },
                { p: 'You can test any Pro theme or kit in the free preview at [/?studio](/?studio). To save or publish a Pro theme or kit to OBS, subscribe to **Pro monthly** by card (**R$ 24.90/mo**). If you ever cancel, your projects stay in your account and your OBS link keeps working.' },
            ],
        },
        {
            id: 'codigo',
            title: 'Open source',
            blocks: [
                { p: 'qorpStreamer is a fork of [Overlay Studio](https://github.com/abhayraghuwanshi/overlay-studio) by Abhay Raghuwanshi, licensed under **AGPL-3.0**. The [source code](https://github.com/Peterson047/overlay-studio) is public.' },
            ],
        },
    ],
    faq: [
        ['Is it free?', 'Yes: the Free plan includes 5 base themes and kits and up to 2 active projects. All other themes and kits can be tested in the preview and are part of the Pro monthly plan (R$ 24.90/mo). Nothing is charged unless you subscribe.'],
        ['Do I need to install anything?', 'No. The studio runs in your browser and the overlay goes into OBS as a browser source.'],
        ['Does it work on Twitch, YouTube and Kick?', 'Yes. The overlay goes into OBS, so it works on any platform OBS streams to.'],
        ['Does it work in Streamlabs Desktop, XSplit or Meld?', 'Yes, in any app with a browser source.'],
        ['Why is sign-in Google only?', 'So there is no password to forget, leak or recover. More sign-in options may come later.'],
        ["I edited, but OBS didn't change.", 'Edits go to the draft. Click **Publish** in the studio.'],
        ['I lost my OBS link.', 'In [My projects](/?conta), click **New OBS link** and paste the new one into OBS. The old one stops working.'],
        ['OBS shows a blank screen.', 'The project may not be published yet, or the link was replaced. Publish again and, if you made a new link, update the URL in OBS.'],
        ['The overlay looks cropped or small.', 'Check that the browser source is **1920 × 1080** and that the OBS base canvas is also 1920 × 1080.'],
        ['I lost what I built in the preview.', 'The preview lives only in the browser where you made it. Clearing site data or using another browser starts fresh. Sign in to save it to your account.'],
        ['Can I use the same link on two computers?', 'Yes. The OBS link works on as many computers as you want.'],
        ['I see “WebSocket 4455” errors in the browser.', 'That is the camera auto-fit trying to reach OBS. Turn on the WebSocket server in OBS or click **Turn off** in the camera panel.'],
        ['Can I share my overlay with someone?', "Template sharing doesn't exist yet. Don't send your OBS link: anyone with it can see your overlay."],
        ['How do I delete my account?', 'For now, email [contato@qorp.com.br](mailto:contato@qorp.com.br) from your account email. Self-service deletion is on the way.'],
        ['What happens to my data?', 'We only keep what the account needs: your Google email, name and photo, and your projects. We do not sell data. Details in the [Privacy Policy](/?privacidade).'],
        ['Who owns the overlay I create?', 'You do. Your projects, text and images stay yours. See the [Terms of Use](/?termos).'],
        ['Can I use other people’s images and music?', 'Only if you have the right to use them. You are responsible for what appears on your stream.'],
    ],
};

export default { 'pt-BR': pt, en };
