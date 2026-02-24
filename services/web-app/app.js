const API_BASE_URLS = window.SEPSIS_FLOW_API_BASE_URLS || {
  orchestrator: "https://sepsis-flow-orchestrator.onrender.com",
  day1: "https://sepsis-flow-d1-api.onrender.com",
  day2: "https://sepsis-flow-platform.onrender.com"
};
const APP_CONFIG = window.SEPSIS_FLOW_APP_CONFIG || {};
const SKIP_STARTUP_WARMUP = Boolean(APP_CONFIG.skipStartupWarmup);
const ORCHESTRATOR_API_BASE_URL = API_BASE_URLS.orchestrator;
const DAY1_API_BASE_URL = API_BASE_URLS.day1;
const DAY2_API_BASE_URL = API_BASE_URLS.day2;
const STARTUP_WARMUP_MAX_ATTEMPTS = 2;
const STARTUP_WARMUP_RETRY_DELAY_MS = 3000;
const STARTUP_WARMUP_REQUEST_TIMEOUT_MS = 210000;
const BROWSER_WAKE_ROUNDS = 2;
const BROWSER_WAKE_DELAY_MS = 2500;

const BASELINE_FIELDS = [
  { key: "age.months", label: "Age (months)", type: "number", step: "1" },
  {
    key: "sex",
    label: "Sex",
    type: "binary-radio",
    options: [
      { label: "Male", value: 1 },
      { label: "Female", value: 0 }
    ]
  },
  {
    key: "adm.recent",
    label: "Recent admission (overnight hospitalisation within last 6 months)",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "wfaz", label: "Weight-for-Age Z-Score", type: "number", step: "0.01" },
  { key: "cidysymp", label: "Illness Duration (days)", type: "number", step: "1" },
  {
    key: "not.alert",
    label: "Not alert (AVPU < A)",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "hr.all", label: "Heart Rate", type: "number", step: "0.1" },
  { key: "rr.all", label: "Respiratory Rate", type: "number", step: "0.1" },
  { key: "envhtemp", label: "Temperature (C)", type: "number", step: "0.1" },
  {
    key: "crt.long",
    label: "Capillary refill time > 2 seconds",
    type: "binary-radio",
    options: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 }
    ]
  },
  { key: "oxy.ra", label: "SpO2 (%)", type: "number", step: "0.1", min: "1", max: "100" }
];

const DAY2_FIELDS = [
  {
    key: "LEVEL1_TREATMENTS_D1_SAFE_0",
    label: "Day 1: Mechanical ventilation, inotropes, or renal replacement therapy",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL2_TREATMENTS_D1_SAFE_0",
    label: "Day 1: CPAP or IV fluid bolus",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL3_TREATMENTS_D1_SAFE_0",
    label: "Day 1: ICU admission with clinical reason",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL4_TREATMENTS_D1_SAFE_0",
    label: "Day 1: O2 via face or nasal cannula",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  },
  {
    key: "LEVEL5_TREATMENTS_D1_SAFE_0",
    label: "Day 1: Non-bolused IV fluids",
    type: "binary-radio",
    options: [
      { label: "Received", value: 1 },
      { label: "Not Received", value: 0 }
    ]
  }
];

const state = {
  baselineInputs: null,
  day2Prefill: null,
  day1Response: null,
  day2Response: null,
  priorAdjustments: null,
  startupReady: false,
  startupWarming: false,
  loading: {
    day1: false,
    day2: false
  }
};

const byId = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAbortError(err) {
  return err?.name === "AbortError";
}

async function browserWake(url) {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit"
    });
  } catch (_) {
    // Opaque / no-cors failures are not reliable signals; orchestrator warmup verifies readiness.
  }
}

async function wakeServicesFromBrowser() {
  const urls = [
    `${ORCHESTRATOR_API_BASE_URL}/`,
    `${DAY1_API_BASE_URL}/`,
    `${DAY2_API_BASE_URL}/`
  ];

  for (let round = 1; round <= BROWSER_WAKE_ROUNDS; round += 1) {
    setWarmupUi({
      text: `Sending wake-up requests (${round}/${BROWSER_WAKE_ROUNDS}) to orchestrator, Day 1, and Day 2 APIs...`,
      chipLabel: "Waking",
      chipClass: "chip-warn"
    });

    await Promise.all(urls.map((url) => browserWake(url)));
    if (round < BROWSER_WAKE_ROUNDS) await sleep(BROWSER_WAKE_DELAY_MS);
  }
}

function makeFieldHtml({ key, label, type = "number", step = "any", min, max }, value = "") {
  const renderBinaryPills = (keyName, leftText, rightText, val) => {
    const leftChecked = String(val) === "1" ? "checked" : "";
    const rightChecked = String(val) === "0" ? "checked" : "";
    return `
      <div class="field">
        <label id="${keyName}-label">${label}</label>
        <div class="pill-group" role="radiogroup" aria-labelledby="${keyName}-label">
          <input type="radio" id="${keyName}-left" name="${keyName}" value="1" ${leftChecked} required />
          <label for="${keyName}-left" class="pill">${leftText}</label>

          <input type="radio" id="${keyName}-right" name="${keyName}" value="0" ${rightChecked} />
          <label for="${keyName}-right" class="pill">${rightText}</label>
        </div>
      </div>
    `;
  };

  if (type === "binary-radio") {
    const fieldDef = [...BASELINE_FIELDS, ...DAY2_FIELDS].find((field) => field.key === key);
    if (fieldDef?.options?.length === 2) {
      return renderBinaryPills(
        key,
        fieldDef.options[0].label,
        fieldDef.options[1].label,
        value
      );
    }
  }

  const minAttr = min !== undefined ? `min="${min}"` : "";
  const maxAttr = max !== undefined ? `max="${max}"` : "";
  return `
    <div class="field">
      <label for="${key}">${label}</label>
      <input id="${key}" name="${key}" type="${type}" step="${step}" ${minAttr} ${maxAttr} value="${value}" required />
    </div>
  `;
}

function renderDay1Form(defaults = {}) {
  byId("day1Form").innerHTML = BASELINE_FIELDS.map((f) => makeFieldHtml(f, defaults[f.key] ?? "")).join("");
}

function renderDay2Form(prefill = {}) {
  byId("day2Form").innerHTML = DAY2_FIELDS.map((f) => makeFieldHtml(f, prefill[f.key] ?? 0)).join("");
}

function showCard(id) {
  byId(id).classList.remove("hidden");
}

function hideCard(id) {
  byId(id).classList.add("hidden");
}

function setStatus(kind, message) {
  const indicator = byId("statusIndicator");
  const text = byId("statusText");
  indicator.className = `status-indicator status-${kind}`;
  text.textContent = message;
}

function friendlyErrorMessage(err) {
  const message = err?.message || "Unknown error.";
  if (SKIP_STARTUP_WARMUP && /failed to fetch/i.test(message)) {
    return `Could not reach local orchestrator at ${ORCHESTRATOR_API_BASE_URL}. Start local APIs on :8001/:8002 and orchestrator on :8000. Test ${ORCHESTRATOR_API_BASE_URL}/health. If needed, set CORS_ALLOW_ORIGINS=http://localhost:5173.`;
  }
  return message;
}

function setLoading(phase, isLoading) {
  state.loading[phase] = isLoading;
  const runDay1Btn = byId("runDay1Btn");
  const runDay2Btn = byId("runDay2Btn");

  if (phase === "day1") {
    runDay1Btn.disabled = isLoading;
    runDay1Btn.textContent = isLoading ? "Running Day 1..." : "Run Day 1";
  }
  if (phase === "day2") {
    runDay2Btn.disabled = isLoading;
    runDay2Btn.textContent = isLoading ? "Running Day 2..." : "Run Day 2";
  }

  if (state.loading.day1 || state.loading.day2) {
    setStatus("loading", "Loading: running prediction request. Please wait.");
  }
}

function setWarmupUi({ text, chipLabel, chipClass }) {
  const warmupText = byId("warmupText");
  const warmupChip = byId("warmupChip");
  warmupText.textContent = text;
  warmupChip.textContent = chipLabel;
  warmupChip.className = `chip ${chipClass}`.trim();
}

function setInteractionLocked(locked) {
  const gateableCards = document.querySelectorAll(".gateable");
  gateableCards.forEach((card) => {
    card.classList.toggle("locked", locked);
    card.querySelectorAll("input, button, select, textarea").forEach((el) => {
      el.disabled = locked;
    });
  });
}

function clampNumberInputToBounds(el) {
  if (!el || el.tagName !== "INPUT" || el.type !== "number" || el.value === "") return;
  let n = Number(el.value);
  if (!Number.isFinite(n)) return;
  const min = el.min !== "" ? Number(el.min) : null;
  const max = el.max !== "" ? Number(el.max) : null;
  if (Number.isFinite(min) && n < min) n = min;
  if (Number.isFinite(max) && n > max) n = max;
  if (String(n) !== el.value) {
    el.value = String(n);
  }
}

function readNumberInput(id) {
  const el = byId(id);
  if (el) {
    if ("value" in el && el.type !== "radio") {
      const raw = el.value;
      let n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${id}.`);
      if (el.type === "number") {
        clampNumberInputToBounds(el);
        n = Number(el.value);
      }
      return n;
    }
  }

  const radios = document.getElementsByName(id);
  if (radios && radios.length > 0) {
    for (let i = 0; i < radios.length; i++) {
      if (radios[i].checked) {
        const n = Number(radios[i].value);
        if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${id}.`);
        return n;
      }
    }
    throw new Error(`Invalid numeric value for ${id} (no option selected).`);
  }

  throw new Error(`Missing input element for ${id}.`);
}

function collectBaselineInputs() {
  const out = {};
  BASELINE_FIELDS.forEach((f) => {
    if (f.type === "binary-radio") {
      const selected = document.querySelector(`input[name="${f.key}"]:checked`);
      if (!selected) throw new Error(`Select an option for ${f.label}.`);
      out[f.key] = Number(selected.value);
      return;
    }
    out[f.key] = readNumberInput(f.key);
  });
  return out;
}

function collectDay2Prefill() {
  const out = {};
  DAY2_FIELDS.forEach((f) => {
    const value = readNumberInput(f.key);
    out[f.key] = value > 0.5 ? 1 : 0;
  });
  return out;
}

function collectOptionalStrata() {
  const country = (byId("priorCountry")?.value || "").trim();
  const inpatientStatus = (byId("priorInpatientStatus")?.value || "").trim();
  const strata = {};
  if (country) strata.country = country;
  if (inpatientStatus) strata.inpatient_status = inpatientStatus;
  return strata;
}

function withOptionalStrata(payload, strata) {
  if (!strata || Object.keys(strata).length === 0) return payload;
  return { ...payload, strata };
}

function strataSummaryText(strata) {
  if (!strata || Object.keys(strata).length === 0) return "standard 50/50 priors";
  const country = strata.country ? `country=${strata.country}` : null;
  const inpatient = strata.inpatient_status ? `inpatient_status=${strata.inpatient_status}` : null;
  return [country, inpatient].filter(Boolean).join(", ");
}

function asPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return (num * 100).toFixed(2);
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatPredictionRow(row) {
  return {
    treatment: row.level ?? "",
    avgPredictedProbabilityPct: asPercent(row.mean_predicted_probability),
    adjustedPredictedProbabilityPct: asPercent(row.p_adj),
    adjustedThresholdPct: asPercent(row.t_adj),
    prevalencePct: asPercent(row.prevalence),
    prevalenceScope: row.prevalence_scope ?? "",
    prevalenceStratum: row.prevalence_stratum ?? "",
    votersExceedingThreshold: row.votes_exceeding_threshold ?? "",
    votesAboveThresholdPct: asPercent(row.votes_above_threshold),
    overallTreatmentPrediction: row.predicted_treatment_by_majority_vote ? "Yes" : "No"
  };
}


function confidenceClassFromPct(pctStr) {
  const n = Number(String(pctStr).replace(/[^0-9.-]/g, "")) || 0;
  if (n >= 80) return "confidence-strong";
  if (n >= 60) return "confidence-moderate";
  if (n >= 50) return "confidence-borderline";
  return "confidence-weak";
}

function renderHeroCard(row) {
  const pct = Number(String(row.avgPredictedProbabilityPct).replace(/[^0-9.-]/g, "")) || 0;
  const pctDisplay = row.avgPredictedProbabilityPct === "" ? "—" : `${row.avgPredictedProbabilityPct}%`;
  const confClass = confidenceClassFromPct(row.avgPredictedProbabilityPct);
  // show adjusted lines if they exist
  const adjustedLines = row.adjustedPredictedProbabilityPct || row.adjustedThresholdPct || row.prevalencePct
    ? `<div class="hero-adjusted">
         ${row.adjustedPredictedProbabilityPct ? `<div><strong>Adjusted:</strong> ${row.adjustedPredictedProbabilityPct}% (threshold: ${row.adjustedThresholdPct}%)</div>` : ""}
         ${row.prevalencePct ? `<div><strong>Prevalence:</strong> ${row.prevalencePct}%</div>` : ""}
       </div>`
    : "";

  return `
    <article class="treatment-hero ${confClass}">
      <div class="hero-left">
        <h3 class="hero-title">${row.treatment}</h3>
        ${adjustedLines}
        <div class="hero-support">
          <span class="muted small">Voters exceeding threshold: ${row.votersExceedingThreshold}</span>
          <span class="muted small">•</span>
          <span class="muted small">Votes above threshold: ${row.votesAboveThresholdPct}%</span>
        </div>
      </div>

      <div class="hero-right">
        <div class="decision-badge decision-yes">Predicted Treatment</div>
        <div class="prob-number">${pctDisplay}</div>
        <div class="prob-bar" aria-hidden="true">
          <div class="prob-fill" style="width: ${Math.min(100, pct)}%"></div>
        </div>
      </div>
    </article>
  `;
}

function renderCompactRow(row) {
  const pctDisplay = row.avgPredictedProbabilityPct === "" ? "—" : `${row.avgPredictedProbabilityPct}%`;
  return `
    <div class="compact-row ${row.overallTreatmentPrediction === "Yes" ? "compact-row-yes" : ""}">
      <div class="compact-left">
        <div class="compact-title">${row.treatment}</div>
        <div class="muted small">Voters: ${row.votersExceedingThreshold} • Votes above threshold: ${row.votesAboveThresholdPct}%</div>
      </div>
      <div class="compact-right">
        <div class="compact-prob">${pctDisplay}</div>
        <div class="compact-decision">${row.overallTreatmentPrediction}</div>
      </div>
    </div>
  `;
}



function tableFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "<p class='hint'>No rows returned.</p>";
  const formatted = rows.map(formatPredictionRow);

  // pull priority predicted treatments and promote to big panel
  const recommended = formatted.filter((r) => r.overallTreatmentPrediction === "Yes");
  const others = formatted.filter((r) => r.overallTreatmentPrediction !== "Yes");

  // stack multiple predicted treatments by importance (if multiple)
  const heroHtml = recommended.length > 0
    ? `<section class="hero-section">
         <header class="hero-section-header">
           <h3>${recommended.length} Predicted Treatment${recommended.length > 1 ? "s" : ""}</h3>
           <p class="muted small">Primary predicted treatment(s) for this patient:</p>
         </header>
         ${recommended.map(renderHeroCard).join("")}
       </section>`
    : "";

  // supporting list
  const compactSupportHtml = `
    <section class="support-section">
      <header class="support-section-header">
        <h4>Other treatments</h4>
      </header>

      <div class="support-compact-cards">
        ${others.map(renderCompactRow).join("")}
      </div>
    </section>
  `;

  return `${heroHtml}${compactSupportHtml}${summaryCardsFromRows(formatted)}`;

  return `${heroHtml}${compactSupportHtml}${summaryCardsFromRows(formatted)}`;
}

function summaryCardsFromRows(rows) {
  const recommended = rows.filter((r) => r.overallTreatmentPrediction === "Yes");
  if (recommended.length === 0) {
    return `<div class="topline-summary muted">No predicted treatments by majority vote.</div>`;
  }

  const top = recommended[0];
  const topPct = top.avgPredictedProbabilityPct || "—";
  return `<div class="topline-summary">
    <strong>${recommended.length} predicted treatment${recommended.length > 1 ? "s" : ""}:</strong>
    <span class="muted"> ${top.treatment} — ${topPct}%</span>
  </div>`;
}

async function postJson(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error?.message || body?.error || `Request failed with HTTP ${resp.status}.`);
  }
  return body;
}

async function requestJson(url, { method = "GET", timeoutMs = 0, payload } = {}) {
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const options = {
      method,
      signal: controller?.signal
    };

    if (payload !== undefined) {
      options.headers = { "Content-Type": "application/json", Accept: "application/json" };
      options.body = JSON.stringify(payload);
    } else {
      options.headers = { Accept: "application/json" };
    }

    const resp = await fetch(url, options);
    const raw = await resp.text();
    const body = raw ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    })() : {};

    if (!resp.ok) {
      const err = new Error(body?.error?.message || `Request failed with HTTP ${resp.status}.`);
      err.httpStatus = resp.status;
      err.responseBody = body;
      throw err;
    }

    return body;
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function checkLocalOrchestratorHealth() {
  if (!SKIP_STARTUP_WARMUP) return;

  try {
    await requestJson(`${ORCHESTRATOR_API_BASE_URL}/health`, {
      method: "GET",
      timeoutMs: 5000
    });
    setStatus("success", `Local API mode: connected to orchestrator at ${ORCHESTRATOR_API_BASE_URL}. Ready to run Day 1 prediction.`);
  } catch (err) {
    setStatus("error", `Local API mode: ${friendlyErrorMessage(err)}`);
  }
}

function summarizeWarmupTarget(details, key) {
  const info = details?.[key];
  if (!info) return null;
  if (info.ok) return `${key.toUpperCase()}: ready`;
  const status = Number.isFinite(Number(info?.last?.status)) ? `HTTP ${Number(info.last.status)}` : null;
  const err = info?.last?.error ? String(info.last.error) : null;
  const reason = status || err || "no response";
  const attempts = Number.isFinite(Number(info?.attempts)) ? ` after ${Number(info.attempts)} probe(s)` : "";
  return `${key.toUpperCase()}: ${reason}${attempts}`;
}

function summarizeWarmupError(err) {
  const code = err?.responseBody?.error?.code ? ` [${err.responseBody.error.code}]` : "";
  const details = err?.responseBody?.error?.details;
  const targetSummaries = ["day1", "day2"].map((key) => summarizeWarmupTarget(details, key)).filter(Boolean);
  if (targetSummaries.length === 0) return `${err.message || "Unknown error."}${code}`;
  return `${err.message || "Unknown error."}${code} (${targetSummaries.join("; ")})`;
}

function renderDay1Results(envelope) {
  const rows = envelope?.data?.day1_result || [];
  byId("day1Results").innerHTML = tableFromRows(rows);
  showCard("day1ResultsCard");
}

function renderDay2Results(envelope) {
  const rows = envelope?.data?.day2_result || [];
  byId("day2Results").innerHTML = tableFromRows(rows);
  showCard("day2ResultsCard");
}

function escapeCsvCell(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildCsvRows() {
  const header = [
    "Day",
    "Treatment",
    "Averaged Predicted Probability (%)",
    "Prevalence-Adjusted Probability (%)",
    "Adjusted Threshold (%)",
    "Stratum Prevalence (%)",
    "Prevalence Scope",
    "Prevalence Stratum",
    "Voters Exceeding Threshold",
    "Votes Above Threshold (%)",
    "Overall Treatment Prediction"
  ];
  const lines = [header.map(escapeCsvCell).join(",")];

  const day1Rows = (state.day1Response?.data?.day1_result || []).map((row) => ({ day: "Day 1", ...formatPredictionRow(row) }));
  const day2Rows = (state.day2Response?.data?.day2_result || []).map((row) => ({ day: "Day 2", ...formatPredictionRow(row) }));

  [...day1Rows, ...day2Rows].forEach((row) => {
    const values = [
      row.day,
      row.treatment,
      row.avgPredictedProbabilityPct,
      row.adjustedPredictedProbabilityPct,
      row.adjustedThresholdPct,
      row.prevalencePct,
      row.prevalenceScope,
      row.prevalenceStratum,
      row.votersExceedingThreshold,
      row.votesAboveThresholdPct,
      row.overallTreatmentPrediction
    ];
    lines.push(values.map(escapeCsvCell).join(","));
  });

  return lines.join("\n");
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleRunDay1() {
  try {
    if (!state.startupReady) throw new Error("APIs are not ready yet. Click 'Check API Status' first.");
    setLoading("day1", true);
    const baselineInputs = collectBaselineInputs();
    const priorAdjustments = collectOptionalStrata();
    const envelope = await postJson(
      `${ORCHESTRATOR_API_BASE_URL}/flow/day1?format=long`,
      withOptionalStrata({ data: baselineInputs }, priorAdjustments)
    );

    state.baselineInputs = envelope?.data?.baseline_inputs || baselineInputs;
    state.priorAdjustments = priorAdjustments;
    state.day2Prefill = envelope?.data?.day2_prefill || {};
    state.day1Response = envelope;
    state.day2Response = null;

    renderDay1Results(envelope);
    renderDay2Form(state.day2Prefill);
    showCard("day2EditCard");
    byId("day2ResultsCard").classList.add("hidden");
    byId("exportCard").classList.add("hidden");
    setStatus("success", `Success: Day 1 treatment predictions completed (${strataSummaryText(priorAdjustments)}).`);
  } catch (err) {
    setStatus("error", `Failed: ${friendlyErrorMessage(err)}`);
  } finally {
    setLoading("day1", false);
  }
}

async function handleRunDay2() {
  try {
    if (!state.startupReady) throw new Error("APIs are not ready yet. Click 'Check API Status' first.");
    setLoading("day2", true);
    if (!state.baselineInputs) throw new Error("Run Day 1 first to generate baseline and Day 2 prefill.");
    const day2Prefill = collectDay2Prefill();
    const priorAdjustments = collectOptionalStrata();

    const envelope = await postJson(
      `${ORCHESTRATOR_API_BASE_URL}/flow/day2?format=long`,
      withOptionalStrata({
        baseline_inputs: state.baselineInputs,
        day2_prefill: day2Prefill
      }, priorAdjustments)
    );

    state.day2Prefill = day2Prefill;
    state.priorAdjustments = priorAdjustments;
    state.day2Response = envelope;

    renderDay2Results(envelope);
    showCard("exportCard");
    setStatus("success", `Success: Day 2 treatment predictions completed (${strataSummaryText(priorAdjustments)}).`);
  } catch (err) {
    setStatus("error", `Failed: ${friendlyErrorMessage(err)}`);
  } finally {
    setLoading("day2", false);
  }
}

function handleExport() {
  if (!state.startupReady) {
    setStatus("error", "Failed: APIs are not ready yet. Click 'Check API Status' first.");
    return;
  }
  if (!state.day1Response || !state.day2Response) {
    setStatus("error", "Failed: run both Day 1 and Day 2 predictions before exporting CSV.");
    return;
  }
  const csvText = buildCsvRows();
  downloadCsv("sepsis-flow-two-day-results.csv", csvText);
  setStatus("success", "Success: CSV export downloaded.");
}

async function runStartupWarmup() {
  if (SKIP_STARTUP_WARMUP) {
    state.startupReady = true;
    state.startupWarming = false;
    setInteractionLocked(false);
    setStatus("neutral", "Local API mode: startup wake-up check is disabled. Ready to run Day 1 prediction.");
    return;
  }

  if (state.startupWarming) return;
  state.startupWarming = true;
  state.startupReady = false;
  setInteractionLocked(true);
  byId("retryWarmupBtn").disabled = true;
  setStatus("loading", "Loading: checking API endpoints");
  setWarmupUi({
    text: "Manual API check started. Sending wake-up requests, then verifying readiness. Cold starts on Render can take 1-3 minutes.",
    chipLabel: "Warming Up",
    chipClass: "chip-warn"
  });

  try {
    await wakeServicesFromBrowser();
    let lastError = null;

    for (let attempt = 1; attempt <= STARTUP_WARMUP_MAX_ATTEMPTS; attempt += 1) {
      try {
        await requestJson(`${ORCHESTRATOR_API_BASE_URL}/warmup`, {
          method: "POST",
          timeoutMs: STARTUP_WARMUP_REQUEST_TIMEOUT_MS
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < STARTUP_WARMUP_MAX_ATTEMPTS) {
          setWarmupUi({
            text: `API status check attempt ${attempt} failed while verifying readiness. Retrying...`,
            chipLabel: "Retrying",
            chipClass: "chip-warn"
          });
          await sleep(STARTUP_WARMUP_RETRY_DELAY_MS);
        }
      }
    }

    if (lastError) throw lastError;

    state.startupReady = true;
    setInteractionLocked(false);
    setStatus("neutral", "Ready to run Day 1 prediction.");
    setWarmupUi({
      text: "API status check complete. Orchestrator, Day 1, and Day 2 APIs are ready.",
      chipLabel: "Ready",
      chipClass: "chip-ok"
    });
  } catch (err) {
    console.error("Startup warmup failed", err?.responseBody || err);
    const warmupMessage = summarizeWarmupError(err);
    state.startupReady = false;
    setInteractionLocked(true);
    setStatus("error", `Failed: ${warmupMessage}`);
    setWarmupUi({
      text: `API status check failed: ${warmupMessage}`,
      chipLabel: "Failed",
      chipClass: "chip-error"
    });
  } finally {
    state.startupWarming = false;
    byId("retryWarmupBtn").disabled = false;
  }
}

function init() {
  renderDay1Form({
    "age.months": 24,
    sex: 0,
    "adm.recent": 0,
    wfaz: -1.1,
    cidysymp: 2,
    "not.alert": 0,
    "hr.all": 120,
    "rr.all": 28,
    envhtemp: 37.8,
    "crt.long": 0,
    "oxy.ra": 98
  });

  byId("runDay1Btn").addEventListener("click", handleRunDay1);
  byId("runDay2Btn").addEventListener("click", handleRunDay2);
  byId("exportBtn").addEventListener("click", handleExport);
  byId("retryWarmupBtn").addEventListener("click", runStartupWarmup);
  byId("day1Form").addEventListener("input", (event) => {
    if (event.target?.id === "oxy.ra") clampNumberInputToBounds(event.target);
  });
  byId("day1Form").addEventListener("change", (event) => {
    if (event.target?.id === "oxy.ra") clampNumberInputToBounds(event.target);
  });

  if (SKIP_STARTUP_WARMUP) {
    hideCard("warmupCard");
    setInteractionLocked(false);
    state.startupReady = true;
    state.startupWarming = false;
    setStatus("neutral", `Local API mode: warm-up disabled. Using local orchestrator at ${ORCHESTRATOR_API_BASE_URL}.`);
    void checkLocalOrchestratorHealth();
    return;
  }

  setInteractionLocked(true);
  state.startupReady = false;
  setStatus("neutral", "APIs are idle. Click 'Check API Status' to wake services and continue.");

  setWarmupUi({
    text: "Click 'Check API Status' to send wake-up requests to backend services. Expect 1-3 minutes for services to become ready.",
    chipLabel: "Pending",
    chipClass: ""
  });
}

init();
