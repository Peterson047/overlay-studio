# Handoff — qorpStreamer

Atualizado em 17/11/2026 pela sessão do Gemini (Antigravity), após concluir as **Etapas 2, 3, 5 e 7** (Design System + i18n do estúdio, catálogo Gratuito vs. Pro com 5 temas grátis, isolamento proprietário do Xaxinim, cobrança Stripe Sandbox com plano Pro mensal, gestão completa de projetos em `/?conta`, histórico de versões/rollback e Painel Ao Vivo de cenas).

Leituras obrigatórias para o próximo agente, nesta ordem:

1. Este arquivo (`docs/HANDOFF.md`).
2. [`docs/PRODUTO.md`](PRODUTO.md): a especificação comercial completa do produto (especialmente seções 5, 7, 8, 10, 12 e 14).
3. [`.project/state/context.md`](../.project/state/context.md) e [`.project/state/decisions.md`](../.project/state/decisions.md): estado atual e registro das decisões tomadas pelo usuário. Não reabra decisões já tomadas.
4. [`tests/README.md`](../tests/README.md): convenções da suíte de testes.

---

## 1. Estado do repositório

- **Branch:** `produto-etapas-0-1` (ainda não enviada ao GitHub).
- **Não faça `git commit` nem `git push` sem pedido explícito do usuário.**
- **Validação atual (100% verde):**
  - `npm run check` → `eslint .` (0 erros) + `vitest run` (**11 arquivos, 133 testes passando**) + `vite build` + `scripts/seo-pages.mjs` (20 páginas estáticas + hub).
  - `npm run test:e2e` → `playwright test` (**20 testes E2E passando** em `tests/e2e/smoke.spec.js` e `tests/e2e/editor.spec.js`).

---

## 2. O que foi entregue nesta sessão

### A. Etapa 2 — Design System & Internacionalização do Estúdio (Concluída)
- **Design System (`src/ui/index.jsx`, `src/ui/ui.css`, `src/ui/tokens.css`):**
  - Adicionados variantes e tamanhos (`size="sm"`, `variant="soft"`, `variant="ghost"`) em `Button`, `IconButton` e `SegmentButton`, além de classes utilitárias baseadas em tokens (`.qs-toolcard`, `.qs-shape-btn`, `.qs-scene-trigger`, `.qs-scene-row`, `.qs-inline-link`, `.qs-layercard`, `.qs-layerbtn`, `.qs-floating-panel`, `.qs-floating-head`, `.qs-floating-title`, `.qs-subhead`, `.qs-tile`, `.qs-switch`, `.qs-frame-btn`, `.qs-callout`).
- **Todos os painéis e barras do estúdio migrados para `src/ui/` + tokens `--qs-*` + `tx()` / `useI18n()`:**
  - `src/components/LayersPanel.jsx` (painel esquerdo Adicionar à cena + seletor de cenas + busca bilíngue pt-BR/en)
  - `src/components/LayerStrip.jsx` (faixa de camadas abaixo do canvas, acessível por teclado)
  - `src/components/BackgroundPanel.jsx` (painel de fundo)
  - `src/components/CameraEditor.jsx` (editor de câmera + WebSocket OBS com textos alinhados à Central de Ajuda: `Conectar ao OBS` / `Desligar`)
  - `src/components/HelpPanel.jsx` (guia do estúdio + nova aba **Sobre / About** com créditos AGPL-3.0 ao Overlay Studio e link para `https://github.com/Peterson047/overlay-studio`)
  - `src/components/ThemePanel.jsx` (seletor de temas, packs, cores, fontes, arredondamento e gráficos)
  - `src/components/LayoutGallery.jsx` (galeria de layouts salvos e modelos com filtro por categoria traduzido)
  - `src/components/DraggableBox.jsx`, `src/components/elementCatalog.jsx`, `src/components/Showcase.jsx`
  - `src/components/OverlayLayout.jsx` (barra superior do modo de edição, dock ao vivo, banners e toasts)
- **Zero índigo herdado:** todas as ocorrências de `#818cf8`, `#6366f1`, `rgba(99,102,241,…)`, `#a5b4fc`, `#c7d2fe`, `#4f46e5` e `rgba(165,180,252,…)` foram removidas dos controles do estúdio.
- **Correções de UX no estúdio:**
  - O banner `Preview grátis.` desce automaticamente abaixo da barra superior quando o editor está aberto (`top: inEditor ? editorHeaderHeight + 10 : 12`).
  - O botão `?` da barra inferior (dock) navega para `/?ajuda`.

### B. Modo Beta, Catálogo Gratuito vs. Pro (5 Temas Grátis) & Isolamento do Xaxinim
- **Regras de catálogo e planos (`src/theme/entitlements.js`):**
  - **Gratuito:** apenas os **5 temas base** (`midnight`, `neon`, `minimal`, `warm`, `aurora`) e seus kits correspondentes (`midnight-pro`, `neon-arcade`, `mono-podcast`, `warm-studio`, `aurora-glow`, mais os 5 `THEME_PACKS`), até **2 projetos ativos** e histórico das **últimas 5 revisões**.
  - **Pro:** todos os demais **57 temas** e **59 kits** públicos (marcados com selo `PRO` na homepage, no `ThemePanel` e na `LayoutGallery`), até **15 projetos ativos** e histórico das **últimas 50 revisões**.
- **Preview-first Pro gating:**
  - Qualquer visitante em `/?studio` ou usuário no editor pode aplicar e testar temas/kits Pro ao vivo no canvas.
  - Salvar na conta ou publicar no OBS um layout com tema/kit Pro exige plano Pro ativo, validado no servidor (`api/projects.js` e `api/project-layout.js` via `assertDraftAllowed` em `server/project-layout.js`, retornando `403 PRO_REQUIRED`).
  - Em `src/auth/pendingImport.js`, `peekImport()` + `clearImport()` garantem que uma falha `403 PRO_REQUIRED` ao importar o preview após login não apaga o rascunho do `localStorage`.
- **Xaxinim restrito ao proprietário:**
  - `xaxinim-vice`, `kit-xaxinim`, `vicedusk` e `/brand/xaxinim.png` foram removidos das listagens públicas (`THEMES`, `STARTER_LAYOUTS`, `BACKDROPS`, `HERO_THEMES`) e bloqueados no servidor com `403 OWNER_ONLY` para não-proprietários.
  - Contas proprietárias são configuradas por variáveis de ambiente no servidor (`QORP_OWNER_EMAILS` / `QORP_OWNER_USER_IDS`).

### C. Etapa 7 — Pagamentos Stripe Sandbox (Plano Pro Mensal)
- **Backend Stripe (`server/stripe.js`, `api/billing.js`, `api/stripe-webhook.js`):**
  - Trava de segurança que bloqueia chaves `sk_live_` e eventos `livemode: true` enquanto `STRIPE_ALLOW_LIVE` não for `'true'`.
  - Criação de sessão de Checkout (`POST /api/billing`, `action: 'checkout'`, `plan: 'monthly'`) usando `STRIPE_PRO_MONTHLY_PRICE_ID` e sessão do **Customer Portal** (`action: 'portal'`).
  - Reconciliação automática do `session_id` no retorno do Checkout (`GET /api/billing?session_id=cs_...`), permitindo testar compras em `localhost:3377` mesmo sem o Stripe CLI (`stripe listen`) aberto, além do webhook assinado e idempotente em `/api/stripe-webhook` (`qorp_stripe_events` + `qorp_billing`).
  - Carência de 7 dias em `past_due`, preservação de links OBS publicados após cancelamento/downgrade e marcação dos projetos excedentes como `readOnly` (mantendo os 2 mais recentes editáveis no plano Gratuito).
  - Migração adicional em `supabase/migrations/202611170002_billing_grace_and_pix.sql` (com fallback automático em `upsertBillingRow` caso a migração 0002 ainda não tenha sido rodada no Supabase).
- **Decisão comercial vigente na UI:** por orientação do usuário (`"plano por enquanto vai ser só mensal"`), a interface em `/?conta`, a Central de Ajuda e os Termos de Uso exibem apenas a opção **Pro mensal (`R$ 24,90/mês`)** no cartão + Portal Stripe.

### D. Etapas 3 e 5 — Gestão Completa em `/?conta`, Histórico de Versões & Painel Ao Vivo
- **Na página `/?conta` (`src/components/AccountPage.jsx` + `api/projects.js`):**
  - **Renomear** projeto inline (`action: 'rename'`);
  - **Duplicar** projeto (`action: 'duplicate'`);
  - **Exportar JSON** sanitizado (`action: 'export'`) e **Importar JSON** (upload de arquivo `.json` / `.qorp.json`);
  - **Desativar link do OBS** imediatamente (`action: 'revoke'`);
  - **Mover para a lixeira (30 dias)** (`action: 'trash'`) e seção **Lixeira (30 dias)** com **Restaurar projeto** (`action: 'restore'`);
  - **Painel Ao Vivo (`LiveScenesPanel`):** abre em qualquer projeto publicado (ou direto por `/?conta&ao-vivo=<id>`), lista as cenas publicadas com botões de `48px`, indica a cena **`NO AR`** (`activeSceneId`) e alterna cenas em tempo real (`action: 'scene'`) gravando apenas em `qorp_projects.live`;
  - **Histórico de versões publicadas (`RevisionHistoryPanel`):** lista as revisões publicadas (`últimas 5` no Gratuito / `50` no Pro), destaca a versão **`ATUAL NO OBS`** e permite restaurar qualquer versão anterior (`action: 'rollback'`) sem sobrescrever o rascunho, reconciliando automaticamente `activeSceneId` se uma cena deixou de existir.

---

## 3. O que falta fazer (Próximas Etapas)

| Prioridade | Etapa / Item | O que fazer |
|---|---|---|
| **1** | **Etapa 4 — Indicador de salvamento e conflito 409 entre abas** | No topo de `OverlayLayout.jsx`, exibir o estado real de salvamento (`Salvando…`, `Salvo na conta`, `Salvo neste navegador`, `Sem conexão`, `Falha ao salvar`). No modo projeto (`?project=`), quando um `POST /api/project-layout` retornar `409` (outra aba salvou uma revisão mais nova), não descartar silenciosamente a edição local: oferecer recarregar a versão do servidor ou salvar o estado local como cópia/novo projeto. |
| **2** | **Etapa 4 — Mídia fora do JSON (Vercel Blob)** | Hoje imagens enviadas viram base64 dentro do JSON (`src/utils/imageScale.js`), limitando o projeto a 2 MB e duplicando imagens em cada revisão. Implementar upload autenticado para Vercel Blob (ou Supabase Storage), guardando apenas a referência de mídia e respeitando os limites por plano (250 MB Gratuito / 5 GB Pro; 10 MB / 50 MB por arquivo). |
| **3** | **Etapa 6 — Elemento de Widget Externo no estúdio** | Integrar o elemento `external` (URL de widget do Streamlabs, LivePix, StreamElements, etc., já validado por `validateWidgetUrl` em `src/utils/widgetLab.js` e `server/project-layout.js`) ao catálogo do editor (`elementCatalog.jsx`, `ElementEditor.jsx`, `ElementRenderer.jsx`), com prévia de alertas/áudio descarregada por padrão e instruções de Browser Source separado quando o provedor bloquear iframe. |
| **4** | **Etapa 0 — Protocolo prático com Streamlabs no OBS** | Depende de execução manual pelo usuário no OBS Studio com uma conta Streamlabs de teste, preenchendo os 12 testes em `docs/validacao/streamlabs.md`. |
| **5** | **Rotina de purga de 30 dias & Exclusão self-service de conta** | Criar endpoint/cron para remover definitivamente projetos na lixeira há mais de 30 dias e adicionar o fluxo de exclusão de conta com janela de 30 dias em `/?conta` (PRODUTO.md, seção 8). |
| **6** | **Configurações operacionais antes de produção** | 1) Rodar `supabase/migrations/202611170002_billing_grace_and_pix.sql` no SQL Editor do Supabase; 2) Desativar provedor Email no painel do Supabase (deixar apenas Google); 3) Preencher `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO COMPLETO]` e `[NOME DO ENCARREGADO]` em `src/components/legal/content.js`. |

---

## 4. Regras inegociáveis do projeto

1. **Segredos apenas em `.env.local`:** nunca coloque chaves ou valores reais em `.env.example`, código, testes ou logs.
2. **Stripe em modo Sandbox (`STRIPE_ALLOW_LIVE=false`):** nunca use chaves `sk_live_`. Por decisão do usuário, a UI exibe apenas o plano **Pro mensal** (`R$ 24,90/mês`).
3. **Xaxinim é exclusivo do proprietário:** nunca exiba `kit-xaxinim` / `xaxinim-vice` em galerias públicas, capturas, vitrines ou exemplos.
4. **Licença AGPL-3.0:** mantenha `LICENSE`, `NOTICE.md`, créditos ao Overlay Studio (Abhay Raghuwanshi) e link público do código-fonte.
5. **Login apenas com Google:** não adicione formulários de e-mail/senha.
6. **Servidor na porta 3377:** se já houver um processo rodando em `http://localhost:3377`, reutilize-o; nunca mate processos do usuário.
7. **Git:** só execute `git commit` ou `git push` quando o usuário pedir explicitamente.

## Notas de revisão (Claude, 17/11)

- `src/components/SettingsModal.jsx` não é importado em lugar nenhum (sobra do companheiro de IA local do projeto original). Pode ser removido; não vale migrar.
- A migração `supabase/migrations/202611170002_billing_grace_and_pix.sql` ainda não está aplicada no Supabase.
- `QORP_OWNER_EMAILS` / `QORP_OWNER_USER_IDS` vazios bloqueiam o Xaxinim para todos, inclusive para o dono.
- Playwright limitado a 4 workers: com mais, o dev server único fica sobrecarregado e os testes do editor estouram o tempo.
