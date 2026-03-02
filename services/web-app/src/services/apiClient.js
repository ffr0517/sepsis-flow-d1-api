function isAbortError(err) {
  return err?.name === "AbortError";
}

function classifyHttpStatus(status) {
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";
  if (status >= 500) return "downstream_unavailable";
  if (status >= 400) return "client_error";
  return "unknown";
}

function parseJsonSafe(rawText) {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

export class ApiClient {
  constructor({ getBaseUrl }) {
    this.getBaseUrl = getBaseUrl;
  }

  buildUrl(path) {
    const base = String(this.getBaseUrl() || "").replace(/\/$/, "");
    const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  async request(path, { method = "GET", timeoutMs = 0, payload } = {}) {
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const options = {
        method,
        signal: controller?.signal,
        headers: payload === undefined
          ? { Accept: "application/json" }
          : { "Content-Type": "application/json", Accept: "application/json" }
      };
      if (payload !== undefined) options.body = JSON.stringify(payload);

      const resp = await fetch(this.buildUrl(path), options);
      const rawText = await resp.text();
      const body = parseJsonSafe(rawText);

      if (!resp.ok) {
        const err = new Error(body?.error?.message || body?.error || `Request failed with HTTP ${resp.status}.`);
        err.httpStatus = resp.status;
        err.responseBody = body;
        err.failureType = classifyHttpStatus(resp.status);
        throw err;
      }

      return body;
    } catch (error) {
      if (isAbortError(error)) {
        const err = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        err.failureType = "timeout";
        throw err;
      }
      if (!error?.failureType) {
        error.failureType = /failed to fetch/i.test(String(error?.message || "")) ? "network_error" : "unknown";
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  health() {
    return this.request("/health", { timeoutMs: 8000 });
  }

  warmup(timeoutMs = 210000) {
    return this.request("/warmup", { method: "POST", timeoutMs });
  }

  calculateWfaz(data) {
    return this.request("/tools/wfaz", { method: "POST", timeoutMs: 12000, payload: { data } });
  }

  flowDay1(payload) {
    return this.request("/flow/day1?format=long", { method: "POST", timeoutMs: 60000, payload });
  }

  flowDay2(payload) {
    return this.request("/flow/day2?format=long", { method: "POST", timeoutMs: 60000, payload });
  }
}
