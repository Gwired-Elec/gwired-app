-- G|Wired 007: the status "Won" is renamed "Live". Run once after 006. Safe to run twice.
update job_statuses set slug = 'live', name = 'Live' where slug = 'won';
update jobs set status = 'live' where status = 'won';
