create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_row jsonb;
  target_org uuid;
  target_id uuid;
begin
  changed_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  target_org := coalesce(nullif(changed_row ->> 'organization_id', '')::uuid,
                         nullif(changed_row ->> 'id', '')::uuid);
  target_id := coalesce(nullif(changed_row ->> 'id', '')::uuid,
                        nullif(changed_row ->> 'user_id', '')::uuid);

  if target_org is null or target_id is null then
    raise exception 'Audit event could not identify tenant and record';
  end if;

  insert into public.audit_events (
    organization_id, establishment_id, actor_id, action, entity_type, entity_id, details
  ) values (
    target_org,
    nullif(changed_row ->> 'establishment_id', '')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    target_id,
    jsonb_build_object('operation', lower(tg_op))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'establishments', 'implementation_stages', 'tasks', 'diagnostic_responses',
    'products', 'suppliers', 'ingredients', 'recipes', 'recipe_items',
    'ingredient_price_history', 'purchases', 'purchase_items', 'inventory_counts',
    'inventory_items', 'stock_movements', 'loss_cases', 'training_sessions',
    'training_participants', 'evidence_files'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      table_name || '_audit_change', table_name
    );
  end loop;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;