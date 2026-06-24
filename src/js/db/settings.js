import { db } from './schema.js';

const DEFAULTS = {
  theme: 'dark',
  lang: 'bn',
  activeCompanyId: null,
  invoicePrefix: 'BJ',
  lowStockThreshold: 5,
  pinHash: null,        // null = no app lock
  lastBackupAt: null,
};

let cache = null;

async function loadAll() {
  if (cache) return cache;
  const rows = await db.appSettings.toArray();
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  cache = out;
  return out;
}

export async function get(key) {
  const s = await loadAll();
  return s[key];
}

export async function getAll() {
  return { ...(await loadAll()) };
}

export async function set(key, value) {
  await db.appSettings.put({ key, value });
  if (cache) cache[key] = value;
}

export async function setMany(obj) {
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value }));
  await db.appSettings.bulkPut(rows);
  if (cache) Object.assign(cache, obj);
}

// Hash a PIN with a salted SHA-256 (Web Crypto is available in WebView).
export async function hashPin(pin) {
  const salt = 'bijoy-production-v1';
  const data = new TextEncoder().encode(salt + ':' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function clearCache() {
  cache = null;
}
