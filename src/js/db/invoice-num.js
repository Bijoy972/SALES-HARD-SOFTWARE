import { db } from './schema.js';
import { fyCodeFor } from '../utils/fy.js';

// Allocate the next gap-free invoice number for a (company, FY) pair.
// Format:  <prefix>/<fyCode>/<seq4>   e.g. BJ/26-27/0001
export async function next(companyId, prefix, dateStr) {
  const fy = fyCodeFor(dateStr || new Date().toISOString().slice(0, 10));
  const key = `${companyId}:${fy}`;
  return db.transaction('rw', db.invoiceCounters, async () => {
    const row = await db.invoiceCounters.get(key);
    const seq = (row?.value || 0) + 1;
    await db.invoiceCounters.put({ key, value: seq });
    const num = String(seq).padStart(4, '0');
    return `${prefix || 'BJ'}/${fy}/${num}`;
  });
}

// For backup/restore, allow setting the counter directly.
export async function setCounter(companyId, fyCode, value) {
  const key = `${companyId}:${fyCode}`;
  await db.invoiceCounters.put({ key, value: Number(value) || 0 });
}

export async function exportAll() {
  return db.invoiceCounters.toArray();
}
