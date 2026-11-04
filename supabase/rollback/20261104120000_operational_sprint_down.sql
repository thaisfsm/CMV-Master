-- REVERSÃO da migration 20261104120000_operational_sprint.sql
-- ATENÇÃO: só executar com autorização da Thaís. Executar dentro de uma transação (begin; ... commit;).
-- Perda de dados: apaga visitas, histórico de respostas e as colunas novas
-- (situação/observações do diagnóstico, responsável/prioridade das tarefas, descrição das evidências).
-- Faça um export (supabase db dump --data-only) antes, se já houver uso real.
-- Os dados que existiam antes da migration (organização, Enrico, etapas, tarefas, respostas) não são tocados.
-- Idempotente: pode ser executada mais de uma vez.

-- 1. Bucket: volta à configuração anterior (10 MB; PDF, JPEG, PNG, WebP).
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
 where id = 'cmv-evidence';

-- 2. Evidências
alter table public.evidence_files drop constraint if exists evidence_files_path_matches_tenant;
drop trigger if exists evidence_visit_check on public.evidence_files;
alter table public.evidence_files drop column if exists description;
alter table public.evidence_files drop column if exists visit_id;

-- 3. Tarefas
drop trigger if exists tasks_touch on public.tasks;
drop trigger if exists tasks_visit_check on public.tasks;
alter table public.tasks drop column if exists updated_at;
alter table public.tasks drop column if exists created_by;
alter table public.tasks drop column if exists visit_id;
alter table public.tasks drop column if exists priority;
alter table public.tasks drop column if exists assignee_name;

-- 4. Diagnóstico
drop trigger if exists diagnostic_responses_revision on public.diagnostic_responses;
drop trigger if exists diagnostic_visit_check on public.diagnostic_responses;
drop table if exists public.diagnostic_response_revisions;
drop function if exists public.record_diagnostic_revision();
alter table public.diagnostic_responses drop column if exists notes;
alter table public.diagnostic_responses drop column if exists situation;
alter table public.diagnostic_responses drop column if exists visit_id;

-- 5. Visitas (os eventos de auditoria já gravados sobre visitas permanecem em audit_events)
drop table if exists public.visits;
drop function if exists public.check_visit_reference();
drop function if exists public.touch_updated_at();

-- 6. Políticas: volta exatamente ao estado de produção de 2026-11-04
drop policy if exists audit_events_insert_self on public.audit_events;
drop policy if exists audit_events_insert_members on public.audit_events;
drop policy if exists audit_events_update_members on public.audit_events;
drop policy if exists audit_events_delete_members on public.audit_events;
create policy audit_events_insert_members on public.audit_events for insert with check (private.is_org_editor(organization_id));
create policy audit_events_update_members on public.audit_events for update using (private.is_org_editor(organization_id)) with check (private.is_org_editor(organization_id));
create policy audit_events_delete_members on public.audit_events for delete using (private.is_org_editor(organization_id));

drop policy if exists establishments_delete_owner on public.establishments;
drop policy if exists establishments_delete_members on public.establishments;
create policy establishments_delete_members on public.establishments for delete using (private.is_org_editor(organization_id));

drop policy if exists memberships_insert_owner on public.memberships;
drop policy if exists memberships_update_owner on public.memberships;
drop policy if exists memberships_delete_owner on public.memberships;
drop policy if exists memberships_insert_members on public.memberships;
drop policy if exists memberships_update_members on public.memberships;
drop policy if exists memberships_delete_members on public.memberships;
create policy memberships_insert_members on public.memberships for insert with check (private.is_org_editor(organization_id));
create policy memberships_update_members on public.memberships for update using (private.is_org_editor(organization_id)) with check (private.is_org_editor(organization_id));
create policy memberships_delete_members on public.memberships for delete using (private.is_org_editor(organization_id));

drop function if exists private.is_org_owner(uuid);

-- 7. Histórico de migrations (somente se aplicada via supabase CLI/MCP)
delete from supabase_migrations.schema_migrations where version = '20261104120000';
