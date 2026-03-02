export const LEVEL_PRIORITY = {
  "Mechanical ventilation, inotropes, or renal replacement therapy": 1,
  "CPAP or IV fluid bolus": 2,
  "ICU admission with clinical reason": 3,
  "O2 via face or nasal cannula": 4,
  "Non-bolused IV fluids": 5
};

export const LEVEL_KEY_BY_LABEL = {
  "Mechanical ventilation, inotropes, or renal replacement therapy": "L1",
  "CPAP or IV fluid bolus": "L2",
  "ICU admission with clinical reason": "L3",
  "O2 via face or nasal cannula": "L4",
  "Non-bolused IV fluids": "L5"
};

export const DAY2_CARRY_FORWARD_KEYS = [
  "LEVEL1_TREATMENTS_D1_SAFE_0",
  "LEVEL2_TREATMENTS_D1_SAFE_0",
  "LEVEL3_TREATMENTS_D1_SAFE_0",
  "LEVEL4_TREATMENTS_D1_SAFE_0",
  "LEVEL5_TREATMENTS_D1_SAFE_0"
];
