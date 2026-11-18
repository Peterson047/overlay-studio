// Termos de Uso e Política de Privacidade (pt-BR e en).
// Revisar com assessoria jurídica. A versão em português prevalece.
//
// The seller's identification (required on the site by Decreto 7.962/2013)
// comes from build-time env vars, so a personal CPF and address never land in
// this public repository:
//   VITE_LEGAL_NAME     full name (person) or company name
//   VITE_LEGAL_DOC      CPF or CNPJ, formatted
//   VITE_LEGAL_ADDRESS  contact address
const env = import.meta.env || {};
const doc = String(env.VITE_LEGAL_DOC || '').trim();
const digits = doc.replace(/\D/g, '');

export const UPDATED = '17/11/2026';
export const COMPANY = {
    name: String(env.VITE_LEGAL_NAME || '').trim() || '[NOME DO RESPONSÁVEL]',
    docLabel: digits.length === 14 ? 'CNPJ' : 'CPF',
    doc: doc || '[CPF]',
    address: String(env.VITE_LEGAL_ADDRESS || '').trim() || '[ENDEREÇO PARA CONTATO]',
    email: 'contato@qorp.com.br',
    privacyEmail: 'contato@qorp.com.br',
};
export const LEGAL_CONFIGURED = !!(env.VITE_LEGAL_NAME && env.VITE_LEGAL_DOC && env.VITE_LEGAL_ADDRESS);

const c = COMPANY;

const termsPt = {
    title: 'Termos de Uso',
    intro: `Estes Termos regulam o uso do qorpStreamer, operado por ${c.name}, ${c.docLabel} ${c.doc}, endereço para contato ${c.address} (“qorpStreamer”, “nós”). Ao entrar com sua conta ou usar o serviço, você concorda com estes Termos e com a [Política de Privacidade](/?privacidade).`,
    sections: [
        { id: 'servico', title: '1. O serviço', blocks: [
            { p: 'O qorpStreamer é um editor de overlays para transmissões ao vivo, usado no navegador e exibido em programas como o OBS por meio de um link.' },
            { p: 'O serviço está em **beta**: funcionalidades podem mudar, ser incluídas ou removidas, e pode haver instabilidades.' },
        ] },
        { id: 'conta', title: '2. Conta e acesso', blocks: [
            { ul: [
                'O acesso é feito com uma conta Google. Você é responsável pela segurança dessa conta.',
                'O preview grátis funciona sem conta e fica salvo apenas no seu navegador.',
                'Você precisa ter **18 anos** ou mais. Entre 13 e 17 anos, o uso depende da autorização e da supervisão do responsável legal. Menores de 13 anos não podem usar o serviço.',
                'Você deve fornecer informações verdadeiras e não pode usar a conta de outra pessoa.',
            ] },
        ] },
        { id: 'uso', title: '3. Uso aceitável', blocks: [
            { p: 'Você concorda em **não**:' },
            { ul: [
                'publicar conteúdo ilegal, discriminatório, que incite violência, de exploração sexual ou que viole direitos de terceiros;',
                'usar imagens, marcas, músicas ou textos sem ter o direito de usá-los;',
                'tentar acessar contas, projetos ou dados de outras pessoas, ou contornar limites e medidas de segurança;',
                'sobrecarregar, atacar ou automatizar o serviço de forma abusiva;',
                'revender o acesso ao serviço hospedado ou se apresentar como o qorpStreamer.',
            ] },
        ] },
        { id: 'conteudo', title: '4. Seu conteúdo', blocks: [
            { p: 'Os projetos, textos e imagens que você cria ou envia continuam sendo **seus**. Você nos concede apenas a licença necessária para armazenar, processar e exibir esse conteúdo para prestar o serviço a você, inclusive no link do OBS.' },
            { p: 'Você é o único responsável pelo conteúdo que exibe nas suas transmissões. Podemos remover conteúdo que viole estes Termos ou a lei.' },
            { p: 'Kits e temas de jogos ou de datas comemorativas são criações originais inspiradas nesses temas e **não têm afiliação** com os respectivos titulares.' },
        ] },
        { id: 'link', title: '5. Link do OBS', blocks: [
            { p: 'O link do OBS mostra o overlay publicado para quem o tiver. Mantenha-o em sigilo. Se ele vazar, gere um novo em [Meus projetos](/?conta). Não respondemos por exibições feitas por quem obteve o link a partir de você.' },
        ] },
        { id: 'terceiros', title: '6. Serviços de terceiros', blocks: [
            { p: 'O qorpStreamer se integra a serviços de terceiros, como Google, Twitch, OBS e provedores de widgets (por exemplo LivePix, Streamlabs e StreamElements). O uso desses serviços segue os termos de cada um, e não controlamos sua disponibilidade ou conteúdo.' },
        ] },
        { id: 'planos', title: '7. Planos e pagamentos', blocks: [
            { ul: [
                'O serviço em beta conta com um plano Gratuito (5 temas e kits base, até 2 projetos ativos) e o plano Pro pago (todos os temas e kits públicos, até 15 projetos ativos e histórico ampliado).',
                'O plano Pro é cobrado pelo Stripe via assinatura mensal recorrente no cartão. Os preços e limites são mostrados antes da contratação.',
                'Assinaturas no cartão renovam automaticamente até o cancelamento. Ao cancelar, o plano continua até o fim do período pago.',
                'Você pode desistir da primeira contratação em até **7 dias**, com reembolso integral, conforme o art. 49 do Código de Defesa do Consumidor.',
                'Mudanças de preço serão avisadas com pelo menos 30 dias de antecedência e valem a partir da renovação seguinte.',
                'Cancelar, deixar de pagar ou voltar ao plano gratuito **não apaga** seus projetos nem interrompe o link do OBS já publicado. Projetos acima dos limites gratuitos ficam somente para leitura.',
            ] },
        ] },
        { id: 'licenca', title: '8. Software livre e marca', blocks: [
            { p: 'O código do qorpStreamer é distribuído sob a licença **GNU AGPL-3.0** e deriva do [Overlay Studio](https://github.com/abhayraghuwanshi/overlay-studio). O [código-fonte](https://github.com/Peterson047/overlay-studio) é público.' },
            { p: 'A licença do código não inclui o direito de usar o nome, o logotipo e a identidade visual do qorpStreamer e da Qorp.' },
        ] },
        { id: 'disponibilidade', title: '9. Disponibilidade e responsabilidade', blocks: [
            { p: 'Trabalhamos para manter o serviço estável, mas ele é oferecido **no estado em que se encontra**, sem garantia de funcionamento ininterrupto ou livre de erros, especialmente durante o beta.' },
            { p: 'Na extensão permitida pela lei, não respondemos por lucros cessantes, perda de audiência ou danos indiretos decorrentes de falhas, interrupções ou de serviços de terceiros. Nada nestes Termos limita direitos que o Código de Defesa do Consumidor garante a você.' },
        ] },
        { id: 'encerramento', title: '10. Suspensão e encerramento', blocks: [
            { p: 'Você pode parar de usar o serviço e pedir a exclusão da conta a qualquer momento escrevendo para [contato@qorp.com.br](mailto:contato@qorp.com.br). Podemos suspender ou encerrar contas que violem estes Termos ou a lei, com aviso sempre que possível.' },
            { p: 'Após a exclusão, os dados são apagados conforme a [Política de Privacidade](/?privacidade). Antes de excluir, você pode pedir a exportação dos seus projetos.' },
        ] },
        { id: 'mudancas', title: '11. Mudanças nestes Termos', blocks: [
            { p: 'Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no serviço ou por e-mail com antecedência razoável. Continuar usando o serviço depois da vigência significa aceitar a nova versão.' },
        ] },
        { id: 'lei', title: '12. Lei aplicável e foro', blocks: [
            { p: 'Estes Termos seguem a legislação brasileira. Fica eleito o foro do domicílio do consumidor para resolver eventuais conflitos.' },
        ] },
        { id: 'contato', title: '13. Contato', blocks: [
            { p: `${c.name} · ${c.docLabel} ${c.doc} · ${c.address} · [${c.email}](mailto:${c.email})` },
        ] },
    ],
};

const privacyPt = {
    title: 'Política de Privacidade',
    intro: `Esta Política explica como o qorpStreamer, operado por ${c.name}, ${c.docLabel} ${c.doc} (controlador), trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD).`,
    sections: [
        { id: 'dados', title: '1. Dados que tratamos', blocks: [
            { ul: [
                '**Conta Google:** identificador da conta, e-mail, nome e foto, recebidos quando você entra com Google. Não recebemos sua senha do Google.',
                '**Projetos:** os overlays, textos, imagens e configurações que você cria, e o histórico de publicações.',
                '**Link do OBS:** guardamos apenas uma versão cifrada (hash) do código do link.',
                '**Pagamentos (planos pagos):** status da assinatura e identificadores do cliente no Stripe. Os dados do cartão são tratados pelo Stripe e **não chegam** até nós.',
                '**Uso:** contagem de acessos com um identificador aleatório gerado no seu navegador, sem nome ou e-mail.',
                '**Dados técnicos:** endereço IP, navegador e registros de acesso mantidos pelos nossos provedores de hospedagem para segurança e funcionamento.',
            ] },
        ] },
        { id: 'finalidades', title: '2. Para que usamos e com qual base legal', blocks: [
            { ul: [
                '**Criar e manter sua conta e seus projetos, publicar o overlay e processar planos:** execução de contrato (art. 7º, V).',
                '**Segurança, prevenção a fraudes e abusos, e métricas de uso agregadas para melhorar o serviço:** legítimo interesse (art. 7º, IX).',
                '**Guardar registros de acesso e documentos fiscais pelo tempo exigido:** cumprimento de obrigação legal (art. 7º, II), incluindo o Marco Civil da Internet.',
                '**Comunicações sobre o serviço** (mudanças, segurança, cobrança). Não enviamos marketing sem o seu consentimento.',
            ] },
            { p: 'Não vendemos dados pessoais e não os usamos para publicidade de terceiros.' },
        ] },
        { id: 'navegador', title: '3. Armazenamento no seu navegador', blocks: [
            { p: 'Usamos o armazenamento local do navegador (localStorage) para manter sua sessão, seu preview grátis, o idioma escolhido e preferências do estúdio. Esses dados ficam no seu dispositivo e você pode apagá-los limpando os dados do site.' },
            { p: 'Se no futuro usarmos ferramentas de análise com cookies, como o Google Analytics, esta Política será atualizada antes.' },
        ] },
        { id: 'compartilhamento', title: '4. Com quem compartilhamos', blocks: [
            { p: 'Usamos fornecedores que tratam dados em nosso nome (operadores), apenas para prestar o serviço:' },
            { ul: [
                '**Google:** login.',
                '**Supabase:** banco de dados e autenticação.',
                '**Vercel:** hospedagem do site e das APIs.',
                '**Upstash:** armazenamento das salas antigas e das métricas de uso.',
                '**Stripe:** pagamentos, quando houver planos pagos.',
            ] },
            { p: 'Ao usar recursos que você ativa, seu navegador também se conecta diretamente a terceiros: **Google Fonts** (fontes), **Twitch** (chat e alertas, de forma anônima) e provedores de widgets que você adicionar. Também podemos compartilhar dados quando a lei ou uma ordem judicial exigir.' },
        ] },
        { id: 'internacional', title: '5. Transferência internacional', blocks: [
            { p: 'Alguns fornecedores armazenam dados fora do Brasil. Essas transferências seguem a LGPD (art. 33), com fornecedores que adotam garantias contratuais e medidas de segurança adequadas.' },
        ] },
        { id: 'retencao', title: '6. Por quanto tempo guardamos', blocks: [
            { ul: [
                'Conta e projetos: enquanto a conta existir.',
                'Projetos excluídos: até 30 dias na lixeira, depois são apagados.',
                'Conta excluída: os dados são apagados em até 30 dias. Cópias de segurança expiram em seguida.',
                'Registros de acesso: pelo menos 6 meses, como exige o Marco Civil da Internet.',
                'Registros fiscais de pagamentos: pelo prazo da legislação tributária.',
            ] },
        ] },
        { id: 'direitos', title: '7. Seus direitos', blocks: [
            { p: 'Você pode pedir, a qualquer momento: confirmação e acesso aos dados, correção, anonimização ou eliminação, portabilidade (exportação dos projetos), informação sobre compartilhamento, e revisão de decisões automatizadas (art. 18). Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).' },
            { p: `Para exercer seus direitos, escreva para [${c.privacyEmail}](mailto:${c.privacyEmail}) a partir do e-mail da sua conta. Respondemos em até 15 dias.` },
        ] },
        { id: 'seguranca', title: '8. Segurança', blocks: [
            { p: 'Usamos conexões cifradas (HTTPS), controle de acesso por conta em cada operação, banco de dados sem acesso direto pelo navegador e links do OBS somente leitura e revogáveis. Nenhum sistema é totalmente seguro. Se houver um incidente relevante, avisaremos você e a ANPD conforme a lei.' },
        ] },
        { id: 'menores', title: '9. Crianças e adolescentes', blocks: [
            { p: 'O serviço não é destinado a menores de 13 anos. Adolescentes entre 13 e 17 anos só podem usar com autorização do responsável legal. Se identificarmos dados de menores sem essa autorização, eles serão excluídos.' },
        ] },
        { id: 'encarregado', title: '10. Canal de contato sobre dados', blocks: [
            { p: `Como agente de tratamento de pequeno porte, o qorpStreamer não indica um encarregado (Resolução CD/ANPD nº 2/2022) e mantém este canal para titulares e para a ANPD: [${c.privacyEmail}](mailto:${c.privacyEmail}) · ${c.name}, ${c.address}.` },
        ] },
        { id: 'mudancas', title: '11. Mudanças nesta Política', blocks: [
            { p: 'Podemos atualizar esta Política. A data no topo mostra a versão vigente. Mudanças relevantes serão avisadas no serviço ou por e-mail.' },
        ] },
    ],
};

const termsEn = {
    title: 'Terms of Use',
    intro: `These Terms govern your use of qorpStreamer, operated by ${c.name}, ${c.docLabel} ${c.doc}, contact address ${c.address} (“qorpStreamer”, “we”). By signing in or using the service you agree to these Terms and to the [Privacy Policy](/?privacidade). The Portuguese version prevails.`,
    sections: [
        { id: 'servico', title: '1. The service', blocks: [
            { p: 'qorpStreamer is a stream overlay editor used in the browser and shown in apps such as OBS through a link.' },
            { p: 'The service is in **beta**: features may change, be added or removed, and there may be instability.' },
        ] },
        { id: 'conta', title: '2. Account and access', blocks: [
            { ul: [
                'You sign in with a Google account and are responsible for keeping it secure.',
                'The free preview works without an account and is saved only in your browser.',
                'You must be **18 or older**. From 13 to 17, use requires a parent or guardian’s permission and supervision. Children under 13 may not use the service.',
                'Provide truthful information and do not use someone else’s account.',
            ] },
        ] },
        { id: 'uso', title: '3. Acceptable use', blocks: [
            { p: 'You agree **not** to:' },
            { ul: [
                'publish illegal, discriminatory, violent, sexually exploitative content or content that infringes others’ rights;',
                'use images, trademarks, music or text you have no right to use;',
                'try to access other people’s accounts, projects or data, or bypass limits and security measures;',
                'overload, attack or abusively automate the service;',
                'resell access to the hosted service or present yourself as qorpStreamer.',
            ] },
        ] },
        { id: 'conteudo', title: '4. Your content', blocks: [
            { p: 'Projects, text and images you create or upload remain **yours**. You grant us only the license needed to store, process and display that content to provide the service to you, including on the OBS link.' },
            { p: 'You alone are responsible for what you show on your streams. We may remove content that breaks these Terms or the law.' },
            { p: 'Game and holiday kits and themes are original works inspired by those themes and are **not affiliated** with their owners.' },
        ] },
        { id: 'link', title: '5. OBS link', blocks: [
            { p: 'The OBS link shows the published overlay to anyone who has it. Keep it private. If it leaks, create a new one in [My projects](/?conta). We are not responsible for displays by people who got the link from you.' },
        ] },
        { id: 'terceiros', title: '6. Third-party services', blocks: [
            { p: 'qorpStreamer works with third-party services such as Google, Twitch, OBS and widget providers (for example LivePix, Streamlabs and StreamElements). Their use follows their own terms, and we do not control their availability or content.' },
        ] },
        { id: 'planos', title: '7. Plans and payments', blocks: [
            { ul: [
                'During the beta the service offers a Free plan (5 base themes and kits, up to 2 active projects) and a paid Pro plan (all public themes and kits, up to 15 active projects and extended history).',
                'The Pro plan is billed through Stripe via a monthly recurring card subscription. Prices and limits are shown before you subscribe.',
                'Card subscriptions renew automatically until cancelled. When you cancel, the plan lasts until the end of the paid period.',
                'You may withdraw from your first purchase within **7 days** for a full refund, under article 49 of the Brazilian Consumer Code.',
                'Price changes are announced at least 30 days in advance and apply from the next renewal.',
                'Cancelling, failing to pay or returning to the free plan **does not delete** your projects or stop already published OBS links. Projects above free limits become read-only.',
            ] },
        ] },
        { id: 'licenca', title: '8. Free software and brand', blocks: [
            { p: 'qorpStreamer’s code is licensed under the **GNU AGPL-3.0** and derives from [Overlay Studio](https://github.com/abhayraghuwanshi/overlay-studio). The [source code](https://github.com/Peterson047/overlay-studio) is public.' },
            { p: 'The code license does not grant rights to the qorpStreamer and Qorp name, logo or visual identity.' },
        ] },
        { id: 'disponibilidade', title: '9. Availability and liability', blocks: [
            { p: 'We work to keep the service stable, but it is provided **as is**, with no guarantee of uninterrupted or error-free operation, especially during the beta.' },
            { p: 'To the extent allowed by law, we are not liable for lost profits, lost audience or indirect damages caused by failures, outages or third-party services. Nothing here limits your rights under the Brazilian Consumer Code.' },
        ] },
        { id: 'encerramento', title: '10. Suspension and termination', blocks: [
            { p: 'You can stop using the service and ask us to delete your account at any time by emailing [contato@qorp.com.br](mailto:contato@qorp.com.br). We may suspend or close accounts that break these Terms or the law, with notice whenever possible.' },
            { p: 'After deletion, data is erased as described in the [Privacy Policy](/?privacidade). You can ask for an export of your projects before deletion.' },
        ] },
        { id: 'mudancas', title: '11. Changes to these Terms', blocks: [
            { p: 'We may update these Terms. Material changes will be announced in the service or by email with reasonable notice. Continuing to use the service after they take effect means you accept the new version.' },
        ] },
        { id: 'lei', title: '12. Governing law', blocks: [
            { p: 'These Terms are governed by Brazilian law. Disputes will be handled in the courts of the consumer’s place of residence.' },
        ] },
        { id: 'contato', title: '13. Contact', blocks: [
            { p: `${c.name} · ${c.docLabel} ${c.doc} · ${c.address} · [${c.email}](mailto:${c.email})` },
        ] },
    ],
};

const privacyEn = {
    title: 'Privacy Policy',
    intro: `This Policy explains how qorpStreamer, operated by ${c.name}, ${c.docLabel} ${c.doc} (controller), handles personal data under Brazil’s General Data Protection Law (Law 13,709/2018, LGPD). The Portuguese version prevails.`,
    sections: [
        { id: 'dados', title: '1. Data we handle', blocks: [
            { ul: [
                '**Google account:** account ID, email, name and photo, received when you sign in with Google. We never receive your Google password.',
                '**Projects:** the overlays, text, images and settings you create, and your publish history.',
                '**OBS link:** we store only a hashed version of the link code.',
                '**Payments (paid plans):** subscription status and Stripe customer IDs. Card data is handled by Stripe and **never reaches** us.',
                '**Usage:** visit counts with a random ID created in your browser, with no name or email.',
                '**Technical data:** IP address, browser and access logs kept by our hosting providers for security and operation.',
            ] },
        ] },
        { id: 'finalidades', title: '2. Purposes and legal bases', blocks: [
            { ul: [
                '**Creating and keeping your account and projects, publishing your overlay and processing plans:** performance of a contract (art. 7, V).',
                '**Security, fraud and abuse prevention, and aggregate usage metrics to improve the service:** legitimate interest (art. 7, IX).',
                '**Keeping access logs and tax records for the required time:** legal obligation (art. 7, II), including Brazil’s Internet Civil Framework.',
                '**Service messages** (changes, security, billing). No marketing without your consent.',
            ] },
            { p: 'We do not sell personal data or use it for third-party advertising.' },
        ] },
        { id: 'navegador', title: '3. Storage in your browser', blocks: [
            { p: 'We use your browser’s local storage (localStorage) to keep your session, free preview, chosen language and studio preferences. That data stays on your device and you can delete it by clearing site data.' },
            { p: 'If we ever use analytics tools with cookies, such as Google Analytics, this Policy will be updated first.' },
        ] },
        { id: 'compartilhamento', title: '4. Who we share data with', blocks: [
            { p: 'We use providers that process data on our behalf (processors), only to run the service:' },
            { ul: [
                '**Google:** sign-in.',
                '**Supabase:** database and authentication.',
                '**Vercel:** hosting for the site and APIs.',
                '**Upstash:** storage for legacy rooms and usage metrics.',
                '**Stripe:** payments, when paid plans exist.',
            ] },
            { p: 'When you use features you turn on, your browser also connects directly to third parties: **Google Fonts** (fonts), **Twitch** (chat and alerts, anonymously) and any widget providers you add. We may also share data when required by law or court order.' },
        ] },
        { id: 'internacional', title: '5. International transfers', blocks: [
            { p: 'Some providers store data outside Brazil. These transfers follow the LGPD (art. 33), with providers that adopt contractual safeguards and appropriate security measures.' },
        ] },
        { id: 'retencao', title: '6. How long we keep data', blocks: [
            { ul: [
                'Account and projects: while the account exists.',
                'Deleted projects: up to 30 days in the trash, then erased.',
                'Deleted account: data erased within 30 days. Backups expire shortly after.',
                'Access logs: at least 6 months, as required by Brazil’s Internet Civil Framework.',
                'Payment tax records: for the period required by tax law.',
            ] },
        ] },
        { id: 'direitos', title: '7. Your rights', blocks: [
            { p: 'At any time you may ask for: confirmation of and access to your data, correction, anonymization or deletion, portability (export of your projects), information about sharing, and review of automated decisions (art. 18). You may also complain to Brazil’s data protection authority (ANPD).' },
            { p: `To exercise your rights, email [${c.privacyEmail}](mailto:${c.privacyEmail}) from your account email. We reply within 15 days.` },
        ] },
        { id: 'seguranca', title: '8. Security', blocks: [
            { p: 'We use encrypted connections (HTTPS), per-account access control on every operation, a database the browser cannot reach directly, and read-only, revocable OBS links. No system is fully secure. If a relevant incident occurs, we will notify you and the ANPD as required by law.' },
        ] },
        { id: 'menores', title: '9. Children and teenagers', blocks: [
            { p: 'The service is not meant for children under 13. Teenagers from 13 to 17 may only use it with a parent or guardian’s permission. If we find minors’ data without that permission, we will delete it.' },
        ] },
        { id: 'encarregado', title: '10. Data protection contact', blocks: [
            { p: `As a small-scale processing agent, qorpStreamer does not appoint a data protection officer (ANPD Resolution CD/ANPD 2/2022) and keeps this channel for data subjects and the ANPD: [${c.privacyEmail}](mailto:${c.privacyEmail}) · ${c.name}, ${c.address}.` },
        ] },
        { id: 'mudancas', title: '11. Changes to this Policy', blocks: [
            { p: 'We may update this Policy. The date at the top shows the current version. Material changes will be announced in the service or by email.' },
        ] },
    ],
};

export const LEGAL = {
    terms: { 'pt-BR': termsPt, en: termsEn },
    privacy: { 'pt-BR': privacyPt, en: privacyEn },
};
