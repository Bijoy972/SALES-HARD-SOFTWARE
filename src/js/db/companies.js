import { db } from './schema.js';
import * as settings from './settings.js';

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'shop';
}

// GSTIN format: 2 digits state + 10 chars PAN + 1 entity + 1 'Z' + 1 check.
// We extract the state code (first 2 chars) for CGST/SGST/IGST logic.
export function stateCodeFromGstin(gstin) {
  if (!gstin) return null;
  const m = /^\s*(\d{2})/.exec(gstin);
  return m ? m[1] : null;
}

export async function list() {
  return db.companies.orderBy('createdAt').toArray();
}

export async function get(id) {
  if (!id) return null;
  return db.companies.get(id);
}

export async function create(data) {
  const now = Date.now();
  const slug = slugify(data.name || 'shop');
  const id = await db.companies.add({
    slug,
    name: data.name || 'BIJOY PRODUCTION',
    address: data.address || '',
    phone: data.phone || '',
    gstin: data.gstin || '',
    stateCode: stateCodeFromGstin(data.gstin) || data.stateCode || '',
    logoDataUrl: data.logoDataUrl || null,
    createdAt: now,
  });
  // First company becomes active automatically.
  const all = await db.companies.count();
  if (all === 1) await settings.set('activeCompanyId', id);
  return id;
}

export async function update(id, patch) {
  const c = await db.companies.get(id);
  if (!c) return;
  const merged = { ...c, ...patch };
  if (patch.gstin !== undefined) {
    merged.stateCode = stateCodeFromGstin(patch.gstin) || '';
  }
  await db.companies.put(merged);
}

export async function remove(id) {
  await db.transaction(
    'rw',
    [
      db.companies,
      db.products,
      db.parties,
      db.purchases,
      db.sales,
      db.payments,
      db.invoiceCounters,
    ],
    async () => {
      await db.products.where('companyId').equals(id).delete();
      await db.parties.where('companyId').equals(id).delete();
      await db.purchases.where('companyId').equals(id).delete();
      await db.sales.where('companyId').equals(id).delete();
      await db.payments.where('companyId').equals(id).delete();
      await db.invoiceCounters
        .where('key')
        .startsWith(`${id}:`)
        .delete();
      await db.companies.delete(id);
    },
  );
  const active = await settings.get('activeCompanyId');
  if (active === id) {
    const remaining = await list();
    await settings.set('activeCompanyId', remaining[0]?.id ?? null);
  }
}

export async function setActive(id) {
  await settings.set('activeCompanyId', id);
}

export async function getActive() {
  const id = await settings.get('activeCompanyId');
  if (!id) return null;
  return get(id);
}

export async function ensureSeed() {
  const n = await db.companies.count();
  if (n > 0) return;
  // Seed the placeholder company (user can edit in Settings).
  await create({
    name: 'BIJOY PRODUCTION',
    address: '',
    phone: '',
    gstin: '',
  });
}
