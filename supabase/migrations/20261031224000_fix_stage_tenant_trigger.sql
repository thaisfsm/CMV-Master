create or replace function public.check_establishment_tenant()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists (
    select 1 from public.establishments e
    where e.id = new.establishment_id and e.organization_id = new.organization_id
  ) then
    raise exception 'Establishment does not belong to this organization';
  end if;
  return new;
end
$$;

create or replace function public.check_task_stage_tenant()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.stage_id is not null and not exists (
    select 1 from public.implementation_stages s
    where s.id = new.stage_id
      and s.establishment_id = new.establishment_id
      and s.organization_id = new.organization_id
  ) then
    raise exception 'Stage does not belong to this establishment';
  end if;
  return new;
end
$$;

drop trigger if exists tasks_stage_tenant_check on public.tasks;
create trigger tasks_stage_tenant_check
before insert or update of stage_id, establishment_id, organization_id
on public.tasks for each row execute function public.check_task_stage_tenant();