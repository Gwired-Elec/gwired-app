-- G|Wired 010: an estimate line's "sell each" can be set by hand. Without it the line uses the suggested price (cost + markup
-- + labour, with the estimate's overheads and profit % applied). Run once after 009. Never re-run.

alter table estimate_lines add column if not exists sell_override numeric(14, 4);   -- pence per unit, all-in; null = use the suggestion

update sync_tables set columns = columns || array['sell_override']
where table_name = 'estimate_lines' and not ('sell_override' = any (columns));
