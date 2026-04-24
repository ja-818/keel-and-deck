-- profiles: mirror of auth.users with the subset of user data Houston
-- actually uses (display name, avatar). Auto-populated via trigger on
-- auth.users insert. RLS keeps each user's row private to themselves.
--
-- This is the minimum schema needed for the auth foundation; Houston
-- Cloud tables (workspaces, sync state, team membership) will layer on
-- top in later migrations.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy "update own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
