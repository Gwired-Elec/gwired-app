-- G|Wired 020: photos on variation items. Run once after 019. Safe to run twice.
-- Variation photos are stored the same way as walkaround photos (same table, same private bucket). A photo either belongs to a
-- walkaround item (area_id / element_id) or to a line of a variation's pricing (line_id).
alter table walkaround_photos alter column area_id drop not null;
alter table walkaround_photos add column if not exists line_id uuid references estimate_lines (id);
create index if not exists walkaround_photos_line on walkaround_photos (line_id);

update sync_tables set columns = array['area_id','element_id','line_id','path','original_path','caption','sort','deleted_at'] where table_name = 'walkaround_photos';
