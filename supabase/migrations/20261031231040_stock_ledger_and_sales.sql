alter table public.purchases add column if not exists received_at timestamptz;
alter table public.stock_movements add column if not exists unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0);
alter table public.inventory_items add column if not exists unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0);
alter table public.purchase_items drop constraint if exists purchase_items_unit_price_nonnegative;
alter table public.purchase_items add constraint purchase_items_unit_price_nonnegative check (unit_price is null or unit_price >= 0);
create unique index if not exists stock_movements_source_operation_key
  on public.stock_movements(source_record, movement_type) where source_record is not null;
create unique index if not exists inventory_count_ingredient_unique
  on public.inventory_items(inventory_count_id, ingredient_id) where ingredient_id is not null;

create table if not exists public.sales_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  sold_on date not null,
  gross_revenue numeric(14,2) not null check (gross_revenue >= 0),
  source text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.sales_records enable row level security;
create policy sales_records_read_members on public.sales_records for select using (private.is_org_member(organization_id));
create policy sales_records_insert_members on public.sales_records for insert with check (private.is_org_editor(organization_id));
create policy sales_records_update_members on public.sales_records for update using (private.is_org_editor(organization_id)) with check (private.is_org_editor(organization_id));
create policy sales_records_delete_members on public.sales_records for delete using (private.is_org_editor(organization_id));

create or replace function public.check_operational_references()
returns trigger language plpgsql set search_path = public
as $$
declare
  parent_org uuid;
  parent_establishment uuid;
begin
  if tg_table_name = 'purchases' then
    if new.supplier_id is not null and not exists (
      select 1 from public.suppliers s where s.id = new.supplier_id
        and s.organization_id = new.organization_id and s.establishment_id = new.establishment_id
    ) then raise exception 'Supplier must belong to this establishment'; end if;
  elsif tg_table_name = 'ingredients' then
    if new.supplier_id is not null and not exists (
      select 1 from public.suppliers s where s.id = new.supplier_id
        and s.organization_id = new.organization_id and s.establishment_id = new.establishment_id
    ) then raise exception 'Supplier must belong to this establishment'; end if;
  elsif tg_table_name = 'recipes' then
    if new.product_id is not null and not exists (
      select 1 from public.products p where p.id = new.product_id
        and p.organization_id = new.organization_id and p.establishment_id = new.establishment_id
    ) then raise exception 'Product must belong to this establishment'; end if;
  elsif tg_table_name = 'loss_cases' then
    if new.ingredient_id is not null and not exists (
      select 1 from public.ingredients i where i.id = new.ingredient_id
        and i.organization_id = new.organization_id and i.establishment_id = new.establishment_id
    ) then raise exception 'Ingredient must belong to this establishment'; end if;
    if new.product_id is not null and not exists (
      select 1 from public.products p where p.id = new.product_id
        and p.organization_id = new.organization_id and p.establishment_id = new.establishment_id
    ) then raise exception 'Product must belong to this establishment'; end if;
  elsif tg_table_name = 'stock_movements' then
    if not exists (
      select 1 from public.ingredients i where i.id = new.ingredient_id
        and i.organization_id = new.organization_id and i.establishment_id = new.establishment_id
    ) then raise exception 'Ingredient must belong to this establishment'; end if;
  elsif tg_table_name = 'ingredient_price_history' then
    if not exists (
      select 1 from public.ingredients i where i.id = new.ingredient_id
        and i.organization_id = new.organization_id and i.establishment_id = new.establishment_id
    ) then raise exception 'Ingredient must belong to this establishment'; end if;
    if new.supplier_id is not null and not exists (
      select 1 from public.suppliers s where s.id = new.supplier_id
        and s.organization_id = new.organization_id and s.establishment_id = new.establishment_id
    ) then raise exception 'Supplier must belong to this establishment'; end if;
  elsif tg_table_name = 'purchase_items' then
    select p.organization_id, p.establishment_id into parent_org, parent_establishment
      from public.purchases p where p.id = new.purchase_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'Purchase must belong to this organization';
    end if;
    if new.ingredient_id is not null and not exists (
      select 1 from public.ingredients i where i.id = new.ingredient_id
        and i.organization_id = parent_org and i.establishment_id = parent_establishment
    ) then raise exception 'Ingredient must belong to the purchase establishment'; end if;
  elsif tg_table_name = 'inventory_items' then
    select c.organization_id, c.establishment_id into parent_org, parent_establishment
      from public.inventory_counts c where c.id = new.inventory_count_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'Inventory count must belong to this organization';
    end if;
    if new.ingredient_id is not null and not exists (
      select 1 from public.ingredients i where i.id = new.ingredient_id
        and i.organization_id = parent_org and i.establishment_id = parent_establishment
    ) then raise exception 'Ingredient must belong to the inventory establishment'; end if;
  end if;
  return new;
end $$;

create trigger purchases_operational_refs before insert or update of supplier_id, organization_id, establishment_id on public.purchases for each row execute function public.check_operational_references();
create trigger ingredients_operational_refs before insert or update of supplier_id, organization_id, establishment_id on public.ingredients for each row execute function public.check_operational_references();
create trigger recipes_operational_refs before insert or update of product_id, organization_id, establishment_id on public.recipes for each row execute function public.check_operational_references();
create trigger losses_operational_refs before insert or update of ingredient_id, product_id, organization_id, establishment_id on public.loss_cases for each row execute function public.check_operational_references();
create trigger stock_operational_refs before insert or update of ingredient_id, organization_id, establishment_id on public.stock_movements for each row execute function public.check_operational_references();
create trigger prices_operational_refs before insert or update of ingredient_id, supplier_id, organization_id, establishment_id on public.ingredient_price_history for each row execute function public.check_operational_references();
create or replace function public.check_child_tenant()
returns trigger language plpgsql set search_path = public
as $$
declare
  parent_org uuid;
  parent_establishment uuid;
begin
  if tg_table_name = 'purchase_items' then
    select p.organization_id, p.establishment_id into parent_org, parent_establishment
      from public.purchases p where p.id = new.purchase_id;
    if parent_org is null or parent_org <> new.organization_id then raise exception 'Purchase must belong to this organization'; end if;
    if new.ingredient_id is not null and not exists (select 1 from public.ingredients i where i.id = new.ingredient_id and i.organization_id = parent_org and i.establishment_id = parent_establishment) then
      raise exception 'Ingredient must belong to the purchase establishment';
    end if;
  elsif tg_table_name = 'inventory_items' then
    select c.organization_id, c.establishment_id into parent_org, parent_establishment
      from public.inventory_counts c where c.id = new.inventory_count_id;
    if parent_org is null or parent_org <> new.organization_id then raise exception 'Inventory count must belong to this organization'; end if;
    if new.ingredient_id is not null and not exists (select 1 from public.ingredients i where i.id = new.ingredient_id and i.organization_id = parent_org and i.establishment_id = parent_establishment) then
      raise exception 'Ingredient must belong to the inventory establishment';
    end if;
  elsif tg_table_name = 'training_participants' and not exists (
    select 1 from public.training_sessions s where s.id = new.training_id and s.organization_id = new.organization_id
  ) then raise exception 'Training must belong to this organization';
  end if;
  return new;
end $$;

create trigger sales_records_tenant_check before insert or update on public.sales_records for each row execute function public.check_establishment_tenant();
create trigger sales_records_audit_change after insert or update or delete on public.sales_records for each row execute function public.audit_row_change();

drop policy if exists stock_movements_insert_members on public.stock_movements;
drop policy if exists stock_movements_update_members on public.stock_movements;
drop policy if exists stock_movements_delete_members on public.stock_movements;

create or replace function public.guard_workflow_status()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare
  workflow_owner text;
begin
  select r.rolname into workflow_owner
  from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.oid = case when tg_table_name = 'purchases'
    then 'public.receive_purchase(uuid)'::regprocedure
    else 'public.close_inventory_count(uuid)'::regprocedure end;
  if tg_table_name = 'purchases' then
    if tg_op = 'INSERT' and new.status = 'received' and current_user <> workflow_owner then
      raise exception 'Use receive_purchase() to post inventory movements atomically';
    end if;
    if tg_op = 'DELETE' and old.status = 'received' then raise exception 'Received purchases cannot be deleted'; end if;
    if tg_op = 'UPDATE' and new.status = 'received' and old.status <> 'received' and current_user <> workflow_owner then
      raise exception 'Use receive_purchase() to post inventory movements atomically';
    end if;
    if tg_op in ('UPDATE','DELETE') and old.status = 'received' and tg_op = 'UPDATE' then
      raise exception 'Received purchases are immutable; use a reversal workflow';
    end if;
  elsif tg_table_name = 'inventory_counts' then
    if tg_op = 'INSERT' and new.status = 'closed' and current_user <> workflow_owner then
      raise exception 'Use close_inventory_count() to reconcile stock atomically';
    end if;
    if tg_op = 'DELETE' and old.status = 'closed' then raise exception 'Closed inventory counts cannot be deleted'; end if;
    if tg_op = 'UPDATE' and new.status = 'closed' and old.status <> 'closed' and current_user <> workflow_owner then
      raise exception 'Use close_inventory_count() to reconcile stock atomically';
    end if;
    if tg_op = 'UPDATE' and old.status = 'closed' then raise exception 'Closed inventory counts are immutable'; end if;
  elsif tg_table_name = 'purchase_items' and tg_op <> 'INSERT' and exists(select 1 from public.purchases p where p.id = old.purchase_id and p.status = 'received') then
    raise exception 'Items of received purchases are immutable';
  elsif tg_table_name = 'inventory_items' and tg_op <> 'INSERT' and exists(select 1 from public.inventory_counts c where c.id = old.inventory_count_id and c.status = 'closed') then
    raise exception 'Items of closed inventory counts are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger purchases_workflow_guard before insert or update or delete on public.purchases for each row execute function public.guard_workflow_status();
create trigger inventory_counts_workflow_guard before insert or update or delete on public.inventory_counts for each row execute function public.guard_workflow_status();
create trigger purchase_items_workflow_guard before update or delete on public.purchase_items for each row execute function public.guard_workflow_status();
create trigger inventory_items_workflow_guard before update or delete on public.inventory_items for each row execute function public.guard_workflow_status();

create or replace function public.receive_purchase(target_purchase_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  purchase_row public.purchases%rowtype;
  line record;
  movement_count integer := 0;
begin
  select * into purchase_row from public.purchases where id = target_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if not private.is_org_editor(purchase_row.organization_id) then raise exception 'Editor access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(purchase_row.establishment_id::text, 0));
  if purchase_row.status = 'received' then
    return jsonb_build_object('purchase_id', purchase_row.id, 'status', 'received', 'already_received', true);
  end if;
  if not exists (select 1 from public.purchase_items where purchase_id = purchase_row.id) then
    raise exception 'A purchase needs at least one item before receipt';
  end if;
  for line in
    select pi.*, i.purchase_unit
    from public.purchase_items pi
    left join public.ingredients i on i.id = pi.ingredient_id
    where pi.purchase_id = purchase_row.id
    for update of pi
  loop
    if line.received_quantity is null or line.unit is null or btrim(line.unit) = '' then
      raise exception 'Every purchase item needs an actual received quantity and unit';
    end if;
    if line.ingredient_id is not null then
      if line.purchase_unit is null or lower(btrim(line.purchase_unit)) <> lower(btrim(line.unit)) then
        raise exception 'Purchase unit must match the ingredient purchase unit before stock can be received';
      end if;
      if line.unit_price is not null then
        insert into public.ingredient_price_history(organization_id, establishment_id, ingredient_id, supplier_id, unit_price, observed_at, source_note)
        values (purchase_row.organization_id, purchase_row.establishment_id, line.ingredient_id, purchase_row.supplier_id, line.unit_price, purchase_row.purchased_at, purchase_row.document_number);
        update public.ingredients set current_price = line.unit_price, price_updated_at = purchase_row.purchased_at
        where id = line.ingredient_id;
      end if;
      insert into public.stock_movements(organization_id, establishment_id, ingredient_id, movement_type, quantity, unit, unit_cost, occurred_at, source_record, notes)
      values (purchase_row.organization_id, purchase_row.establishment_id, line.ingredient_id, 'purchase', line.received_quantity, lower(btrim(line.unit)), line.unit_price, now(), line.id, coalesce(purchase_row.document_number, 'Compra recebida'));
      movement_count := movement_count + 1;
    end if;
  end loop;
  update public.purchase_items set recorded_quantity = received_quantity where purchase_id = purchase_row.id;
  update public.purchases set status = 'received', received_at = now() where id = purchase_row.id;
  return jsonb_build_object('purchase_id', purchase_row.id, 'status', 'received', 'stock_movements', movement_count);
end;
$$;

create or replace function public.close_inventory_count(target_inventory_count_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  count_row public.inventory_counts%rowtype;
  line record;
  expected_qty numeric;
  average_cost numeric;
  missing_cost boolean;
  movement_count integer := 0;
begin
  select * into count_row from public.inventory_counts where id = target_inventory_count_id for update;
  if not found then raise exception 'Inventory count not found'; end if;
  if not private.is_org_editor(count_row.organization_id) then raise exception 'Editor access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(count_row.establishment_id::text, 0));
  if count_row.status = 'closed' then
    return jsonb_build_object('inventory_count_id', count_row.id, 'status', 'closed', 'already_closed', true);
  end if;
  if not exists (select 1 from public.inventory_items where inventory_count_id = count_row.id) then
    raise exception 'An inventory count needs at least one item';
  end if;
  if exists (select 1 from public.stock_movements where establishment_id = count_row.establishment_id and occurred_at > count_row.counted_at) then
    raise exception 'This count is earlier than a recorded stock movement; reconcile the latest count first';
  end if;
  if exists (
    select 1 from public.stock_movements m
    where m.establishment_id = count_row.establishment_id
    group by m.ingredient_id
    having sum(m.quantity) <> 0
      and not exists(select 1 from public.inventory_items ii where ii.inventory_count_id = count_row.id and ii.ingredient_id = m.ingredient_id)
  ) then raise exception 'Include every ingredient with a non-zero stock balance in this inventory'; end if;
  for line in
    select ii.*, i.purchase_unit, i.id as valid_ingredient_id
    from public.inventory_items ii
    left join public.ingredients i on i.id = ii.ingredient_id
    where ii.inventory_count_id = count_row.id
    for update of ii
  loop
    if line.counted_quantity is null then raise exception 'Every counted item needs an actual quantity'; end if;
    if line.counted_quantity < 0 then raise exception 'Counted quantities cannot be negative'; end if;
    if line.ingredient_id is null then
      update public.inventory_items set unit_cost = null where id = line.id;
      continue;
    end if;
    if line.valid_ingredient_id is null or line.purchase_unit is null or line.unit is null
       or lower(btrim(line.purchase_unit)) <> lower(btrim(line.unit)) then
      raise exception 'Inventory unit must match the ingredient purchase unit';
    end if;
    select coalesce(sum(m.quantity), 0),
           case when bool_or(m.quantity <> 0 and m.unit_cost is null) then null
                when coalesce(sum(m.quantity), 0) > 0 then sum(m.quantity * m.unit_cost) / sum(m.quantity)
                else null end,
           coalesce(bool_or(m.quantity <> 0 and m.unit_cost is null), false)
      into expected_qty, average_cost, missing_cost
      from public.stock_movements m
      where m.ingredient_id = line.ingredient_id and m.establishment_id = count_row.establishment_id
        and m.occurred_at <= count_row.counted_at;
    if line.counted_quantity <> expected_qty then
      insert into public.stock_movements(organization_id, establishment_id, ingredient_id, movement_type, quantity, unit, unit_cost, occurred_at, source_record, notes)
      values (count_row.organization_id, count_row.establishment_id, line.ingredient_id, 'count', line.counted_quantity - expected_qty,
              lower(btrim(line.unit)), case when missing_cost then null else average_cost end, count_row.counted_at,
              line.id, 'Ajuste de inventário após contagem física');
      movement_count := movement_count + 1;
    end if;
    update public.inventory_items set expected_quantity = expected_qty,
      unit_cost = case when missing_cost then null else average_cost end,
      investigation_status = case when line.counted_quantity <> expected_qty then 'uninvestigated_difference' else 'not_investigated' end
      where id = line.id;
  end loop;
  update public.inventory_counts set status = 'closed' where id = count_row.id;
  return jsonb_build_object('inventory_count_id', count_row.id, 'status', 'closed', 'stock_adjustments', movement_count);
end;
$$;

revoke all on function public.receive_purchase(uuid) from public, anon;
revoke all on function public.close_inventory_count(uuid) from public, anon;
grant execute on function public.receive_purchase(uuid) to authenticated;
grant execute on function public.close_inventory_count(uuid) to authenticated;
