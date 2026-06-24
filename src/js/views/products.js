import { h, clear, openModal, closeModal, toast, confirmDialog } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as products from '../db/products.js';
import * as settings from '../db/settings.js';
import { INR } from '../utils/format.js';
import { t } from '../i18n.js';

let searchTerm = '';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.products')));

  // Top: search + add
  const searchInput = h('input', {
    type: 'search',
    placeholder: t('common.search'),
    value: searchTerm,
    oninput: (e) => {
      searchTerm = e.target.value;
      refresh();
    },
  });
  root.appendChild(h('div', { class: 'search-box' }, searchInput));
  root.appendChild(
    h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
      h(
        'button',
        { class: 'btn btn-primary', onclick: () => editProduct(co.id, null, refresh) },
        '＋ ' + t('product.add'),
      ),
    ]),
  );

  const listHost = h('div');
  root.appendChild(listHost);
  await refresh();

  async function refresh() {
    clear(listHost);
    const all = await products.list(co.id, searchTerm);
    const threshold = Number((await settings.get('lowStockThreshold')) || 5);
    if (!all.length) {
      listHost.appendChild(
        h('div', { class: 'empty' }, [
          h('div', { class: 'ico' }, '📦'),
          h('div', {}, searchTerm ? 'No matches.' : 'No products yet.'),
        ]),
      );
      return;
    }
    const list = h('div', { class: 'list' });
    for (const p of all) {
      const low =
        Number(p.stock || 0) <= (p.lowStockAt != null ? p.lowStockAt : threshold);
      list.appendChild(
        h(
          'div',
          {
            class: 'list-row',
            onclick: () => editProduct(co.id, p, refresh),
          },
          [
            h('div', { class: 'l-main' }, [
              h('div', { class: 'l-title' }, [
                p.name,
                p.code ? h('span', { class: 'tag', style: { marginLeft: '6px' } }, p.code) : null,
              ]),
              h(
                'div',
                { class: 'l-sub' },
                [
                  p.hsn ? 'HSN ' + p.hsn : null,
                  p.gstRate ? 'GST ' + p.gstRate + '%' : null,
                  INR(p.rate) + ' / ' + (p.unit || 'pcs'),
                ]
                  .filter(Boolean)
                  .join(' · '),
              ),
            ]),
            h('div', { class: 'l-end' }, [
              h(
                'div',
                { class: 'l-amt ' + (low ? 'text-warn' : '') },
                String(p.stock),
              ),
              h('div', { class: 'l-sub' }, p.unit || 'pcs'),
            ]),
          ],
        ),
      );
    }
    listHost.appendChild(list);
  }
}

function editProduct(companyId, p, onDone) {
  const isNew = !p;
  const form = h('div', {}, [
    h('div', { class: 'modal-title' }, isNew ? t('product.add') : p.name),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.name')),
      h('input', { id: 'p-name', value: p?.name || '' }),
    ]),
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('product.code')),
        h('input', { id: 'p-code', value: p?.code || '' }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('product.unit')),
        h('input', { id: 'p-unit', value: p?.unit || 'pcs' }),
      ]),
    ]),
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('common.rate')),
        h('input', { id: 'p-rate', type: 'number', step: '0.01', value: p?.rate ?? 0 }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('product.stock')),
        h('input', { id: 'p-stock', type: 'number', step: '0.01', value: p?.stock ?? 0 }),
      ]),
    ]),
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('product.hsn')),
        h('input', { id: 'p-hsn', value: p?.hsn || '' }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('product.gstRate')),
        h('input', { id: 'p-gst', type: 'number', step: '0.1', value: p?.gstRate ?? 0 }),
      ]),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('product.lowAt')),
      h('input', { id: 'p-low', type: 'number', step: '0.01', value: p?.lowStockAt ?? '' }),
    ]),
    h('div', { class: 'btn-row' }, [
      h(
        'button',
        { class: 'btn btn-ghost', onclick: closeModal },
        t('common.cancel'),
      ),
      !isNew
        ? h(
            'button',
            {
              class: 'btn btn-danger',
              onclick: async () => {
                if (await confirmDialog('Delete ' + p.name + '?', { danger: true })) {
                  await products.remove(p.id);
                  closeModal();
                  toast(t('product.deleted'), 'ok');
                  onDone?.();
                }
              },
            },
            t('common.delete'),
          )
        : null,
      h(
        'button',
        {
          class: 'btn btn-primary flex-1',
          onclick: async () => {
            const data = {
              name: val('p-name'),
              code: val('p-code'),
              unit: val('p-unit') || 'pcs',
              rate: numVal('p-rate'),
              stock: numVal('p-stock'),
              hsn: val('p-hsn'),
              gstRate: numVal('p-gst'),
              lowStockAt: val('p-low') === '' ? null : numVal('p-low'),
            };
            if (!data.name) {
              toast('Name required', 'err');
              return;
            }
            if (isNew) await products.create(companyId, data);
            else await products.update(p.id, data);
            closeModal();
            toast(t('product.saved'), 'ok');
            onDone?.();
          },
        },
        t('common.save'),
      ),
    ]),
  ]);
  openModal(form);
}

const val = (id) => document.getElementById(id).value.trim();
const numVal = (id) => Number(document.getElementById(id).value) || 0;
