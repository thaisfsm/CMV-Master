-- Sprint operacional (2026-11-04)
-- Migration aditiva: não apaga tabelas, colunas nem dados existentes.
-- Idempotente: pode ser executada mais de uma vez (drop ... if exists antes de cada create).
-- Reversão: supabase/rollback/20261104120000_operational_sprint_down.sql
-- Adiciona visitas, histórico de respostas, classificação do diagnóstico,
-- responsáveis em tarefas, vínculo de evidências à visita e endurece políticas.

-- 1. Papel de proprietário ---------------------------------------------------
create or replace function private.is_org_owner(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.memberships m where m.organization_id = target_org and m.user_id = auth.uid() and m.role = 'owner') $$;
revoke all on function private.is_org_owner(uuid) from public, anon;
grant execute on function private.is_org_owner(uuid) to authenticated;

-- Só proprietários gerenciam membros (antes, qualquer consultor podia se promover ou incluir terceiros).
drop policy if exists memberships_insert_members on public.memberships;
drop policy if exists memberships_update_members on public.memberships;
drop policy if exists memberships_delete_members on public.memberships;
drop policy if exists memberships_insert_owner on public.memberships;
create policy memberships_insert_owner on public.memberships for insert with check (private.is_org_owner(organization_id));
drop policy if exists memberships_update_owner on public.memberships;
create policy memberships_update_owner on public.memberships for update using (private.is_org_owner(organization_id)) with check (private.is_org_owner(organization_id));
drop policy if exists memberships_delete_owner on public.memberships;
create policy memberships_delete_owner on public.memberships for delete using (private.is_org_owner(organization_id));

-- Excluir um estabelecimento apaga em cascata todo o histórico: restrito ao proprietário.
drop policy if exists establishments_delete_members on public.establishments;
drop policy if exists establishments_delete_owner on public.establishments;
create policy establishments_delete_owner on public.establishments for delete using (private.is_org_owner(organization_id));

-- Trilha de auditoria imutável pelo app: sem update/delete, e inserção apenas como o próprio usuário.
drop policy if exists audit_events_update_members on public.audit_events;
drop policy if exists audit_events_delete_members on public.audit_events;
drop policy if exists audit_events_insert_members on public.audit_events;
drop policy if exists audit_events_insert_self on public.audit_events;
create policy audit_events_insert_self on public.audit_events for insert
  with check (private.is_org_editor(organization_id) and actor_id = auth.uid());

-- 2. Visitas -------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  stage_id uuid references public.implementation_stages(id) on delete set null,
  visit_date date not null,
  visit_type text not null default 'diagnostic' check (visit_type in ('diagnostic','follow_up','training','closing','other')),
  status text not null default 'open' check (status in ('open','completed')),
  participants text[] not null default '{}',
  objective text,
  observations text,
  next_steps text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists visits_establishment_date_idx on public.visits (establishment_id, visit_date desc);
alter table public.visits enable row level security;
drop policy if exists visits_read_members on public.visits;
create policy visits_read_members on public.visits for select using (private.is_org_member(organization_id));
drop policy if exists visits_insert_members on public.visits;
create policy visits_insert_members on public.visits for insert with check (private.is_org_editor(organization_id));
drop policy if exists visits_update_members on public.visits;
create policy visits_update_members on public.visits for update using (private.is_org_editor(organization_id)) with check (private.is_org_editor(organization_id));
drop policy if exists visits_delete_members on public.visits;
create policy visits_delete_members on public.visits for delete using (private.is_org_editor(organization_id));
drop trigger if exists visits_tenant_check on public.visits;
create trigger visits_tenant_check before insert or update on public.visits for each row execute function public.check_establishment_tenant();
drop trigger if exists visits_audit_change on public.visits;
create trigger visits_audit_change after insert or update or delete on public.visits for each row execute function public.audit_row_change();

create or replace function public.check_visit_reference()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_table_name = 'visits' then
    if new.stage_id is not null and not exists (
      select 1 from public.implementation_stages s where s.id = new.stage_id
        and s.establishment_id = new.establishment_id and s.organization_id = new.organization_id
    ) then raise exception 'Stage does not belong to this establishment'; end if;
  elsif new.visit_id is not null and not exists (
    select 1 from public.visits v where v.id = new.visit_id
      and v.establishment_id = new.establishment_id and v.organization_id = new.organization_id
  ) then raise exception 'Visit does not belong to this establishment';
  end if;
  return new;
end $$;
drop trigger if exists visits_stage_check on public.visits;
create trigger visits_stage_check before insert or update of stage_id, establishment_id, organization_id on public.visits
  for each row execute function public.check_visit_reference();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists visits_touch on public.visits;
create trigger visits_touch before update on public.visits for each row execute function public.touch_updated_at();

-- 3. Diagnóstico: classificação, vínculo com visita e histórico -------------
alter table public.diagnostic_responses add column if not exists visit_id uuid references public.visits(id) on delete set null;
alter table public.diagnostic_responses add column if not exists situation text
  check (situation is null or situation in ('critical','attention','adequate','not_applicable'));
alter table public.diagnostic_responses add column if not exists notes text;
drop trigger if exists diagnostic_visit_check on public.diagnostic_responses;
create trigger diagnostic_visit_check before insert or update of visit_id, establishment_id, organization_id on public.diagnostic_responses
  for each row execute function public.check_visit_reference();

create table if not exists public.diagnostic_response_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  response_id uuid not null references public.diagnostic_responses(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  question_key text not null,
  answer text not null,
  evidence_status text not null,
  situation text,
  notes text,
  revised_by uuid references auth.users(id),
  revised_at timestamptz not null default now()
);
create index if not exists diagnostic_revisions_response_idx on public.diagnostic_response_revisions (response_id, revised_at desc);
alter table public.diagnostic_response_revisions enable row level security;
-- Somente leitura para membros; as linhas são gravadas pelo gatilho abaixo.
drop policy if exists diagnostic_revisions_read_members on public.diagnostic_response_revisions;
create policy diagnostic_revisions_read_members on public.diagnostic_response_revisions for select using (private.is_org_member(organization_id));

create or replace function public.record_diagnostic_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.answer is not distinct from old.answer and new.evidence_status is not distinct from old.evidence_status
     and new.situation is not distinct from old.situation and new.notes is not distinct from old.notes then
    return new;
  end if;
  insert into public.diagnostic_response_revisions (organization_id, establishment_id, response_id, visit_id, question_key, answer, evidence_status, situation, notes, revised_by)
  values (new.organization_id, new.establishment_id, new.id, new.visit_id, new.question_key, new.answer, new.evidence_status, new.situation, new.notes, auth.uid());
  return new;
end $$;
revoke all on function public.record_diagnostic_revision() from public, anon, authenticated;
drop trigger if exists diagnostic_responses_revision on public.diagnostic_responses;
create trigger diagnostic_responses_revision after insert or update on public.diagnostic_responses
  for each row execute function public.record_diagnostic_revision();

-- 4. Tarefas: responsável, prioridade, origem ---------------------------------
alter table public.tasks add column if not exists assignee_name text;
alter table public.tasks add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high'));
alter table public.tasks add column if not exists visit_id uuid references public.visits(id) on delete set null;
alter table public.tasks add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
drop trigger if exists tasks_visit_check on public.tasks;
create trigger tasks_visit_check before insert or update of visit_id, establishment_id, organization_id on public.tasks
  for each row execute function public.check_visit_reference();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- 5. Evidências vinculadas à visita --------------------------------------------
alter table public.evidence_files add column if not exists visit_id uuid references public.visits(id) on delete set null;
alter table public.evidence_files add column if not exists description text;
drop trigger if exists evidence_visit_check on public.evidence_files;
create trigger evidence_visit_check before insert or update of visit_id, establishment_id, organization_id on public.evidence_files
  for each row execute function public.check_visit_reference();

-- O caminho do arquivo precisa começar por organização/estabelecimento do registro.
alter table public.evidence_files drop constraint if exists evidence_files_path_matches_tenant;
alter table public.evidence_files add constraint evidence_files_path_matches_tenant
  check (storage_path like organization_id::text || '/' || establishment_id::text || '/%');

-- Bucket privado: aceita também documentos de escritório e fotos HEIC do celular.
update storage.buckets
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
         'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']
 where id = 'cmv-evidence';
