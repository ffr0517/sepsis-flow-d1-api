export const BASELINE_FIELDS = [
  { key: "age.months", label: "Age (months)", type: "number", step: "1" },
  {
    key: "sex",
    label: "Sex",
    type: "binary-radio",
    options: [
      { label: "Male", value: 1 },
      { label: "Female", value: 0 }
    ]
  },
  { key: "weight.value", label: "Weight", type: "number", step: "0.01", min: "0", clientOnly: true },
  {
    key: "weight.unit",
    label: "Weight Unit",
    type: "binary-radio",
    clientOnly: true,
    options: [
      { label: "kg", value: 1 },
      { label: "lbs", value: 0 }
    ]
  },
  {
    key: "wfaz",
    label: "Weight-for-Age Z-Score (auto-calculated)",
    type: "number",
    step: "0.01",
    readonly: true,
    placeholder: "Auto-calculated from sex, age, and weight"
  },
  {
    key: "adm.recent",
    label: "Recent admission (overnight hospitalisation within last 6 months)",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "cidysymp", label: "Illness Duration (days)", type: "number", step: "1" },
  {
    key: "not.alert",
    label: "Not alert (AVPU < A)",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "hr.all", label: "Heart Rate", type: "number", step: "0.1" },
  { key: "rr.all", label: "Respiratory Rate", type: "number", step: "0.1" },
  { key: "envhtemp", label: "Temperature (C)", type: "number", step: "0.1" },
  {
    key: "crt.long",
    label: "Capillary refill time > 2 seconds",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "oxy.ra", label: "SpO2 (%)", type: "number", step: "0.1", min: "1", max: "100" }
];

export const DAY2_FIELDS = [
  {
    key: "LEVEL1_TREATMENTS_D1_SAFE_0",
    label: "Day 1: Mechanical ventilation, inotropes, or renal replacement therapy",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL2_TREATMENTS_D1_SAFE_0",
    label: "Day 1: CPAP or IV fluid bolus",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL3_TREATMENTS_D1_SAFE_0",
    label: "Day 1: ICU admission with clinical reason",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL4_TREATMENTS_D1_SAFE_0",
    label: "Day 1: O2 via face or nasal cannula",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL5_TREATMENTS_D1_SAFE_0",
    label: "Day 1: Non-bolused IV fluids",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  }
];

export const WFAZ_AUTOFILL_SOURCE_KEYS = new Set(["age.months", "sex", "weight.value", "weight.unit"]);

export const STRATA_COUNTRIES = ["Bangladesh", "Cambodia", "Indonesia", "Laos", "Vietnam"];

export function defaultDay1FormValues() {
  return {
    "age.months": 24,
    sex: 0,
    "weight.value": 10,
    "weight.unit": 1,
    "adm.recent": 0,
    wfaz: "",
    cidysymp: 2,
    "not.alert": 0,
    "hr.all": 120,
    "rr.all": 28,
    envhtemp: 37.8,
    "crt.long": 0,
    "oxy.ra": 98
  };
}
