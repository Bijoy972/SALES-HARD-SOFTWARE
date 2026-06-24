import { h, clear, openModal, closeModal, toast, confirmDialog } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import { t } from '../i18n.js';

export async function render(root) {
  clear(root);
  root.appendChild(h('h1', {}, t('nav.companies')));
  const all = await companies.list();
  const active = await companies.getActive();
  root.appendChild(
    h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
      h(
        'button',
        { class: 'btn btn-primary', onclick: () => editCompany(null, () => render(root)) },
        '＋ ' + t('co.add'),
      ),
    ]),
  );
  if (!all.length) {
    root.appendChild(
      h('div', { class: 'empty' }, [
        h('div', { class: 'ico' }, '🏪'),
        h('div', {}, 'No companies yet.'),
      ]),
    );
    return;
  }
  const list = h('div', { class: 'list' });
  for (const c of all) {
    list.appendChild(
      h('div', { class: 'list-row' }, [
        h('div', { class: 'l-main' }, [
          h('div', { class: 'l-title' }, [
            c.name,
            active?.id === c.id
              ? h('span', { class: 'tag ok', style: { marginLeft: '8px' } }, 'active')
              : null,
          ]),
          h(
            'div',
            { class: 'l-sub' },
            [c.gstin || 'no GSTIN', c.phone, c.address].filter(Boolean).join(' · ') ||
              'No details',
          ),
        ]),
        h('div', { class: 'l-end' }, [
          h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } }, [
            active?.id !== c.id
              ? h(
                  'button',
                  {
                    class: 'btn btn-small btn-ghost',
                    onclick: async () => {
                      await companies.setActive(c.id);
                      toast('Switched to ' + c.name, 'ok');
                      render(root);
                      window.dispatchEvent(new CustomEvent('company-changed'));
                    },
                  },
                  t('co.switch'),
                )
              : null,
            h(
              'button',
              {
                class: 'btn btn-small',
                onclick: () => editCompany(c, () => render(root)),
              },
              t('common.edit'),
            ),
            h(
              'button',
              {
                class: 'btn btn-small btn-danger',
                onclick: async () => {
                  if (await confirmDialog(t('co.delete.confirm'), { danger: true })) {
                    await companies.remove(c.id);
                    toast('Deleted', 'ok');
                    render(root);
                    window.dispatchEvent(new CustomEvent('company-changed'));
                  }
                },
              },
              t('common.delete'),
            ),
          ]),
        ]),
      ]),
    );
  }
  root.appendChild(list);
}

function editCompany(c, onDone) {
  const isNew = !c;
  const form = h('div', {}, [
    h('div', { class: 'modal-title' }, isNew ? t('co.add') : t('common.edit')),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.name')),
      h('input', { id: 'co-name', value: c?.name || '', placeholder: 'BIJOY PRODUCTION' }),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('common.address')),
      h('textarea', { id: 'co-address' }, c?.address || ''),
    ]),
    h('div', { class: 'field row-2' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('common.phone')),
        h('input', { id: 'co-phone', value: c?.phone || '' }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('common.gstin')),
        h('input', { id: 'co-gstin', value: c?.gstin || '', placeholder: '19ABCDE1234F1Z5' }),
      ]),
    ]),
    h('div', { class: 'btn-row' }, [
      h(
        'button',
        { class: 'btn btn-ghost flex-1', onclick: closeModal },
        t('common.cancel'),
      ),
      h(
        'button',
        {
          class: 'btn btn-primary flex-1',
          onclick: async () => {
            const data = {
              name: document.getElementById('co-name').value.trim() || 'Shop',
              address: document.getElementById('co-address').value.trim(),
              phone: document.getElementById('co-phone').value.trim(),
              gstin: document.getElementById('co-gstin').value.trim().toUpperCase(),
            };
            if (isNew) await companies.create(data);
            else await companies.update(c.id, data);
            closeModal();
            toast(t('common.save') + ' ✓', 'ok');
            onDone?.();
            window.dispatchEvent(new CustomEvent('company-changed'));
          },
        },
        t('common.save'),
      ),
    ]),
  ]);
  openModal(form);
}
