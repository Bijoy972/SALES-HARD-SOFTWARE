import { h, clear } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as sales from '../db/sales.js';
import * as products from '../db/products.js';
import * as settings from '../db/settings.js';
import { INR, fmtDate } from '../utils/format.js';
import { t } from '../i18n.js';
import { todayISO, monthStartISO } from '../utils/fy.js';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(emptyState());
    return;
  }
  const today = todayISO();
  const monthStart = monthStartISO();
  const [todayTot, monthTot, stockTot, recvTot, recent, lowS] =
    await Promise.all([
      sales.totalsBetween(co.id, today, today),
      sales.totalsBetween(co.id, monthStart, today),
      products.totalValuation(co.id),
      sales.totalReceivable(co.id),
      sales.list(co.id),
      products.lowStock(
        co.id,
        Number((await settings.get('lowStockThreshold')) || 5),
      ),
    ]);

  root.appendChild(
    h('h1', {}, [
      t('nav.dashboard'),
      h('span', { class: 'muted', style: { fontSize: '13px', marginLeft: '8px' } }, '· ' + (co.name || '')),
    ]),
  );

  root.appendChild(
    h('div', { class: 'kpi-grid' }, [
      kpi('accent', t('dash.todaySales'), INR(todayTot.total), `${todayTot.count} ${todayTot.count === 1 ? 'bill' : 'bills'}`),
      kpi('', t('dash.monthSales'), INR(monthTot.total), `${monthTot.count} bills`),
      kpi('ok', t('dash.stockValue'), INR(stockTot.value), `${stockTot.count} items`),
      kpi('warn', t('dash.receivable'), INR(recvTot), ''),
    ]),
  );

  // Low-stock alerts
  if (lowS.length) {
    root.appendChild(h('h2', {}, t('dash.lowStock')));
    const list = h('div', { class: 'list' });
    for (const p of lowS.slice(0, 6)) {
      list.appendChild(
        h('div', { class: 'list-row' }, [
          h('div', { class: 'l-main' }, [
            h('div', { class: 'l-title' }, p.name),
            h('div', { class: 'l-sub' }, (p.code || '') + ' · ' + (p.unit || '')),
          ]),
          h('div', { class: 'l-end' }, [
            h('div', { class: 'l-amt text-warn' }, String(p.stock)),
            h('div', { class: 'l-sub' }, p.unit || ''),
          ]),
        ]),
      );
    }
    root.appendChild(list);
  }

  // Recent sales
  root.appendChild(h('h2', {}, t('dash.recent')));
  if (!recent.length) {
    root.appendChild(
      h('div', { class: 'empty' }, [
        h('div', { class: 'ico' }, '🧾'),
        h('div', {}, t('dash.empty')),
        h('div', { style: { marginTop: '14px' } }, [
          h(
            'a',
            { href: '#/sales/new', class: 'btn btn-primary' },
            t('dash.newBill'),
          ),
        ]),
      ]),
    );
    return;
  }
  const list = h('div', { class: 'list' });
  for (const s of recent.slice(0, 8)) {
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
              fmtDate(s.date) +
                ' · ' +
                (s.items?.length || 0) +
                ' items',
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

function kpi(klass, label, value, sub) {
  return h('div', { class: 'kpi-card ' + (klass || '') }, [
    h('div', { class: 'card-title' }, label),
    h('div', { class: 'card-value' }, value),
    sub ? h('div', { class: 'card-sub' }, sub) : null,
  ]);
}

function emptyState() {
  return h('div', { class: 'empty', style: { marginTop: '50px' } }, [
    h('div', { class: 'ico' }, '🏪'),
    h('div', { style: { fontSize: '17px', marginBottom: '6px' } }, 'Create your first company'),
    h('div', { class: 'muted', style: { marginBottom: '14px' } }, 'Set up your shop name, address, phone, GSTIN.'),
    h('a', { href: '#/companies', class: 'btn btn-primary' }, t('co.add')),
  ]);
}
