-- G|Wired 015: photos belong to an item, not just an area. Run once after 014. Safe to run twice.
-- Existing photos (taken against a whole area) are kept and still show under the area.

alter table walkaround_photos add column if not exists element_id uuid references walkaround_elements (id);
create index if not exists walkaround_photos_element on walkaround_photos (element_id);

update sync_tables set columns = array['area_id','element_id','path','caption','sort','deleted_at'] where table_name = 'walkaround_photos';
