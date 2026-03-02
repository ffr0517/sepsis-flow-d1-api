import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeInviteEmail } from "../_shared/inviteValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173";

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
    const body = await req.json();
    const workspaceId = String(body?.workspaceId || "").trim();
    const email = normalizeInviteEmail(String(body?.email || ""));

    if (!workspaceId || !email) {
      return json({ error: "workspaceId and email are required." }, 400);
    }

    const { data: ownerMembership, error: ownerMembershipError } = await adminClient
      .from("workspace_members")
      .select("workspace_id, role, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle();

    if (ownerMembershipError || !ownerMembership) {
      return json({ error: "Only workspace owners can invite members." }, 403);
    }

    const { data: pendingInvite } = await adminClient
      .from("workspace_invites")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingInvite) {
      return json({ error: "An active invite already exists for this email." }, 409);
    }

    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
    const { data: invite, error: inviteError } = await adminClient
      .from("workspace_invites")
      .insert({
        workspace_id: workspaceId,
        email,
        invited_by: user.id,
        status: "pending",
        expires_at: expiresAt
      })
      .select("id,email,status,expires_at")
      .single();

    if (inviteError || !invite) {
      return json({ error: inviteError?.message || "Could not create invite." }, 500);
    }

    const inviteLink = `${SITE_URL.replace(/\/$/, "")}/index.html?invite_id=${invite.id}`;

    let emailSent = false;
    let emailWarning: string | null = null;

    const { error: inviteEmailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteLink,
      data: {
        workspace_id: workspaceId,
        invite_id: invite.id
      }
    });

    if (inviteEmailError) {
      emailWarning = inviteEmailError.message;
    } else {
      emailSent = true;
    }

    return json({
      ok: true,
      inviteId: invite.id,
      email: invite.email,
      emailSent,
      emailWarning,
      inviteLink
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
