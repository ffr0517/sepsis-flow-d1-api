const DEFAULT_ENV_CONFIG = {
  prod: {
    label: "Production",
    orchestratorBaseUrl: "https://sepsis-flow-orchestrator.onrender.com"
  },
  staging: {
    label: "Staging",
    orchestratorBaseUrl: ""
  },
  local: {
    label: "Local",
    orchestratorBaseUrl: "http://localhost:8000"
  }
};

const STORAGE_KEY = "sepsis_flow_settings_v1";

export function loadPersistedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveOrchestratorBaseUrl(settings, runtimeDefaults = {}) {
  const selection = settings.environmentSelection || "prod";

  if (selection === "staging") {
    return settings.customStagingBaseUrl || runtimeDefaults.staging || DEFAULT_ENV_CONFIG.staging.orchestratorBaseUrl;
  }
  if (selection === "local") {
    return runtimeDefaults.local || DEFAULT_ENV_CONFIG.local.orchestratorBaseUrl;
  }
  return runtimeDefaults.prod || DEFAULT_ENV_CONFIG.prod.orchestratorBaseUrl;
}

export function envConfig() {
  return DEFAULT_ENV_CONFIG;
}
