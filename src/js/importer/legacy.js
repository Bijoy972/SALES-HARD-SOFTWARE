// Parse the legacy C++ CLI's pipe-delimited text files.
// Expected formats (from the C++ source):
//   products.txt   : id|name|unit|rate|stock|hsn
//   purchases.txt  : id|supplier|date|item|qty|rate|amount    (one row per line item)
//   sales.txt      : invoiceNo|customer|date|item|qty|rate|gstPct|discountPct|amount  (one row per line item)
// We are lenient: extra/missing fields are tolerated.
import * as products from '../db/products.js';
import * as purchases from '../db/purchases.js';
import * as sales from '../db/sales.js';

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function importProductsTxt(companyId, text) {
  const lines = splitLines(text);
  let imported = 0;
  for (const line of lines) {
    const cols = line.split('|');
    if (cols.length < 2) continue;
    const [_id, name, unit, rate, stock, hsn] = cols;
    await products.create(companyId, {
      name: name || '',
      unit: unit || 'pcs',
      rate: Number(rate) || 0,
      stock: Number(stock) || 0,
      hsn: hsn || '',
      code: _id || '',
    });
    imported++;
  }
  return imported;
}

// Group consecutive lines that share the same purchase id+supplier+date into one purchase.
export async function importPurchasesTxt(companyId, text) {
  const lines = splitLines(text);
  const groups = new Map();
  for (const line of lines) {
    const cols = line.split('|');
    if (cols.length < 5) continue;
    const [id, supplier, date, item, qty, rate] = cols;
    const key = `${id}|${supplier}|${date}`;
    if (!groups.has(key)) {
      groups.set(key, { partyName: supplier, date, items: [] });
    }
    const q = Number(qty) || 0;
    const r = Number(rate) || 0;
    groups.get(key).items.push({
      name: item || '',
      qty: q,
      rate: r,
      amount: q * r,
      unit: 'pcs',
    });
  }
  let imported = 0;
  for (const g of groups.values()) {
    await purchases.create(companyId, g);
    imported++;
  }
  return imported;
}

export async function importSalesTxt(companyId, text) {
  const lines = splitLines(text);
  const groups = new Map();
  for (const line of lines) {
    const cols = line.split('|');
    if (cols.length < 5) continue;
    const [invoiceNo, customer, date, item, qty, rate, gstPct, discPct] = cols;
    const key = invoiceNo;
    if (!groups.has(key)) {
      groups.set(key, {
        invoiceNo,
        partyName: customer,
        date,
        items: [],
      });
    }
    groups.get(key).items.push({
      name: item || '',
      qty: Number(qty) || 0,
      rate: Number(rate) || 0,
      gstPct: Number(gstPct) || 0,
      discountPct: Number(discPct) || 0,
      unit: 'pcs',
    });
  }
  let imported = 0;
  for (const g of groups.values()) {
    await sales.create(companyId, g, { skipStock: true });
    imported++;
  }
  return imported;
}
