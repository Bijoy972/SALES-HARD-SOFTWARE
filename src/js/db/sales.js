import { db } from './schema.js';
import * as products from './products.js';
import * as invoiceNum from './invoice-num.js';
import * as settings from './settings.js';

// data:
//   partyId, partyName, partySnapshot {gstin,address,phone,stateCode}
//   date (YYYY-MM-DD), placeOfSupplyStateCode
//   items: [{productId, code, name, hsn, unit, qty, rate, discountPct, gstPct, amount, taxableValue}]
//   discount (overall), roundOff
//   paid, status ('paid'|'unpaid'|'partial'), paymentMethod, notes
export async function create(companyId, data, opts = {}) {
  return db.transaction(
    'rw',
    [db.sales, db.products, db.invoiceCounters, db.appSettings, db.payments],
    async () => {
      const prefix = (await settings.get('invoicePrefix')) || 'BJ';
      const invoiceNo =
        data.invoiceNo || (await invoiceNum.next(companyId, prefix, data.date));

      // Compute totals server-side (don't trust client math).
      const items = (data.items || []).map((i) => {
        const qty = Number(i.qty) || 0;
        const rate = Number(i.rate) || 0;
        const discPct = Number(i.discountPct) || 0;
        const gstPct = Number(i.gstPct) || 0;
        const gross = qty * rate;
        const discAmt = gross * (discPct / 100);
        const taxable = gross - discAmt;
        const taxAmt = taxable * (gstPct / 100);
        return {
          ...i,
          qty,
          rate,
          discountPct: discPct,
          gstPct,
          taxableValue: round2(taxable),
          taxAmount: round2(taxAmt),
          amount: round2(taxable + taxAmt),
        };
      });

      const subtotal = round2(items.reduce((s, i) => s + i.taxableValue, 0));
      const taxTotal = round2(items.reduce((s, i) => s + i.taxAmount, 0));
      const extraDiscount = Number(data.discount) || 0;
      const roundOff = Number(data.roundOff) || 0;
      const total = round2(subtotal + taxTotal - extraDiscount + roundOff);

      const paid = Number(data.paid) || 0;
      let status = 'unpaid';
      if (paid >= total - 0.01) status = 'paid';
      else if (paid > 0) status = 'partial';

      const id = await db.sales.add({
        companyId,
        invoiceNo,
        partyId: data.partyId || null,
        partyName: data.partyName || 'Cash',
        partySnapshot: data.partySnapshot || null,
        placeOfSupplyStateCode: data.placeOfSupplyStateCode || '',
        date: data.date,
        items,
        subtotal,
        taxTotal,
        discount: extraDiscount,
        roundOff,
        total,
        paid,
        status,
        paymentMethod: data.paymentMethod || 'cash',
        notes: data.notes || '',
        createdAt: Date.now(),
      });

      if (paid > 0) {
        await db.payments.add({
          companyId,
          saleId: id,
          date: data.date,
          amount: paid,
          method: data.paymentMethod || 'cash',
          createdAt: Date.now(),
        });
      }

      // Stock-out
      if (!opts.skipStock) {
        for (const it of items) {
          if (it.productId) {
            await products.adjustStock(it.productId, -(Number(it.qty) || 0));
          }
        }
      }
      return id;
    },
  );
}

export async function list(companyId, { from = null, to = null } = {}) {
  let rows = await db.sales
    .where('companyId')
    .equals(companyId)
    .toArray();
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

export async function get(id) {
  return db.sales.get(id);
}

export async function remove(id) {
  return db.transaction(
    'rw',
    [db.sales, db.products, db.payments],
    async () => {
      const s = await db.sales.get(id);
      if (!s) return;
      for (const it of s.items || []) {
        if (it.productId) {
          await products.adjustStock(it.productId, Number(it.qty) || 0);
        }
      }
      await db.payments.where('saleId').equals(id).delete();
      await db.sales.delete(id);
    },
  );
}

export async function addPayment(companyId, saleId, amount, method = 'cash', date = null) {
  return db.transaction('rw', [db.sales, db.payments], async () => {
    const s = await db.sales.get(saleId);
    if (!s) throw new Error('Sale not found');
    const amt = Number(amount) || 0;
    await db.payments.add({
      companyId,
      saleId,
      date: date || new Date().toISOString().slice(0, 10),
      amount: amt,
      method,
      createdAt: Date.now(),
    });
    const newPaid = round2((Number(s.paid) || 0) + amt);
    let status = 'unpaid';
    if (newPaid >= Number(s.total) - 0.01) status = 'paid';
    else if (newPaid > 0) status = 'partial';
    await db.sales.put({ ...s, paid: newPaid, status });
    return newPaid;
  });
}

// Totals used by the dashboard.
export async function totalsBetween(companyId, fromISO, toISO) {
  const rows = await db.sales
    .where('companyId')
    .equals(companyId)
    .toArray();
  let total = 0;
  let receivable = 0;
  let count = 0;
  for (const r of rows) {
    const inRange =
      (!fromISO || r.date >= fromISO) && (!toISO || r.date <= toISO);
    if (!inRange) continue;
    count++;
    total += Number(r.total) || 0;
    receivable += Math.max(0, (Number(r.total) || 0) - (Number(r.paid) || 0));
  }
  return { total: round2(total), receivable: round2(receivable), count };
}

export async function totalReceivable(companyId) {
  const rows = await db.sales
    .where('companyId')
    .equals(companyId)
    .toArray();
  let r = 0;
  for (const s of rows) {
    r += Math.max(0, (Number(s.total) || 0) - (Number(s.paid) || 0));
  }
  return round2(r);
}

// Sales by product, within optional date range.
export async function byProduct(companyId, { from = null, to = null } = {}) {
  const rows = await db.sales
    .where('companyId')
    .equals(companyId)
    .toArray();
  const map = new Map();
  for (const s of rows) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    for (const it of s.items || []) {
      const key = it.productId || `__${it.name}`;
      const cur = map.get(key) || {
        productId: it.productId || null,
        name: it.name || '',
        unit: it.unit || '',
        qty: 0,
        amount: 0,
      };
      cur.qty += Number(it.qty) || 0;
      cur.amount += Number(it.amount) || 0;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
