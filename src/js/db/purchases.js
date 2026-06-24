import { db } from './schema.js';
import * as products from './products.js';

// items: [{ productId, name, unit, qty, rate, amount }]
export async function create(companyId, data) {
  return db.transaction('rw', [db.purchases, db.products], async () => {
    const total = (data.items || []).reduce(
      (s, i) => s + Number(i.amount || 0),
      0,
    );
    const id = await db.purchases.add({
      companyId,
      partyId: data.partyId || null,
      partyName: data.partyName || '',
      date: data.date,
      items: data.items || [],
      total,
      notes: data.notes || '',
      createdAt: Date.now(),
    });
    // Stock-in for each line
    for (const it of data.items || []) {
      if (it.productId) {
        await products.adjustStock(it.productId, Number(it.qty) || 0);
      }
    }
    return id;
  });
}

export async function list(companyId, { from = null, to = null } = {}) {
  let rows = await db.purchases
    .where('companyId')
    .equals(companyId)
    .toArray();
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

export async function get(id) {
  return db.purchases.get(id);
}

export async function remove(id) {
  return db.transaction('rw', [db.purchases, db.products], async () => {
    const p = await db.purchases.get(id);
    if (!p) return;
    // Reverse stock-in.
    for (const it of p.items || []) {
      if (it.productId) {
        await products.adjustStock(it.productId, -(Number(it.qty) || 0));
      }
    }
    await db.purchases.delete(id);
  });
}
