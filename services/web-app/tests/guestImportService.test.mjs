import test from "node:test";
import assert from "node:assert/strict";
import { importGuestDataIntoWorkspace } from "../src/services/guestImportService.js";

test("imports guest patients and assessments with patient ID mapping", async () => {
  const createdPatients = [];
  const savedAssessments = [];

  const result = await importGuestDataIntoWorkspace({
    guestSnapshot: {
      patients: [{ id: "p1", alias: "Patient-001", externalId: "ABC" }],
      assessments: [{ id: "a1", patientId: "p1", status: "day1_complete" }]
    },
    createPatient: async (payload) => {
      createdPatients.push(payload);
      return { id: "np1" };
    },
    upsertAssessment: async (record) => {
      savedAssessments.push(record);
      return record;
    }
  });

  assert.equal(result.importedPatients, 1);
  assert.equal(result.importedAssessments, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(savedAssessments[0].patientId, "np1");
});
