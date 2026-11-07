create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists study_sessions_user_created_idx
  on public.study_sessions (user_id, created_at desc);

alter table public.study_sessions enable row level security;

create policy "Users can read their own study sessions"
  on public.study_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save their own study sessions"
  on public.study_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own study sessions"
  on public.study_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);
