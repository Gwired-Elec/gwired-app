-- G|Wired 016: keep the original photo when it is marked up. Run once after 015. Safe to run twice.
-- "path" is the picture shown (the marked-up one if there is one); "original_path" is the untouched picture, so the markup can
-- be removed later. Empty means the photo has not been marked up.

alter table walkaround_photos add column if not exists original_path text;

update sync_tables set columns = array['area_id','element_id','path','original_path','caption','sort','deleted_at'] where table_name = 'walkaround_photos';
