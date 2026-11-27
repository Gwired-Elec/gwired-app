-- G|Wired 018: part-accepted variations. Run once after 017. Safe to run twice.
-- When a variation is approved, the value the client actually accepted is kept here (empty = accepted in full). Anything
-- below the priced total shows as a discount line on the application for payment.
alter table variations add column if not exists approved_pence bigint;

update sync_tables set columns = array['job_id','number','title','description','status','var_date','approved_pence','deleted_at'] where table_name = 'variations';
