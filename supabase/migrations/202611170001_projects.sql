-- Apply to the qorpStreamer Supabase project using SQL Editor or Supabase CLI.
-- All mutations go through authenticated Vercel APIs, never anonymous clients.
create table if not exists public.qorp_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  draft jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  published jsonb,
  published_revision bigint,
  playback_hash text,
  -- Live state (active scene, timers) kept apart from the immutable published
  -- revision, so switching scenes never rewrites what was published.
  live jsonb not null default '{}'::jsonb,
  runtime_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists qorp_projects_owner on public.qorp_projects(owner_id);
create table if not exists public.qorp_revisions (
  project_id uuid not null references public.qorp_projects(id) on delete cascade,
  revision bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key(project_id, revision)
);
create table if not exists public.qorp_billing (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text unique,
  subscription_id text,
  status text not null default 'free',
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.qorp_stripe_events (
  id text primary key,
  created bigint not null,
  processed_at timestamptz not null default now()
);
alter table public.qorp_projects enable row level security;
alter table public.qorp_revisions enable row level security;
alter table public.qorp_billing enable row level security;
alter table public.qorp_stripe_events enable row level security;
-- No direct browser access, including authenticated users. Vercel verifies
-- identity and ownership before using the service role.
revoke all on public.qorp_projects, public.qorp_revisions, public.qorp_billing, public.qorp_stripe_events from anon, authenticated;
grant all on public.qorp_projects, public.qorp_revisions, public.qorp_billing, public.qorp_stripe_events to service_role;

create or replace function public.qorp_create_project(p_owner uuid, p_name text, p_draft jsonb)
returns public.qorp_projects language plpgsql security definer set search_path = public as $$
declare result public.qorp_projects; project_limit integer := 2;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  if exists(select 1 from qorp_billing where owner_id=p_owner and status in ('active','trialing') and paid_until > now()) then project_limit := 15; end if;
  if (select count(*) from qorp_projects where owner_id=p_owner and deleted_at is null) >= project_limit then
    raise exception 'PROJECT_LIMIT' using errcode='P0001';
  end if;
  insert into qorp_projects(owner_id,name,draft) values(p_owner,p_name,p_draft) returning * into result;
  return result;
end $$;

create or replace function public.qorp_publish_project(p_owner uuid, p_project uuid, p_expected bigint, p_hash text, p_restore bigint default null)
returns public.qorp_projects language plpgsql security definer set search_path = public as $$
declare result public.qorp_projects; payload jsonb; published_rev bigint;
begin
  select * into result from qorp_projects where id=p_project and owner_id=p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if result.revision <> p_expected then raise exception 'CONFLICT'; end if;
  if p_restore is null then
    payload := result.draft;
    published_rev := result.revision;
    insert into qorp_revisions(project_id,revision,snapshot) values(p_project,published_rev,payload) on conflict do nothing;
  else
    select snapshot into payload from qorp_revisions where project_id=p_project and revision=p_restore;
    if not found then raise exception 'NOT_FOUND'; end if;
    published_rev := p_restore;
  end if;
  update qorp_projects set published=payload, published_revision=published_rev,
    playback_hash=coalesce(playback_hash,p_hash), runtime_version=runtime_version+1, updated_at=now()
    where id=p_project returning * into result;
  return result;
end $$;

revoke all on function public.qorp_create_project(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.qorp_publish_project(uuid,uuid,bigint,text,bigint) from public, anon, authenticated;
grant execute on function public.qorp_create_project(uuid,text,jsonb) to service_role;
grant execute on function public.qorp_publish_project(uuid,uuid,bigint,text,bigint) to service_role;
