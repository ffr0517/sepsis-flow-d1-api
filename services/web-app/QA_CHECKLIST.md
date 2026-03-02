# Phase 1.5 QA Checklist

## Guest mode
- Create patient and run Day 1/Day 2.
- Reload page and confirm local data persists.
- Confirm assessments are visible in timeline.

## Auth + workspace
- Sign up with email/password and verify email.
- Sign in and confirm workspace is auto-created (owner role).
- Send invite from owner account and accept with another account.
- Confirm invited user is member and cannot send invites.
- Confirm one-workspace-per-user enforcement.

## Data isolation
- Create data in Workspace A.
- Sign in with Workspace B user and verify Workspace A data is not visible.

## Guest import
- Create guest data before sign in.
- Sign in and verify import prompt appears.
- Import guest data and verify rows appear in workspace timeline.

## Connection manager
- Verify Assess buttons are disabled before readiness.
- Run connection check and verify Ready state enables Day 1/Day 2 buttons.

## Export
- Export selected patient CSV.
- Export all-data CSV.
