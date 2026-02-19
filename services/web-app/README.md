# Sepsis Flow Web App (Static)

Static two-step frontend for the Day 1 -> Day 2 workflow.

## Features

- Day 1 required input form.
- Calls orchestrator `POST /flow/day1`.
- Displays Day 1 treatment predictions, including `mean_predicted_probability`.
- Prefills editable Day 2 carry-forward fields:
  - `LEVEL1_TREATMENTS_D1_SAFE_0` ... `LEVEL5_TREATMENTS_D1_SAFE_0`
- Calls orchestrator `POST /flow/day2`.
- Displays Day 2 treatment predictions, including `mean_predicted_probability`.
- Exports combined flow results + trace metadata as JSON.

## Local Run

Any static server works.

```bash
cd services/web-app
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy (Cloudflare Pages)

1. Connect this repository to Cloudflare Pages.
2. Set build command to empty (none).
3. Set output directory to `services/web-app`.
4. Deploy.
5. Set `CORS_ALLOW_ORIGINS` on the orchestrator to include the deployed Pages URL.
