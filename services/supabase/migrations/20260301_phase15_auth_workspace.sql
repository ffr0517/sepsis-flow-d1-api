-- Phase 1.5: auth + workspace schema and RLS

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null check (status in ('active', 'invited')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists workspace_invites_pending_unique_idx
  on public.workspace_invites (workspace_id, lower(email))
  where status = 'pending';

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  alias text not null,
  external_id text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_assessment_at timestamptz null
);

create index if not exists patients_workspace_idx on public.patients(workspace_id);
create index if not exists patients_last_assessment_idx on public.patients(workspace_id, last_assessment_at desc);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null check (status in ('day1_complete', 'day2_complete')),
  environment text,
  orchestrator_base_url text,
  baseline_inputs jsonb not null,
  day1_outputs jsonb not null,
  day2_carry_forward_edited jsonb not null,
  day2_outputs jsonb null,
  strata jsonb null,
  summary_48h jsonb not null,
  model_metadata jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessments_workspace_patient_idx on public.assessments(workspace_id, patient_id, created_at desc);

create table if not exists public.app_settings (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_profiles_updated_at'
  ) then
    create trigger trg_profiles_updated_at
      before update on public.profiles
      for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_workspaces_updated_at'
  ) then
    create trigger trg_workspaces_updated_at
      before update on public.workspaces
      for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_patients_updated_at'
  ) then
    create trigger trg_patients_updated_at
      before update on public.patients
      for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_assessments_updated_at'
  ) then
    create trigger trg_assessments_updated_at
      before update on public.assessments
      for each row execute function public.set_updated_at_timestamp();
  end if;
end;
$$;

create or replace function public.is_workspace_member_active(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = coalesce(target_user_id, auth.uid())
      and wm.status = 'active'
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = coalesce(target_user_id, auth.uid())
      and wm.status = 'active'
      and wm.role = 'owner'
  );
$$;

revoke all on function public.is_workspace_member_active(uuid, uuid) from public;
grant execute on function public.is_workspace_member_active(uuid, uuid) to authenticated;
revoke all on function public.is_workspace_owner(uuid, uuid) from public;
grant execute on function public.is_workspace_owner(uuid, uuid) to authenticated;

create or replace function public.bootstrap_workspace_for_user(workspace_name text default 'My Workspace')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.workspace_members%rowtype;
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_existing
  from public.workspace_members
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if found then
    return jsonb_build_object(
      'workspace_id', v_existing.workspace_id,
      'role', v_existing.role,
      'status', v_existing.status
    );
  end if;

  insert into public.workspaces (name, created_by)
  values (coalesce(nullif(trim(workspace_name), ''), 'My Workspace'), v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (v_workspace_id, v_user_id, 'owner', 'active');

  insert into public.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'role', 'owner',
    'status', 'active'
  );
end;
$$;

revoke all on function public.bootstrap_workspace_for_user(text) from public;
grant execute on function public.bootstrap_workspace_for_user(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.patients enable row level security;
alter table public.assessments enable row level security;
alter table public.app_settings enable row level security;

-- Profiles policies
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Workspaces policies
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_workspace_member_active(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

-- Workspace members policies
drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member_active(workspace_id));

drop policy if exists workspace_members_owner_manage on public.workspace_members;
create policy workspace_members_owner_manage on public.workspace_members
  for all to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

-- Workspace invites policies
drop policy if exists workspace_invites_select_member on public.workspace_invites;
create policy workspace_invites_select_member on public.workspace_invites
  for select to authenticated
  using (public.is_workspace_member_active(workspace_id));

drop policy if exists workspace_invites_owner_manage on public.workspace_invites;
create policy workspace_invites_owner_manage on public.workspace_invites
  for all to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

-- Patients policies
drop policy if exists patients_member_select on public.patients;
create policy patients_member_select on public.patients
  for select to authenticated
  using (public.is_workspace_member_active(workspace_id));

drop policy if exists patients_member_insert on public.patients;
create policy patients_member_insert on public.patients
  for insert to authenticated
  with check (
    public.is_workspace_member_active(workspace_id)
    and created_by = auth.uid()
  );

drop policy if exists patients_member_update on public.patients;
create policy patients_member_update on public.patients
  for update to authenticated
  using (public.is_workspace_member_active(workspace_id))
  with check (public.is_workspace_member_active(workspace_id));

drop policy if exists patients_member_delete on public.patients;
create policy patients_member_delete on public.patients
  for delete to authenticated
  using (public.is_workspace_member_active(workspace_id));

-- Assessments policies
drop policy if exists assessments_member_select on public.assessments;
create policy assessments_member_select on public.assessments
  for select to authenticated
  using (public.is_workspace_member_active(workspace_id));

drop policy if exists assessments_member_insert on public.assessments;
create policy assessments_member_insert on public.assessments
  for insert to authenticated
  with check (
    public.is_workspace_member_active(workspace_id)
    and created_by = auth.uid()
  );

drop policy if exists assessments_member_update on public.assessments;
create policy assessments_member_update on public.assessments
  for update to authenticated
  using (public.is_workspace_member_active(workspace_id))
  with check (public.is_workspace_member_active(workspace_id));

drop policy if exists assessments_member_delete on public.assessments;
create policy assessments_member_delete on public.assessments
  for delete to authenticated
  using (public.is_workspace_member_active(workspace_id));

-- App settings policies
drop policy if exists app_settings_member_select on public.app_settings;
create policy app_settings_member_select on public.app_settings
  for select to authenticated
  using (public.is_workspace_member_active(workspace_id));

drop policy if exists app_settings_member_upsert on public.app_settings;
create policy app_settings_member_upsert on public.app_settings
  for insert to authenticated
  with check (public.is_workspace_member_active(workspace_id));

drop policy if exists app_settings_member_update on public.app_settings;
create policy app_settings_member_update on public.app_settings
  for update to authenticated
  using (public.is_workspace_member_active(workspace_id))
  with check (public.is_workspace_member_active(workspace_id));

drop policy if exists app_settings_member_delete on public.app_settings;
create policy app_settings_member_delete on public.app_settings
  for delete to authenticated
  using (public.is_workspace_member_active(workspace_id));
