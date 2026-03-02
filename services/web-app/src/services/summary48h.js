import { LEVEL_PRIORITY, LEVEL_KEY_BY_LABEL } from "../constants/treatments.js";

export function highestPredictedTreatment(day1Rows = [], day2Rows = []) {
  const all = [...(Array.isArray(day1Rows) ? day1Rows : []), ...(Array.isArray(day2Rows) ? day2Rows : [])]
    .filter((row) => row?.predicted_treatment_by_majority_vote);

  if (all.length === 0) {
    return {
      hasPrediction: false,
      highestLevelLabel: null,
      highestLevelKey: null,
      rationale: "No predicted treatment levels across Day 1 and Day 2."
    };
  }

  const sorted = [...all].sort((a, b) => {
    const aRank = LEVEL_PRIORITY[a?.level] ?? 999;
    const bRank = LEVEL_PRIORITY[b?.level] ?? 999;
    return aRank - bRank;
  });

  const highest = sorted[0];
  return {
    hasPrediction: true,
    highestLevelLabel: highest?.level ?? null,
    highestLevelKey: LEVEL_KEY_BY_LABEL[highest?.level] ?? null,
    rationale: `Highest predicted treatment level across 48 hours: ${highest?.level}.`
  };
}

export function buildSummary48h(day1Rows = [], day2Rows = []) {
  const highest = highestPredictedTreatment(day1Rows, day2Rows);
  return {
    generatedAt: new Date().toISOString(),
    ...highest,
    day1PredictedCount: (Array.isArray(day1Rows) ? day1Rows : []).filter((row) => row?.predicted_treatment_by_majority_vote).length,
    day2PredictedCount: (Array.isArray(day2Rows) ? day2Rows : []).filter((row) => row?.predicted_treatment_by_majority_vote).length
  };
}
