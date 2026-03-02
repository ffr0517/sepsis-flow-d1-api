export function normalizeInviteEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function isInviteExpired(expiresAt: string, nowMs = Date.now()): boolean {
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts < nowMs;
}

export function emailMatchesInvite(inviteEmail: string, userEmail: string): boolean {
  return normalizeInviteEmail(inviteEmail) === normalizeInviteEmail(userEmail);
}
