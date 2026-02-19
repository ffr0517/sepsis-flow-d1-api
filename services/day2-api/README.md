# Day 2 API

This service mirrors the Day 1 API scaffolding and serves Day 2 treatment
predictions from `api/models/day2_bundle.rds`.

Notes:
- Endpoint: `POST /predict/day2`
- Required inputs include all baseline clinical fields plus:
  `LEVEL1_TREATMENTS_D1_SAFE_0` through `LEVEL5_TREATMENTS_D1_SAFE_0`
- Demo scripts are included in this folder and match the Day 1 script patterns.
