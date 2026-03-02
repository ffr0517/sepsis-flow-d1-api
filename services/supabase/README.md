# Supabase Setup (Phase 1.7)

This folder contains the schema and edge functions for account auth + team workspaces.

## 1) Apply migration

Use the Supabase SQL editor or CLI to apply:

- `migrations/20260301_phase15_auth_workspace.sql`
- `migrations/20260301_phase16_patient_profile_and_workspace_updates.sql`
- `migrations/20260302_phase17_workspace_encryption.sql`

## 2) Deploy edge functions

Functions:
- `send-workspace-invite`
- `accept-workspace-invite`

Required environment variables (edge runtime):
- `SERVICE_ROLE_KEY`
- `SITE_URL` (example: `https://your-frontend-domain`)

Notes:
- `SUPABASE_URL` is available automatically in Supabase Edge runtime.
- Newer Supabase CLI versions may reject custom secrets prefixed with `SUPABASE_`.

## 3) Frontend configuration

Set on the web app page before loading `app.js`:

```html
<script>
  window.SEPSIS_FLOW_SUPABASE = {
    url: "https://YOUR_PROJECT.supabase.co",
    anonKey: "YOUR_ANON_KEY"
  };
</script>
```

## 4) Auth provider settings

In Supabase Auth:
- Enable email/password sign-in.
- Require email confirmation.
- Configure redirect URL to the deployed web app (`/index.html`).

## 5) Invite flow notes

`send-workspace-invite` will:
- verify caller is workspace owner,
- create a `workspace_invites` row,
- attempt to send email via `auth.admin.inviteUserByEmail`.

If email sending fails, the function still returns `inviteLink` for fallback sharing.

## 6) One-workspace rule

The unique constraint on `workspace_members.user_id` enforces one active workspace membership per user in v1.
