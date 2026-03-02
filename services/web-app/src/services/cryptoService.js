const ENC_VERSION = 1;
const ALG_LABEL = "AES-GCM-256";
const DEFAULT_KDF_ITERATIONS = 310000;
const DEFAULT_SALT_BYTES = 16;
const IV_BYTES = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function ensureCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is not available in this environment.");
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

function bytesToBase64(bytes) {
  const normalized = toUint8Array(bytes);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < normalized.length; i += 1) binary += String.fromCharCode(normalized[i]);
  return btoa(binary);
}

function base64ToBytes(input) {
  if (!input) return new Uint8Array(0);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(String(input), "base64"));
  }
  const binary = atob(String(input));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(length) {
  ensureCrypto();
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

async function importPassphraseKey(passphrase) {
  ensureCrypto();
  return globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(String(passphrase || "")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
}

export function generateSaltB64(length = DEFAULT_SALT_BYTES) {
  return bytesToBase64(randomBytes(length));
}

export function kdfDefaults() {
  return {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: DEFAULT_KDF_ITERATIONS
  };
}

export async function deriveWorkspaceKey(passphrase, saltB64, iterations = DEFAULT_KDF_ITERATIONS) {
  const passphraseKey = await importPassphraseKey(passphrase);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(saltB64),
      iterations
    },
    passphraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function assertEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid encrypted envelope.");
  }
  if (Number(envelope.enc_v) !== ENC_VERSION) {
    throw new Error("Unsupported encrypted envelope version.");
  }
  if (envelope.alg !== ALG_LABEL) {
    throw new Error("Unsupported encrypted envelope algorithm.");
  }
}

export async function encryptJson(payload, key, aad) {
  ensureCrypto();
  if (!key) throw new Error("Encryption key is required.");
  const iv = randomBytes(IV_BYTES);
  const aadText = String(aad || "");
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(aadText)
    },
    key,
    plaintext
  );

  return {
    enc_v: ENC_VERSION,
    alg: ALG_LABEL,
    iv_b64: bytesToBase64(iv),
    ct_b64: bytesToBase64(new Uint8Array(ciphertext)),
    aad: aadText
  };
}

export async function decryptJson(envelope, key, expectedAad = null) {
  ensureCrypto();
  if (!key) throw new Error("Decryption key is required.");
  assertEnvelope(envelope);
  const aad = String(envelope.aad || "");
  if (expectedAad !== null && String(expectedAad) !== aad) {
    throw new Error("Encrypted payload context mismatch.");
  }

  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(envelope.iv_b64),
      additionalData: textEncoder.encode(aad)
    },
    key,
    base64ToBytes(envelope.ct_b64)
  );

  return JSON.parse(textDecoder.decode(plaintext));
}

export async function createKeyCheckEnvelope(key, workspaceId) {
  const aad = `workspace-key-check:${workspaceId}`;
  return encryptJson({ check: "ok", workspaceId }, key, aad);
}

export async function verifyKeyCheckEnvelope(key, envelope, workspaceId) {
  try {
    const aad = `workspace-key-check:${workspaceId}`;
    const out = await decryptJson(envelope, key, aad);
    return out?.check === "ok" && out?.workspaceId === workspaceId;
  } catch {
    return false;
  }
}
