-- Home app schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- Tables are prefixed home_ so they can live in a project shared with another site.
-- Access is limited to users listed in home_members, not just "anyone logged in".

create table if not exists public.home_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

create table if not exists public.home_settings (
  key text primary key,
  value integer not null
);

create table if not exists public.home_tab_transactions (
  id bigint generated always as identity primary key,
  amount_cents integer not null check (amount_cents <> 0),
  label text not null check (char_length(label) between 1 and 80),
  created_by uuid not null default auth.uid() references public.home_members (user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.home_items (
  id bigint generated always as identity primary key,
  list text not null check (list in ('groceries', 'takealot')),
  text text not null check (char_length(text) between 1 and 200),
  done boolean not null default false,
  created_by uuid not null default auth.uid() references public.home_members (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists home_items_list on public.home_items (list);

insert into public.home_settings (key, value) values
  ('beer_price_cents', 2500),
  ('coke_price_cents', 1500)
on conflict (key) do nothing;

-- Security definer so policies on home_members itself don't recurse
create or replace function public.home_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.home_members where user_id = auth.uid());
$$;

-- Runs with the caller's rights, so RLS applies (non-members get 0)
create or replace function public.home_tab_balance() returns bigint
language sql stable as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.home_tab_transactions;
$$;

-- Explicit grants (newer projects don't always expose new tables to the API).
-- anon gets nothing; authenticated is further narrowed by the policies below.
revoke all on public.home_members, public.home_settings, public.home_tab_transactions, public.home_items from anon;
grant select on public.home_members to authenticated;
grant select, insert, update, delete on public.home_settings, public.home_tab_transactions, public.home_items to authenticated;
grant execute on function public.home_is_member(), public.home_tab_balance() to authenticated;

alter table public.home_members enable row level security;
alter table public.home_settings enable row level security;
alter table public.home_tab_transactions enable row level security;
alter table public.home_items enable row level security;

drop policy if exists "members read members" on public.home_members;
create policy "members read members" on public.home_members
  for select to authenticated using (public.home_is_member());

drop policy if exists "members only" on public.home_settings;
create policy "members only" on public.home_settings
  for all to authenticated using (public.home_is_member()) with check (public.home_is_member());

drop policy if exists "members only" on public.home_tab_transactions;
create policy "members only" on public.home_tab_transactions
  for all to authenticated using (public.home_is_member()) with check (public.home_is_member());

drop policy if exists "members only" on public.home_items;
create policy "members only" on public.home_items
  for all to authenticated using (public.home_is_member()) with check (public.home_is_member());

-- ---------------------------------------------------------------------------
-- After creating your two users (Authentication → Users → Add user), add them
-- to the allowlist. Edit the emails/names and run just these lines:
--
-- insert into public.home_members (user_id, name)
-- select id, 'Mark' from auth.users where email = 'you@example.com'
-- on conflict (user_id) do update set name = excluded.name;
--
-- insert into public.home_members (user_id, name)
-- select id, 'Hana' from auth.users where email = 'hana@example.com'
-- on conflict (user_id) do update set name = excluded.name;
