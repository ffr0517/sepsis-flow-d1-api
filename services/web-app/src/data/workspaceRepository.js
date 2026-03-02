import { uid } from "../utils/format.js";

function mapError(error, fallback = "Workspace operation failed.") {
  return new Error(error?.message || fallback);
}

function asNullable(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
}

function asNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSex(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0.5 ? 1 : 0;
}

function normalizeWeightUnit(value) {
  const text = asNullable(value);
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized === "kg") return "kg";
  if (normalized === "lbs" || normalized === "lb") return "lbs";
  return null;
}

function normalizeInpatientStatus(value) {
  const text = asNullable(value);
  if (!text) return null;
  if (/^inpatient$/i.test(text)) return "Inpatient";
  if (/^outpatient$/i.test(text)) return "Outpatient";
  return null;
}

function mapPatientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    alias: row.alias,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAssessmentAt: row.last_assessment_at,
    country: row.country,
    inpatientStatus: row.inpatient_status,
    ageMonths: row.age_months,
    sex: row.sex,
    weightValue: row.weight_value,
    weightUnit: row.weight_unit
  };
}

function mapAssessmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    status: row.status,
    environment: row.environment,
    orchestratorBaseUrl: row.orchestrator_base_url,
    baselineInputs: row.baseline_inputs,
    day1Outputs: row.day1_outputs,
    day2CarryForwardEdited: row.day2_carry_forward_edited,
    day2Outputs: row.day2_outputs,
    strata: row.strata,
    summary48h: row.summary_48h,
    modelMetadata: row.model_metadata,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePatientPayload(input = {}) {
  return {
    alias: asNullable(input.alias),
    external_id: asNullable(input.externalId),
    country: asNullable(input.country),
    inpatient_status: normalizeInpatientStatus(input.inpatientStatus),
    age_months: asNullableNumber(input.ageMonths),
    sex: normalizeSex(input.sex),
    weight_value: asNullableNumber(input.weightValue),
    weight_unit: normalizeWeightUnit(input.weightUnit)
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function createWorkspaceRepository(getSupabase, getAuthContext, getWorkspaceContext) {
  async function getContext() {
    const supabase = getSupabase();
    const auth = getAuthContext();
    const workspace = getWorkspaceContext();

    if (!supabase) throw new Error("Supabase is not configured.");
    if (!auth?.user?.id) throw new Error("You must be signed in.");
    if (!workspace?.id) throw new Error("No active workspace found.");

    return {
      supabase,
      userId: auth.user.id,
      workspaceId: workspace.id
    };
  }

  return {
    async listPatients(search = "") {
      const { supabase, workspaceId } = await getContext();

      let query = supabase
        .from("patients")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("last_assessment_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      const term = String(search || "").trim();
      if (term) {
        query = query.or(`alias.ilike.%${term}%,external_id.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw mapError(error, "Failed to load patients.");
      return (data || []).map(mapPatientRow);
    },

    async createPatient({ alias, externalId = "", ...profileInput }) {
      const { supabase, userId, workspaceId } = await getContext();
      const now = new Date().toISOString();
      const normalized = normalizePatientPayload({ alias, externalId, ...profileInput });
      const finalAlias = normalized.alias || `Patient-${String(Date.now()).slice(-6)}`;

      const payload = {
        id: uid(),
        workspace_id: workspaceId,
        alias: finalAlias,
        external_id: normalized.external_id,
        country: normalized.country,
        inpatient_status: normalized.inpatient_status,
        age_months: normalized.age_months,
        sex: normalized.sex,
        weight_value: normalized.weight_value,
        weight_unit: normalized.weight_unit,
        created_by: userId,
        created_at: now,
        updated_at: now,
        last_assessment_at: null
      };

      const { data, error } = await supabase.from("patients").insert(payload).select("*").single();
      if (error) throw mapError(error, "Failed to create patient.");
      return mapPatientRow(data);
    },

    async updatePatient(id, updates) {
      const { supabase, workspaceId } = await getContext();
      const normalized = normalizePatientPayload(updates);
      const { data: existing, error: existingError } = await supabase
        .from("patients")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .single();
      if (existingError) throw mapError(existingError, "Failed to load patient before update.");

      const payload = { updated_at: new Date().toISOString() };
      if (hasOwn(updates, "alias")) payload.alias = normalized.alias || existing.alias;
      if (hasOwn(updates, "externalId")) payload.external_id = normalized.external_id;
      if (hasOwn(updates, "country")) payload.country = normalized.country;
      if (hasOwn(updates, "inpatientStatus")) payload.inpatient_status = normalized.inpatient_status;
      if (hasOwn(updates, "ageMonths")) payload.age_months = normalized.age_months;
      if (hasOwn(updates, "sex")) payload.sex = normalized.sex;
      if (hasOwn(updates, "weightValue")) payload.weight_value = normalized.weight_value;
      if (hasOwn(updates, "weightUnit")) payload.weight_unit = normalized.weight_unit;

      const { data, error } = await supabase
        .from("patients")
        .update(payload)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw mapError(error, "Failed to update patient.");
      return mapPatientRow(data);
    },

    async deletePatient(id) {
      const { supabase, workspaceId } = await getContext();
      const { error } = await supabase
        .from("patients")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      if (error) throw mapError(error, "Failed to delete patient.");
    },

    async listAssessmentsByPatient(patientId) {
      const { supabase, workspaceId } = await getContext();
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw mapError(error, "Failed to load assessments.");
      return (data || []).map(mapAssessmentRow);
    },

    async upsertAssessment(record) {
      const { supabase, workspaceId, userId } = await getContext();
      const now = new Date().toISOString();
      const payload = {
        id: record.id || uid(),
        workspace_id: workspaceId,
        patient_id: record.patientId,
        status: record.status,
        environment: record.environment,
        orchestrator_base_url: record.orchestratorBaseUrl,
        baseline_inputs: record.baselineInputs,
        day1_outputs: record.day1Outputs,
        day2_carry_forward_edited: record.day2CarryForwardEdited,
        day2_outputs: record.day2Outputs,
        strata: record.strata || null,
        summary_48h: record.summary48h,
        model_metadata: record.modelMetadata,
        created_by: record.createdBy || userId,
        created_at: record.createdAt || now,
        updated_at: now
      };

      const { data, error } = await supabase
        .from("assessments")
        .upsert(payload)
        .select("*")
        .single();
      if (error) throw mapError(error, "Failed to save assessment.");

      await supabase
        .from("patients")
        .update({
          last_assessment_at: now,
          updated_at: now
        })
        .eq("workspace_id", workspaceId)
        .eq("id", record.patientId);

      return mapAssessmentRow(data);
    },

    async getAllAssessments() {
      const { supabase, workspaceId } = await getContext();
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw mapError(error, "Failed to load assessments.");
      return (data || []).map(mapAssessmentRow);
    },

    async getProfile() {
      const { supabase, userId } = await getContext();
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,display_name,created_at,updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw mapError(error, "Failed to load user profile.");
      return data || { user_id: userId, display_name: null };
    },

    async upsertProfile({ displayName }) {
      const { supabase, userId } = await getContext();
      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          user_id: userId,
          display_name: asNullable(displayName)
        })
        .select("user_id,display_name,created_at,updated_at")
        .single();
      if (error) throw mapError(error, "Failed to save profile.");
      return data;
    },

    async updateWorkspaceName(name) {
      const { supabase, workspaceId } = await getContext();
      const cleanName = asNullable(name);
      if (!cleanName) throw new Error("Workspace name is required.");

      const { data, error } = await supabase
        .from("workspaces")
        .update({ name: cleanName, updated_at: new Date().toISOString() })
        .eq("id", workspaceId)
        .select("id,name,created_at,updated_at,created_by")
        .single();

      if (error) throw mapError(error, "Failed to update workspace name.");
      return data;
    },

    async listWorkspaceMembers() {
      const { supabase, workspaceId } = await getContext();
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id,user_id,role,status,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw mapError(error, "Failed to load workspace members.");
      return data || [];
    },

    async listWorkspaceInvites() {
      const { supabase, workspaceId } = await getContext();
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("id,email,status,expires_at,created_at,invited_by")
        .eq("workspace_id", workspaceId)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false });
      if (error) throw mapError(error, "Failed to load invites.");
      return data || [];
    },

    async sendInvite(email) {
      const { supabase, workspaceId } = await getContext();
      const { data, error } = await supabase.functions.invoke("send-workspace-invite", {
        body: { workspaceId, email }
      });
      if (error) throw mapError(error, "Failed to send invite.");
      return data;
    },

    async acceptInvite(inviteId) {
      const { supabase } = await getContext();
      const { data, error } = await supabase.functions.invoke("accept-workspace-invite", {
        body: { inviteId }
      });
      if (error) throw mapError(error, "Failed to accept invite.");
      return data;
    },

    async upsertAppSetting(key, value) {
      const { supabase, workspaceId } = await getContext();
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          workspace_id: workspaceId,
          key,
          value,
          updated_at: new Date().toISOString()
        });
      if (error) throw mapError(error, "Failed to save workspace setting.");
    }
  };
}
