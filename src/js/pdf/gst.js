// GST split logic.
// Indian GST rule: if seller's state code == buyer's place-of-supply state code,
// the tax is split as CGST + SGST (each = gstPct / 2). Otherwise IGST = gstPct.
export function splitTax(taxableValue, gstPct, sellerStateCode, buyerStateCode) {
  const taxAmt = (Number(taxableValue) || 0) * (Number(gstPct) || 0) / 100;
  const isIntra =
    sellerStateCode && buyerStateCode && sellerStateCode === buyerStateCode;
  if (isIntra) {
    const half = round2(taxAmt / 2);
    return {
      mode: 'CGST_SGST',
      cgstPct: round2((Number(gstPct) || 0) / 2),
      sgstPct: round2((Number(gstPct) || 0) / 2),
      igstPct: 0,
      cgst: half,
      sgst: round2(taxAmt - half), // avoid rounding loss
      igst: 0,
      total: round2(taxAmt),
    };
  }
  return {
    mode: 'IGST',
    cgstPct: 0,
    sgstPct: 0,
    igstPct: round2(Number(gstPct) || 0),
    cgst: 0,
    sgst: 0,
    igst: round2(taxAmt),
    total: round2(taxAmt),
  };
}

// Build a per-rate summary table for the invoice footer:
// [{rate: 18, taxable, cgst, sgst, igst, total}]
export function summary(items, sellerStateCode, buyerStateCode) {
  const map = new Map();
  for (const it of items) {
    const taxable = Number(it.taxableValue) || 0;
    const rate = Number(it.gstPct) || 0;
    const sp = splitTax(taxable, rate, sellerStateCode, buyerStateCode);
    const row = map.get(rate) || {
      rate,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    };
    row.taxable = round2(row.taxable + taxable);
    row.cgst = round2(row.cgst + sp.cgst);
    row.sgst = round2(row.sgst + sp.sgst);
    row.igst = round2(row.igst + sp.igst);
    row.total = round2(row.total + sp.total);
    map.set(rate, row);
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
