-- One row per chat attempt, written only by chat_begin_turn. It is the rate limit and the
-- "one turn at a time" lock, and it counts attempts whether or not they succeed (a failed
-- turn still spent model calls).

create table public.chat_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index chat_turns_user_started_idx on public.chat_turns (user_id, started_at);

alter table public.chat_turns enable row level security;

-- Users can read their own attempts; nothing writes through the API directly.
create policy chat_turns_select on public.chat_turns
  for select using (user_id = auth.uid());

-- Reserve a turn: rate limit and single-flight check run under a per-user advisory lock so
-- parallel requests cannot all slip past the count.
create function public.chat_begin_turn(max_per_hour int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  recent int;
  in_flight boolean;
  turn_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select count(*) into recent
    from public.chat_turns
   where user_id = uid and started_at > now() - interval '1 hour';
  if recent >= max_per_hour then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- A turn left unfinished for over two minutes (crashed request) stops blocking.
  select exists (
    select 1 from public.chat_turns
     where user_id = uid and finished_at is null and started_at > now() - interval '2 minutes'
  ) into in_flight;
  if in_flight then
    return jsonb_build_object('status', 'busy');
  end if;

  insert into public.chat_turns (user_id) values (uid) returning id into turn_id;
  return jsonb_build_object('status', 'ok', 'id', turn_id);
end;
$$;

create function public.chat_end_turn(turn_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.chat_turns set finished_at = now() where id = turn_id and user_id = auth.uid();
$$;

revoke all on function public.chat_begin_turn(int) from public, anon;
revoke all on function public.chat_end_turn(uuid) from public, anon;
grant execute on function public.chat_begin_turn(int) to authenticated;
grant execute on function public.chat_end_turn(uuid) to authenticated;
