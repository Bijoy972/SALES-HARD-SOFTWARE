import { h, clear } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as products from '../db/products.js';
import * as settings from '../db/settings.js';
import { INR, NUM } from '../utils/format.js';
import { t } from '../i18n.js';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.stockReport')));
  const all = await products.list(co.id);
  const threshold = Number((await settings.get('lowStockThreshold')) || 5);
  let totalQty = 0;
  let totalValue = 0;
  for (const p of all) {
    totalQty += Number(p.stock) || 0;
    totalValue += (Number(p.stock) || 0) * (Number(p.rate) || 0);
  }
  root.appendChild(
    h('div', { class: 'kpi-grid' }, [
      kpiCard(t('product.stock'), NUM(totalQty, 2), ''),
      kpiCard(t('dash.stockValue'), INR(totalValue), `${all.length} items`),
    ]),
  );
  if (!all.length) {
    root.appendChild(h('div', { class: 'empty' }, 'No products yet.'));
    return;
  }
  const list = h('div', { class: 'list' });
  all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  for (const p of all) {
    const low = Number(p.stock || 0) <= (p.lowStockAt ?? threshold);
    list.appendChild(
      h('div', { class: 'list-row' }, [
        h('div', { class: 'l-main' }, [
          h('div', { class: 'l-title' }, p.name + (p.code ? ' (' + p.code + ')' : '')),
          h(
            'div',
            { class: 'l-sub' },
            INR(p.rate) +
              ' / ' +
              (p.unit || 'pcs') +
              ' · value ' +
              INR((Number(p.stock) || 0) * (Number(p.rate) || 0)),
          ),
        ]),
        h('div', { class: 'l-end' }, [
          h('div', { class: 'l-amt ' + (low ? 'text-warn' : '') }, NUM(p.stock, 2)),
          h('div', { class: 'l-sub' }, p.unit || 'pcs'),
        ]),
      ]),
    );
  }
  root.appendChild(list);
}

function kpiCard(label, value, sub) {
  return h('div', { class: 'kpi-card' }, [
    h('div', { class: 'card-title' }, label),
    h('div', { class: 'card-value' }, value),
    sub ? h('div', { class: 'card-sub' }, sub) : null,
  ]);
}
