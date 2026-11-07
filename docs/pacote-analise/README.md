# Pacote de análise · integração com a consultoria (Fase 1)

O CMV Mestre troca dois arquivos JSON com a análise técnica feita no ChatGPT:

| Arquivo | Sentido | Formato | Onde é montado / conferido |
| --- | --- | --- | --- |
| Contexto | CMV Mestre → ChatGPT | `cmv-mestre.contexto` 1.0 | `lib/context.mjs` (botão "Exportar contexto para análise" na tela Implantação) |
| Pacote de análise | ChatGPT → CMV Mestre | `cmv-mestre.pacote-analise` 1.0 | `lib/package.mjs` (validador) |

Regra central: **o pacote recomenda, só a equipe executa.** O pacote não marca execução, não informa valor medido e não apaga nada; o que ele não cita continua como está.

## Arquivos desta pasta

- `pacote-analise.schema.json` — esquema oficial (JSON Schema 2020-12). Gerado por `node scripts/gerar-schema.mjs` a partir de `lib/package-schema.mjs`; um teste garante que está atualizado.
- `INSTRUCOES_CHATGPT.md` — instruções fixas para colar no ChatGPT.
- `exemplo-contexto.json` — exportação real do contexto, gerada do estado da produção em 07/11/2026 (`tests/fixtures/producao-2026-11-07.json`, sem dados sensíveis) por `node scripts/exemplo-contexto.mjs`.
- `exemplo-pacote.json` — pacote válido contra esse contexto (conteúdo ilustrativo).

## Conferir um pacote no computador

```bash
npm run validar-pacote -- pacote.json --contexto cmv-contexto-pizzaria-enrico-AAAA-MM-DD.json
```

Sai com código 0 quando o pacote é válido. Não acessa banco nem rede.

## O que o validador confere

- Estrutura: formato, versão, campos obrigatórios, listas fechadas, datas.
- Recomendação ≠ execução: campos de status, conclusão, critério cumprido, nível atual, valor medido ou exclusão são recusados em qualquer nível.
- Códigos: padrão por tipo, sem repetição, número da etapa no código da tarefa, critério com o código do dono, só etapas E1–E6.
- Referências e dependências: todo código citado existe no pacote ou no contexto; sem ciclos, sem dependência de etapa posterior ou de tarefa cancelada; dependência de controle com nível.
- Maturidade: controle não nasce antes do pré-requisito; tarefa não cria controle antes da etapa prevista nem depende de controle que só nasce depois; nível-alvo acima do observado; indicador não mede controle inexistente nem começa antes dele; nível divergente do sistema vira aviso (vale o sistema).
- Integridade com o sistema: assinatura do contexto, contexto atualizado, mesmo diagnóstico e estabelecimento, origem no último fechamento de fase, pacote repetido, etapa já concluída, possíveis duplicatas por título.
- Plano: o que seria criado, atualizado e o que não foi citado (fica como está).

`computePlanning` calcula a situação de cada tarefa (planejada, aguardando pré-requisito, liberada, concluída, cancelada), o atraso (só tarefa liberada com prazo aceito vencido) e o próximo passo.

## Ainda não existe (fases seguintes)

Tabelas, importação no banco, telas de importação e histórico, fechamento de fase, dashboard e relatório da fase. Nada disso foi criado na Fase 1.
