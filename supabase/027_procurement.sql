-- G|Wired 027: materials procurement list on the Costs tab. Run once after 026. Safe to run twice.
-- Each material on a job is one job_costs row (kind 'material'): status 'needed' = still to order, 'actual' = ordered or bought.
-- These columns let a row remember how many, what unit, and which estimate line it was pulled in from (so nothing is pulled in twice).
alter table job_costs add column if not exists qty numeric(12, 3);
alter table job_costs add column if not exists unit text;
alter table job_costs add column if not exists estimate_line_id uuid;

insert into sync_tables (table_name, columns, protected) values
  ('job_costs', array['job_id','kind','status','description','supplier','person','days','rate_pence','amount_pence','cost_date','source_event_id','notes','created_by','deleted_at','qty','unit','estimate_line_id'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
