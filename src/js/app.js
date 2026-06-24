// BIJOY PRODUCTION — main entry.
// Initialises DB defaults, theme/language, the lock screen, the router, and the
// app shell event wiring. Views are loaded statically (small bundle) but route
// dispatch is async so future code-splitting is easy.

import * as companies from './db/companies.js';
import * as settings from './db/settings.js';
import { setLang, refreshDom, t } from './i18n.js';
import { maybeLock } from './utils/pin-lock.js';
import { setActiveNav } from './utils/dom.js';

import * as Dashboard from './views/dashboard.js';
import * as CompaniesView from './views/companies.js';
import * as Products from './views/products.js';
import * as Parties from './views/parties.js';
import * as Sales from './views/sales.js';
import * as Purchases from './views/purchases.js';
import * as StockReport from './views/stock-report.js';
import * as SalesReport from './views/sales-report.js';
import * as SettingsView from './views/settings.js';
import * as Backup from './views/backup.js';
import * as ImportLegacy from './views/import-legacy.js';

async function boot() {
  // Apply persisted theme + language as early as possible.
  const s = await settings.getAll();
  document.body.dataset.theme = s.theme || 'dark';
  setLang(s.lang || 'bn');

  // Ensure at least one company exists (BIJOY PRODUCTION placeholder).
  await companies.ensureSeed();

  // Set up shell event wiring (menu, lang toggle, company picker, drawer).
  wireShell();

  // Refresh static i18n labels in the HTML shell.
  refreshDom();

  // Decide initial route.
  if (!location.hash) location.hash = '#/dashboard';
  // Lock screen first (if PIN configured); after unlock, render route.
  await maybeLock();
  await renderRoute();

  // Update header on company change.
  window.addEventListener('company-changed', updateCompanyHeader);
  window.addEventListener('hashchange', renderRoute);
  updateCompanyHeader();
}

function wireShell() {
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('drawer-scrim');
  const openDrawer = () => {
    drawer.classList.add('show');
    drawer.classList.remove('hidden');
    scrim.classList.add('show');
    scrim.classList.remove('hidden');
  };
  const closeDrawer = () => {
    drawer.classList.remove('show');
    scrim.classList.remove('show');
    setTimeout(() => {
      drawer.classList.add('hidden');
      scrim.classList.add('hidden');
    }, 220);
  };
  document.getElementById('btn-menu').addEventListener('click', openDrawer);
  scrim.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') closeDrawer();
  });

  // Language toggle (BN ↔ EN)
  document.getElementById('btn-lang').addEventListener('click', async () => {
    const cur = (await settings.get('lang')) || 'bn';
    const next = cur === 'bn' ? 'en' : 'bn';
    await settings.set('lang', next);
    setLang(next);
    document.getElementById('lang-flag').textContent =
      next === 'bn' ? 'বাং' : 'EN';
    renderRoute();
  });

  // Company picker → jump to companies view
  document.getElementById('company-picker').addEventListener('click', () => {
    location.hash = '#/companies';
  });
}

async function updateCompanyHeader() {
  const co = await companies.getActive();
  document.getElementById('company-name').textContent =
    co?.name || t('co.add');
  const lang = (await settings.get('lang')) || 'bn';
  document.getElementById('lang-flag').textContent = lang === 'bn' ? 'বাং' : 'EN';
}

async function renderRoute() {
  const view = document.getElementById('view');
  const hash = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  const [route, ...rest] = hash.split('/');
  setActiveNav(route);

  try {
    switch (route) {
      case '':
      case 'dashboard':
        await Dashboard.render(view);
        break;
      case 'companies':
        await CompaniesView.render(view);
        break;
      case 'products':
        await Products.render(view);
        break;
      case 'parties':
        await Parties.render(view);
        break;
      case 'sales':
        if (rest[0] === 'new') await Sales.renderNew(view);
        else if (rest[0]) await Sales.renderDetail(view, rest[0]);
        else await Sales.renderList(view);
        break;
      case 'purchases':
        if (rest[0] === 'new') await Purchases.renderNew(view);
        else await Purchases.renderList(view);
        break;
      case 'stock-report':
        await StockReport.render(view);
        break;
      case 'sales-report':
        await SalesReport.render(view);
        break;
      case 'settings':
        await SettingsView.render(view);
        break;
      case 'backup':
        await Backup.render(view);
        break;
      case 'import-legacy':
        await ImportLegacy.render(view);
        break;
      default:
        view.innerHTML = '<div class="empty">Not found.</div>';
    }
  } catch (e) {
    console.error('Route render failed', e);
    view.innerHTML =
      '<div class="empty"><div class="ico">⚠️</div><div>' +
      String(e.message || e) +
      '</div></div>';
  }
  window.scrollTo(0, 0);
}

boot().catch((e) => {
  console.error('Boot failed:', e);
  document.body.innerHTML =
    '<div style="padding:24px;color:#fff;background:#111;font-family:sans-serif">Boot failed: ' +
    String(e.message || e) +
    '</div>';
});
