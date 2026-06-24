import { h, clear, toast } from '../utils/dom.js';
import * as companies from '../db/companies.js';
import * as settings from '../db/settings.js';
import { t, setLang, refreshDom } from '../i18n.js';

export async function render(root) {
  clear(root);
  const co = await companies.getActive();
  const s = await settings.getAll();

  root.appendChild(h('h1', {}, t('settings.title')));

  // ----- Company profile -----
  if (co) {
    root.appendChild(h('h2', {}, t('settings.company')));
    const logoFile = h('input', {
      id: 's-logo',
      type: 'file',
      accept: 'image/png,image/jpeg',
      onchange: (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          document.getElementById('logo-preview').src = String(fr.result);
          document.getElementById('logo-preview').dataset.url = String(fr.result);
        };
        fr.readAsDataURL(f);
      },
    });

    root.appendChild(
      h('div', { class: 'card' }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('common.name')),
          h('input', { id: 's-co-name', value: co.name || '' }),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('common.address')),
          h('textarea', { id: 's-co-address' }, co.address || ''),
        ]),
        h('div', { class: 'field row-2' }, [
          h('div', { class: 'field' }, [
            h('label', {}, t('common.phone')),
            h('input', { id: 's-co-phone', value: co.phone || '' }),
          ]),
          h('div', { class: 'field' }, [
            h('label', {}, t('common.gstin')),
            h('input', { id: 's-co-gstin', value: co.gstin || '' }),
          ]),
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('settings.logo')),
          logoFile,
          h('img', {
            id: 'logo-preview',
            src: co.logoDataUrl || '',
            style: {
              maxWidth: '90px',
              maxHeight: '90px',
              marginTop: '8px',
              borderRadius: '12px',
              background: '#fff2',
              padding: '4px',
              display: co.logoDataUrl ? 'block' : 'none',
            },
            'data-url': co.logoDataUrl || '',
          }),
        ]),
        h(
          'button',
          {
            class: 'btn btn-primary btn-block',
            onclick: async () => {
              const data = {
                name: val('s-co-name'),
                address: val('s-co-address'),
                phone: val('s-co-phone'),
                gstin: val('s-co-gstin').toUpperCase(),
              };
              const imgEl = document.getElementById('logo-preview');
              if (imgEl?.dataset?.url) data.logoDataUrl = imgEl.dataset.url;
              await companies.update(co.id, data);
              toast(t('settings.saved'), 'ok');
              window.dispatchEvent(new CustomEvent('company-changed'));
            },
          },
          t('common.save'),
        ),
      ]),
    );
  }

  // ----- App preferences -----
  root.appendChild(h('h2', {}, 'App'));
  root.appendChild(
    h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.invoicePrefix')),
        h('input', { id: 's-prefix', value: s.invoicePrefix || 'BJ' }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.lowStock')),
        h('input', {
          id: 's-low',
          type: 'number',
          step: '1',
          value: s.lowStockThreshold ?? 5,
        }),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.theme')),
        h(
          'select',
          { id: 's-theme' },
          [
            h(
              'option',
              { value: 'dark', selected: s.theme === 'dark' },
              t('settings.theme.dark'),
            ),
            h(
              'option',
              { value: 'light', selected: s.theme === 'light' },
              t('settings.theme.light'),
            ),
          ],
        ),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.lang')),
        h(
          'select',
          { id: 's-lang' },
          [
            h(
              'option',
              { value: 'bn', selected: s.lang === 'bn' },
              t('settings.lang.bn'),
            ),
            h(
              'option',
              { value: 'en', selected: s.lang === 'en' },
              t('settings.lang.en'),
            ),
          ],
        ),
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('settings.pin')),
        h('input', {
          id: 's-pin',
          type: 'password',
          maxlength: 4,
          inputmode: 'numeric',
          placeholder: s.pinHash ? '••••' : t('settings.pin.setHint'),
        }),
        h(
          'div',
          { class: 'muted', style: { marginTop: '4px', fontSize: '12px' } },
          t('settings.pin.setHint'),
        ),
      ]),
      h(
        'button',
        {
          class: 'btn btn-primary btn-block',
          onclick: async () => {
            const patch = {
              invoicePrefix: val('s-prefix') || 'BJ',
              lowStockThreshold: numVal('s-low'),
              theme: val('s-theme'),
              lang: val('s-lang'),
            };
            const pin = val('s-pin');
            if (pin === '') {
              // leave existing PIN as-is (do not clear unless user explicitly wants)
            } else if (pin === '0000') {
              patch.pinHash = null;
            } else if (/^\d{4}$/.test(pin)) {
              patch.pinHash = await settings.hashPin(pin);
            } else {
              toast('PIN must be 4 digits (0000 to remove)', 'err');
              return;
            }
            await settings.setMany(patch);
            document.body.dataset.theme = patch.theme;
            setLang(patch.lang);
            refreshDom();
            toast(t('settings.saved'), 'ok');
          },
        },
        t('common.save'),
      ),
    ]),
  );

  root.appendChild(
    h('div', { style: { marginTop: '20px' } }, [
      h(
        'a',
        { href: '#/companies', class: 'btn btn-ghost btn-block' },
        '🏪 ' + t('nav.companies'),
      ),
      h(
        'a',
        { href: '#/parties', class: 'btn btn-ghost btn-block', style: { marginTop: '8px' } },
        '👥 ' + t('nav.parties'),
      ),
      h(
        'a',
        { href: '#/backup', class: 'btn btn-ghost btn-block', style: { marginTop: '8px' } },
        '💾 ' + t('nav.backup'),
      ),
      h(
        'a',
        { href: '#/import-legacy', class: 'btn btn-ghost btn-block', style: { marginTop: '8px' } },
        '📥 ' + t('nav.importLegacy'),
      ),
    ]),
  );
}

const val = (id) => document.getElementById(id).value.trim();
const numVal = (id) => Number(document.getElementById(id).value) || 0;
