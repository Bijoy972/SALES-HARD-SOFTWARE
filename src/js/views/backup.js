import { h, clear, toast, confirmDialog } from '../utils/dom.js';
import { db } from '../db/schema.js';
import * as companies from '../db/companies.js';
import * as settings from '../db/settings.js';
import { saveAndShareText } from '../utils/share.js';
import { t } from '../i18n.js';
import { fmtDate } from '../utils/format.js';

const SCHEMA_VERSION = 1;

async function dumpAll(opts = {}) {
  const filter = opts.companyId ? (r) => r.companyId === opts.companyId : () => true;
  const co = opts.companyId
    ? [await db.companies.get(opts.companyId)].filter(Boolean)
    : await db.companies.toArray();
  const data = {
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope: opts.companyId ? 'company' : 'all',
    appSettings: opts.companyId ? [] : await db.appSettings.toArray(),
    companies: co,
    products: (await db.products.toArray()).filter(filter),
    parties: (await db.parties.toArray()).filter(filter),
    purchases: (await db.purchases.toArray()).filter(filter),
    sales: (await db.sales.toArray()).filter(filter),
    payments: (await db.payments.toArray()).filter(filter),
    invoiceCounters: opts.companyId
      ? (await db.invoiceCounters.toArray()).filter((r) =>
          String(r.key).startsWith(opts.companyId + ':'),
        )
      : await db.invoiceCounters.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

async function restoreAll(text) {
  const data = JSON.parse(text);
  if (!data.schema) throw new Error('Invalid backup file');
  await db.transaction(
    'rw',
    [
      db.appSettings,
      db.companies,
      db.products,
      db.parties,
      db.purchases,
      db.sales,
      db.payments,
      db.invoiceCounters,
    ],
    async () => {
      if (data.scope !== 'company') {
        await db.appSettings.clear();
        await db.companies.clear();
      }
      await db.products.clear();
      await db.parties.clear();
      await db.purchases.clear();
      await db.sales.clear();
      await db.payments.clear();
      if (data.scope !== 'company') {
        await db.invoiceCounters.clear();
      }
      if (data.appSettings?.length) await db.appSettings.bulkPut(data.appSettings);
      if (data.companies?.length) await db.companies.bulkPut(data.companies);
      if (data.products?.length) await db.products.bulkPut(data.products);
      if (data.parties?.length) await db.parties.bulkPut(data.parties);
      if (data.purchases?.length) await db.purchases.bulkPut(data.purchases);
      if (data.sales?.length) await db.sales.bulkPut(data.sales);
      if (data.payments?.length) await db.payments.bulkPut(data.payments);
      if (data.invoiceCounters?.length)
        await db.invoiceCounters.bulkPut(data.invoiceCounters);
    },
  );
  settings.clearCache();
}

export async function render(root) {
  clear(root);
  root.appendChild(h('h1', {}, t('backup.title')));
  const last = await settings.get('lastBackupAt');
  const co = await companies.getActive();
  root.appendChild(
    h('div', { class: 'card' }, [
      h(
        'div',
        { class: 'muted' },
        t('backup.lastBackup') +
          ': ' +
          (last ? new Date(last).toLocaleString() : t('backup.never')),
      ),
    ]),
  );

  root.appendChild(
    h('div', { class: 'btn-row', style: { flexDirection: 'column', gap: '10px' } }, [
      h(
        'button',
        {
          class: 'btn btn-primary btn-block',
          onclick: async () => {
            const json = await dumpAll();
            const fname =
              'bijoy-backup-all-' + fmtDate(new Date().toISOString().slice(0, 10)).replace(/\//g, '-') + '.json';
            await saveAndShareText(json, fname, 'application/json', 'Share backup');
            await settings.set('lastBackupAt', Date.now());
            toast('Exported', 'ok');
            render(root);
          },
        },
        '⬆ ' + t('backup.export'),
      ),
      co
        ? h(
            'button',
            {
              class: 'btn btn-ghost btn-block',
              onclick: async () => {
                const json = await dumpAll({ companyId: co.id });
                const fname =
                  'bijoy-backup-' + (co.slug || 'shop') + '-' + Date.now() + '.json';
                await saveAndShareText(json, fname, 'application/json', 'Share backup');
                toast('Exported', 'ok');
              },
            },
            '⬆ ' + t('backup.exportThis'),
          )
        : null,
      h('label', { class: 'btn btn-ghost btn-block', style: { cursor: 'pointer' } }, [
        '⬇ ' + t('backup.import'),
        h('input', {
          type: 'file',
          accept: 'application/json,.json',
          style: { display: 'none' },
          onchange: async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            if (!(await confirmDialog(t('backup.confirm'), { danger: true }))) return;
            try {
              await restoreAll(text);
              toast(t('backup.imported'), 'ok');
              setTimeout(() => location.reload(), 500);
            } catch (err) {
              toast('Import failed: ' + err.message, 'err');
            }
          },
        }),
      ]),
    ]),
  );
}
