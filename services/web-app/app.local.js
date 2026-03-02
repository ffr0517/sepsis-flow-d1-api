window.SEPSIS_FLOW_API_BASE_URLS = window.SEPSIS_FLOW_API_BASE_URLS || {
  orchestrator: "http://localhost:8000"
};
window.SEPSIS_FLOW_APP_CONFIG = window.SEPSIS_FLOW_APP_CONFIG || {
  skipStartupWarmup: true,
  defaultEnvironment: "local"
};
window.SEPSIS_FLOW_SUPABASE = window.SEPSIS_FLOW_SUPABASE || {
  url: "",
  anonKey: ""
};

import("./src/main.js");
