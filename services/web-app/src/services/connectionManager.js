import { createStore } from "../state/createStore.js";

const RETRY_DELAYS_MS = [2000, 5000, 10000];

function withJitter(ms) {
  const jitter = ms * 0.2;
  return Math.round(ms + ((Math.random() * jitter * 2) - jitter));
}

export const connectionStore = createStore({
  state: "warming", // warming | ready | degraded
  message: "Connection check pending.",
  failureType: null,
  lastCheckedAt: null,
  lastHealth: null,
  warming: false
});

function classifyFromWarmupError(error) {
  if (error?.failureType) return error.failureType;

  const status = Number(error?.httpStatus || error?.responseBody?.error?.details?.day1?.last?.status || 0);
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";
  if (status >= 500) return "downstream_unavailable";
  return "unknown";
}

export function createConnectionManager(apiClient, { skipWarmup = false } = {}) {
  async function checkReady() {
    if (connectionStore.getState().warming) return connectionStore.getState();

    connectionStore.patch({
      warming: true,
      state: "warming",
      message: "Warming backend services...",
      failureType: null
    });

    if (skipWarmup) {
      let health = null;
      try {
        health = await apiClient.health();
      } catch {
        // local dev can still proceed even if health probe fails briefly
      }

      connectionStore.patch({
        warming: false,
        state: "ready",
        message: "Ready to assess.",
        failureType: null,
        lastHealth: health,
        lastCheckedAt: new Date().toISOString()
      });
      return connectionStore.getState();
    }

    let lastError = null;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await apiClient.warmup(210000);
        const health = await apiClient.health().catch(() => null);
        connectionStore.patch({
          warming: false,
          state: "ready",
          message: "Ready to assess.",
          failureType: null,
          lastHealth: health,
          lastCheckedAt: new Date().toISOString()
        });
        return connectionStore.getState();
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_DELAYS_MS.length - 1) {
          const delay = withJitter(RETRY_DELAYS_MS[attempt]);
          connectionStore.patch({
            state: "warming",
            message: `Connection attempt ${attempt + 1} failed. Retrying...`,
            failureType: classifyFromWarmupError(error)
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    connectionStore.patch({
      warming: false,
      state: "degraded",
      message: lastError?.message || "Connection check failed.",
      failureType: classifyFromWarmupError(lastError),
      lastHealth: null,
      lastCheckedAt: new Date().toISOString()
    });

    return connectionStore.getState();
  }

  return {
    store: connectionStore,
    checkReady,
    isReady: () => connectionStore.getState().state === "ready"
  };
}
