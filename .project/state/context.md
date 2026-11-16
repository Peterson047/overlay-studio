# Session Context

- **Goal**: Construir a primeira versão comercial do qorpStreamer seguindo docs/PRODUTO.md.
- **Phase**: Build — etapas 0 e 1
- **Status**:
  - Etapa 0: laboratório de widgets em `/?widgetlab` (src/components/WidgetLab.jsx, src/utils/widgetLab.js) e registro em docs/validacao/streamlabs.md. Aguardando o usuário rodar os 12 testes com Streamlabs no OBS.
  - Etapa 1: Vitest (tests/unit, tests/api com Redis falso), Playwright (tests/e2e, usa o dev server com API local) e CI em .github/workflows/ci.yml. Prioridade 1 coberta: layout.store, api/layout, sincronização para o player, player OBS. Faltam prioridade 2 (editor, widgets, Twitch) e 3 (capturas de referência dos templates, homepage).
  - LICENSE (AGPL-3.0), NOTICE.md e créditos adicionados. Falta tela Sobre no estúdio.
