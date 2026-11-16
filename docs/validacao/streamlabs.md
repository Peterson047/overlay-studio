# Validação de widgets — Streamlabs (etapa 0)

Protocolo completo em [PRODUTO.md, seção 12](../PRODUTO.md). **Nunca cole aqui URLs de widget, tokens ou links do laboratório**: eles dão acesso aos widgets da conta.

## Como montar

1. Rode o app (`npm run dev`) ou use um deploy de preview da Vercel.
2. Abra `/?widgetlab`, cole a URL de exibição do widget do Streamlabs e ajuste o tamanho original (o tamanho configurado no Streamlabs).
3. **Montagem A:** no OBS, adicione a URL do widget direto como Browser Source.
4. **Montagem B:** clique em **Copiar link do OBS** e adicione esse link como Browser Source 1920×1080, sem CSS personalizado.
5. Para o teste 8, preencha **Trocar cena a cada** (ex.: 20 s) antes de copiar o link.
6. No OBS, ative **Controlar áudio pelo OBS** nas duas fontes para medir o áudio no mixer.

> Atenção: alertas de teste disparados no Streamlabs aparecem em **todas** as fontes abertas com aquele widget, inclusive a de uma live em andamento.

## Ambiente

| Campo | Valor |
| --- | --- |
| Data | |
| Sistema operacional | |
| CPU / GPU | |
| Versão do OBS | |
| Endereço do player (local ou preview) | |
| Conta / canal de teste | (só o nome, nunca a URL) |

## Resultados

Legenda: ✅ passou · ❌ falhou · ⚠️ parcial · — não se aplica

| # | Teste | Alert Box A | Alert Box B | Goal A | Goal B | Chat Box A | Chat Box B | Event List A | Event List B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Carrega sem login | | | | | | | | |
| 2 | Iframe permitido | — | | — | | — | | — | |
| 3 | Transparência | | | | | | | | |
| 4 | Evento de teste aparece | | | | | | | | |
| 5 | Áudio toca uma vez | | | — | — | — | — | — | — |
| 6 | Sem áudio duplicado | | | — | — | — | — | — | — |
| 7 | Fonte oculta (fila ou perde) | | | | | | | | |
| 8 | Troca de cena sem recarregar | — | | — | | — | | — | |
| 9 | Tempo de recarga | | | | | | | | |
| 10 | Rede caída por 30 s | | | | | | | | |
| 11 | Escala (800×600 em 400×300) | — | | — | | — | | — | |
| 12 | 4 horas: CPU / memória início → fim | | | | | | | | |

## Observações

Descreva aqui cada ⚠️ e ❌: o que aconteceu, mensagens do console (F12 no laboratório, ou o log do OBS) e se o comportamento é igual na montagem A.

## Resultado

- [ ] **Validado:** Alert Box e Goal passam em todos os testes na montagem B (7 e 8 podem ser parciais se iguais à A).
- [ ] **Não incorporável:** teste 2 falhou → Streamlabs usa Browser Source separado no OBS.
- [ ] **Parcial:** limitação documentada acima, decidir se é aceitável.
