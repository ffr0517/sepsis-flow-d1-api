import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emailMatchesInvite, isInviteExpired, normalizeInviteEmail } from "../functions/_shared/inviteValidation.ts";

Deno.test("normalizeInviteEmail trims and lowercases", () => {
  assertEquals(normalizeInviteEmail("  USER@Example.COM "), "user@example.com");
});

Deno.test("isInviteExpired reports true for past timestamp", () => {
  assertEquals(isInviteExpired("2000-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z")), true);
});

Deno.test("emailMatchesInvite compares case-insensitive email", () => {
  assertEquals(emailMatchesInvite("Test@Example.com", "test@example.com"), true);
});
