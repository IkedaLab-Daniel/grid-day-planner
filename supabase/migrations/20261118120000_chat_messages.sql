-- Chat helper history. Users can read and add their own rows; nothing can be edited or deleted by users.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

create policy chat_messages_select on public.chat_messages
  for select using (user_id = auth.uid());
create policy chat_messages_insert on public.chat_messages
  for insert with check (user_id = auth.uid());
