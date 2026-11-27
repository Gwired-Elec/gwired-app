-- G|Wired 029: the 07:00 daily summary notification. Run once, AFTER 028 and after deploying the "push" function.
-- BEFORE running: change the two values marked  <<< EDIT  below (your project reference and a secret you invent, the same one you add to the push function as CRON_SECRET).
-- It runs at 06:00 and 07:00 UTC; the function only sends when it is 07:00 in London, so it is right in summer and winter.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'gwired-daily-push';

select cron.schedule(
  'gwired-daily-push',
  '0 6,7 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/push',            -- <<< EDIT: your project reference
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),  -- <<< EDIT: the CRON_SECRET you chose
    body := '{"action":"daily"}'::jsonb
  );
  $$
);
