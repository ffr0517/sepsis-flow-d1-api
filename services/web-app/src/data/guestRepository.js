import { idbClear, idbDelete, idbGet, idbGetAll, idbPut, STORES } from "./idb.js";
import { normalizeText, uid } from "../utils/format.js";

function sortPatients(patients) {
  return [...patients].sort((a, b) => {
    const ad = a.lastAssessmentAt ? Date.parse(a.lastAssessmentAt) : 0;
    const bd = b.lastAssessmentAt ? Date.parse(b.lastAssessmentAt) : 0;
    if (ad !== bd) return bd - ad;
    return (a.alias || "").localeCompare(b.alias || "");
  });
}

function asNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asNullableText(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
}

function normalizeSex(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0.5 ? 1 : 0;
}

function normalizeWeightUnit(value) {
  const text = asNullableText(value);
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized === "kg") return "kg";
  if (normalized === "lbs" || normalized === "lb") return "lbs";
  return null;
}

function normalizeInpatientStatus(value) {
  const text = asNullableText(value);
  if (!text) return null;
  if (/^inpatient$/i.test(text)) return "Inpatient";
  if (/^outpatient$/i.test(text)) return "Outpatient";
  return null;
}

function normalizePatientProfileInput(input = {}) {
  return {
    country: asNullableText(input.country),
    inpatientStatus: normalizeInpatientStatus(input.inpatientStatus),
    ageMonths: asNullableNumber(input.ageMonths),
    sex: normalizeSex(input.sex),
    weightValue: asNullableNumber(input.weightValue),
    weightUnit: normalizeWeightUnit(input.weightUnit)
  };
}

async function getAliasCounter() {
  const row = await idbGet(STORES.guestSettings, "aliasCounter");
  return Number(row?.value || 0);
}

async function setAliasCounter(next) {
  await idbPut(STORES.guestSettings, { key: "aliasCounter", value: next });
}

async function nextAlias() {
  const current = await getAliasCounter();
  const next = current + 1;
  await setAliasCounter(next);
  return `Patient-${String(next).padStart(3, "0")}`;
}

export const guestRepository = {
  async listPatients(search = "") {
    const patients = sortPatients(await idbGetAll(STORES.guestPatients));
    const term = normalizeText(search);
    if (!term) return patients;
    return patients.filter((row) => (row.aliasSearch || "").includes(term) || (row.externalIdSearch || "").includes(term));
  },

  async createPatient({ alias, externalId = "", ...profileInput }) {
    const now = new Date().toISOString();
    const finalAlias = alias?.trim() ? alias.trim() : await nextAlias();
    const profile = normalizePatientProfileInput(profileInput);

    const patient = {
      id: uid(),
      alias: finalAlias,
      aliasSearch: normalizeText(finalAlias),
      externalId: asNullableText(externalId),
      externalIdSearch: normalizeText(externalId),
      createdAt: now,
      updatedAt: now,
      lastAssessmentAt: null,
      ...profile
    };

    await idbPut(STORES.guestPatients, patient);
    return patient;
  },

  async updatePatient(id, updates) {
    const existing = await idbGet(STORES.guestPatients, id);
    if (!existing) throw new Error("Patient not found.");

    const profile = normalizePatientProfileInput(updates);
    const alias = updates.alias ?? existing.alias;
    const externalId = updates.externalId ?? existing.externalId;

    const next = {
      ...existing,
      ...updates,
      ...profile,
      alias,
      externalId: asNullableText(externalId),
      aliasSearch: normalizeText(alias),
      externalIdSearch: normalizeText(externalId),
      updatedAt: new Date().toISOString()
    };

    await idbPut(STORES.guestPatients, next);
    return next;
  },

  async deletePatient(id) {
    const assessments = await idbGetAll(STORES.guestAssessments);
    const matches = assessments.filter((row) => row.patientId === id);
    await Promise.all(matches.map((row) => idbDelete(STORES.guestAssessments, row.id)));
    await idbDelete(STORES.guestPatients, id);
  },

  async listAssessmentsByPatient(patientId) {
    const rows = await idbGetAll(STORES.guestAssessments);
    return rows
      .filter((row) => row.patientId === patientId)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  },

  async upsertAssessment(record) {
    const now = new Date().toISOString();
    const next = {
      ...record,
      id: record.id || uid(),
      createdAt: record.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.guestAssessments, next);

    const patient = await idbGet(STORES.guestPatients, next.patientId);
    if (patient) {
      await idbPut(STORES.guestPatients, {
        ...patient,
        lastAssessmentAt: now,
        updatedAt: now
      });
    }

    return next;
  },

  async getAllAssessments() {
    return idbGetAll(STORES.guestAssessments);
  },

  async clearAllGuestData() {
    await idbClear(STORES.guestAssessments);
    await idbClear(STORES.guestPatients);
  },

  async getGuestDataSnapshot() {
    const [patients, assessments] = await Promise.all([
      idbGetAll(STORES.guestPatients),
      idbGetAll(STORES.guestAssessments)
    ]);
    return { patients, assessments };
  }
};
