-- G|Wired 006: job statuses cut down to five: Estimating, Quoted, Won, Closed, Lost (each with its own colour).
-- Run once after 005. Safe to run twice.
--
-- Existing jobs are moved across:
--   Enquiry, Site Visit Booked, On Hold          -> Estimating
--   Priced / Quote Sent, Awaiting Feedback       -> Quoted
--   Won, In Progress, Practical Completion, Final Account -> Won

insert into job_statuses (slug, name, sort, colour, is_lost, asks_chase, active) values
  ('estimating', 'Estimating', 10, '#7c3aed', false, false, true),
  ('quoted',     'Quoted',     20, '#d97706', false, true,  true),
  ('won',        'Won',        30, '#15803d', false, false, true),
  ('closed',     'Closed',     40, '#52525b', false, false, true),
  ('lost',       'Lost',       50, '#b91c1c', true,  false, true)
on conflict (slug) do update
  set name = excluded.name, sort = excluded.sort, colour = excluded.colour,
      is_lost = excluded.is_lost, asks_chase = excluded.asks_chase, active = true;

update jobs set status = 'estimating' where status in ('enquiry', 'site_visit_booked', 'on_hold');
update jobs set status = 'quoted' where status in ('priced_quote_sent', 'awaiting_feedback');
update jobs set status = 'won' where status in ('in_progress', 'practical_completion', 'final_account');

update job_statuses set active = false
where slug not in ('estimating', 'quoted', 'won', 'closed', 'lost');

alter table jobs alter column status set default 'estimating';
