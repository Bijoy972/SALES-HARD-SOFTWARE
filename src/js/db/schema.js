// Dexie schema for BIJOY PRODUCTION.
// Single DB; every domain row carries `companyId` so multi-company isolation
// is enforced at query-time.
import Dexie from 'dexie';

export const db = new Dexie('bijoy_production_v1');

db.version(1).stores({
  // App-global settings (theme, language, PIN hash, active company id, etc.).
  appSettings: 'key',
  // Companies / shops.
  companies:
    '++id, slug, name, gstin, stateCode, createdAt',
  // Per-company products.
  products:
    '++id, companyId, [companyId+name], [companyId+code], code, name, hsn',
  // Customers + suppliers (party kind: customer|supplier|both).
  parties:
    '++id, companyId, [companyId+name], [companyId+phone], kind, name, phone, gstin, stateCode',
  // Purchase headers + line items (denormalized).
  purchases:
    '++id, companyId, [companyId+date], partyId, date, total, createdAt',
  // Sale headers + line items.
  sales:
    '++id, companyId, [companyId+date], [companyId+invoiceNo], partyId, date, invoiceNo, total, paid, status, createdAt',
  // Payments received against sales (for partial / unpaid tracking).
  payments:
    '++id, companyId, saleId, [companyId+saleId], date, amount, method',
  // Per-company FY-aware invoice counter:  key = `${companyId}:${fyCode}`.
  invoiceCounters: 'key',
});

// Open the DB on first import so callers don't need to await.
db.open().catch((e) => {
  console.error('Failed to open IndexedDB:', e);
});

export default db;
