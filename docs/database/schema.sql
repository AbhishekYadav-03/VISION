-- ===========================================================================
-- VISION database schema (Supabase / PostgreSQL + pgvector)
--
-- Run this file in the Supabase SQL editor. It is idempotent: existing rows
-- are preserved and missing columns/indexes/functions are added.
-- ===========================================================================

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  email          text primary key,
  firstname      text not null,
  lastname       text not null,
  hashedpassword text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  email      text references public.users(email) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id                       uuid primary key default gen_random_uuid(),
  email                    text references public.users(email) on delete cascade,
  name                     text,
  avatar_url               text,
  representative_embedding vector(512),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.faces (
  id         uuid primary key default gen_random_uuid(),
  photo_id   uuid references public.photos(id) on delete cascade,
  person_id  uuid references public.people(id) on delete cascade,
  email      text references public.users(email) on delete cascade,
  bbox       jsonb not null,
  embedding  vector(512) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.albums (
  id         uuid primary key default gen_random_uuid(),
  email      text references public.users(email) on delete cascade,
  name       text not null,
  music_url  text,
  created_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid references public.albums(id) on delete cascade,
  photo_id   uuid references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (album_id, photo_id)
);

-- Additive migrations for databases created by older versions of the app.
alter table public.people add column if not exists name text;
alter table public.people add column if not exists updated_at timestamptz not null default now();
alter table public.photos add column if not exists updated_at timestamptz not null default now();
alter table public.users  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

drop trigger if exists photos_touch_updated_at on public.photos;
create trigger photos_touch_updated_at
before update on public.photos
for each row execute function public.touch_updated_at();

drop trigger if exists people_touch_updated_at on public.people;
create trigger people_touch_updated_at
before update on public.people
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (the hot paths used by the API)
-- ---------------------------------------------------------------------------

create index if not exists photos_email_created_at_idx
  on public.photos (email, created_at desc);

create index if not exists people_email_idx
  on public.people (email);

create index if not exists faces_person_id_idx
  on public.faces (person_id);

create index if not exists faces_photo_id_idx
  on public.faces (photo_id);

create index if not exists faces_email_idx
  on public.faces (email);

create index if not exists albums_email_created_at_idx
  on public.albums (email, created_at desc);

create index if not exists album_photos_album_id_idx
  on public.album_photos (album_id, created_at);

create index if not exists album_photos_photo_id_idx
  on public.album_photos (photo_id);

-- Approximate nearest-neighbour index for face clustering. HNSW gives good
-- recall without training data; pgvector >= 0.5 is required (Supabase has it).
create index if not exists people_embedding_hnsw_idx
  on public.people using hnsw (representative_embedding vector_cosine_ops)
  where representative_embedding is not null;

-- ---------------------------------------------------------------------------
-- Face matching RPC
--
-- Only the closest candidate is returned, which lets Postgres use the HNSW
-- index. The old version returned every row and sorted in the application.
-- ---------------------------------------------------------------------------

create or replace function public.match_people(
  query_embedding vector(512),
  user_email text
)
returns table (id uuid, distance double precision)
language sql
stable
as $$
  select
    p.id,
    (p.representative_embedding <=> query_embedding)::double precision as distance
  from public.people p
  where p.email = user_email
    and p.representative_embedding is not null
  order by p.representative_embedding <=> query_embedding
  limit 1;
$$;

grant execute on function public.match_people(vector, text) to service_role;

-- ---------------------------------------------------------------------------
-- Optional hardening
--
-- The API uses the service-role key, which bypasses RLS. Enabling RLS with no
-- policies stops the anon/authenticated PostgREST roles from reading these
-- tables directly. Uncomment once you have confirmed the browser never talks
-- to Supabase directly.
-- ---------------------------------------------------------------------------
-- alter table public.users        enable row level security;
-- alter table public.photos       enable row level security;
-- alter table public.people       enable row level security;
-- alter table public.faces        enable row level security;
-- alter table public.albums       enable row level security;
-- alter table public.album_photos enable row level security;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- select tablename, indexname from pg_indexes
--   where schemaname = 'public' order by tablename;
-- select proname from pg_proc where proname = 'match_people';
