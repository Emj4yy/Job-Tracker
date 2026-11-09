-- =============================================================
-- Migration 001: new status list + work setup column
-- Only needed for databases created with the FIRST version of schema.sql.
-- (A fresh project only needs schema.sql, which already includes these changes.)
-- Safe to re-run.
-- =============================================================

-- 1. Replace the status rule and convert existing rows to the new values
alter table public.jobs drop constraint if exists jobs_status_check;

update public.jobs
set status = case status
  when 'applied'   then 'waiting'
  when 'interview' then 'interviewing'
  when 'offer'     then 'accepted'
  else status
end
where status in ('applied', 'interview', 'offer');

alter table public.jobs alter column status set default 'waiting';

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('wishlist', 'waiting', 'interviewing', 'accepted', 'rejected', 'withdrawn', 'ghosted'));

-- 2. Add the work setup column (On-site / Hybrid / Remote, optional)
alter table public.jobs add column if not exists work_setup text;

alter table public.jobs drop constraint if exists jobs_work_setup_check;
alter table public.jobs
  add constraint jobs_work_setup_check
  check (work_setup is null or work_setup in ('onsite', 'hybrid', 'remote'));
