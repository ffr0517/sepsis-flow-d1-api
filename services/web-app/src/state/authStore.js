import { createStore } from "./createStore.js";

/** @typedef {'guest'|'authenticated'} AuthMode */

export const authStore = createStore({
  mode: "guest",
  authStatus: "idle",
  session: null,
  user: null,
  error: null,
  emailVerificationRequired: false
});

export function setGuestMode() {
  authStore.patch({
    mode: "guest",
    authStatus: "guest",
    session: null,
    user: null,
    error: null,
    emailVerificationRequired: false
  });
}

export function setAuthLoading() {
  authStore.patch({ authStatus: "loading", error: null });
}

export function setAuthenticated(session, user) {
  authStore.patch({
    mode: "authenticated",
    authStatus: "authenticated",
    session,
    user,
    error: null,
    emailVerificationRequired: false
  });
}

export function setAuthError(error) {
  authStore.patch({ authStatus: "error", error: String(error || "Authentication failed.") });
}

export function setEmailVerificationRequired(message = "Please verify your email before using workspace data.") {
  authStore.patch({
    mode: "guest",
    authStatus: "verification_required",
    emailVerificationRequired: true,
    error: message,
    session: null,
    user: null
  });
}
