# Auditoria e sprint operacional · CMV Mestre · 04/11/2026

Branch: `claude/project-thread-lmukz7` (a partir do PR #1). Nada foi mesclado em `main`, nenhuma migration foi aplicada no Supabase de produção e nenhum dado foi gravado na produção.

## Limite desta auditoria

O arquivo `Especificacao_Oficial_CMV_Mestre.txt` **não foi encontrado** no repositório, em nenhuma branch, nem nos arquivos do projeto. A matriz abaixo foi montada a partir do pedido do sprint, das regras de produto, do README e das decisões já gravadas no código e no banco (etapas, roteiro de 15 tópicos, metodologia, primeira visita diagnóstica). Quando a especificação for enviada, a matriz precisa ser conferida item a item contra ela.

## Legenda

- **Testado**: implementado e testado ponta a ponta (navegador e/ou banco local).
- **Parcial**: implementado em parte.
- **Só banco**: existe apenas no banco de dados.
- **Só visual**: existe apenas na interface, sem persistência.
- **Não implementado**.
- **Bloqueado**: depende de configuração ou autorização.

## Matriz de requisitos

| # | Requisito | Antes do sprint | Agora | Evidência |
|---|---|---|---|---|
| 1 | Login com e-mail e senha | Parcial (sem mensagens em português, sem recuperar senha) | Testado | e2e: senha errada, criação de conta, entrada; integração: login |
| 2 | Persistência de sessão | Parcial (padrão do Supabase, não verificado) | Testado | e2e: recarregar mantém sessão; sair encerra |
| 3 | Recuperação de senha | Não implementado | Parcial | Fluxo no app; envio de e-mail depende do SMTP do Supabase (não testado) |
| 4 | Carregar a Pizzaria Enrico | Parcial (pegava o primeiro registro) | Testado | Seleção por preferência salva, depois por nome; contrato 19/10/2026 a 18/04/2027 exibido |
| 5 | Vários estabelecimentos por organização | Não implementado | Parcial | Seletor aparece quando há mais de um; não há tela para cadastrar outro |
| 6 | Diagnóstico: salvar respostas | Parcial (salvava, sem visita, sem edição clara) | Testado | e2e e integração |
| 7 | Diagnóstico: editar respostas | Parcial (sobrescrevia sem histórico) | Testado | Histórico de versões por resposta (gatilho no banco) |
| 8 | Diagnóstico: classificar respostas | Só banco (status de evidência sem tela) | Testado | Grau de confirmação (confirmada/declarada/hipótese/pendente) e situação (crítico/atenção/adequado/não se aplica) |
| 9 | Registro de visitas | Não implementado | Testado | Tabela `visits`; criar, editar, concluir, reabrir |
| 10 | Histórico de visitas | Não implementado | Testado | Lista por data, respostas e arquivos vinculados à visita |
| 11 | Upload de fotos e documentos | Só banco (bucket e tabela sem tela) | Testado | Upload, link assinado de 2 minutos, exclusão |
| 12 | Armazenamento privado | Só banco | Testado | Bucket não público; outra empresa não lê, não baixa e não envia |
| 13 | Tarefas: criar e editar | Não implementado (só marcar concluída) | Testado | Título, descrição, responsável, prazo, prioridade, etapa, visita |
| 14 | Tarefas: responsáveis e status | Não implementado | Testado | 6 status do banco, filtro aberto/concluído, prazo vencido em destaque |
| 15 | Relatório da visita | Não implementado | Testado | Tópicos, classificação, anexos, pendências, tarefas, próximos passos; imprimir/PDF e copiar resumo |
| 16 | Consultor CMV orientado pelos dados | Só visual (texto fixo) | Testado | Regras determinísticas em `lib/consultant.mjs`, cita a base de cada orientação |
| 17 | Metodologia LEVANTAR → PADRONIZAR → TREINAR → ACOMPANHAR | Só visual | Testado | Fase calculada pelas etapas; na fase LEVANTAR só sugere levantamento |
| 18 | Não inventar dados nem tratar declaração como fato | Parcial | Testado | Testes unitários; consultor avisa quando crítico não tem evidência |
| 19 | Cálculos só com dados suficientes | Parcial (funções prontas, sem uso) | Testado | Consultor lista o que falta; nenhum valor estimado |
| 20 | Cálculos financeiros determinísticos | Testado (unitário) | Testado | `lib/cmv.mjs`, sem alteração |
| 21 | Primeira visita sem pesagem, custos ou padronização | Só visual | Testado | Avisos no diagnóstico, consultor e relatório |
| 22 | Frequência de visitas não fixa | — | Testado | Visitas avulsas, sem agenda obrigatória |
| 23 | Implantação guiada (6 etapas) | Parcial | Testado | Etapas com contagem de tarefas; etapa 1 só conclui com 15 tópicos e tarefas concluídas |
| 24 | Central técnica (produtos, ingredientes, fornecedores, receitas) | Parcial (só cadastro e lista) | Parcial | Sem edição, exclusão ou itens de receita; sem alteração neste sprint |
| 25 | Compras e estoque | Só banco (recebimento atômico, inventário, saldo) | Só banco | Tela pendente, sem dados fictícios |
| 26 | Perdas | Só banco | Só banco | Tela pendente |
| 27 | Treinamentos | Só banco | Só banco | Tela pendente |
| 28 | Vendas / faturamento | Só banco (`sales_records`) | Só banco | Tela pendente |
| 29 | SaaS multiempresa e isolamento por organização | Só banco (RLS) | Testado | 8 tabelas verificadas contra outra organização |
| 30 | RLS corretamente configurado | Parcial (falhas abaixo) | Testado (local) | Integração: papéis e isolamento |
| 31 | Funções SECURITY DEFINER revisadas | Não revisado | Revisado | Todas checam `auth.uid()` ou papel; ver segurança |
| 32 | Policies de storage revisadas | Não revisado | Testado | Pasta da organização, bucket privado, tipos permitidos |
| 33 | Trilha de auditoria | Só banco (editável por editores) | Testado | Imutável pelo app |
| 34 | Convite de membros / papéis | Só banco | Parcial | Banco correto (só proprietário gerencia); sem tela de convite |
| 35 | Tema escuro e claro | Parcial (não lembrava a escolha) | Testado | Escolha guardada no navegador |
| 36 | Identidade azul-marinho, ciano e azul elétrico | Testado | Testado | Mesmos tokens; novos componentes usam os tokens existentes |
| 37 | Responsivo (celular e tablet) | Parcial | Testado | e2e: sem rolagem horizontal em 390 px e 820 px |
| 38 | Bootstrap do banco do zero | Bloqueado (migration inicial divergente) | Testado (local) | Migration inicial reconciliada byte a byte com a produção |
| 39 | Preview na Vercel com banco | Bloqueado | Bloqueado | Variáveis de preview só existem para outra branch; ver pendências |

## O que existia antes

Login e cadastro, criação do espaço da Pizzaria Enrico com 6 etapas e 6 tarefas, roteiro de 15 perguntas com resposta única por tópico, marcar tarefa como concluída, Central técnica com cadastro simples, cálculos determinísticos testados, telas de Compras, Perdas, Treinamentos e Relatórios apenas com aviso de módulo inativo. No banco: estrutura completa de compras, estoque, inventário, perdas, treinamentos, evidências e vendas, com RLS.

A branch `codex/enrico-operational` tinha uma versão anterior do diagnóstico com visitas gravadas dentro da tabela de auditoria. Ela não foi mesclada; as ideias foram reaproveitadas com tabelas próprias.

## O que foi corrigido

1. **Migration inicial divergente**: o arquivo do repositório não era o que foi aplicado. Foi substituído pela versão exata do banco (`20261031211139_initial_schema.sql`, MD5 `c32273e8fc3ad217873d09f9390f0360`, igual ao registrado no Supabase). As 9 migrations agora sobem do zero sem erro.
2. **Consultor podia se promover a proprietário e incluir terceiros** na organização. Agora só o proprietário gerencia membros.
3. **Consultor podia excluir o estabelecimento**, apagando em cascata todo o histórico. Agora só o proprietário.
4. **Trilha de auditoria editável e apagável** por qualquer editor. Agora é imutável pelo app.
5. **Arquivo de evidência podia apontar para pasta de outro estabelecimento**. Agora há restrição no banco.
6. **Bucket não aceitava fotos HEIC do iPhone nem Word/Excel**. Agora aceita, até 20 MB.
7. Data fixa “sábado, 31 de outubro” no painel trocada pela data atual.
8. Menu lateral no celular mostrava o nome do estabelecimento sobreposto aos ícones.
9. Mensagens de erro do Supabase em inglês traduzidas.

## O que foi desenvolvido no sprint

- Visitas: registro, edição, histórico, conclusão, participantes, objetivo, observações e próximos passos.
- Diagnóstico ligado à visita, com grau de confirmação, situação do tópico, observações, histórico de versões e aviso de alteração não salva.
- Evidências privadas por tópico e por visita, com consentimento registrado, link temporário e exclusão.
- Tarefas completas: criar, editar, excluir, responsável, prazo, prioridade, status, etapa e visita.
- Consultor CMV por regras, a partir dos dados reais, com prioridades, cuidados e prontidão dos cálculos.
- Relatório da visita para tela, impressão/PDF e texto para copiar.
- Painel com visitas, tarefas e diagnóstico reais.
- Supabase local (`supabase/config.toml`) e testes de integração e ponta a ponta.

## O que continua pendente

1. **Aplicar a migration `20261104120000_operational_sprint.sql` no Supabase de produção** (aguarda autorização). Sem ela, o app mostra aviso de banco desatualizado em visitas, classificação e responsáveis.
2. **Variáveis do preview na Vercel** para esta branch (as atuais só valem para `codex/enrico-operational`).
3. Especificação oficial: conferir a matriz quando o arquivo for enviado.
4. Telas de Compras e estoque, Perdas, Treinamentos e Vendas (banco pronto).
5. Convite de membros pela interface.
6. Cadastro de outros estabelecimentos/organizações: hoje `start_initial_workspace` sempre cria a Pizzaria Enrico, então qualquer pessoa que criar conta ganha uma cópia vazia isolada. Recomendação: desligar cadastro aberto no Supabase Auth (ou trocar por convite) e ativar a proteção contra senhas vazadas.
7. Fontes: o CSS pede Manrope e DM Sans, mas elas nunca foram carregadas; os títulos aparecem na fonte serifada padrão. Não alterei para não mudar a identidade aprovada. Decidir se carrega as fontes.
8. E-mail de recuperação de senha não testado (depende do SMTP do projeto).
9. Áudio e transcrição de entrevistas: não habilitados.

## Testes executados

| Comando | Resultado |
|---|---|
| `npm ci` | ok, 0 vulnerabilidades |
| `npm test` (cálculos, diagnóstico, consultor, relatório) | 15 de 15 |
| `npm run build` | ok |
| `npm run test:integration` (Supabase local) | 9 de 9: autenticação, Enrico, diagnóstico e histórico, tarefas, upload e link assinado, isolamento entre organizações, papéis, etapa 1, relatório |
| `npm run test:e2e` (Playwright, Supabase local) | 23 de 23, sem erros de JavaScript |

Os testes de integração e ponta a ponta só rodam contra `127.0.0.1` e usam usuários e dados de teste marcados como “[Teste]”.

## Capturas

Pasta `auditoria/capturas/2026-11-04/`, geradas pelo teste ponta a ponta com dados de teste isolados:

01 login · 02 painel · 03 implantação guiada · 04 diagnóstico · 05 consultor CMV · 06 central técnica · 07 compras e estoque (pendente) · 08 perdas (pendente) · 09 treinamentos (pendente) · 10 relatórios · 11 tarefas · 12 visitas · 13 e 14 tema claro · m1 a m5 celular · t1 tablet · `relatorio-visita.pdf`.

Compras e estoque, Perdas e Treinamentos aparecem como pendentes porque as telas ainda não existem; as capturas mostram o estado real, não uma funcionalidade suposta.

## Como reproduzir

```bash
npm ci
npx supabase start -x realtime,studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
# .env.local com a URL e a chave publishable do Supabase LOCAL (npx supabase status)
npm test && npm run build
SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<chave local> npm run test:integration
npx next start -p 3000 &
NODE_PATH=$(npm root -g) npm run test:e2e   # requer playwright instalado globalmente
```
