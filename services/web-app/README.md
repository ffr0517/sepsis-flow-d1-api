# Sepsis Flow Web App

Desktop-first static web app with:

- Patient-centric navigation (`Patients`, `Assess`, `Settings`)
- Guest mode (local IndexedDB persistence)
- Optional authenticated workspace mode (Supabase auth + Postgres)
- Day 1 -> Day 2 sequential assessment flow
- Day 2 carry-forward override editor
- 48-hour deterministic summary from highest predicted treatment level
- Connection manager (`warming`, `ready`, `degraded`) gating assessment submissions
- CSV export for selected patient or full dataset

## Runtime Modes

### Guest mode
- No login required.
- Patients/assessments saved locally in browser IndexedDB.
- Data is device/browser scoped.

### Authenticated workspace mode
- Email/password login via Supabase.
- Email verification required.
- Data stored in Supabase Postgres and isolated by workspace membership (RLS).
- One workspace per user in v1.

## Supabase setup

See `services/supabase/README.md`.

You must configure in page bootstrap before loading the app:

```html
<script>
  window.SEPSIS_FLOW_SUPABASE = {
    url: "https://YOUR_PROJECT.supabase.co",
    anonKey: "YOUR_ANON_KEY"
  };
</script>
```

If omitted, app runs in guest-only mode.

## Local run

Recommended stack launcher:

```bash
./scripts/run-local-web.sh
```

Open:

- `http://localhost:5173/index.local.html`

## Manual run (frontend only)

```bash
cd services/web-app
python3 -m http.server 5173
```

Open:

- `http://localhost:5173/index.html` (deployed orchestrator default)
- `http://localhost:5173/index.local.html` (local orchestrator default)

## Tests

```bash
cd services/web-app
npm test
```

(Uses Node built-in test runner; no external dependencies.)
