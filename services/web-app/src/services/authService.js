import { initSupabaseClient } from "./supabaseClient.js";
import { authStore, setAuthenticated, setAuthError, setAuthLoading, setEmailVerificationRequired, setGuestMode } from "../state/authStore.js";
import { clearWorkspaceContext, ensureWorkspaceContext } from "./workspaceService.js";

function validatedUserFromSession(session) {
  const user = session?.user || null;
  if (!user) return null;
  return user;
}

function isEmailVerified(user) {
  return Boolean(user?.email_confirmed_at);
}

export function createAuthService({ supabaseUrl, supabaseAnonKey }) {
  let supabase = null;
  let initialized = false;
  let unsubscribeAuth = null;

  async function applySession(session) {
    if (!session) {
      clearWorkspaceContext();
      setGuestMode();
      return;
    }

    const user = validatedUserFromSession(session);
    if (!user) {
      clearWorkspaceContext();
      setGuestMode();
      return;
    }

    if (!isEmailVerified(user)) {
      await supabase.auth.signOut();
      clearWorkspaceContext();
      setEmailVerificationRequired("Email verification is required before workspace access.");
      return;
    }

    setAuthenticated(session, user);
    await ensureWorkspaceContext(supabase, user);
  }

  async function init() {
    if (initialized) return supabase;
    setAuthLoading();

    supabase = await initSupabaseClient({ supabaseUrl, supabaseAnonKey });
    if (!supabase) {
      setGuestMode();
      clearWorkspaceContext();
      initialized = true;
      return null;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAuthError(error.message || "Failed to load auth session.");
      clearWorkspaceContext();
      initialized = true;
      return supabase;
    }

    await applySession(data?.session || null);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_, nextSession) => {
      try {
        await applySession(nextSession);
      } catch (err) {
        setAuthError(err?.message || "Auth state update failed.");
      }
    });

    unsubscribeAuth = () => authListener?.subscription?.unsubscribe?.();
    initialized = true;
    return supabase;
  }

  async function signUp(email, password) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw new Error(error.message || "Sign up failed.");
    return data;
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || "Sign in failed.");
    await applySession(data?.session || null);
    return data;
  }

  async function signOut() {
    if (!supabase) {
      setGuestMode();
      clearWorkspaceContext();
      return;
    }
    await supabase.auth.signOut();
    clearWorkspaceContext();
    setGuestMode();
  }

  async function resetPassword(email) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message || "Could not send password reset email.");
  }

  function getSupabase() {
    return supabase;
  }

  function destroy() {
    unsubscribeAuth?.();
  }

  return {
    init,
    signUp,
    signIn,
    signOut,
    resetPassword,
    getSupabase,
    destroy
  };
}
