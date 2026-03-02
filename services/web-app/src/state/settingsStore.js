import { createStore } from "./createStore.js";

export const settingsStore = createStore({
  environmentSelection: "prod",
  customStagingBaseUrl: "",
  privacyShowExternalIdByDefault: false,
  skipStartupWarmup: false
});
