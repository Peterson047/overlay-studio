# Publicar o qorpStreamer na Vercel

O frontend usa Vite. As rotas `/api/layout`, `/api/scores` e `/api/usage` são
Vercel Functions. Layouts, cenas e estado ao vivo ficam no Upstash Redis.

## Configurar o projeto

1. Importe o repositório na Vercel e selecione o preset **Vite** e Node.js **22.x**.
2. Use `npm run build` como comando de build e `dist` como diretório de saída.
   O arquivo `vercel.json` já declara esses valores.
3. Crie um banco Upstash Redis e configure as variáveis abaixo na Vercel.
4. Configure as variáveis para o ambiente desejado e faça um novo deployment
   após alterá-las. Use bancos separados para Preview e Production.

| Variável | Uso |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | URL REST do banco |
| `UPSTASH_REDIS_REST_TOKEN` | Token com permissão de leitura e escrita |
| `SITE_URL` | Opcional — URL pública com `https://` para sitemap/canonical (sobrescreve o domínio automático `VERCEL_PROJECT_PRODUCTION_URL`) |
| `FOOTBALL_DATA_TOKEN` | Opcional, habilita placares reais |
| `FOOTBALL_DATA_COMPETITION` | Opcional, código da competição, padrão `WC` |

A API também aceita `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
As credenciais do Redis devem ficar nas variáveis do servidor.
Variáveis com prefixo `VITE_` são incluídas no código público do frontend.

A configuração normal usa frontend e API no mesmo domínio. Para uma API
hospedada separadamente, defina `VITE_LAYOUT_API=https://seu-dominio/api`.

## Conferir o deployment

1. Abra a homepage, entre no estúdio e aplique um template.
2. Clique em **Go Live** para criar a sala e copiar o link OBS.
3. Edite um texto e recarregue o editor. Confira se a alteração foi salva.
4. Abra o link OBS em outra janela e troque a cena no editor.
5. Adicione o link como fonte de navegador no OBS, com 1920 × 1080.

O editor usa `/?room=<sala>`. A fonte OBS usa `/?obs&room=<sala>`.
O parâmetro `obs` ativa a saída de transmissão.

Uma resposta 500 em `/api/layout` ou `/api/usage` pode indicar credenciais
ausentes ou inválidas. Consulte os logs da Function na Vercel.
Sem token de futebol, `/api/scores` fornece dados demonstrativos.

## Desenvolvimento e validação

Use Node.js 22.12 ou superior dentro da série 22.

```sh
npm ci
npm run dev
npm run check
```

O servidor Vite grava os dados locais em `.dev-layouts.json` e
`.dev-usage.json`. Para testar as Functions no runtime da Vercel, use
`vercel dev` com as variáveis de um banco de desenvolvimento.

O backend em `backend/` atende recursos locais, como modelos de IA e controle
do OBS. A publicação na Vercel serve o editor, os overlays e as APIs de dados.
Câmeras e captura de tela devem ser adicionadas como fontes nativas no OBS.

## Modelo atual de acesso

A sala é identificada por um endereço compartilhável. Quem tem seu identificador
consegue consultar e modificar seus dados pela API. O produto ainda precisa de
contas, autorização por proprietário e controle de acesso para uma operação
comercial com projetos privados.

Referências oficiais — [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite) e [Functions Node.js](https://vercel.com/docs/functions/runtimes/node-js).
