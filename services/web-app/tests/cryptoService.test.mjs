import test from "node:test";
import assert from "node:assert/strict";
import {
  createKeyCheckEnvelope,
  decryptJson,
  deriveWorkspaceKey,
  encryptJson,
  verifyKeyCheckEnvelope
} from "../src/services/cryptoService.js";

test("encrypt/decrypt json roundtrip succeeds", async () => {
  const saltB64 = "AAAAAAAAAAAAAAAAAAAAAA==";
  const key = await deriveWorkspaceKey("passphrase-123", saltB64, 1000);
  const payload = { alias: "Patient-001", nested: { ageMonths: 24 } };
  const aad = "patients:ws1:p1";

  const envelope = await encryptJson(payload, key, aad);
  const decrypted = await decryptJson(envelope, key, aad);
  assert.deepEqual(decrypted, payload);
});

test("key check fails with wrong passphrase-derived key", async () => {
  const saltB64 = "BBBBBBBBBBBBBBBBBBBBBB==";
  const key = await deriveWorkspaceKey("correct-passphrase", saltB64, 1000);
  const wrong = await deriveWorkspaceKey("wrong-passphrase", saltB64, 1000);

  const envelope = await createKeyCheckEnvelope(key, "workspace-1");
  const ok = await verifyKeyCheckEnvelope(key, envelope, "workspace-1");
  const nope = await verifyKeyCheckEnvelope(wrong, envelope, "workspace-1");

  assert.equal(ok, true);
  assert.equal(nope, false);
});

test("aad mismatch throws on decrypt", async () => {
  const saltB64 = "CCCCCCCCCCCCCCCCCCCCCC==";
  const key = await deriveWorkspaceKey("passphrase-123", saltB64, 1000);
  const envelope = await encryptJson({ id: 1 }, key, "patients:ws1:p1");

  await assert.rejects(
    () => decryptJson(envelope, key, "patients:ws1:p2"),
    /context mismatch/i
  );
});
