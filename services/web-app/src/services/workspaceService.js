import { workspaceStore } from "../state/workspaceStore.js";

const PENDING_WORKSPACE_KEY_PREFIX = "sepsis_flow_pending_workspace_name:";

function defaultWorkspaceName(user) {
  const email = String(user?.email || "").trim();
  if (!email.includes("@")) return "My Workspace";
  return `${email.split("@")[0]} workspace`;
}

function inviteIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite_id");
}

function clearInviteIdFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite_id");
  window.history.replaceState({}, "", url.toString());
}

function pendingWorkspaceKey(email) {
  return `${PENDING_WORKSPACE_KEY_PREFIX}${String(email || "").trim().toLowerCase()}`;
}

export function setPendingWorkspaceNameForEmail(email, workspaceName) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(workspaceName || "").trim();
  if (!cleanEmail) return;
  if (!cleanName) {
    localStorage.removeItem(pendingWorkspaceKey(cleanEmail));
    return;
  }
  localStorage.setItem(pendingWorkspaceKey(cleanEmail), cleanName);
}

function consumePendingWorkspaceNameForEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;
  const key = pendingWorkspaceKey(cleanEmail);
  const value = localStorage.getItem(key);
  if (value) {
    localStorage.removeItem(key);
    return value;
  }
  return null;
}

async function lookupMembership(supabase, userId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message || "Could not load workspace membership.");
  return data || null;
}

async function bootstrapWorkspace(supabase, user, workspaceName) {
  const effectiveName = String(workspaceName || "").trim() || defaultWorkspaceName(user);
  const { data, error } = await supabase.rpc("bootstrap_workspace_for_user", {
    workspace_name: effectiveName
  });

  if (error) throw new Error(error.message || "Could not bootstrap workspace.");
  return data;
}

async function fetchWorkspace(supabase, workspaceId) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,created_at,updated_at,created_by")
    .eq("id", workspaceId)
    .single();

  if (error) throw new Error(error.message || "Could not fetch workspace.");
  return data;
}

export async function ensureWorkspaceContext(supabase, user) {
  workspaceStore.patch({ loading: true, error: null });

  try {
    let membership = await lookupMembership(supabase, user.id);

    if (!membership) {
      const inviteId = inviteIdFromUrl();
      if (inviteId) {
        const { error } = await supabase.functions.invoke("accept-workspace-invite", {
          body: { inviteId }
        });
        if (error) throw new Error(error.message || "Invite acceptance failed.");
        clearInviteIdFromUrl();
        membership = await lookupMembership(supabase, user.id);
      }
    }

    if (!membership) {
      const pendingWorkspaceName = consumePendingWorkspaceNameForEmail(user.email);
      await bootstrapWorkspace(supabase, user, pendingWorkspaceName);
      membership = await lookupMembership(supabase, user.id);
    }

    if (!membership) {
      throw new Error("Workspace membership was not established.");
    }

    const workspace = await fetchWorkspace(supabase, membership.workspace_id);

    workspaceStore.patch({
      workspace,
      membershipRole: membership.role,
      loading: false,
      error: null
    });

    return { workspace, membershipRole: membership.role };
  } catch (error) {
    workspaceStore.patch({
      loading: false,
      error: String(error?.message || "Failed to initialize workspace.")
    });
    throw error;
  }
}

export function clearWorkspaceContext() {
  workspaceStore.patch({
    workspace: null,
    membershipRole: null,
    members: [],
    invites: [],
    loading: false,
    error: null
  });
}
