# Session Context

- **Goal**: Construir a primeira versão comercial do qorpStreamer seguindo `docs/PRODUTO.md` e `docs/HANDOFF.md`.
- **Phase**: Build — Etapas 1, 2, 3, 5 e 7 concluídas; próximas: Etapa 4 (indicador de salvamento, conflito 409 e mídia fora do JSON) e Etapa 6 (elemento de widget externo no editor).
- **Status**:
  - **Suíte de verificação (100% verde):** `npm run check` (`eslint .` + **133 testes Vitest** em 11 arquivos + `vite build` + `seo-pages`) e `npm run test:e2e` (**20 testes Playwright**).
  - **Etapa 0:** laboratório de widgets em `/?widgetlab` (`src/components/WidgetLab.jsx`, `src/utils/widgetLab.js`) e protocolo em `docs/validacao/streamlabs.md`. Aguardando o usuário rodar os 12 testes práticos no OBS.
  - **Etapa 2 (Design System e i18n do estúdio — concluída):** todos os painéis e barras do estúdio (`ElementEditor`, `LayersPanel`, `LayerStrip`, `BackgroundPanel`, `CameraEditor`, `HelpPanel` com aba **Sobre** AGPL-3.0, `ThemePanel`, `LayoutGallery`, `DraggableBox`, `Showcase` e cabeçalho/dock de `OverlayLayout`) migrados para `src/ui/` + tokens `--qs-*` e traduzidos via `tx()` + `src/i18n/studio-pt.js`. Zero índigo herdado; banner `Preview grátis.` abaixo da barra superior no modo edição; botão `?` do dock abrindo `/?ajuda`.
  - **Catálogo Beta Gratuito vs. Pro & Isolamento Xaxinim (concluído):** apenas 5 temas/kits base gratuitos (`midnight`, `neon`, `minimal`, `warm`, `aurora`); demais 57 temas e 59 kits públicos marcados como `PRO` (liberados para teste no preview e exigindo Pro no servidor para salvar/publicar). `Xaxinim` (`kit-xaxinim`, `xaxinim-vice`, `vicedusk`, `/brand/xaxinim.png`) ocultado do público e restrito a contas em `QORP_OWNER_EMAILS` / `QORP_OWNER_USER_IDS`.
  - **Etapa 7 (Stripe Sandbox — concluída):** implementada em `server/stripe.js`, `api/billing.js`, `api/stripe-webhook.js` e `AccountPage.jsx`. Na UI pública (`/?conta`, Ajuda e Termos), apenas o plano **Pro mensal (`R$ 24,90/mês`)** + Customer Portal está ativo por decisão do usuário, com reconciliação automática do `session_id` no retorno do Checkout e webhooks idempotentes.
  - **Etapas 3 e 5 (Gestão de projetos em `/?conta`, histórico de versões e Painel Ao Vivo — concluídas):** renomear inline, duplicar, exportar/importar JSON, revogar link do OBS, lixeira de 30 dias com restauração, histórico de versões publicadas com `rollback` no OBS e **Painel Ao Vivo** (`/?conta` e `/?conta&ao-vivo=<id>`) para trocar cenas publicadas em tempo real (`action: 'scene'`).
  - **Falta fazer:**
    1. Etapa 4: indicador visual de salvamento no topo do estúdio + tratamento não-destrutivo de conflito `409` entre abas + upload de mídia fora do JSON (Vercel Blob).
    2. Etapa 6: integrar o elemento de Widget Externo por URL (`type: 'external'`) à caixa de ferramentas e ao painel de propriedades do editor.
    3. Rotina de purga automática da lixeira (30 dias) e preenchimento dos dados da empresa em `src/components/legal/content.js`.
