const BASELINE_FIELDS = [
  { key: "age.months", label: "Age (months)", type: "number", step: "1" },
  { key: "sex", label: "Sex (1=male, 0=female)", type: "number", step: "1", min: "0", max: "1" },
  { key: "adm.recent", label: "Recent Admission (1/0)", type: "number", step: "1", min: "0", max: "1" },
  { key: "wfaz", label: "WFA Z-Score", type: "number", step: "0.01" },
  { key: "cidysymp", label: "Illness Duration (days)", type: "number", step: "1" },
  { key: "not.alert", label: "Not Alert (1/0)", type: "number", step: "1", min: "0", max: "1" },
  { key: "hr.all", label: "Heart Rate", type: "number", step: "0.1" },
  { key: "rr.all", label: "Respiratory Rate", type: "number", step: "0.1" },
  { key: "envhtemp", label: "Temperature (C)", type: "number", step: "0.1" },
  { key: "crt.long", label: "CRT >2s (1/0)", type: "number", step: "1", min: "0", max: "1" },
  { key: "oxy.ra", label: "SpO2 (%)", type: "number", step: "0.1" }
];

const DAY2_FIELDS = [
  { key: "LEVEL1_TREATMENTS_D1_SAFE_0", label: "Day1 L1 Carry-Forward (1/0)" },
  { key: "LEVEL2_TREATMENTS_D1_SAFE_0", label: "Day1 L2 Carry-Forward (1/0)" },
  { key: "LEVEL3_TREATMENTS_D1_SAFE_0", label: "Day1 L3 Carry-Forward (1/0)" },
  { key: "LEVEL4_TREATMENTS_D1_SAFE_0", label: "Day1 L4 Carry-Forward (1/0)" },
  { key: "LEVEL5_TREATMENTS_D1_SAFE_0", label: "Day1 L5 Carry-Forward (1/0)" }
];

const state = {
  baselineInputs: null,
  day2Prefill: null,
  day1Response: null,
  day2Response: null,
  loading: {
    day1: false,
    day2: false
  }
};

const byId = (id) => document.getElementById(id);

function makeFieldHtml({ key, label, type = "number", step = "any", min, max }, value = "") {
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
  byId("day2Form").innerHTML = DAY2_FIELDS.map((f) => makeFieldHtml({ ...f, min: "0", max: "1", step: "1" }, prefill[f.key] ?? 0)).join("");
}

function showCard(id) {
  byId(id).classList.remove("hidden");
}

function showStatus(payload) {
  const card = byId("statusCard");
  const pre = byId("statusText");
  card.classList.remove("hidden");
  pre.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function setLoading(phase, isLoading) {
  state.loading[phase] = isLoading;
  const runDay1Btn = byId("runDay1Btn");
  const runDay2Btn = byId("runDay2Btn");
  const anyLoading = state.loading.day1 || state.loading.day2;

  if (phase === "day1") {
    runDay1Btn.disabled = isLoading;
    runDay1Btn.textContent = isLoading ? "Running Day 1..." : "Run Day 1";
  }
  if (phase === "day2") {
    runDay2Btn.disabled = isLoading;
    runDay2Btn.textContent = isLoading ? "Running Day 2..." : "Run Day 2";
  }

  if (anyLoading) {
    showStatus({
      phase: "loading",
      message: "Prediction request in progress. On free hosting tiers, cold starts can take up to ~2 minutes.",
      running: {
        day1: state.loading.day1,
        day2: state.loading.day2
      }
    });
  }
}

function getApiBaseUrl() {
  const url = (byId("apiBaseUrl").value || "").trim();
  if (!url) throw new Error("Set your Orchestrator API Base URL before running predictions.");
  return url.replace(/\/+$/, "");
}

function readNumberInput(id) {
  const raw = byId(id).value;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${id}.`);
  return n;
}

function collectBaselineInputs() {
  const out = {};
  BASELINE_FIELDS.forEach((f) => {
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

function tableFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "<p class='hint'>No rows returned.</p>";
  const columns = ["level", "mean_predicted_probability", "votes_exceeding_threshold", "votes_above_threshold", "predicted_treatment_by_majority_vote"];
  const header = columns.map((c) => `<th>${c}</th>`).join("");
  const body = rows
    .map((row) => {
      return `<tr>${columns.map((c) => `<td>${row[c] ?? ""}</td>`).join("")}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
    </div>
    ${summaryCardsFromRows(rows)}
  `;
}

function summaryCardsFromRows(rows) {
  const cards = rows
    .map((row) => {
      const probability = row.mean_predicted_probability;
      const probText = Number.isFinite(Number(probability)) ? Number(probability).toFixed(3) : String(probability ?? "");
      return `
        <article class="summary-card">
          <h3>${row.level ?? "Treatment Level"}</h3>
          <p><strong>Mean Probability:</strong> ${probText}</p>
          <p><strong>Votes > Threshold:</strong> ${row.votes_exceeding_threshold ?? ""}</p>
          <p><strong>Vote Fraction:</strong> ${row.votes_above_threshold ?? ""}</p>
          <p><strong>Majority Vote:</strong> ${row.predicted_treatment_by_majority_vote ?? ""}</p>
        </article>
      `;
    })
    .join("");

  return `<div class="summary-cards">${cards}</div>`;
}

function initTabs() {
  const buttons = Array.from(document.querySelectorAll("[data-tab-target]"));
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  if (buttons.length === 0 || panels.length === 0) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab-target");
      buttons.forEach((b) => b.classList.remove("is-active"));
      panels.forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      const targetPanel = byId(targetId);
      if (targetPanel) targetPanel.classList.add("is-active");
    });
  });
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
    setLoading("day1", true);
    const apiBase = getApiBaseUrl();
    const baselineInputs = collectBaselineInputs();
    const envelope = await postJson(`${apiBase}/flow/day1?format=long`, { data: baselineInputs });

    state.baselineInputs = envelope?.data?.baseline_inputs || baselineInputs;
    state.day2Prefill = envelope?.data?.day2_prefill || {};
    state.day1Response = envelope;
    state.day2Response = null;

    renderDay1Results(envelope);
    renderDay2Form(state.day2Prefill);
    showCard("day2EditCard");
    byId("day2ResultsCard").classList.add("hidden");
    byId("exportCard").classList.add("hidden");
    showStatus({ phase: "day1_complete", trace: envelope?.trace });
  } catch (err) {
    showStatus({ phase: "day1_error", message: err.message });
  } finally {
    setLoading("day1", false);
  }
}

async function handleRunDay2() {
  try {
    setLoading("day2", true);
    if (!state.baselineInputs) throw new Error("Run Day 1 first to generate baseline and Day 2 prefill.");
    const apiBase = getApiBaseUrl();
    const day2Prefill = collectDay2Prefill();

    const envelope = await postJson(`${apiBase}/flow/day2?format=long`, {
      baseline_inputs: state.baselineInputs,
      day2_prefill: day2Prefill
    });

    state.day2Prefill = day2Prefill;
    state.day2Response = envelope;

    renderDay2Results(envelope);
    showCard("exportCard");
    showStatus({ phase: "day2_complete", trace: envelope?.trace });
  } catch (err) {
    showStatus({ phase: "day2_error", message: err.message });
  } finally {
    setLoading("day2", false);
  }
}

function handleExport() {
  const exportPayload = {
    exported_at: new Date().toISOString(),
    flow_day1_response: state.day1Response,
    flow_day2_response: state.day2Response,
    baseline_inputs: state.baselineInputs,
    final_day2_prefill_used: state.day2Prefill
  };
  downloadJson("sepsis-flow-two-day-results.json", exportPayload);
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

  byId("apiBaseUrl").value = "https://sepsis-flow-orchestrator.onrender.com";
  byId("runDay1Btn").addEventListener("click", handleRunDay1);
  byId("runDay2Btn").addEventListener("click", handleRunDay2);
  byId("exportBtn").addEventListener("click", handleExport);
  initTabs();
}

init();
