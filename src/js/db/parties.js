import { db } from './schema.js';
import { stateCodeFromGstin } from './companies.js';

export async function list(companyId, { kind = null, search = '' } = {}) {
  let rows = await db.parties
    .where('companyId')
    .equals(companyId)
    .toArray();
  if (kind) {
    rows = rows.filter((p) => p.kind === kind || p.kind === 'both');
  }
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.gstin || '').toLowerCase().includes(q),
    );
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return rows;
}

export async function get(id) {
  if (!id) return null;
  return db.parties.get(id);
}

export async function create(companyId, data) {
  return db.parties.add({
    companyId,
    kind: data.kind || 'customer',
    name: data.name || '',
    phone: data.phone || '',
    gstin: data.gstin || '',
    stateCode: stateCodeFromGstin(data.gstin) || data.stateCode || '',
    address: data.address || '',
    createdAt: Date.now(),
  });
}

export async function update(id, patch) {
  const p = await db.parties.get(id);
  if (!p) return;
  const merged = { ...p, ...patch };
  if (patch.gstin !== undefined) {
    merged.stateCode = stateCodeFromGstin(patch.gstin) || '';
  }
  await db.parties.put(merged);
}

export async function remove(id) {
  await db.parties.delete(id);
}

// Ledger: aggregate sales (debit) and payments (credit) for a party.
export async function ledger(companyId, partyId) {
  const sales = await db.sales
    .where('companyId')
    .equals(companyId)
    .filter((s) => s.partyId === partyId)
    .toArray();
  const payments = await db.payments
    .where('companyId')
    .equals(companyId)
    .filter((p) => sales.some((s) => s.id === p.saleId))
    .toArray();
  const entries = [];
  for (const s of sales) {
    entries.push({
      date: s.date,
      type: 'sale',
      ref: s.invoiceNo,
      debit: Number(s.total) || 0,
      credit: 0,
      saleId: s.id,
    });
  }
  for (const p of payments) {
    const s = sales.find((x) => x.id === p.saleId);
    entries.push({
      date: p.date,
      type: 'payment',
      ref: s?.invoiceNo || '',
      debit: 0,
      credit: Number(p.amount) || 0,
      saleId: p.saleId,
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  for (const e of entries) {
    balance += e.debit - e.credit;
    e.balance = balance;
  }
  return { entries, balance };
}
