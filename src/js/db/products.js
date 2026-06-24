import { db } from './schema.js';

export async function list(companyId, search = '') {
  let rows = await db.products
    .where('companyId')
    .equals(companyId)
    .toArray();
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.hsn || '').toLowerCase().includes(q),
    );
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return rows;
}

export async function get(id) {
  return db.products.get(id);
}

export async function getByCode(companyId, code) {
  return db.products
    .where({ companyId, code })
    .first();
}

export async function create(companyId, data) {
  return db.products.add({
    companyId,
    code: data.code || '',
    name: data.name || '',
    unit: data.unit || 'pcs',
    rate: Number(data.rate) || 0,
    stock: Number(data.stock) || 0,
    hsn: data.hsn || '',
    gstRate: Number(data.gstRate) || 0,
    lowStockAt: data.lowStockAt != null ? Number(data.lowStockAt) : null,
    createdAt: Date.now(),
  });
}

export async function update(id, patch) {
  const p = await db.products.get(id);
  if (!p) return;
  const merged = { ...p, ...patch };
  ['rate', 'stock', 'gstRate', 'lowStockAt'].forEach((k) => {
    if (merged[k] !== null && merged[k] !== undefined) {
      merged[k] = Number(merged[k]);
    }
  });
  await db.products.put(merged);
}

export async function remove(id) {
  await db.products.delete(id);
}

// Adjust stock atomically; positive = in, negative = out.
// Returns the new stock value.
export async function adjustStock(id, delta) {
  return db.transaction('rw', db.products, async () => {
    const p = await db.products.get(id);
    if (!p) throw new Error('Product not found: ' + id);
    p.stock = Number(p.stock || 0) + Number(delta);
    await db.products.put(p);
    return p.stock;
  });
}

export async function totalValuation(companyId) {
  const rows = await db.products
    .where('companyId')
    .equals(companyId)
    .toArray();
  let qty = 0;
  let value = 0;
  for (const p of rows) {
    qty += Number(p.stock) || 0;
    value += (Number(p.stock) || 0) * (Number(p.rate) || 0);
  }
  return { count: rows.length, qty, value };
}

export async function lowStock(companyId, defaultThreshold = 5) {
  const rows = await db.products
    .where('companyId')
    .equals(companyId)
    .toArray();
  return rows.filter((p) => {
    const t = p.lowStockAt != null ? p.lowStockAt : defaultThreshold;
    return Number(p.stock || 0) <= t;
  });
}
