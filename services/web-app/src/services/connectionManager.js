import { createStore } from "../state/createStore.js";

const STARTUP_WARMUP_MAX_ATTEMPTS = 2;
const STARTUP_WARMUP_RETRY_DELAY_MS = 3000;
const STARTUP_WARMUP_REQUEST_TIMEOUT_MS = 210000;
const BROWSER_WAKE_ROUNDS = 2;
const BROWSER_WAKE_DELAY_MS = 2500;

const INITIAL_MANUAL_WARMUP_TEXT = "Manual check only. Click 'Check API Status' to send wake-up requests to the orchestrator, Day 1 API, and Day 2 API.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectionStore = createStore({
  state: "pending", // pending | warming | ready | degraded
  message: "APIs are idle. Click 'Check API Status' to wake services and continue.",
  failureType: null,
  lastCheckedAt: null,
  lastHealth: null,
  warming: false,
  warmupText: INITIAL_MANUAL_WARMUP_TEXT,
  warmupChipLabel: "Pending",
  warmupChipClass: ""
});

function classifyFromWarmupError(error) {
  if (error?.failureType) return error.failureType;

  const status = Number(error?.httpStatus || error?.responseBody?.error?.details?.day1?.last?.status || 0);
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";
  if (status >= 500) return "downstream_unavailable";
  return "unknown";
}

function normalizeWakeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return `${text.replace(/\/+$/, "")}/`;
}

function summarizeWarmupTarget(details, key) {
  const info = details?.[key];
  if (!info) return null;
  if (info.ok) return `${key.toUpperCase()}: ready`;
  const status = Number.isFinite(Number(info?.last?.status)) ? `HTTP ${Number(info.last.status)}` : null;
  const error = info?.last?.error ? String(info.last.error) : null;
  const reason = status || error || "no response";
  const attempts = Number.isFinite(Number(info?.attempts)) ? ` after ${Number(info.attempts)} probe(s)` : "";
  return `${key.toUpperCase()}: ${reason}${attempts}`;
}

function summarizeWarmupError(error) {
  const code = error?.responseBody?.error?.code ? ` [${error.responseBody.error.code}]` : "";
  const details = error?.responseBody?.error?.details;
  const targetSummaries = ["day1", "day2"].map((key) => summarizeWarmupTarget(details, key)).filter(Boolean);
  if (targetSummaries.length === 0) return `${error?.message || "Unknown error."}${code}`;
  return `${error?.message || "Unknown error."}${code} (${targetSummaries.join("; ")})`;
}

async function browserWake(url) {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit"
    });
  } catch {
    // no-cors wake calls are best-effort; orchestrator warmup is the readiness source of truth.
  }
}

async function wakeServicesFromBrowser(getWakeUrls, onRoundStart) {
  const urlsConfig = (typeof getWakeUrls === "function" ? getWakeUrls() : {}) || {};
  const urls = [urlsConfig.orchestrator, urlsConfig.day1, urlsConfig.day2]
    .map(normalizeWakeUrl)
    .filter(Boolean);

  if (!urls.length) return;

  for (let round = 1; round <= BROWSER_WAKE_ROUNDS; round += 1) {
    onRoundStart?.(round, BROWSER_WAKE_ROUNDS);
    await Promise.all(urls.map((url) => browserWake(url)));
    if (round < BROWSER_WAKE_ROUNDS) await sleep(BROWSER_WAKE_DELAY_MS);
  }
}

export function createConnectionManager(apiClient, { skipWarmup = false, getWakeUrls } = {}) {
  async function checkReady() {
    if (connectionStore.getState().warming) return connectionStore.getState();

    connectionStore.patch({
      warming: true,
      state: "warming",
      message: "Loading: checking API endpoints",
      failureType: null
    });

    if (skipWarmup) {
      let health = null;
      try {
        health = await apiClient.health();
      } catch {
        // local development can proceed even when the first health probe is not ready.
      }

      connectionStore.patch({
        warming: false,
        state: "ready",
        message: "Local mode active. Startup warmup skipped.",
        failureType: null,
        lastHealth: health,
        lastCheckedAt: new Date().toISOString(),
        warmupText: "Startup warmup skipped because local mode is enabled.",
        warmupChipLabel: "Skipped",
        warmupChipClass: ""
      });
      return connectionStore.getState();
    }

    connectionStore.patch({
      warmupText: "Manual API check started. Sending wake-up requests, then verifying readiness. Cold starts on Render can take 1-3 minutes.",
      warmupChipLabel: "Warming Up",
      warmupChipClass: "chip-warn"
    });

    try {
      await wakeServicesFromBrowser(getWakeUrls, (round, total) => {
        connectionStore.patch({
          warmupText: `Sending wake-up requests (${round}/${total}) to orchestrator, Day 1, and Day 2 APIs...`,
          warmupChipLabel: "Waking",
          warmupChipClass: "chip-warn"
        });
      });

      let lastError = null;
      for (let attempt = 1; attempt <= STARTUP_WARMUP_MAX_ATTEMPTS; attempt += 1) {
        try {
          await apiClient.warmup(STARTUP_WARMUP_REQUEST_TIMEOUT_MS);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < STARTUP_WARMUP_MAX_ATTEMPTS) {
            connectionStore.patch({
              warmupText: `API status check attempt ${attempt} failed while verifying readiness. Retrying...`,
              warmupChipLabel: "Retrying",
              warmupChipClass: "chip-warn",
              failureType: classifyFromWarmupError(error)
            });
            await sleep(STARTUP_WARMUP_RETRY_DELAY_MS);
          }
        }
      }

      if (lastError) throw lastError;

      const health = await apiClient.health().catch(() => null);
      connectionStore.patch({
        warming: false,
        state: "ready",
        message: "Ready to run Day 1 prediction.",
        failureType: null,
        lastHealth: health,
        lastCheckedAt: new Date().toISOString(),
        warmupText: "API status check complete. Orchestrator, Day 1, and Day 2 APIs are ready.",
        warmupChipLabel: "Ready",
        warmupChipClass: "chip-ok"
      });
      return connectionStore.getState();
    } catch (error) {
      const warmupMessage = summarizeWarmupError(error);
      connectionStore.patch({
        warming: false,
        state: "degraded",
        message: `Failed: ${warmupMessage}`,
        failureType: classifyFromWarmupError(error),
        lastHealth: null,
        lastCheckedAt: new Date().toISOString(),
        warmupText: `API status check failed: ${warmupMessage}`,
        warmupChipLabel: "Failed",
        warmupChipClass: "chip-error"
      });
      return connectionStore.getState();
    }
  }

  return {
    store: connectionStore,
    checkReady,
    isReady: () => connectionStore.getState().state === "ready"
  };
}
