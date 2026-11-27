-- G|Wired 009: overheads and profit become ONE combined figure per estimate, with an option to use separate percentages for
-- materials and for labour instead. Run once after 008. Never re-run.
-- Existing estimates keep their price: the combined % is the old overheads % plus the old profit %.

alter table estimates add column if not exists ohp_mode text not null default 'combined' check (ohp_mode in ('combined', 'split'));
alter table estimates add column if not exists ohp_pct numeric(6, 2) not null default 0;            -- one % on everything
alter table estimates add column if not exists ohp_materials_pct numeric(6, 2) not null default 0;  -- used when ohp_mode = split
alter table estimates add column if not exists ohp_labour_pct numeric(6, 2) not null default 0;

update estimates set ohp_pct = oh_pct + profit_pct, ohp_materials_pct = oh_pct + profit_pct, ohp_labour_pct = oh_pct + profit_pct;

update sync_tables set columns = columns || array['ohp_mode', 'ohp_pct', 'ohp_materials_pct', 'ohp_labour_pct']
where table_name = 'estimates' and not ('ohp_pct' = any (columns));
