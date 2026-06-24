import { h, clear } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as sales from '../db/sales.js';
import { INR, NUM, fmtDate } from '../utils/format.js';
import { t } from '../i18n.js';
import { todayISO, monthStartISO } from '../utils/fy.js';

let from = monthStartISO();
let to = todayISO();

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.salesReport')));
  root.appendChild(
    h('div', { class: 'card', style: { padding: '12px' } }, [
      h('div', { class: 'field row-2' }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('report.from')),
          h('input', {
            type: 'date',
            value: from,
            oninput: (e) => {
              from = e.target.value;
              refresh();
            },
          }),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('report.to')),
          h('input', {
            type: 'date',
            value: to,
            oninput: (e) => {
              to = e.target.value;
              refresh();
            },
          }),
        ]),
      ]),
    ]),
  );

  const totalsHost = h('div', { class: 'kpi-grid' });
  root.appendChild(totalsHost);

  const billsHost = h('div');
  root.appendChild(h('h2', {}, t('nav.sales')));
  root.appendChild(billsHost);

  root.appendChild(h('h2', {}, t('report.byProduct')));
  const byProductHost = h('div');
  root.appendChild(byProductHost);

  await refresh();

  async function refresh() {
    const billsRaw = await sales.list(co.id, { from, to });
    const totals = await sales.totalsBetween(co.id, from, to);
    const grouped = await sales.byProduct(co.id, { from, to });

    clear(totalsHost);
    totalsHost.appendChild(kpi(t('report.total') + ' (bills)', String(totals.count)));
    totalsHost.appendChild(kpi(t('report.total'), INR(totals.total)));

    clear(billsHost);
    if (!billsRaw.length) {
      billsHost.appendChild(h('div', { class: 'empty' }, 'No sales in this range.'));
    } else {
      const list = h('div', { class: 'list' });
      for (const s of billsRaw) {
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
                h('div', { class: 'l-title' }, s.invoiceNo),
                h('div', { class: 'l-sub' }, fmtDate(s.date) + ' · ' + (s.partyName || 'Cash')),
              ]),
              h('div', { class: 'l-end' }, [
                h('div', { class: 'l-amt' }, INR(s.total)),
              ]),
            ],
          ),
        );
      }
      billsHost.appendChild(list);
    }

    clear(byProductHost);
    if (!grouped.length) {
      byProductHost.appendChild(h('div', { class: 'empty' }, '—'));
    } else {
      const list = h('div', { class: 'list' });
      for (const g of grouped) {
        list.appendChild(
          h('div', { class: 'list-row' }, [
            h('div', { class: 'l-main' }, [
              h('div', { class: 'l-title' }, g.name),
              h('div', { class: 'l-sub' }, NUM(g.qty, 2) + ' ' + (g.unit || '')),
            ]),
            h('div', { class: 'l-end' }, [
              h('div', { class: 'l-amt' }, INR(g.amount)),
            ]),
          ]),
        );
      }
      byProductHost.appendChild(list);
    }
  }
}

function kpi(label, value) {
  return h('div', { class: 'kpi-card' }, [
    h('div', { class: 'card-title' }, label),
    h('div', { class: 'card-value' }, value),
  ]);
}
