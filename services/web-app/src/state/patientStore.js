import { createStore } from "./createStore.js";

export const patientStore = createStore({
  patients: [],
  filteredPatients: [],
  selectedPatientId: null,
  selectedPatient: null,
  selectedPatientAssessments: [],
  search: "",
  loading: false,
  error: null,
  workspaceRole: null,
  workspace: null
});
