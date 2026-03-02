export function asPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return (num * 100).toFixed(2);
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}
