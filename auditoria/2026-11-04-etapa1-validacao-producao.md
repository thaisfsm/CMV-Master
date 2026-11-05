# CMV Mestre · Etapa 1: validação para liberação em produção

Data: 04/11/2026 · Branch `claude/project-thread-lmukz7` · PR #2 (rascunho, não mergeado)

**Nada foi alterado em produção.** Supabase `cmv-mestre` e Vercel `cmv-mestre-thais` foram apenas lidos.
A migration não foi aplicada, nenhuma variável foi criada, nenhum deploy de produção foi feito.

---

## 1. O que muda no banco

Migration: `supabase/migrations/20261104120000_operational_sprint.sql`. É **aditiva**: não apaga tabelas, colunas nem linhas.

| Tipo | Objeto | O que acontece |
|---|---|---|
| Tabela nova | `visits` | Visitas: data, tipo, status, participantes, objetivo, observações, próximos passos, autor. Índice por estabelecimento e data. RLS ligado. |
| Tabela nova | `diagnostic_response_revisions` | Histórico de cada versão das respostas do diagnóstico. RLS ligado, **só leitura** para membros; gravada apenas pelo gatilho. |
| Colunas novas | `diagnostic_responses` | `visit_id`, `situation` (crítico/atenção/adequado/não se aplica, opcional), `notes` |
| Colunas novas | `tasks` | `assignee_name`, `priority` (padrão `normal`), `visit_id`, `created_by`, `updated_at` |
| Colunas novas | `evidence_files` | `visit_id`, `description` |
| Restrição nova | `evidence_files_path_matches_tenant` | O caminho do arquivo tem de começar por `organização/estabelecimento/` |
| Função nova (SECURITY DEFINER) | `private.is_org_owner(uuid)` | Diz se o usuário é proprietário da organização. Execução só para `authenticated`. |
| Função nova (SECURITY DEFINER) | `public.record_diagnostic_revision()` | Grava o histórico. Execução revogada de `public`, `anon` e `authenticated` (só o gatilho usa). |
| Funções novas | `check_visit_reference()`, `touch_updated_at()` | Validação de vínculo com a visita / data de atualização. Sem SECURITY DEFINER. |
| Gatilhos novos | 9 | `visits_tenant_check`, `visits_audit_change`, `visits_stage_check`, `visits_touch`, `diagnostic_visit_check`, `diagnostic_responses_revision`, `tasks_visit_check`, `tasks_touch`, `evidence_visit_check` |
| Políticas novas | 4 em `visits`, 1 em revisões | Membros leem; editores criam/alteram/excluem |
| Políticas **trocadas** | `memberships` insert/update/delete | Antes: qualquer editor (inclusive consultor). Depois: **só proprietário**. |
| Política **trocada** | `establishments` delete | Antes: qualquer editor. Depois: **só proprietário** (excluir apaga todo o histórico em cascata). |
| Políticas **removidas** | `audit_events` update e delete | A trilha de auditoria deixa de poder ser editada ou apagada pelo app. |
| Política **trocada** | `audit_events` insert | Agora exige `actor_id = auth.uid()` (ninguém registra evento em nome de outro). |
| Configuração | bucket `cmv-evidence` | Continua **privado**. Limite 10 MB → 20 MB. Tipos: PDF/JPEG/PNG/WebP + HEIC/HEIF, Word, Excel, TXT, CSV. |

Permissões de tabela (`grant`) não mudam; as tabelas novas herdam os padrões do Supabase e ficam protegidas por RLS.

**Dependências:** usa `private.is_org_member`, `private.is_org_editor`, `public.check_establishment_tenant` e `public.audit_row_change`, todas já existentes em produção (conferido).

**Compatibilidade com o app que está em produção hoje (`main`):** o app atual só chama `start_initial_workspace`, grava respostas do diagnóstico (`upsert`) e atualiza tarefas. As colunas novas são opcionais ou têm padrão, então o app atual continua funcionando com o banco migrado. O app novo (PR #2), sem a migration, mostra o aviso amarelo “banco de dados ainda não recebeu a atualização” e não perde nada.

## 2. O que pode dar errado

| Risco | Probabilidade | Efeito | Mitigação |
|---|---|---|---|
| Falha no meio da execução | Baixa | Nenhum, se rodar em transação | Aplicar entre `begin;` e `commit;`: tudo ou nada |
| Consultor convidado perde a ação “gerenciar membros” e “excluir estabelecimento” | Intencional | Só a proprietária (Thaís) faz isso | É a correção de segurança |
| Bloqueio de tabela durante `alter table` | Muito baixa | Milissegundos; o banco tem poucas linhas | Aplicar fora do horário de visita |
| Restrição de caminho rejeitar evidência antiga | Nula hoje | Produção tem **0** evidências | Conferido |
| Reexecução acidental | Sem efeito | A migration agora é reexecutável | Testado 2× seguidas |

## 3. Como os dados são protegidos

Situação atual da produção (lida em 04/11/2026): 1 organização, 1 membro (proprietária), 1 estabelecimento (Pizzaria Enrico), 6 etapas, 6 tarefas, 1 evento de auditoria, 0 respostas, 0 evidências, 0 arquivos no bucket.

- Nenhum `drop table`, `drop column`, `delete` ou `truncate` sobre dados existentes.
- As 6 tarefas da Enrico ganham `priority = 'normal'` e `updated_at = agora`; os demais campos novos ficam vazios. Nada existente é sobrescrito.
- **Reexecutável:** cada `create policy` e `create trigger` vem precedido de `drop ... if exists`; tabelas, índices e colunas usam `if not exists`. Testado: duas execuções seguidas sem erro.
- **Reversão pronta:** `supabase/rollback/20261104120000_operational_sprint_down.sql` restaura exatamente as políticas e o bucket atuais da produção (definições copiadas do banco) e remove os objetos novos. Testado no local, duas vezes seguidas, e depois a migration reaplicada.
- No teste local (6 organizações, 40 tarefas, 16 respostas, 4 evidências) as contagens ficaram idênticas depois de migrar, reverter e migrar de novo.

**O que não é reversível automaticamente:** a reversão apaga o que for criado *depois* da migration nas partes novas (visitas, histórico de respostas, situação/observações, responsável/prioridade das tarefas, descrição das evidências). Antes de reverter com uso real, exportar os dados.

## 4. Existe backup recuperável?

**Não há backup automático.** A organização Supabase “LINK Finance” está no **plano Free** (conferido). Pela documentação do Supabase, backups diários existem a partir do plano Pro; o PITR é um adicional pago do Pro.

Como hoje há só os dados iniciais (Enrico, 6 etapas, 6 tarefas), o risco real é pequeno, mas recomendo **antes de aplicar**:

1. Exportar o banco com a CLI do Supabase: `supabase db dump --linked -f backup_schema.sql` e `supabase db dump --linked --data-only -f backup_dados.sql` (a CLI pede a senha do banco; feito por você ou com sua autorização e a senha).
2. Alternativa mínima: eu exporto em leitura os registros atuais da Enrico (organização, estabelecimento, etapas, tarefas) para um arquivo SQL de reinserção.

**Restauração:** para desfazer só a migration, rodar o script de reversão (SQL Editor do Supabase, entre `begin;` e `commit;`). Para voltar ao estado completo, aplicar `backup_schema.sql` + `backup_dados.sql` via `psql`.

## 5. Vercel: o que falta (sem valores expostos)

| Variável | Production | Preview `codex/enrico-operational` | Preview `claude/project-thread-lmukz7` (PR #2) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | existe | existe | **falta** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | existe | existe | **falta** |

Sem as duas, o preview do PR #2 abre na tela “Conecte o banco de dados”. Opções: criá-las para a branch do PR, ou para todas as previews (com os mesmos valores das existentes).

**Proteção de acesso:** o projeto tem *Vercel Authentication* ligada para tudo que não é domínio próprio (`all_except_custom_domains`). Como não há domínio próprio, **inclusive `cmv-mestre-thais.vercel.app` exige login na Vercel**. A consultora não consegue abrir o sistema sem conta no time da Vercel. É preciso decidir: domínio próprio, desligar a proteção só para produção, ou link de acesso (bypass).

## 6. O que está validado

| Teste | Local (Supabase local + app compilado) | Preview | Produção |
|---|---|---|---|
| Login, senha errada, sessão e sair | ✅ | não testado (sem variáveis) | não testado |
| Seleção da Pizzaria Enrico | ✅ | não testado | não testado |
| Visitas: criar, editar, concluir | ✅ | não testado | não testado (tabela não existe) |
| Diagnóstico: salvar, editar, classificar | ✅ | não testado | não testado |
| Histórico das respostas | ✅ | não testado | não testado |
| Evidência privada, link assinado, bloqueio entre empresas | ✅ | não testado | não testado |
| Tarefas com responsável e status | ✅ | não testado | não testado |
| Consultor CMV | ✅ | não testado | não testado |
| Relatório da visita e PDF | ✅ | não testado | não testado |
| Isolamento entre organizações | ✅ | não testado | não testado |
| Papéis (consultor não gerencia membros) | ✅ | não testado | não testado |
| Migration reexecutável e reversão | ✅ | — | não aplicada |

Números: `npm test` 15/15 · integração 9/9 · ponta a ponta (Playwright) 23/23 · `npm run build` ok · CI do PR #2 verde.
Preview e produção **não foram testados** porque faltam as variáveis no preview, a proteção da Vercel exige login e a migration não está aplicada. Não há resultado inventado.

## 7. O que ainda bloqueia o uso real

1. Migration não aplicada em produção.
2. Proteção da Vercel impede a consultora de abrir o sistema.
3. Cadastro aberto: qualquer pessoa que se cadastre cria a própria cópia da “Pizzaria Enrico” (`start_initial_workspace`). Recomendo desligar o cadastro público no Supabase Auth e convidar a consultora.
4. Proteção contra senhas vazadas desligada (aviso do Supabase).
5. Supabase Auth: conferir *Site URL* e *Redirect URLs* para o link de redefinição de senha funcionar no domínio usado.
6. Convite da consultora: ainda não existe tela de convite; incluir a conta dela como `consultant` é um passo manual (eu faço com sua autorização, depois que ela criar a senha).
7. Não bloqueia, mas fica registrado: fontes Manrope/DM Sans citadas no CSS nunca são carregadas; não alterei para preservar a identidade aprovada. Arquivo `Especificacao_Oficial_CMV_Mestre.txt` não foi recebido.

## 8. Recomendação técnica

A migration é segura para aplicar: é aditiva, compatível com o app atual, reexecutável, tem reversão testada e a produção tem só os dados iniciais. Recomendo esta ordem, cada passo com sua autorização:

1. Exportar o banco (backup manual, já que o plano é Free).
2. Aplicar a migration em produção.
3. Criar as 2 variáveis no preview do PR #2 e testar o fluxo completo no preview, com a sua conta (sem dados fictícios na Enrico; uso de uma organização de teste ou só leitura).
4. Ajustar Supabase Auth (cadastro fechado, senhas vazadas, URLs).
5. Decidir o acesso da Vercel para a consultora.
6. Merge do PR #2 → deploy de produção → teste de fumaça na produção.

## Ações que dependem da sua autorização

| # | Ação | Onde | Reversível? |
|---|---|---|---|
| A1 | Exportar backup do banco | Supabase (leitura) | — |
| A2 | Aplicar a migration `20261104120000` | Supabase produção | Sim, script de reversão |
| A3 | Criar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no Preview (branch do PR #2 ou todas) | Vercel | Sim |
| A4 | Proteção de acesso: domínio próprio / desligar só na produção / link de bypass | Vercel | Sim |
| A5 | Desligar cadastro público e ligar proteção de senhas vazadas | Supabase Auth | Sim |
| A6 | Ajustar Site URL e Redirect URLs | Supabase Auth | Sim |
| A7 | Incluir a consultora como `consultant` na organização | Supabase produção (1 linha) | Sim |
| A8 | Merge do PR #2 e deploy de produção | GitHub / Vercel | Sim (rollback de deploy) |
| A9 | Carregar as fontes Manrope/DM Sans | Código | Sim |
