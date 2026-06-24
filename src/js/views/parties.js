import { h, clear, openModal, closeModal, toast, confirmDialog } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as parties from '../db/parties.js';
import { INR, fmtDate } from '../utils/format.js';
import { t } from '../i18n.js';

let searchTerm = '';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  if (!co) {
    root.appendChild(h('div', { class: 'empty' }, 'Select a company first.'));
    return;
  }
  root.appendChild(h('h1', {}, t('nav.parties')));
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
        { class: 'btn btn-primary', onclick: () => editParty(co.id, null, refresh) },
        '＋ ' + t('party.add'),
      ),
    ]),
  );
  const listHost = h('div');
  root.appendChild(listHost);
  await refresh();

  async function refresh() {
    clear(listHost);
    const all = await parties.list(co.id, { search: searchTerm });
    if (!all.length) {
      listHost.appendChild(
        h('div', { class: 'empty' }, [
          h('div', { class: 'ico' }, '👤'),
          h('div', {}, searchTerm ? 'No matches.' : 'No parties yet.'),
        ]),
      );
      return;
    }
    const list = h('div', { class: 'list' });
    for (const p of all) {
      const klass =
        p.kind === 'supplier'
          ? 'accent'
          : p.kind === 'both'
            ? 'ok'
            : '';
      list.appendChild(
        h('div', { class: 'list-row' }, [
          h(
            'div',
            { class: 'l-main', onclick: () => openLedger(co.id, p) },
            [
              h('div', { class: 'l-title' }, [
                p.name,
                h('span', { class: 'tag ' + klass, style: { marginLeft: '6px' } }, p.kind),
              ]),
              h(
                'div',
                { class: 'l-sub' },
                [p.phone, p.gstin, p.address].filter(Boolean).join(' · ') || '—',
              ),
            ],
          ),
          h('div', { class: 'l-end' }, [
            h(
              'button',
              {
                class: 'btn btn-small',
                onclick: () => editParty(co.id, p, refresh),
              },
              t('common.edit'),
            ),
          ]),
        ]),
      );
    }
    listHost.appendChild(list);
  }
}

function editParty(companyId, p, onDone) {
  const isNew = !p;
  const form = h('div', {}, [
    h('div', { class: 'modal-title' }, isNew ? t('party.add') : p.name),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.name')),
      h('input', { id: 'pa-name', value: p?.name || '' }),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('party.kind')),
      h(
        'select',
        { id: 'pa-kind' },
        [
          h('option', { value: 'customer', selected: !p || p.kind === 'customer' }, t('party.customer')),
          h('option', { value: 'supplier', selected: p?.kind === 'supplier' }, t('party.supplier')),
          h('option', { value: 'both', selected: p?.kind === 'both' }, t('party.both')),
        ],
      ),
    ]),
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('common.phone')),
        h('input', { id: 'pa-phone', value: p?.phone || '' }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('common.gstin')),
        h('input', { id: 'pa-gstin', value: p?.gstin || '' }),
      ]),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.address')),
      h('textarea', { id: 'pa-address' }, p?.address || ''),
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
                  await parties.remove(p.id);
                  closeModal();
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
              name: val('pa-name'),
              kind: val('pa-kind'),
              phone: val('pa-phone'),
              gstin: val('pa-gstin').toUpperCase(),
              address: val('pa-address'),
            };
            if (!data.name) {
              toast('Name required', 'err');
              return;
            }
            if (isNew) await parties.create(companyId, data);
            else await parties.update(p.id, data);
            closeModal();
            toast('Saved ✓', 'ok');
            onDone?.();
          },
        },
        t('common.save'),
      ),
    ]),
  ]);
  openModal(form);
}

async function openLedger(companyId, p) {
  const { entries, balance } = await parties.ledger(companyId, p.id);
  const rows = entries.length
    ? entries.map((e) =>
        h('div', { class: 'list-row' }, [
          h('div', { class: 'l-main' }, [
            h(
              'div',
              { class: 'l-title' },
              (e.type === 'sale' ? '🧾 ' : '💰 ') + (e.ref || e.type),
            ),
            h('div', { class: 'l-sub' }, fmtDate(e.date)),
          ]),
          h('div', { class: 'l-end' }, [
            h(
              'div',
              {
                class: 'l-amt ' + (e.debit ? '' : 'text-ok'),
              },
              (e.debit ? '' : '+') +
                INR(e.debit ? e.debit : e.credit),
            ),
            h('div', { class: 'l-sub' }, 'Bal: ' + INR(e.balance)),
          ]),
        ]),
      )
    : [h('div', { class: 'empty' }, 'No activity.')];
  const card = h('div', {}, [
    h('div', { class: 'modal-title' }, t('party.ledger') + ' · ' + p.name),
    h(
      'div',
      {
        style: { marginBottom: '10px', color: 'var(--text-soft)' },
      },
      'Closing balance: ' + INR(balance),
    ),
    h('div', { class: 'list' }, rows),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn btn-block', onclick: closeModal }, 'Close'),
    ]),
  ]);
  openModal(card);
}

const val = (id) => document.getElementById(id).value.trim();
