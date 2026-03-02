-- Phase 1.6: patient profile defaults + profile consistency updates

alter table public.patients
  add column if not exists country text null;

alter table public.patients
  add column if not exists inpatient_status text null;

alter table public.patients
  add column if not exists age_months numeric null;

alter table public.patients
  add column if not exists sex smallint null;

alter table public.patients
  add column if not exists weight_value numeric null;

alter table public.patients
  add column if not exists weight_unit text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_inpatient_status_check'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_inpatient_status_check
      check (inpatient_status in ('Inpatient', 'Outpatient'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_sex_check'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_sex_check
      check (sex in (0, 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_weight_unit_check'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_weight_unit_check
      check (weight_unit in ('kg', 'lbs'));
  end if;
end;
$$;

alter table public.profiles
  add column if not exists display_name text null;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

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
    select 1
    from pg_trigger
    where tgname = 'trg_profiles_updated_at'
  ) then
    create trigger trg_profiles_updated_at
      before update on public.profiles
      for each row execute function public.set_updated_at_timestamp();
  end if;
end;
$$;
