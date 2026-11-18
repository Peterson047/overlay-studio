# Rede de testes

Execute `npm run check` para lint, unidade/API e build. Execute `npm run test:e2e` para os fluxos no Chromium. A instalação do navegador é feita com `npx playwright install chromium`; no CI o workflow instala também as dependências do sistema.

## Cobertura atual

| Arquivo | Comportamento protegido |
| --- | --- |
| `unit/layout.store.test.js` | Persistência, versões e mesclagem do layout |
| `api/layout.test.js` | Contrato da API com Redis simulado |
| `unit/widgetLab.test.js` | Configuração e validação de URLs do laboratório |
| `unit/widgets.test.jsx` | Valores e limites das metas, relógio, countdown com offset/pausa, transições e recuperação de pomodoro |
| `unit/twitchChat.test.js` | Fixtures IRC, mensagens Unicode, eventos, moderação, agrupamento de presentes e histórico limitado |
| `unit/layers.test.jsx` | Ordem da lista de camadas consistente com o canvas |
| `e2e/editor.spec.js` | Colocar/mover/redimensionar, persistir/recarregar, duplicar, ordenar, ocultar/exibir/excluir, instalar Xaxinim, trocar suas nove cenas e aplicar tema |
| `e2e/smoke.spec.js` | Homepage, estúdio, transparência do player, sincronização e laboratório de widgets |

Os E2E usam salas únicas na API local do Vite, que grava em `.dev-layouts.json` ignorado pelo Git. Importar `test` de `e2e/fixtures.js` mantém o isolamento dos serviços externos: documentos externos recebem uma página simulada, outros recursos externos são bloqueados, assim como WebSockets fora do ambiente local. Isso não valida a compatibilidade real com Streamlabs, Twitch ou outros provedores.

O relógio dos testes de widgets é controlado. As fixtures IRC são sanitizadas e não exigem credenciais. A suíte de API não usa o Redis de produção.

## Pendências da etapa 1

- Referências visuais dos 65 templates, em ambiente de navegador/fontes reproduzível.
- Homepage com navegação e carregamento do estúdio sob demanda, além do smoke atual.
- Confirmar os checks obrigatórios na proteção da branch. Ter um workflow no repositório não configura essa proteção automaticamente.

Os testes reais de provedores externos no OBS seguem o protocolo de `docs/validacao/streamlabs.md` e não são substituídos pelas simulações.
