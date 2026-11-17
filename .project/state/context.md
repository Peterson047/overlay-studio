# Session Context

- **Goal**: Construir a primeira versão comercial do qorpStreamer seguindo docs/PRODUTO.md.
- **Phase**: Build — etapas 0 e 1
- **Status**:
  - Etapa 0: laboratório de widgets em `/?widgetlab` (src/components/WidgetLab.jsx, src/utils/widgetLab.js) e registro em docs/validacao/streamlabs.md. Aguardando o usuário rodar os 12 testes com Streamlabs no OBS.
  - Etapa 1: Vitest (tests/unit, tests/api com Redis falso), Playwright (tests/e2e com API local) e CI em .github/workflows/ci.yml. Prioridades 1 e 2 cobertas: 91 testes de unidade/API e 10 E2E, incluindo gestos/persistência do editor, camadas, nove cenas Xaxinim, tema, relógio/metas/timers/pomodoro e IRC. Fix em LayerStrip alinha ordem ao canvas. Faltam prioridade 3 (capturas de referência de todos os templates e homepage ampliada) e confirmar checks obrigatórios na proteção da branch. Serviços externos HTTP/WS isolados nos E2E.
  - LICENSE (AGPL-3.0), NOTICE.md e créditos adicionados. Falta tela Sobre no estúdio.
  - 2026-11-17: contas funcionando (Google + e-mail) em /?conta; editor abre e salva ?project=<id>; botão Publicar no estúdio; player OBS em /?obs&project=<id>#t=<token>; troca de cena grava só em qorp_projects.live. Pendências: conflito 409 no modo projeto recarrega e pode perder a edição local; painel ao vivo para trocar cenas publicadas; Stripe; lixeira e renomear na tela de conta.
