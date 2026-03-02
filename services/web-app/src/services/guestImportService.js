const IMPORT_MARKER_KEY_PREFIX = "sepsis_flow_guest_import_done_for_";

export function shouldPromptGuestImport(userId, snapshot) {
  if (!userId) return false;
  const marker = localStorage.getItem(`${IMPORT_MARKER_KEY_PREFIX}${userId}`);
  if (marker === "1") return false;
  const patientCount = Array.isArray(snapshot?.patients) ? snapshot.patients.length : 0;
  return patientCount > 0;
}

export function markGuestImportDecision(userId) {
  if (!userId) return;
  localStorage.setItem(`${IMPORT_MARKER_KEY_PREFIX}${userId}`, "1");
}

export async function importGuestDataIntoWorkspace({
  guestSnapshot,
  createPatient,
  upsertAssessment
}) {
  const patients = Array.isArray(guestSnapshot?.patients) ? guestSnapshot.patients : [];
  const assessments = Array.isArray(guestSnapshot?.assessments) ? guestSnapshot.assessments : [];

  const patientIdMap = new Map();
  let importedPatients = 0;
  let importedAssessments = 0;
  const failures = [];

  for (const patient of patients) {
    try {
      const created = await createPatient({
        alias: patient.alias,
        externalId: patient.externalId || ""
      });
      patientIdMap.set(patient.id, created.id);
      importedPatients += 1;
    } catch (error) {
      failures.push({ type: "patient", id: patient.id, reason: error?.message || "Unknown error" });
    }
  }

  for (const assessment of assessments) {
    const mappedPatientId = patientIdMap.get(assessment.patientId);
    if (!mappedPatientId) {
      failures.push({ type: "assessment", id: assessment.id, reason: "Patient mapping not found." });
      continue;
    }

    try {
      await upsertAssessment({
        ...assessment,
        patientId: mappedPatientId,
        createdAt: assessment.createdAt
      });
      importedAssessments += 1;
    } catch (error) {
      failures.push({ type: "assessment", id: assessment.id, reason: error?.message || "Unknown error" });
    }
  }

  return {
    importedPatients,
    importedAssessments,
    failures
  };
}
