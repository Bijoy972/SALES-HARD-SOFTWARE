import { h, clear, toast } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import {
  importProductsTxt,
  importPurchasesTxt,
  importSalesTxt,
} from '../importer/legacy.js';
import { t } from '../i18n.js';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('import.title')));
  root.appendChild(
    h(
      'p',
      { class: 'muted' },
      'Pick one or more of the legacy text files from your old C++ app. They will be merged into the current company.',
    ),
  );

  const state = { products: null, purchases: null, sales: null };

  const card = h('div', { class: 'card' }, [
    fileRow('products', t('import.products'), state),
    fileRow('purchases', t('import.purchases'), state),
    fileRow('sales', t('import.sales'), state),
    h(
      'button',
      {
        class: 'btn btn-primary btn-block',
        style: { marginTop: '10px' },
        onclick: async () => {
          let total = 0;
          try {
            if (state.products) {
              total += await importProductsTxt(co.id, state.products);
            }
            if (state.purchases) {
              total += await importPurchasesTxt(co.id, state.purchases);
            }
            if (state.sales) {
              total += await importSalesTxt(co.id, state.sales);
            }
            toast(t('import.done') + ' (' + total + ')', 'ok');
          } catch (e) {
            toast('Import error: ' + e.message, 'err');
          }
        },
      },
      t('import.run'),
    ),
  ]);
  root.appendChild(card);
}

function fileRow(key, label, state) {
  return h('div', { class: 'field' }, [
    h('label', {}, label),
    h('input', {
      type: 'file',
      accept: '.txt,text/plain',
      onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) {
          state[key] = null;
          return;
        }
        state[key] = await f.text();
      },
    }),
  ]);
}
