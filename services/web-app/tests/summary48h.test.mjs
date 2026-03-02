import test from "node:test";
import assert from "node:assert/strict";
import { buildSummary48h } from "../src/services/summary48h.js";

test("summary picks highest severity across day1/day2", () => {
  const day1 = [
    { level: "Non-bolused IV fluids", predicted_treatment_by_majority_vote: true },
    { level: "CPAP or IV fluid bolus", predicted_treatment_by_majority_vote: false }
  ];
  const day2 = [
    { level: "CPAP or IV fluid bolus", predicted_treatment_by_majority_vote: true }
  ];

  const summary = buildSummary48h(day1, day2);

  assert.equal(summary.hasPrediction, true);
  assert.equal(summary.highestLevelKey, "L2");
  assert.match(summary.rationale, /Highest predicted treatment level/);
});

test("summary reports no prediction when both days have none", () => {
  const summary = buildSummary48h(
    [{ level: "Non-bolused IV fluids", predicted_treatment_by_majority_vote: false }],
    [{ level: "CPAP or IV fluid bolus", predicted_treatment_by_majority_vote: false }]
  );

  assert.equal(summary.hasPrediction, false);
  assert.equal(summary.highestLevelLabel, null);
});
