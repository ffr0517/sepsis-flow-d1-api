-- Phase 1.7: workspace client-side encryption payload columns

alter table public.patients
  add column if not exists secure_payload jsonb null;

alter table public.assessments
  add column if not exists secure_payload jsonb null;

create index if not exists patients_workspace_updated_idx
  on public.patients (workspace_id, updated_at desc);

create index if not exists assessments_workspace_patient_updated_idx
  on public.assessments (workspace_id, patient_id, updated_at desc);

comment on column public.patients.secure_payload is
  'Client-side encrypted patient payload envelope (AES-GCM).';

comment on column public.assessments.secure_payload is
  'Client-side encrypted assessment payload envelope (AES-GCM).';

-- tighten app_settings ownership for workspace crypto keys
drop policy if exists app_settings_member_upsert on public.app_settings;
drop policy if exists app_settings_member_update on public.app_settings;
drop policy if exists app_settings_member_delete on public.app_settings;

create policy app_settings_member_insert_non_crypto on public.app_settings
  for insert to authenticated
  with check (
    public.is_workspace_member_active(workspace_id)
    and key not like 'workspace_crypto_%'
  );

create policy app_settings_owner_insert_crypto on public.app_settings
  for insert to authenticated
  with check (
    public.is_workspace_owner(workspace_id)
    and key like 'workspace_crypto_%'
  );

create policy app_settings_member_update_non_crypto on public.app_settings
  for update to authenticated
  using (
    public.is_workspace_member_active(workspace_id)
    and key not like 'workspace_crypto_%'
  )
  with check (
    public.is_workspace_member_active(workspace_id)
    and key not like 'workspace_crypto_%'
  );

create policy app_settings_owner_update_crypto on public.app_settings
  for update to authenticated
  using (
    public.is_workspace_owner(workspace_id)
    and key like 'workspace_crypto_%'
  )
  with check (
    public.is_workspace_owner(workspace_id)
    and key like 'workspace_crypto_%'
  );

create policy app_settings_member_delete_non_crypto on public.app_settings
  for delete to authenticated
  using (
    public.is_workspace_member_active(workspace_id)
    and key not like 'workspace_crypto_%'
  );

create policy app_settings_owner_delete_crypto on public.app_settings
  for delete to authenticated
  using (
    public.is_workspace_owner(workspace_id)
    and key like 'workspace_crypto_%'
  );
