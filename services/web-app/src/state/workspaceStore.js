import { createStore } from "./createStore.js";

/** @typedef {'owner'|'member'|null} WorkspaceMembershipRole */

export const workspaceStore = createStore({
  workspace: null,
  membershipRole: null,
  members: [],
  invites: [],
  loading: false,
  error: null
});
