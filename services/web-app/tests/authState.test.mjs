import test from "node:test";
import assert from "node:assert/strict";
import { authStore, setAuthenticated, setEmailVerificationRequired, setGuestMode } from "../src/state/authStore.js";

test("auth store enters authenticated state", () => {
  setAuthenticated({ access_token: "t" }, { id: "u1", email: "user@example.com" });
  const state = authStore.getState();
  assert.equal(state.mode, "authenticated");
  assert.equal(state.user.email, "user@example.com");
});

test("auth store handles verification requirement", () => {
  setEmailVerificationRequired();
  const state = authStore.getState();
  assert.equal(state.mode, "guest");
  assert.equal(state.emailVerificationRequired, true);
});

test("auth store returns to guest mode", () => {
  setGuestMode();
  const state = authStore.getState();
  assert.equal(state.mode, "guest");
  assert.equal(state.user, null);
});
