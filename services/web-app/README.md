# Sepsis Flow Web App (Static)

Static two-step frontend for the Day 1 -> Day 2 workflow.

## Features

- Day 1 required input form.
- Optional collapsible prevalence-adjustment inputs:
  - `country` (`Bangladesh`, `Cambodia`, `Indonesia`, `Laos`, `Vietnam`)
  - `inpatient_status` (`Inpatient` / `Outpatient`)
  - If left unset, standard 50/50 (non-adjusted) output is used.
- Calls orchestrator `POST /flow/day1`.
- Displays Day 1 treatment predictions, including:
  - `mean_predicted_probability`
  - and, when available, prevalence-adjusted fields (`p_adj`, `t_adj`, prevalence metadata)
- Prefills editable Day 2 carry-forward fields:
  - `LEVEL1_TREATMENTS_D1_SAFE_0` ... `LEVEL5_TREATMENTS_D1_SAFE_0`
- Calls orchestrator `POST /flow/day2`.
- Displays Day 2 treatment predictions with the same conditional adjusted fields as Day 1.
- Exports combined flow results + trace metadata as JSON.

## Local Run

Recommended (starts local APIs + orchestrator + web server, waits for health checks):

```bash
# Run from the repository root
./scripts/run-local-web.sh
```

Then open `http://localhost:5173/index.local.html`.

Manual web-only run (static server only; does not start APIs):

```bash
cd services/web-app
python3 -m http.server 5173
```

Then open:
- `http://localhost:5173/index.local.html` for local APIs
- `http://localhost:5173/index.html` for deployed Render endpoints

## Deploy (Cloudflare Pages)

1. Connect this repository to Cloudflare Pages.
2. Set build command to empty (none).
3. Set output directory to `services/web-app`.
4. Deploy.
5. Set `CORS_ALLOW_ORIGINS` on the orchestrator to include the deployed Pages URL.
