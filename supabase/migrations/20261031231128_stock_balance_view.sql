create or replace view public.stock_balances
with (security_invoker = true)
as
select
  organization_id,
  establishment_id,
  ingredient_id,
  unit,
  sum(quantity)::numeric as on_hand_quantity,
  case
    when bool_or(quantity <> 0 and unit_cost is null) then null
    when sum(quantity) > 0 then sum(quantity * unit_cost) / sum(quantity)
    else null
  end::numeric as weighted_average_unit_cost,
  max(occurred_at) as last_movement_at
from public.stock_movements
group by organization_id, establishment_id, ingredient_id, unit;
grant select on public.stock_balances to authenticated;
