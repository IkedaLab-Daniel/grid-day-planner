-- Planner core schema: profiles, activities, blocks (+ RLS, new-user seeding)

create type public.activity_category as enum
  ('study', 'sleep', 'exercise', 'meal', 'caffeine', 'other');
create type public.block_kind as enum ('plan', 'actual');
create type public.block_source as enum ('manual', 'ai');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  day_start time not null default '05:00'
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  color_to text,
  category public.activity_category not null default 'other',
  archived_at timestamptz
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  kind public.block_kind not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  source public.block_source not null default 'manual',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index blocks_user_start_idx on public.blocks (user_id, start_at);
create index activities_user_idx on public.activities (user_id);

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.blocks enable row level security;

create policy profiles_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy activities_all on public.activities
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A block must belong to the user AND point at one of the user's own activities.
create policy blocks_select on public.blocks
  for select using (user_id = auth.uid());
create policy blocks_insert on public.blocks
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.user_id = auth.uid()
    )
  );
create policy blocks_update on public.blocks
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.user_id = auth.uid()
    )
  );
create policy blocks_delete on public.blocks
  for delete using (user_id = auth.uid());

-- New user: profile (timezone from sign-up metadata, validated) + six seed activities.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
begin
  if not exists (select 1 from pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  insert into public.profiles (id, timezone) values (new.id, tz);

  insert into public.activities (user_id, name, color, color_to, category) values
    (new.id, 'AI-101',         '#7CB342', null,      'study'),
    (new.id, 'DP-700',         '#56BADB', null,      'study'),
    (new.id, 'CS50',           '#A6A6A6', null,      'study'),
    (new.id, 'QR SaaS',        '#FADF6F', null,      'study'),
    (new.id, 'Capstone',       '#5C6BF5', '#E86DBF', 'study'),
    (new.id, 'IOT commission', '#EF4637', null,      'study');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
