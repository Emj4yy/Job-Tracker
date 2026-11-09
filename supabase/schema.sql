-- =============================================================
-- Job Application Tracker - database schema
-- Run this whole file once in the Supabase SQL Editor.
-- It is safe to re-run: every statement is idempotent.
-- =============================================================


-- -------------------------------------------------------------
-- 1. Table
-- -------------------------------------------------------------
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),

  -- Owner of the row. Filled in automatically from the logged-in
  -- user's JWT, so the frontend never has to send it.
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  company       text not null
                check (char_length(btrim(company)) between 1 and 200),
  role          text not null
                check (char_length(btrim(role)) between 1 and 200),
  date_applied  date,
  -- wishlist = not applied yet, waiting = "Wait for Reply", withdrawn = "Rejected Myself"
  status        text not null default 'waiting'
                constraint jobs_status_check
                check (status in ('wishlist', 'waiting', 'interviewing', 'accepted', 'rejected', 'withdrawn', 'ghosted')),
  work_setup    text
                constraint jobs_work_setup_check
                check (work_setup is null or work_setup in ('onsite', 'hybrid', 'remote')),

  -- Only http(s) links are accepted, which also blocks "javascript:" URLs.
  job_link      text
                check (job_link is null or (job_link ~* '^https?://' and char_length(job_link) <= 2048)),
  location      text check (location is null or char_length(location) <= 200),
  salary_range  text check (salary_range is null or char_length(salary_range) <= 100),
  notes         text check (notes is null or char_length(notes) <= 5000),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- -------------------------------------------------------------
-- 2. Index (every query filters by user_id through RLS)
-- -------------------------------------------------------------
create index if not exists jobs_user_id_idx on public.jobs (user_id);


-- -------------------------------------------------------------
-- 3. Keep updated_at current on every UPDATE
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();


-- -------------------------------------------------------------
-- 4. Row Level Security
-- Every request from the browser runs as the "authenticated" role
-- with the user's id available as auth.uid(). These policies make
-- sure a user can only ever see and change their own rows.
-- -------------------------------------------------------------
alter table public.jobs enable row level security;

drop policy if exists "Users can view their own jobs"   on public.jobs;
drop policy if exists "Users can insert their own jobs" on public.jobs;
drop policy if exists "Users can update their own jobs" on public.jobs;
drop policy if exists "Users can delete their own jobs" on public.jobs;

create policy "Users can view their own jobs"
  on public.jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own jobs"
  on public.jobs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING limits which rows can be targeted; WITH CHECK stops a user
-- from reassigning a row to someone else's user_id.
create policy "Users can update their own jobs"
  on public.jobs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own jobs"
  on public.jobs for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- -------------------------------------------------------------
-- 5. Table privileges
-- Logged-out visitors (anon role) get no access at all.
-- -------------------------------------------------------------
revoke all on public.jobs from anon;
grant select, insert, update, delete on public.jobs to authenticated;
