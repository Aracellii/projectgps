-- Supabase schema for locations table
-- Run this in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  created_at timestamptz default now()
);

create index if not exists locations_user_id_idx on public.locations(user_id);

-- Profiles table for custom user data
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

-- Drop existing policy if exists
drop policy if exists "allow users manage own profile" on public.profiles;

-- Allow users to read/update their own profile
create policy "allow users manage own profile" on public.profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Function to handle new user profile creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on user signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.locations enable row level security;

drop policy if exists "allow auth insert" on public.locations;
drop policy if exists "allow auth read" on public.locations;

create policy "allow auth insert" on public.locations
  for insert
  to authenticated
  with check (auth.uid() = user_id);
-- Allow authenticated reads (all users)
create policy "allow auth read" on public.locations
  for select
  to authenticated
  using (true);
