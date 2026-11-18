# Lançamento da versão 1.0

Endereço: **https://stream.qorp.com.br** · Hospedagem: Vercel (projeto `overlay-studio`) · Cobrança: Stripe, como **pessoa física (CPF)**.

Siga na ordem. Cada passo diz quem faz. Nenhum segredo deve passar por chat, commit ou issue: as chaves vão direto nos painéis.

## 0. Antes de começar

- [x] **(Claude)** Todo o trabalho commitado na branch `produto-etapas-0-1` (commit `d4da269`), com `npm run check` e `npm run test:e2e` verdes.
- [ ] **(Você)** Conta Stripe **ativada** em modo live como pessoa física (dados pessoais, CPF, conta bancária para repasse). Isso pode levar alguns dias de análise do Stripe.

## 1. DNS (Cloudflare) — você

O domínio `stream.qorp.com.br` já está adicionado ao projeto na Vercel.

- [ ] No Cloudflare, em `qorp.com.br` → **DNS** → **Add record**:
  - Tipo `CNAME`, nome `stream`, destino `cname.vercel-dns.com`
  - **Proxy desligado** (nuvem cinza, "DNS only"). Com o proxy ligado, o certificado da Vercel não é emitido.
- [ ] Em alguns minutos a Vercel mostra o domínio como **Valid Configuration** (Project → Settings → Domains).

## 2. Supabase — você

- [ ] **SQL Editor** → rodar `supabase/migrations/202611170002_billing_grace_and_pix.sql` (a 001 já foi aplicada). Sem ela a cobrança falha.
- [ ] **Authentication → URL Configuration**:
  - **Site URL:** `https://stream.qorp.com.br`
  - **Redirect URLs:** manter `http://localhost:3377/?conta` e acrescentar `https://stream.qorp.com.br/?conta`
- [ ] **Authentication → Sign In / Providers:** Email continua **desligado**, Google **ligado**.

> Hoje o mesmo projeto Supabase serve desenvolvimento e produção. Depois do lançamento, não rode checkouts de teste do Stripe contra ele. Criar um projeto Supabase separado para desenvolvimento é a próxima melhoria.

## 3. Google Cloud (login) — você

Em **APIs e serviços**, no cliente OAuth usado pelo Supabase:

- [ ] **Origens JavaScript autorizadas:** acrescentar `https://stream.qorp.com.br`.
- [ ] **URIs de redirecionamento:** mantém só a Callback URL do Supabase (não muda).
- [ ] **Tela de consentimento OAuth → Branding:**
  - Nome do app: `qorpStreamer`
  - Logo: `public/brand/qorp-icon-512.png`
  - Página inicial: `https://stream.qorp.com.br`
  - Política de privacidade: `https://stream.qorp.com.br/?privacidade`
  - Termos de serviço: `https://stream.qorp.com.br/?termos`
  - Domínio autorizado: `qorp.com.br`
- [ ] **Publicar o app** (sair de "Em teste"). Com os escopos básicos (e-mail, perfil) não há revisão longa; a verificação da marca pode levar alguns dias, e o login funciona durante a análise.

## 4. Stripe em modo live — você

Produtos, preços, portal e webhooks do modo de teste **não** passam para o live. Refaça no modo live:

- [ ] **Settings → Public details:** nome `qorpStreamer`, descritor `QORPSTREAMER` (ou `STREAM.QORP.COM.BR`), site `https://stream.qorp.com.br`, e-mail de suporte `contato@qorp.com.br`, URLs dos termos e da privacidade.
- [ ] **Produto** `qorpStreamer Pro`, imagem `public/brand/qorp-pro-1024.png`:
  - preço mensal **R$ 24,90**, recorrente, lookup key `pro_monthly`
  - preço anual **R$ 249,00**, recorrente, lookup key `pro_yearly`
  - opcional: preço avulso de **R$ 249,00** para o Pix de 12 meses (se não criar, o código usa um valor fixo de R$ 249,00)
- [ ] **Settings → Payment methods:** cartão ligado. **Pix** ligado se disponível para a sua conta; ele só é usado no pagamento avulso de 12 meses.
- [ ] **Settings → Billing → Customer portal:** atualizar pagamento, faturas, cancelar **no fim do período**, trocar entre mensal e anual.
- [ ] **Developers → Webhooks → Add endpoint:**
  - URL: `https://stream.qorp.com.br/api/stripe-webhook`
  - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`
  - Copie o **Signing secret** (`whsec_…`) para o passo 5.
- [ ] **Developers → API keys:** copie a **Secret key** live (`sk_live_…`), ou crie uma **chave restrita** com acesso só a Checkout, Customers, Subscriptions, Prices, Billing Portal e Webhooks.

## 5. Variáveis na Vercel — você

Project → Settings → **Environment Variables**, ambiente **Production**. Variáveis `VITE_*` entram no código público do site; as demais ficam só no servidor.

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave publishable (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secret (`sb_secret_…`) — **Sensitive** |
| `STRIPE_SECRET_KEY` | `sk_live_…` (ou chave restrita) — **Sensitive** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` do endpoint live — **Sensitive** |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_…` mensal **live** |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `price_…` anual **live** |
| `STRIPE_PRO_PIX_PRICE_ID` | opcional, `price_…` avulso live |
| `STRIPE_ALLOW_LIVE` | `true` |
| `SITE_URL` | `https://stream.qorp.com.br` |
| `VITE_LEGAL_NAME` | seu nome completo |
| `VITE_LEGAL_DOC` | seu CPF, formatado (`000.000.000-00`) |
| `VITE_LEGAL_ADDRESS` | endereço para contato (pode ser comercial ou caixa postal) |
| `QORP_OWNER_EMAILS` / `QORP_OWNER_USER_IDS` | quem acessa os kits exclusivos (ex.: o dono do Xaxinim). Sem elas, esses kits ficam bloqueados para todos |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | já configuradas |

Não defina `VITE_LAYOUT_API` nem `VITE_ROOM` (são de desenvolvimento). `VERCEL_URL` a Vercel define sozinha.

Opcionais: `USAGE_KEY` (estatísticas por sala), `FOOTBALL_DATA_TOKEN` (placares reais), `VITE_GA_ID` (só se a Política de Privacidade for atualizada antes).

Para **Preview**, use as chaves de **teste** do Stripe e `STRIPE_ALLOW_LIVE=false`.

> O seu nome, CPF e endereço aparecem nos Termos e na Política, como exige o Decreto 7.962/2013 para vendas pela internet. Eles ficam fora do repositório público, mas ficam visíveis no site.
>
> Para não expor o CPF, a alternativa é abrir um **MEI** e usar o **CNPJ** em `VITE_LEGAL_DOC` (o rótulo muda sozinho para CNPJ) e na conta Stripe. Enquanto o Pro não cobra, nada disso é exigido.

## 6. Publicar — Claude, com a sua aprovação

- [ ] Abrir o PR `produto-etapas-0-1` → `main` e conferir o CI.
- [ ] Fazer o merge. A Vercel publica a `main` automaticamente.
- [ ] Conferir no painel da Vercel que o deploy de produção terminou sem erro.

## 7. Conferir em produção

- [ ] `https://stream.qorp.com.br` abre com cadeado (HTTPS) e logo novo.
- [ ] `/?termos` e `/?privacidade` mostram nome, CPF e endereço (sem `[colchetes]`).
- [ ] Entrar com Google → volta para `/?conta` logado.
- [ ] Preview grátis → **Salvar e publicar** → projeto criado na conta.
- [ ] **Publicar** → link do OBS → abrir no OBS (1920 × 1080) → overlay aparece.
- [ ] Assinar o Pro com um cartão real, de valor baixo se possível, e conferir:
  - a conta mostra **Pro** em até alguns segundos;
  - no Stripe, o webhook mostra entregas com **200**;
  - cancelar pelo portal → continua Pro até o fim do período;
  - reembolsar pelo Stripe (para não ficar com a cobrança de teste).
- [ ] Projetos antigos (`?room=`) continuam abrindo.

## Depois do lançamento

- Melhorias: commit em branch → PR → merge na `main` → deploy automático.
- Pendências conhecidas (PRODUTO.md, seção 14): rotina de limpeza de 30 dias, exclusão de conta pela tela, revisão jurídica dos textos, projeto Supabase separado para desenvolvimento.
