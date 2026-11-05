# CMV Mestre · Liberação para a primeira visita da Enrico

Data: 05/11/2026. Nada abaixo foi executado em produção. Cada passo marcado com 🔒 espera sua autorização expressa.

## 1. O que está pronto

- Código do PR #2 (rascunho, sem conflitos, CI verde): visitas, diagnóstico com 15 tópicos, grau de confirmação, situação, observações, histórico, anexos privados com consentimento, tarefas com responsável/prazo/status, Consultor CMV por regras e relatório com PDF.
- Metodologia respeitada na primeira visita: sem pesagem, custos, fichas técnicas ou padronização; o consultor não calcula CMV sem dados; declarações ficam como "Declarada", nunca viram "Confirmada" sozinhas.
- Testes (em Supabase local com as migrations reais): 15/15 unitários, 9/9 integração, 23/23 navegador (Playwright, desktop, celular 390 px, tablet 820 px).
- Preview na Vercel ligado ao Supabase de teste (dados fictícios): login e painel confirmados por você.
- Migration `20261104120000_operational_sprint.sql` revisada de novo: aditiva, reexecutável, compatível com os dados atuais (1 organização, 1 membro, Enrico, 6 etapas, 6 tarefas). Testada sobre uma cópia restaurada do backup A1, com reversão testada.
- Backup A1 validado: `backup-producao-2026-11-05/`.

## 2. Sequência exata para liberar a Enrico

| # | Passo | Quem | Autorização |
|---|---|---|---|
| 1 | Reconferir que a produção não mudou desde o backup (impressão digital `conferencia_impressao_digital.sql` = valores do backup) | Claude, só leitura | não precisa |
| 2 | **Aplicar a migration** `20261104120000_operational_sprint.sql` em `cmv-mestre`, dentro de `begin; … commit;` | Claude | 🔒 A2 |
| 3 | Verificar o resultado com `auditoria/verificacao_pos_migration.sql` (11 valores esperados, só leitura) e conferir que Enrico, 6 etapas e 6 tarefas seguem intactas (contagens e md5 do backup) | Claude, só leitura | junto com A2 |
| 4 | **Mesclar o PR #2 em `main`** (marcar como pronto e fazer o merge). A Vercel publica sozinha na produção `cmv-mestre-thais` | Claude | 🔒 A8 |
| 5 | Teste de fumaça só de leitura em produção: login, Enrico no topo, abrir Visitas, Diagnóstico, Tarefas, Consultor, Relatórios, sem erros. Não grava nada | Claude, pelo Chrome já logado | junto com A8 |
| 6 | Na visita: você entra com `linkconsignados26@gmail.com`, cria a visita do dia e preenche o diagnóstico | Thaís | — |

Ordem importa: migration antes do merge. O app novo sobre o banco antigo mostraria o aviso de "banco não atualizado"; o app antigo sobre o banco novo continua funcionando.

Tempo estimado dos passos 1 a 5: cerca de 15 minutos.

## 3. Verificação das políticas (RLS) após o passo 2

Esperado em produção (tabela e política):
- `memberships`: inserir, alterar e excluir só proprietário (`*_owner`); leitura para membros.
- `establishments`: excluir só proprietário (`establishments_delete_owner`).
- `audit_events`: sem alterar nem excluir; inserir só como o próprio usuário (`audit_events_insert_self`).
- `visits`: 4 políticas de membro. `diagnostic_response_revisions`: só leitura.
- Total de políticas 93, RLS ligado em 25 tabelas, bucket `cmv-evidence` privado, limite 20 MB.

## 4. Configuração de produção

- Vercel produção já tem as 2 variáveis do Supabase `cmv-mestre`; nada a criar.
- Você é a dona do time da Vercel, então abre a produção com o seu login da Vercel.
- Opcional, não bloqueia a primeira visita: desligar cadastro público e ligar proteção de senhas vazadas no Supabase Auth (A5) e ajustar Site URL (A6). Eles ficam para depois de a consultora ter conta; como a Enrico é isolada por RLS, um cadastro novo nunca enxerga os dados dela.

## 5. Plano de reversão

- Banco: executar `supabase/rollback/20261104120000_operational_sprint_down.sql` (devolve as políticas e o bucket ao estado do backup e remove os objetos novos). Para voltar de verdade ao estado do backup, `backup_dados.sql` repõe linhas faltantes.
- Aplicativo: na Vercel, promover o deploy anterior de produção (rollback de deploy, um clique).
- Se já houver dados reais da visita, exportar antes de reverter, porque a reversão apaga visitas, histórico e campos novos.

## 6. Itens que continuam fora do escopo da primeira visita

Compras e estoque, Perdas e Treinamentos (sem tela, de propósito), fontes Manrope/DM Sans, convite automático da consultora (hoje é um passo meu no banco, com sua autorização).

## 7. Autorizações necessárias

1. **A2:** aplicar a migration em produção (com verificação).
2. **A8:** mesclar o PR #2 em `main` e deixar a Vercel publicar.

Responda "autorizo A2 e A8" para eu executar os passos 1 a 5 em sequência, ou autorize só A2 e depois A8.
