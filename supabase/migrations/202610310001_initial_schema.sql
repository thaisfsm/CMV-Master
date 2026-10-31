create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','consultant','viewer')),
  created_at timestamptz not null default now(), primary key (organization_id, user_id)
);
create table public.establishments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, segment text, management_names text[] not null default '{}', address jsonb, operational_notes text,
  contract_start date, contract_end date, contract_monthly_value numeric(12,2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.implementation_stages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  stage_number smallint not null check (stage_number between 1 and 6), title text not null, objective text not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','awaiting_information','awaiting_approval','completed','blocked')),
  target_start date, target_end date, completed_at timestamptz, unique(establishment_id, stage_number)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, stage_id uuid references public.implementation_stages(id) on delete set null,
  title text not null, description text, status text not null default 'not_started'
  check (status in ('not_started','in_progress','awaiting_information','awaiting_approval','completed','blocked')),
  due_on date, completed_at timestamptz, created_at timestamptz not null default now()
);
create table public.diagnostic_responses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, question_key text not null, question text not null,
  answer text not null, evidence_status text not null default 'declared' check (evidence_status in ('confirmed','declared','hypothesis','pending')),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), unique(establishment_id, question_key)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid references public.establishments(id) on delete set null, actor_id uuid references auth.users(id),
  action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, name text not null, category text,
  sale_type text, description text, status text not null default 'draft', created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, name text not null, contact text, notes text,
  created_at timestamptz not null default now()
);
create table public.ingredients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, name text not null,
  purchase_unit text, usage_unit text, conversion_factor numeric, supplier_id uuid references public.suppliers(id) on delete set null,
  current_price numeric(14,4), price_updated_at timestamptz, created_at timestamptz not null default now()
);
create table public.recipes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, product_id uuid references public.products(id) on delete set null,
  name text not null, preparation text, yield_quantity numeric, yield_unit text, version integer not null default 1,
  approval_status text not null default 'draft' check (approval_status in ('draft','pending','approved','rejected')), created_at timestamptz not null default now()
);
create table public.recipe_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict, quantity numeric not null check(quantity >= 0), unit text not null
);
create table public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade, supplier_id uuid references public.suppliers(id) on delete set null,
  unit_price numeric(14,4) not null check(unit_price >= 0), observed_at date not null, source_note text, created_at timestamptz not null default now()
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, supplier_id uuid references public.suppliers(id) on delete set null,
  document_number text, purchased_at date not null, status text not null default 'recorded', notes text, created_at timestamptz not null default now()
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade, ingredient_id uuid references public.ingredients(id) on delete set null,
  description text not null, ordered_quantity numeric, received_quantity numeric, recorded_quantity numeric,
  unit text, unit_price numeric(14,4), check(ordered_quantity is null or ordered_quantity >= 0),
  check(received_quantity is null or received_quantity >= 0), check(recorded_quantity is null or recorded_quantity >= 0)
);
create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, counted_at timestamptz not null,
  status text not null default 'draft' check(status in ('draft','in_progress','review','closed')), notes text, created_at timestamptz not null default now()
);
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_count_id uuid not null references public.inventory_counts(id) on delete cascade, ingredient_id uuid references public.ingredients(id) on delete set null,
  description text not null, expected_quantity numeric, counted_quantity numeric, unit text, investigation_status text not null default 'not_investigated'
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  movement_type text not null check(movement_type in ('purchase','adjustment','production','waste','count')), quantity numeric not null,
  unit text not null, occurred_at timestamptz not null, source_record uuid, notes text
);
create table public.loss_cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, ingredient_id uuid references public.ingredients(id) on delete set null,
  product_id uuid references public.products(id) on delete set null, process_step text, location text, possible_cause text,
  evidence_note text, quantity numeric, unit text, unit_cost numeric(14,4), case_status text not null default 'suspected'
    check(case_status in ('suspected','uninvestigated_difference','proven')), corrective_action text, responsible text,
  identified_at timestamptz not null default now(), followed_up_at timestamptz
);
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, title text not null, category text,
  procedure text, scheduled_at timestamptz, status text not null default 'planned', created_at timestamptz not null default now()
);
create table public.training_participants (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  training_id uuid not null references public.training_sessions(id) on delete cascade, participant_name text not null,
  attendance boolean not null default false, practical_result text not null default 'pending'
    check(practical_result in ('approved','needs_reinforcement','reassess','pending')), notes text
);
create table public.evidence_files (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade, bucket_id text not null, storage_path text not null,
  file_name text not null, media_type text, size_bytes bigint, sha256 text, uploaded_by uuid references auth.users(id),
  consent_recorded boolean not null default false, created_at timestamptz not null default now(), unique(bucket_id,storage_path)
);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.memberships m where m.organization_id = target_org and m.user_id = auth.uid()) $$;
create or replace function public.is_org_editor(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.memberships m where m.organization_id = target_org and m.user_id = auth.uid() and m.role in ('owner','consultant')) $$;

create or replace function public.check_establishment_tenant()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists(select 1 from public.establishments e where e.id = new.establishment_id and e.organization_id = new.organization_id) then
    raise exception 'Establishment does not belong to this organization';
  end if;
  if tg_table_name = 'tasks' and new.stage_id is not null and not exists(
    select 1 from public.implementation_stages s where s.id = new.stage_id and s.establishment_id = new.establishment_id and s.organization_id = new.organization_id
  ) then raise exception 'Stage does not belong to this establishment'; end if;
  return new;
end $$;
create trigger stages_tenant_check before insert or update on public.implementation_stages for each row execute function public.check_establishment_tenant();
create trigger tasks_tenant_check before insert or update on public.tasks for each row execute function public.check_establishment_tenant();
create trigger diagnostic_tenant_check before insert or update on public.diagnostic_responses for each row execute function public.check_establishment_tenant();
create trigger products_tenant_check before insert or update on public.products for each row execute function public.check_establishment_tenant();
create trigger suppliers_tenant_check before insert or update on public.suppliers for each row execute function public.check_establishment_tenant();
create trigger ingredients_tenant_check before insert or update on public.ingredients for each row execute function public.check_establishment_tenant();
create trigger recipes_tenant_check before insert or update on public.recipes for each row execute function public.check_establishment_tenant();
create trigger prices_tenant_check before insert or update on public.ingredient_price_history for each row execute function public.check_establishment_tenant();
create trigger purchases_tenant_check before insert or update on public.purchases for each row execute function public.check_establishment_tenant();
create trigger inventory_counts_tenant_check before insert or update on public.inventory_counts for each row execute function public.check_establishment_tenant();
create trigger stock_tenant_check before insert or update on public.stock_movements for each row execute function public.check_establishment_tenant();
create trigger losses_tenant_check before insert or update on public.loss_cases for each row execute function public.check_establishment_tenant();
create trigger trainings_tenant_check before insert or update on public.training_sessions for each row execute function public.check_establishment_tenant();
create trigger evidence_tenant_check before insert or update on public.evidence_files for each row execute function public.check_establishment_tenant();
create or replace function public.check_child_tenant()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_table_name = 'purchase_items' and not exists(select 1 from public.purchases p where p.id = new.purchase_id and p.organization_id = new.organization_id) then
    raise exception 'Purchase must belong to this organization';
  elsif tg_table_name = 'inventory_items' and not exists(select 1 from public.inventory_counts c where c.id = new.inventory_count_id and c.organization_id = new.organization_id) then
    raise exception 'Inventory count must belong to this organization';
  elsif tg_table_name = 'training_participants' and not exists(select 1 from public.training_sessions s where s.id = new.training_id and s.organization_id = new.organization_id) then
    raise exception 'Training must belong to this organization';
  end if;
  return new;
end $$;
create trigger purchase_items_tenant_check before insert or update on public.purchase_items for each row execute function public.check_child_tenant();
create trigger inventory_items_tenant_check before insert or update on public.inventory_items for each row execute function public.check_child_tenant();
create trigger training_participants_tenant_check before insert or update on public.training_participants for each row execute function public.check_child_tenant();
create or replace function public.check_recipe_item_tenant()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists(select 1 from public.recipes r join public.ingredients i on i.id = new.ingredient_id where r.id = new.recipe_id and r.organization_id = new.organization_id and i.organization_id = new.organization_id) then
    raise exception 'Recipe and ingredient must belong to the same organization';
  end if;
  return new;
end $$;
create trigger recipe_items_tenant_check before insert or update on public.recipe_items for each row execute function public.check_recipe_item_tenant();
create or replace function public.check_stage_completion()
returns trigger language plpgsql set search_path = public
as $$
declare task_total integer; task_done integer; response_total integer;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    if new.stage_number <> 1 then raise exception 'Approval criteria for this stage have not been configured'; end if;
    select count(*), count(*) filter (where status = 'completed') into task_total, task_done
      from public.tasks where stage_id = new.id;
    select count(*) into response_total from public.diagnostic_responses where establishment_id = new.establishment_id;
    if task_total < 6 or task_done <> task_total or response_total < 15 then
      raise exception 'Diagnostic approval requires all tasks and 15 recorded topics';
    end if;
  end if;
  return new;
end $$;
create trigger stage_completion_gate before update of status on public.implementation_stages for each row execute function public.check_stage_completion();

do $$
declare t text;
begin
  foreach t in array array['memberships','establishments','implementation_stages','tasks','diagnostic_responses','audit_events','products','suppliers','ingredients','recipes','recipe_items','ingredient_price_history','purchases','purchase_items','inventory_counts','inventory_items','stock_movements','loss_cases','training_sessions','training_participants','evidence_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || '_read_members', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_editor(organization_id))', t || '_insert_members', t);
    execute format('create policy %I on public.%I for update using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id))', t || '_update_members', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_editor(organization_id))', t || '_delete_members', t);
  end loop;
end $$;
create policy memberships_read_self on public.memberships for select using (user_id = auth.uid());
create policy organizations_read_member on public.organizations for select using (public.is_org_member(id));

create or replace function public.start_initial_workspace(owner_name text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare org_id uuid; site_id uuid; first_stage uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.memberships where user_id = auth.uid()) then raise exception 'Workspace already initialized'; end if;
  insert into public.organizations(name) values ('CMV Mestre') returning id into org_id;
  insert into public.memberships(organization_id,user_id,role) values (org_id,auth.uid(),'owner');
  insert into public.establishments(organization_id,name,segment,management_names,contract_start,contract_end,contract_monthly_value)
  values (org_id,'Pizzaria Enrico','Pizzaria com rodízio',array['Robério','Gi','Aurélio'],'2026-10-19','2027-04-18',2000) returning id into site_id;
  insert into public.implementation_stages(organization_id,establishment_id,stage_number,title,objective,target_start,target_end,status) values
    (org_id,site_id,1,'Diagnóstico geral e organização da base','Conhecer gestão, operação, cardápio, compras, estoque, controles, documentos e expectativas. Esta visita é diagnóstica: não envolve pesagem, custeio nem padronização de receitas.','2026-10-19','2026-10-31','in_progress'),
    (org_id,site_id,2,'Pizzas salgadas e doces','Levantar e padronizar pizzas após diagnóstico aprovado.','2026-11-01','2026-11-30','not_started'),
    (org_id,site_id,3,'Complementos do rodízio','Mapear e padronizar os complementos do rodízio.','2026-12-01','2026-12-31','not_started'),
    (org_id,site_id,4,'Culinária japonesa','Mapear e padronizar itens japoneses do rodízio de quarta e quinta.','2027-01-01','2027-01-31','not_started'),
    (org_id,site_id,5,'Espetinhos e bebidas','Mapear espetinhos de sexta-feira e bebidas.','2027-02-01','2027-02-28','not_started'),
    (org_id,site_id,6,'Consolidação, análise e fechamento','Consolidar dados, inventário, conciliação, indicadores e fechamento.','2027-03-01','2027-04-18','not_started');
  select id into first_stage from public.implementation_stages where establishment_id = site_id and stage_number = 1;
  insert into public.tasks(organization_id,establishment_id,stage_id,title,description) values
   (org_id,site_id,first_stage,'Entrevistar a gestão','Registrar objetivos, expectativas e dificuldades relatadas, identificando as respostas como declaradas.'),
   (org_id,site_id,first_stage,'Mapear estrutura e responsáveis','Entender áreas, funções e responsáveis pela operação.'),
   (org_id,site_id,first_stage,'Levantar cardápio e operação','Mapear categorias e processos existentes, sem solicitar receitas ou pesagens.'),
   (org_id,site_id,first_stage,'Verificar compras, recebimento e estoque','Registrar práticas e documentos já existentes sem presumir controles.'),
   (org_id,site_id,first_stage,'Listar sistemas e documentos disponíveis','Anotar o que foi apresentado e o que ainda está pendente.'),
   (org_id,site_id,first_stage,'Revisar diagnóstico com a gestão','Aprovar o diagnóstico antes de iniciar pesagem, custeio ou padronização.');
  insert into public.audit_events(organization_id,establishment_id,actor_id,action,entity_type,entity_id,details)
  values(org_id,site_id,auth.uid(),'workspace_started','establishment',site_id,jsonb_build_object('owner_name',owner_name));
  return jsonb_build_object('organization_id',org_id,'establishment_id',site_id);
end $$;
revoke all on function public.start_initial_workspace(text) from public;
grant execute on function public.start_initial_workspace(text) to authenticated;
