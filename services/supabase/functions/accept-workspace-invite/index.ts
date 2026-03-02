import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailMatchesInvite, isInviteExpired, normalizeInviteEmail } from "../_shared/inviteValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing bearer token" }, 401);

    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

    const user = authData.user;
    const email = normalizeInviteEmail(String(user.email || ""));
    if (!email) return json({ error: "Authenticated user has no email." }, 400);

    const body = await req.json();
    const inviteId = String(body?.inviteId || "").trim();
    if (!inviteId) return json({ error: "inviteId is required." }, 400);

    const { data: existingMembership } = await adminClient
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingMembership) {
      return json({ error: "User already belongs to a workspace." }, 409);
    }

    const { data: invite, error: inviteError } = await adminClient
      .from("workspace_invites")
      .select("id,workspace_id,email,status,expires_at")
      .eq("id", inviteId)
      .eq("status", "pending")
      .maybeSingle();

    if (inviteError || !invite) {
      return json({ error: "Invite not found or already used." }, 404);
    }

    if (!emailMatchesInvite(String(invite.email || ""), email)) {
      return json({ error: "Invite email does not match signed-in user." }, 403);
    }

    if (isInviteExpired(invite.expires_at)) {
      await adminClient
        .from("workspace_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      return json({ error: "Invite has expired." }, 410);
    }

    const { error: insertMemberError } = await adminClient
      .from("workspace_members")
      .insert({
        workspace_id: invite.workspace_id,
        user_id: user.id,
        role: "member",
        status: "active"
      });

    if (insertMemberError) {
      return json({ error: insertMemberError.message || "Could not add workspace member." }, 500);
    }

    const { error: updateInviteError } = await adminClient
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_by: user.id
      })
      .eq("id", invite.id);

    if (updateInviteError) {
      return json({ error: updateInviteError.message || "Could not update invite status." }, 500);
    }

    await adminClient
      .from("profiles")
      .upsert({ user_id: user.id }, { onConflict: "user_id" });

    return json({
      ok: true,
      workspaceId: invite.workspace_id,
      inviteId: invite.id
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
