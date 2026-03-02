import { createStore } from "./createStore.js";

export const assessmentStore = createStore({
  draft: null,
  day1Response: null,
  day2Response: null,
  baselineInputs: null,
  day2Prefill: null,
  editedDay2CarryForward: null,
  priorAdjustments: null,
  saving: false,
  lastSavedAssessmentId: null,
  unsavedBannerVisible: false,
  wfazCalc: {
    debounceId: null,
    requestSeq: 0,
    lastInputsKey: "",
    lastError: null,
    pending: false
  }
});

export function resetAssessmentState() {
  assessmentStore.patch({
    draft: null,
    day1Response: null,
    day2Response: null,
    baselineInputs: null,
    day2Prefill: null,
    editedDay2CarryForward: null,
    priorAdjustments: null,
    saving: false,
    lastSavedAssessmentId: null,
    unsavedBannerVisible: false
  });
}
