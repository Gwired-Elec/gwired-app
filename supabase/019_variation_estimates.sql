-- G|Wired 019: price variations like an estimate (materials, price per point, day rates, assemblies). Run once after 018. Safe to run twice.
-- A variation's pricing is an ordinary estimate row (with its sections and lines) that points at the variation.
alter table estimates add column if not exists variation_id uuid references variations (id);
create index if not exists estimates_variation on estimates (variation_id);

update sync_tables set columns = array['job_id','rev','name','status','method','labour_rate_id','oh_pct','profit_pct','ohp_mode','ohp_pct','ohp_materials_pct','ohp_labour_pct','contingency_pct','discount_pct','vat_rate','reverse_charge','notes','issued_at','variation_id','deleted_at'] where table_name = 'estimates';
