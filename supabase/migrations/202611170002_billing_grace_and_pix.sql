-- Support 7-day past_due grace window, one-off 12-month Pix tracking, and
-- out-of-order Stripe webhook protection on public.qorp_billing.
alter table public.qorp_billing
  add column if not exists grace_until timestamptz,
  add column if not exists payment_kind text,
  add column if not exists last_event_created bigint not null default 0,
  add column if not exists last_pix_session_id text;

create index if not exists qorp_billing_subscription
  on public.qorp_billing(subscription_id)
  where subscription_id is not null;

create or replace function public.qorp_create_project(p_owner uuid, p_name text, p_draft jsonb)
returns public.qorp_projects language plpgsql security definer set search_path = public as $$
declare
  result public.qorp_projects;
  project_limit integer := 2;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  if exists(
    select 1 from public.qorp_billing
    where owner_id = p_owner
      and (
        (status in ('active', 'trialing') and paid_until > now())
        or (
          status = 'past_due'
          and coalesce(grace_until, paid_until + interval '7 days', updated_at + interval '7 days') > now()
        )
      )
  ) then
    project_limit := 15;
  end if;
  if (select count(*) from public.qorp_projects where owner_id = p_owner and deleted_at is null) >= project_limit then
    raise exception 'PROJECT_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.qorp_projects(owner_id, name, draft) values (p_owner, p_name, p_draft) returning * into result;
  return result;
end $$;

revoke all on function public.qorp_create_project(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.qorp_create_project(uuid, text, jsonb) to service_role;
