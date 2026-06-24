import { h, clear, toast, confirmDialog } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as products from '../db/products.js';
import * as parties from '../db/parties.js';
import * as purchases from '../db/purchases.js';
import { INR, NUM, fmtDate } from '../utils/format.js';
import { t } from '../i18n.js';
import { todayISO } from '../utils/fy.js';

// ---------- List ----------
export async function renderList(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.purchases')));
  root.appendChild(
    h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
      h(
        'a',
        { class: 'btn btn-primary', href: '#/purchases/new' },
        '＋ ' + t('purchase.new'),
      ),
    ]),
  );
  const all = await purchases.list(co.id);
  if (!all.length) {
    root.appendChild(
      h('div', { class: 'empty' }, [
        h('div', { class: 'ico' }, '🛒'),
        h('div', {}, 'No purchases yet.'),
      ]),
    );
    return;
  }
  const list = h('div', { class: 'list' });
  for (const p of all) {
    list.appendChild(
      h('div', { class: 'list-row' }, [
        h('div', { class: 'l-main' }, [
          h('div', { class: 'l-title' }, p.partyName || 'Supplier'),
          h('div', { class: 'l-sub' }, fmtDate(p.date) + ' · ' + (p.items?.length || 0) + ' items'),
        ]),
        h('div', { class: 'l-end' }, [
          h('div', { class: 'l-amt' }, INR(p.total)),
          h(
            'button',
            {
              class: 'btn btn-small btn-danger',
              style: { marginTop: '4px' },
              onclick: async () => {
                if (await confirmDialog('Delete purchase? Stock will be reversed.', { danger: true })) {
                  await purchases.remove(p.id);
                  toast('Deleted', 'ok');
                  renderList(root);
                }
              },
            },
            '✕',
          ),
        ]),
      ]),
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
  const suppliers = await parties.list(co.id, { kind: 'supplier' });

  const state = {
    partyId: null,
    partyName: '',
    date: todayISO(),
    items: [emptyLine()],
    notes: '',
  };

  root.appendChild(h('h1', {}, t('purchase.new')));

  root.appendChild(
    h('div', { class: 'card', style: { padding: '12px' } }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('purchase.supplier')),
        h(
          'select',
          {
            onchange: (e) => {
              const id = Number(e.target.value);
              const p = suppliers.find((x) => x.id === id);
              state.partyId = id || null;
              state.partyName = p?.name || '';
            },
          },
          [
            h('option', { value: '' }, '— ' + t('purchase.supplier') + ' —'),
            ...suppliers.map((s) =>
              h('option', { value: s.id }, s.name),
            ),
          ],
        ),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('common.date')),
        h('input', {
          type: 'date',
          value: state.date,
          oninput: (e) => (state.date = e.target.value),
        }),
      ]),
    ]),
  );

  const itemsHost = h('div');
  root.appendChild(itemsHost);

  root.appendChild(
    h(
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
    ),
  );

  const totalHost = h('div', { class: 'totals-grid' });
  root.appendChild(totalHost);

  root.appendChild(
    h('div', { class: 'field' }, [
      h('label', {}, t('common.notes')),
      h('input', { oninput: (e) => (state.notes = e.target.value) }),
    ]),
  );

  root.appendChild(
    h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        style: { marginTop: '16px' },
        onclick: async () => {
          const items = state.items.filter((i) => i.name && Number(i.qty) > 0);
          if (!items.length) {
            toast('Add at least one line', 'err');
            return;
          }
          // Compute amount per line
          for (const it of items) {
            it.amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
          }
          await purchases.create(co.id, { ...state, items });
          toast(t('purchase.saved'), 'ok');
          location.hash = '#/purchases';
        },
      },
      t('purchase.save'),
    ),
  );

  renderItems();
  recompute();

  function renderItems() {
    clear(itemsHost);
    const tbl = h('table', { class: 'line-table' });
    tbl.appendChild(
      h('thead', {}, [
        h('tr', {}, [
          h('th', {}, '#'),
          h('th', {}, t('common.name')),
          h('th', { class: 'num' }, t('common.qty')),
          h('th', { class: 'num' }, t('common.rate')),
          h('th', { class: 'num' }, t('common.amount')),
          h('th', {}, ''),
        ]),
      ]),
    );
    const tb = h('tbody');
    state.items.forEach((it, idx) => {
      tb.appendChild(
        h('tr', {}, [
          h('td', {}, String(idx + 1)),
          h('td', {}, [
            h('input', {
              value: it.name || '',
              list: 'product-options',
              oninput: (e) => {
                it.name = e.target.value;
                const match = allProducts.find(
                  (p) => (p.name || '').toLowerCase() === it.name.toLowerCase(),
                );
                if (match) {
                  it.productId = match.id;
                  it.unit = match.unit;
                  if (!it._rateEdited) it.rate = match.rate;
                  renderItems();
                  recompute();
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
          h(
            'td',
            { class: 'num mono', id: 'p-amt-' + idx },
            NUM((Number(it.qty) || 0) * (Number(it.rate) || 0), 2),
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
        ]),
      );
    });
    tbl.appendChild(tb);
    itemsHost.appendChild(tbl);

    // ensure product-options datalist exists
    let dl = document.getElementById('product-options');
    if (!dl) {
      dl = h('datalist', { id: 'product-options' });
      document.body.appendChild(dl);
    } else clear(dl);
    for (const p of allProducts) dl.appendChild(h('option', { value: p.name }));
  }

  function recompute() {
    const total = state.items.reduce(
      (s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0),
      0,
    );
    clear(totalHost);
    totalHost.appendChild(h('div', { class: 'lbl grand' }, t('common.total')));
    totalHost.appendChild(h('div', { class: 'val mono grand' }, INR(total)));
    state.items.forEach((it, idx) => {
      const cell = document.getElementById('p-amt-' + idx);
      if (cell) cell.textContent = NUM((Number(it.qty) || 0) * (Number(it.rate) || 0), 2);
    });
  }
}

function emptyLine() {
  return {
    productId: null,
    name: '',
    unit: 'pcs',
    qty: 1,
    rate: 0,
    _rateEdited: false,
  };
}
