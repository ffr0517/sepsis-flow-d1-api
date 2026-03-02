-- Manual smoke checks for RLS behavior.
-- Run in Supabase SQL editor with generated test users/tokens.

-- 1) Confirm helper function exists
select proname from pg_proc where proname in ('is_workspace_member_active', 'is_workspace_owner', 'bootstrap_workspace_for_user');

-- 2) Confirm RLS is enabled on all workspace tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('workspaces', 'workspace_members', 'workspace_invites', 'patients', 'assessments', 'app_settings', 'profiles')
order by tablename;

-- 3) Confirm one-workspace-per-user constraint
select conname
from pg_constraint
where conrelid = 'public.workspace_members'::regclass
  and contype = 'u';

-- 4) Confirm pending invite unique index exists
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'workspace_invites'
  and indexname = 'workspace_invites_pending_unique_idx';
