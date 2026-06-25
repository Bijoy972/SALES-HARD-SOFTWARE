import { h, clear, openModal, closeModal, toast, confirmDialog } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as products from '../db/products.js';
import * as parties from '../db/parties.js';
import * as sales from '../db/sales.js';
import { INR, NUM, fmtDate } from '../utils/format.js';
import { t } from '../i18n.js';
import { todayISO } from '../utils/fy.js';
import { buildInvoicePdf } from '../pdf/invoice.js';
import { saveAndShareBlob, DBG } from '../utils/share.js';

// ---------- List ----------
export async function renderList(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.sales')));
  root.appendChild(
    h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
      h(
        'a',
        { class: 'btn btn-primary', href: '#/sales/new' },
        '＋ ' + t('sale.new'),
      ),
    ]),
  );
  const all = await sales.list(co.id);
  if (!all.length) {
    root.appendChild(
      h('div', { class: 'empty' }, [
        h('div', { class: 'ico' }, '🧾'),
        h('div', {}, t('dash.empty')),
      ]),
    );
    return;
  }
  const list = h('div', { class: 'list' });
  for (const s of all) {
    const statusClass =
      s.status === 'paid' ? 'ok' : s.status === 'partial' ? 'warn' : 'err';
    list.appendChild(
      h(
        'a',
        {
          class: 'list-row',
          href: '#/sales/' + s.id,
          style: { textDecoration: 'none', color: 'inherit' },
        },
        [
          h('div', { class: 'l-main' }, [
            h('div', { class: 'l-title' }, s.invoiceNo + ' · ' + (s.partyName || 'Cash')),
            h(
              'div',
              { class: 'l-sub' },
              fmtDate(s.date) + ' · ' + (s.items?.length || 0) + ' items',
            ),
          ]),
          h('div', { class: 'l-end' }, [
            h('div', { class: 'l-amt' }, INR(s.total)),
            h('div', { class: 'tag ' + statusClass, style: { marginTop: '4px' } }, s.status),
          ]),
        ],
      ),
    );
  }
  root.appendChild(list);
}

// ---------- New ----------
export async function renderNew(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  const allProducts = await products.list(co.id);
  const allCustomers = await parties.list(co.id, { kind: 'customer' });

  // State (line items in memory)
  const state = {
    partyId: null,
    partyName: '',
    partyGstin: '',
    partyAddress: '',
    partyPhone: '',
    placeOfSupplyStateCode: co.stateCode || '',
    date: todayISO(),
    discount: 0,
    discountUnit: 'flat', // 'flat' (₹) or 'pct' (%)
    roundOff: 0,
    paid: 0,
    paymentMethod: 'cash',
    saleType: 'cash', // 'cash' (paid in full) or 'credit' (paid = 0, balance due)
    notes: '',
    items: [emptyLine()],
  };

  root.appendChild(h('h1', {}, t('sale.new')));

  // Customer + date strip — onPartyKind('cash'|'credit'|'named') fires when
  // the picker changes so we can auto-switch the sale-type pill.
  root.appendChild(
    buildHeaderStrip(state, allCustomers, (kind) => {
      if (kind === 'cash') setSaleType('cash');
      else if (kind === 'credit') setSaleType('credit');
    }),
  );

  // Items table
  const itemsHost = h('div');
  root.appendChild(itemsHost);

  const addLineBtn = h(
    'button',
    {
      class: 'btn btn-ghost btn-block',
      style: { marginTop: '8px' },
      onclick: () => {
        state.items.push(emptyLine());
        renderItems();
      },
    },
    '＋ ' + t('sale.addLine'),
  );
  root.appendChild(addLineBtn);

  // Totals
  const totalsHost = h('div', { class: 'totals-grid' });
  root.appendChild(totalsHost);

  // Extra fields — discount with ₹/% toggle + round-off
  root.appendChild(
    h('div', { class: 'field row-2', style: { marginTop: '8px' } }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('sale.discount')),
        h('div', { class: 'input-with-toggle' }, [
          h('input', {
            id: 's-discount',
            type: 'number',
            step: '0.01',
            value: 0,
            oninput: (e) => {
              state.discount = Number(e.target.value) || 0;
              recompute();
            },
          }),
          h('div', { class: 'unit-toggle', role: 'group' }, [
            h(
              'button',
              {
                type: 'button',
                id: 's-disc-flat',
                class: 'unit-btn active',
                onclick: () => setDiscountUnit('flat'),
              },
              '₹',
            ),
            h(
              'button',
              {
                type: 'button',
                id: 's-disc-pct',
                class: 'unit-btn',
                onclick: () => setDiscountUnit('pct'),
              },
              '%',
            ),
          ]),
        ]),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('sale.roundOff')),
        h('input', {
          id: 's-roundoff',
          type: 'number',
          step: '0.01',
          value: 0,
          oninput: (e) => {
            state.roundOff = Number(e.target.value) || 0;
            recompute();
          },
        }),
      ]),
    ]),
  );

  // Cash / Credit sale-type pill toggle
  root.appendChild(
    h('div', { class: 'field' }, [
      h('label', {}, t('sale.saleType')),
      h('div', { class: 'pill-toggle' }, [
        h(
          'button',
          {
            type: 'button',
            id: 's-type-cash',
            class: 'pill active',
            onclick: () => setSaleType('cash'),
          },
          '💵 ' + t('sale.cash'),
        ),
        h(
          'button',
          {
            type: 'button',
            id: 's-type-credit',
            class: 'pill',
            onclick: () => setSaleType('credit'),
          },
          '📒 ' + t('sale.credit'),
        ),
      ]),
    ]),
  );

  root.appendChild(
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('sale.paid')),
        h('input', {
          id: 's-paid',
          type: 'number',
          step: '0.01',
          value: 0,
          oninput: (e) => {
            state.paid = Number(e.target.value) || 0;
          },
        }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('sale.method')),
        h(
          'select',
          {
            id: 's-method',
            onchange: (e) => (state.paymentMethod = e.target.value),
          },
          [
            h('option', { value: 'cash' }, 'Cash'),
            h('option', { value: 'upi' }, 'UPI'),
            h('option', { value: 'card' }, 'Card'),
            h('option', { value: 'bank' }, 'Bank transfer'),
          ],
        ),
      ]),
    ]),
  );

  function setDiscountUnit(unit) {
    state.discountUnit = unit;
    const flat = document.getElementById('s-disc-flat');
    const pct = document.getElementById('s-disc-pct');
    if (flat && pct) {
      flat.classList.toggle('active', unit === 'flat');
      pct.classList.toggle('active', unit === 'pct');
    }
    recompute();
  }

  function setSaleType(type) {
    state.saleType = type;
    const cashBtn = document.getElementById('s-type-cash');
    const credBtn = document.getElementById('s-type-credit');
    if (cashBtn && credBtn) {
      cashBtn.classList.toggle('active', type === 'cash');
      credBtn.classList.toggle('active', type === 'credit');
    }
    const grand = currentGrand();
    const paidInput = document.getElementById('s-paid');
    if (paidInput) {
      const newPaid = type === 'cash' ? grand : 0;
      state.paid = newPaid;
      paidInput.value = String(newPaid.toFixed(2));
    }
  }

  root.appendChild(
    h('div', { class: 'field' }, [
      h('label', {}, t('sale.notes')),
      h('input', {
        id: 's-notes',
        oninput: (e) => (state.notes = e.target.value),
      }),
    ]),
  );

  root.appendChild(
    h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        style: { marginTop: '16px' },
        onclick: async () => {
          const itemsValid = state.items.filter(
            (i) => i.name && Number(i.qty) > 0,
          );
          if (!itemsValid.length) {
            toast('Add at least one line item', 'err');
            return;
          }
          // Resolve discount unit → flat ₹ before persisting
          const subtotalCalc = itemsValid.reduce((s, i) => {
            const gross = (Number(i.qty) || 0) * (Number(i.rate) || 0);
            const taxable = gross - gross * ((Number(i.discountPct) || 0) / 100);
            return s + taxable + taxable * ((Number(i.gstPct) || 0) / 100);
          }, 0);
          const discFlat =
            state.discountUnit === 'pct'
              ? subtotalCalc * ((Number(state.discount) || 0) / 100)
              : Number(state.discount) || 0;
          const saleData = {
            partyId: state.partyId,
            partyName: state.partyName || 'Cash',
            partySnapshot: {
              gstin: state.partyGstin,
              address: state.partyAddress,
              phone: state.partyPhone,
              stateCode: state.placeOfSupplyStateCode,
            },
            placeOfSupplyStateCode: state.placeOfSupplyStateCode,
            date: state.date,
            items: itemsValid,
            discount: discFlat,
            roundOff: state.roundOff,
            paid: state.saleType === 'credit' ? 0 : state.paid,
            paymentMethod: state.paymentMethod,
            saleType: state.saleType,
            notes: state.notes,
          };
          try {
            const id = await sales.create(co.id, saleData);
            toast(t('sale.savedShare'), 'ok');
            location.hash = '#/sales/' + id;
          } catch (e) {
            console.error(e);
            toast(String(e.message || e), 'err');
          }
        },
      },
      t('sale.save'),
    ),
  );

  renderItems();
  recompute();

  function renderItems() {
    clear(itemsHost);
    const tbl = h('table', { class: 'line-table' });
    const thead = h('thead', {}, [
      h('tr', {}, [
        h('th', {}, '#'),
        h('th', {}, t('common.name')),
        h('th', { class: 'num' }, t('common.qty')),
        h('th', { class: 'num' }, t('common.rate')),
        h('th', { class: 'num' }, 'GST'),
        h('th', { class: 'num' }, t('common.amount')),
        h('th', {}, ''),
      ]),
    ]);
    tbl.appendChild(thead);
    const tb = h('tbody');
    state.items.forEach((it, idx) => {
      const tr = h('tr', {}, [
        h('td', {}, String(idx + 1)),
        h('td', {}, [
          h('input', {
            value: it.name || '',
            placeholder: 'Item name',
            list: 'product-options',
            oninput: (e) => {
              it.name = e.target.value;
              // Try to auto-populate from product master
              const match = allProducts.find(
                (p) => (p.name || '').toLowerCase() === it.name.toLowerCase(),
              );
              if (match) {
                it.productId = match.id;
                it.code = match.code;
                it.unit = match.unit;
                it.hsn = match.hsn;
                if (!it._rateEdited) it.rate = match.rate;
                if (!it._gstEdited) it.gstPct = match.gstRate || 0;
                renderItems();
                recompute();
              } else {
                it.productId = null;
              }
            },
          }),
        ]),
        h('td', { class: 'num' }, [
          h('input', {
            type: 'number',
            step: '0.01',
            value: it.qty,
            oninput: (e) => {
              it.qty = Number(e.target.value) || 0;
              recompute();
            },
          }),
        ]),
        h('td', { class: 'num' }, [
          h('input', {
            type: 'number',
            step: '0.01',
            value: it.rate,
            oninput: (e) => {
              it.rate = Number(e.target.value) || 0;
              it._rateEdited = true;
              recompute();
            },
          }),
        ]),
        h('td', { class: 'num' }, [
          h('input', {
            type: 'number',
            step: '0.1',
            value: it.gstPct,
            oninput: (e) => {
              it.gstPct = Number(e.target.value) || 0;
              it._gstEdited = true;
              recompute();
            },
          }),
        ]),
        h(
          'td',
          { class: 'num mono', id: 'amt-' + idx },
          NUM(lineAmount(it), 2),
        ),
        h('td', {}, [
          h(
            'button',
            {
              class: 'btn btn-small btn-danger',
              onclick: () => {
                state.items.splice(idx, 1);
                if (!state.items.length) state.items.push(emptyLine());
                renderItems();
                recompute();
              },
            },
            '✕',
          ),
        ]),
      ]);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    itemsHost.appendChild(tbl);

    // datalist of product names for autocomplete
    let dl = document.getElementById('product-options');
    if (!dl) {
      dl = h('datalist', { id: 'product-options' });
      document.body.appendChild(dl);
    } else {
      clear(dl);
    }
    for (const p of allProducts) {
      dl.appendChild(h('option', { value: p.name }));
    }
  }

  function discountAmount(beforeDisc) {
    const d = Number(state.discount) || 0;
    return state.discountUnit === 'pct' ? beforeDisc * (d / 100) : d;
  }

  function currentGrand() {
    const subtotal = state.items.reduce((s, i) => s + lineTaxable(i), 0);
    const taxTotal = state.items.reduce((s, i) => s + lineTax(i), 0);
    const beforeDisc = subtotal + taxTotal;
    return beforeDisc - discountAmount(beforeDisc) + (Number(state.roundOff) || 0);
  }

  function recompute() {
    const subtotal = state.items.reduce((s, i) => s + lineTaxable(i), 0);
    const taxTotal = state.items.reduce((s, i) => s + lineTax(i), 0);
    const beforeDisc = subtotal + taxTotal;
    const discAmt = discountAmount(beforeDisc);
    const grand = beforeDisc - discAmt + (Number(state.roundOff) || 0);
    clear(totalsHost);
    totalsHost.appendChild(h('div', { class: 'lbl' }, t('sale.subtotal')));
    totalsHost.appendChild(h('div', { class: 'val mono' }, NUM(subtotal, 2)));
    totalsHost.appendChild(h('div', { class: 'lbl' }, t('sale.tax')));
    totalsHost.appendChild(h('div', { class: 'val mono' }, NUM(taxTotal, 2)));
    if (discAmt > 0) {
      totalsHost.appendChild(h('div', { class: 'lbl' }, t('sale.discount')));
      totalsHost.appendChild(h('div', { class: 'val mono' }, '-' + NUM(discAmt, 2)));
    }
    totalsHost.appendChild(h('div', { class: 'lbl grand' }, t('sale.grandTotal')));
    totalsHost.appendChild(h('div', { class: 'val mono grand' }, INR(grand)));
    state.items.forEach((it, idx) => {
      const cell = document.getElementById('amt-' + idx);
      if (cell) cell.textContent = NUM(lineAmount(it), 2);
    });
    // Auto-sync paid amount when in cash mode
    if (state.saleType === 'cash') {
      state.paid = grand;
      const paidInput = document.getElementById('s-paid');
      if (paidInput) paidInput.value = String(grand.toFixed(2));
    }
  }
}

function buildHeaderStrip(state, customers, onPartyKind) {
  const wrap = h('div', { class: 'card', style: { padding: '12px' } }, []);
  wrap.appendChild(
    h('div', { class: 'field' }, [
      h('label', {}, t('sale.customer')),
      h(
        'select',
        {
          id: 's-party',
          onchange: (e) => {
            const v = e.target.value;
            if (v === '__cash__' || v === '') {
              state.partyId = null;
              state.partyName = 'Cash';
              state.partyGstin = '';
              state.partyAddress = '';
              state.partyPhone = '';
              onPartyKind?.('cash');
              return;
            }
            if (v === '__credit__') {
              state.partyId = null;
              state.partyName = 'Credit';
              state.partyGstin = '';
              state.partyAddress = '';
              state.partyPhone = '';
              onPartyKind?.('credit');
              return;
            }
            const id = Number(v);
            const p = customers.find((x) => x.id === id);
            if (!p) return;
            state.partyId = p.id;
            state.partyName = p.name;
            state.partyGstin = p.gstin;
            state.partyAddress = p.address;
            state.partyPhone = p.phone;
            if (p.stateCode) {
              state.placeOfSupplyStateCode = p.stateCode;
              const psInput = document.getElementById('s-pos');
              if (psInput) psInput.value = p.stateCode;
            }
            onPartyKind?.('named');
          },
        },
        [
          h('option', { value: '__cash__' }, '💵 ' + t('sale.cashCustomer')),
          h('option', { value: '__credit__' }, '📒 ' + t('sale.creditCustomer')),
          ...customers.map((c) =>
            h('option', { value: c.id }, c.name + (c.phone ? ' · ' + c.phone : '')),
          ),
        ],
      ),
    ]),
  );
  wrap.appendChild(
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('common.date')),
        h('input', {
          id: 's-date',
          type: 'date',
          value: state.date,
          oninput: (e) => {
            state.date = e.target.value;
          },
        }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('sale.placeOfSupply')),
        h('input', {
          id: 's-pos',
          maxlength: 2,
          value: state.placeOfSupplyStateCode,
          placeholder: 'e.g. 19',
          oninput: (e) => {
            state.placeOfSupplyStateCode = e.target.value.trim();
          },
        }),
      ]),
    ]),
  );
  return wrap;
}

function emptyLine() {
  return {
    productId: null,
    code: '',
    name: '',
    hsn: '',
    unit: 'pcs',
    qty: 1,
    rate: 0,
    discountPct: 0,
    gstPct: 0,
    _rateEdited: false,
    _gstEdited: false,
  };
}

function lineGross(it) {
  return (Number(it.qty) || 0) * (Number(it.rate) || 0);
}
function lineTaxable(it) {
  const gross = lineGross(it);
  return gross - gross * ((Number(it.discountPct) || 0) / 100);
}
function lineTax(it) {
  return lineTaxable(it) * ((Number(it.gstPct) || 0) / 100);
}
function lineAmount(it) {
  return lineTaxable(it) + lineTax(it);
}

// ---------- Detail ----------
export async function renderDetail(root, id) {
  clear(root);
  const co = await companies.getActive();
  const s = await sales.get(Number(id));
  if (!s) {
    root.appendChild(h('div', { class: 'empty' }, 'Bill not found.'));
    return;
  }
  const statusClass =
    s.status === 'paid' ? 'ok' : s.status === 'partial' ? 'warn' : 'err';

  root.appendChild(
    h('h1', {}, [s.invoiceNo, h('span', { class: 'tag ' + statusClass, style: { marginLeft: '10px' } }, s.status)]),
  );

  root.appendChild(
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, t('sale.customer')),
      h('div', { style: { fontWeight: '600', fontSize: '17px' } }, s.partyName || 'Cash'),
      s.partySnapshot?.phone ? h('div', { class: 'muted' }, 'Phone: ' + s.partySnapshot.phone) : null,
      s.partySnapshot?.gstin ? h('div', { class: 'muted' }, 'GSTIN: ' + s.partySnapshot.gstin) : null,
      h('div', { class: 'muted' }, t('common.date') + ': ' + fmtDate(s.date)),
    ]),
  );

  const itemList = h('div', { class: 'list' });
  for (const it of s.items || []) {
    itemList.appendChild(
      h('div', { class: 'list-row' }, [
        h('div', { class: 'l-main' }, [
          h('div', { class: 'l-title' }, it.name),
          h(
            'div',
            { class: 'l-sub' },
            (it.hsn ? 'HSN ' + it.hsn + ' · ' : '') +
              NUM(it.qty, 2) +
              ' ' +
              (it.unit || '') +
              ' @ ' +
              INR(it.rate) +
              (it.gstPct ? ' · GST ' + it.gstPct + '%' : ''),
          ),
        ]),
        h('div', { class: 'l-end' }, [h('div', { class: 'l-amt' }, INR(it.amount))]),
      ]),
    );
  }
  root.appendChild(itemList);

  root.appendChild(
    h('div', { class: 'totals-grid' }, [
      h('div', { class: 'lbl' }, t('sale.subtotal')),
      h('div', { class: 'val mono' }, INR(s.subtotal)),
      h('div', { class: 'lbl' }, t('sale.tax')),
      h('div', { class: 'val mono' }, INR(s.taxTotal)),
      s.discount
        ? h('div', { class: 'lbl' }, t('sale.discount'))
        : null,
      s.discount
        ? h('div', { class: 'val mono' }, '-' + INR(s.discount))
        : null,
      h('div', { class: 'lbl grand' }, t('sale.grandTotal')),
      h('div', { class: 'val mono grand' }, INR(s.total)),
      h('div', { class: 'lbl' }, 'Paid'),
      h('div', { class: 'val mono text-ok' }, INR(s.paid || 0)),
      h('div', { class: 'lbl' }, 'Balance'),
      h(
        'div',
        { class: 'val mono ' + (s.total - (s.paid || 0) > 0 ? 'text-warn' : '') },
        INR(Math.max(0, s.total - (s.paid || 0))),
      ),
    ]),
  );

  root.appendChild(
    h('div', { class: 'btn-row', style: { marginTop: '16px' } }, [
      h(
        'button',
        {
          class: 'btn btn-primary flex-1',
          onclick: async () => {
            DBG('btn click: Share PDF for ' + s.invoiceNo);
            try {
              DBG('calling buildInvoicePdf...');
              const blob = await buildInvoicePdf(s, co);
              DBG('blob ready, size=' + (blob && blob.size != null ? blob.size : 'null'));
              await saveAndShareBlob(
                blob,
                'invoice-' + s.invoiceNo.replace(/\//g, '-') + '.pdf',
                'Share invoice',
              );
            } catch (e) {
              console.error(e);
              DBG('FATAL handler error: ' + (e && e.message ? e.message : e) + ' | stack=' + (e && e.stack ? e.stack.split('\n')[0] : 'n/a'));
              toast('PDF error: ' + (e.message || e), 'err');
            }
          },
        },
        '📤 ' + t('common.share') + ' ' + t('common.pdf'),
      ),
      Math.max(0, s.total - (s.paid || 0)) > 0
        ? h(
            'button',
            {
              class: 'btn btn-ghost',
              onclick: () => recordPaymentDialog(co.id, s, () => renderDetail(root, id)),
            },
            '💰 ' + t('sale.recordPayment'),
          )
        : null,
      h(
        'button',
        {
          class: 'btn btn-danger',
          onclick: async () => {
            if (await confirmDialog('Delete this bill? Stock will be restored.', { danger: true })) {
              await sales.remove(Number(id));
              toast('Deleted', 'ok');
              location.hash = '#/sales';
            }
          },
        },
        t('common.delete'),
      ),
    ]),
  );
}

function recordPaymentDialog(companyId, sale, onDone) {
  const due = Math.max(0, sale.total - (sale.paid || 0));
  const card = h('div', {}, [
    h('div', { class: 'modal-title' }, t('sale.recordPayment')),
    h('div', { class: 'muted', style: { marginBottom: '8px' } }, 'Due: ' + INR(due)),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.amount')),
      h('input', { id: 'pmt-amt', type: 'number', step: '0.01', value: due }),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('sale.method')),
      h('select', { id: 'pmt-method' }, [
        h('option', { value: 'cash' }, 'Cash'),
        h('option', { value: 'upi' }, 'UPI'),
        h('option', { value: 'card' }, 'Card'),
        h('option', { value: 'bank' }, 'Bank transfer'),
      ]),
    ]),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn btn-ghost flex-1', onclick: closeModal }, t('common.cancel')),
      h(
        'button',
        {
          class: 'btn btn-primary flex-1',
          onclick: async () => {
            const amt = Number(document.getElementById('pmt-amt').value) || 0;
            const m = document.getElementById('pmt-method').value;
            await sales.addPayment(companyId, sale.id, amt, m);
            closeModal();
            toast(t('sale.paymentReceived'), 'ok');
            onDone?.();
          },
        },
        t('common.save'),
      ),
    ]),
  ]);
  openModal(card);
}
