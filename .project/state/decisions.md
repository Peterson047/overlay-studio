# Decision Log

| Timestamp | Topic | Selection | Rationale |
| --- | --- | --- | --- |
| 2026-11-16 | Público | Usuário: criadores individuais brasileiros usando OBS | Resposta à pergunta de público da primeira versão comercial |
| 2026-11-16 | Hospedagem | Usuário: Vercel | Direção explicitamente escolhida na conversa |
| 2026-11-16 | Integrações | Usuário: widgets externos genéricos, LivePix como exemplo | Evitar restringir o produto a um provedor ou exigir APIs nativas na primeira versão |
| 2026-11-16 | Acesso | Usuário: não perder acesso ao trabalho | Projetos vinculados à conta, recuperação, salvamento e migração são fundamentos |
| 2026-11-16 | Cobrança | Usuário: Stripe para futuros planos | Estruturar contratação e direitos de uso sem ativar cobrança nesta pesquisa |
| 2026-11-16 | Escopo da etapa | Proposta autônoma: especificação em Markdown | Pedido de pesquisa/estruturação antes de construir, sem alterações de runtime |
| 2026-11-16 | Autenticação | Proposta autônoma: Auth gerenciado e Postgres, candidato Supabase | Concentrar conta e persistência, com recuperação e propriedade por usuário |
| 2026-11-16 | Revisão técnica | Corrigida premissa temporal sobre WebSockets na Vercel | Documentação e anúncio oficial de 20/10/2026 confirmam suporte, com duração limitada e reconexão |
| 2026-11-16 | Revisão de migração | Nenhuma atribuição automática de dono por room | URL existente não comprova autoria; importar cópia com novo projeto e nova credencial |
| 2026-11-16 | Revisão de widgets | Prévia externa descarregada por padrão para áudio/alertas | Iframe genérico não garante silenciamento e testes no provedor podem alcançar o OBS |
| 2026-11-16 | Revisão de publicação | Congelar configuração das fontes e reconciliar estado ao vivo | Referências mutáveis poderiam alterar a publicação pelo rascunho; cenas removidas exigem fallback |
| 2026-11-16 | Revisão de cobrança | Separar primeira compra pendente de renovação atrasada | Carência não deve liberar benefícios antes de uma primeira compra confirmada |
| 2026-11-16 | Revisão de acesso | Distinguir revogação, perda de rede e acesso a mídias | Definir limite observável do player e não prometer recolher dados já entregues |
| 2026-11-16 | Auth e banco | Usuário: Supabase Auth + Postgres | Proposta anterior confirmada |
| 2026-11-16 | Lançamento | Usuário: beta gratuito, depois Pro | Stripe em modo teste no beta; Pro após piloto e custos |
| 2026-11-16 | Widgets etapa 0 | Usuário: Streamlabs primeiro | LivePix e StreamElements na sequência |
| 2026-11-16 | Retenção | Usuário: lixeira de 30 dias | Contas sem plano mantêm projetos no limite gratuito |
| 2026-11-16 | Planos | Proposta: Gratuito/Pro com widgets ilimitados e sem selo | Pro cobra armazenamento, histórico, kits premium e projetos; números a validar |
| 2026-11-16 | Downgrade | Proposta: carência de 7 dias, link OBS nunca cai por cobrança | Projetos excedentes ficam somente leitura, nada é apagado |
| 2026-11-16 | Exclusão de conta | Proposta: revogação imediata e 30 dias para desfazer | Exportação antes; registros fiscais mínimos retidos |
| 2026-11-16 | Pagamento | Proposta: cartão recorrente + Pix avulso para 12 meses | Stripe BR não oferece Pix Automático para empresas brasileiras |
| 2026-11-16 | Reembolso | Proposta: 7 dias de arrependimento (CDC art. 49), sem proporcional depois | Contestações Pix não podem ser contestadas; reembolso fácil reduz risco |
| 2026-11-16 | Etapa 0 | Protocolo de 12 testes com Alert Box, Goal, Chat Box e Event List do Streamlabs | Comparar Browser Source direto contra player qorp com iframe |
| 2026-11-16 | Domicílio | Usuário: empresa registrada no Brasil | Cartão recorrente; Pix só avulso (12 meses) |
| 2026-11-16 | Origem | Fork de abhayraghuwanshi/overlay-studio, AGPL-3.0 | Créditos no README, NOTICE, homepage e estúdio; política de marca do original respeitada |
| 2026-11-16 | Ordem | Usuário: etapa de testes e etapa de design system antes de contas | Proteger o sistema atual e construir telas novas já no visual final |
| 2026-11-16 | Licença | Usuário: seguir na AGPL-3.0 com repositório público | Pro vende o serviço, não código fechado |
| 2026-11-17 | Continuação | Retomar prioridade 2 da rede de testes registrada no estado atual | O commit ce335e3 já consolidou a especificação e iniciou etapas 0/1; preservar a ordem de testes e design system antes de contas |
| 2026-11-17 | Regressão de camadas | Corrigida inversão da lista de elementos em LayerStrip | Teste reproduziu lista em ordem oposta à renderização do canvas; índice 0 é a camada frontal |
| 2026-11-17 | Isolamento E2E | Interceptar recursos HTTP e WebSockets externos | Testes do editor e laboratório não devem depender da rede nem chamar provedores reais |
| 2026-11-17 | Login | Usuário: Google + e-mail e senha | Supabase Auth com PKCE; tela em /?conta |
| 2026-11-17 | Preview | Usuário: preview grátis sem conta; salvar e publicar exigem login | Preview só no navegador (localStorage); salas antigas ?room= continuam funcionando |
| 2026-11-17 | OBS WebSocket | Editor só conecta após opt-in; player no OBS sempre tenta | Evita erros de conexão em quem não usa o encaixe da câmera |
