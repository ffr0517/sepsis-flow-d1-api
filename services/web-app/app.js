window.SEPSIS_FLOW_API_BASE_URLS = window.SEPSIS_FLOW_API_BASE_URLS || {
  orchestrator: "https://sepsis-flow-orchestrator.onrender.com"
};
window.SEPSIS_FLOW_APP_CONFIG = window.SEPSIS_FLOW_APP_CONFIG || {
  skipStartupWarmup: false,
  defaultEnvironment: "prod",
  workspace_client_encryption_v1: true,
  workspaceClientEncryptionV1: true,
  appVersion: "phase-1.7"
};
window.SEPSIS_FLOW_SUPABASE = window.SEPSIS_FLOW_SUPABASE || {
  url: "",
  anonKey: ""
};

import("./src/main.js");
