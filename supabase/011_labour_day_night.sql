-- G|Wired 011: labour rates simplified to "cost" and "charged out" per day (an 8-hour day), plus a night shift price for the
-- same person. Hourly figures are now worked out from the day figures (day / 8), and the overtime multiplier is removed.
-- Run once after 010. Never re-run.

alter table labour_rates add column if not exists night_cost_pence bigint not null default 0;
alter table labour_rates add column if not exists night_rate_pence bigint not null default 0;

-- keep any rates already typed in: a grade that only had hourly figures gets day figures of 8 hours
update labour_rates set day_rate_pence = charge_per_hour_pence * 8 where day_rate_pence = 0 and charge_per_hour_pence > 0;
update labour_rates set day_cost_pence = cost_per_hour_pence * 8 where day_cost_pence = 0 and cost_per_hour_pence > 0;

alter table labour_rates drop column if exists overtime_multiplier;

update sync_tables
set columns = array['name','day_cost_pence','day_rate_pence','night_cost_pence','night_rate_pence','sort','active','deleted_at'],
    protected = array['day_cost_pence','day_rate_pence','night_cost_pence','night_rate_pence']
where table_name = 'labour_rates';
