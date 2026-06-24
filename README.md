# BIJOY PRODUCTION

**Offline Android billing & inventory app.** Multi-company, GST-aware, PDF invoices,
backup/restore. Built with Capacitor + vanilla JS + Dexie (IndexedDB) + pdfmake.

---

## English — Install on your phone

1. Open the latest [GitHub Release](https://github.com/Bijoy972/SALES-HARD-SOFTWARE/releases/latest).
2. Download `bijoy-production.apk`.
3. On your phone, open the downloaded file. Android may warn "Install from unknown
   source" — tap **Settings → Allow this source → Install**.
4. Open **BIJOY PRODUCTION** from your launcher. Fill your shop name, address, phone,
   GSTIN in **Settings**. Done — start billing.

Everything works offline. To back up, use **Backup & Restore → Export** and share
the `.json` to WhatsApp or Drive. To restore on a new phone, install the APK and
**Import** the same file.

---

## বাংলা — ফোনে ইনস্টল করার নিয়ম

1. সর্বশেষ [GitHub Release](https://github.com/Bijoy972/SALES-HARD-SOFTWARE/releases/latest)
   পেজ খুলুন।
2. `bijoy-production.apk` ফাইলটি ডাউনলোড করুন।
3. ফোনে ডাউনলোড হওয়া ফাইলটি খুলুন। Android যদি "Unknown source" warning দেয়,
   **Settings → Allow this source → Install** চাপুন।
4. লঞ্চার থেকে **BIJOY PRODUCTION** খুলুন। **Settings** এ গিয়ে দোকানের নাম, ঠিকানা,
   ফোন, GSTIN দিন। ব্যাস — billing শুরু করুন।

সম্পূর্ণ offline চলে। Backup নিতে **Backup & Restore → Export** চাপুন এবং `.json`
ফাইল WhatsApp / Drive এ পাঠিয়ে রাখুন। নতুন ফোনে APK install করে একই ফাইল
**Import** করলেই পুরো data ফেরত আসবে।

---

## Features

- **Multi-company** — unlimited shops, each with isolated products / parties /
  purchases / sales / invoices.
- **Product master** — id, name, unit, rate, stock, HSN; low-stock highlight; search.
- **Purchase entry** — multi-item, supplier, date; auto stock-in.
- **Sale / billing** — multi-item, per-line qty/rate, line discount, GST%; auto
  stock-out; payment status (paid/unpaid/partial).
- **PDF invoice** — professional template, shop header with GSTIN, itemized table,
  CGST+SGST (intra-state) or IGST (inter-state) split based on GSTIN state codes,
  amount in words, share via Android share sheet.
- **Stock report** — per-company, with total valuation.
- **Sales report** — date-range filter, by-product breakdown.
- **Customer & Supplier master** — reusable parties with phone / GSTIN / address;
  simple per-party ledger.
- **Dashboard** — today's sales, this-month sales, total stock value, low-stock
  alerts, total receivables.
- **Invoice numbering** — per-company, financial-year aware, gap-free
  (e.g. `BJ/26-27/0001`), configurable prefix.
- **Backup & Restore** — single `.json` of ALL companies; share to WhatsApp/Drive;
  per-company export also available.
- **Legacy importer** — read the existing C++ CLI's `products.txt` /
  `purchases.txt` / `sales.txt` and migrate into the new DB.
- **Settings** — company profile + logo, invoice prefix, theme, optional 4-digit
  app-lock PIN, Bengali / English UI toggle.
- **Offline-first** — everything stored in IndexedDB on the device. No server, no
  account, no internet required.

---

## For developers / curious

Tech stack: Capacitor 6, vanilla ES modules, Dexie 4 (IndexedDB), pdfmake 0.2.

```
src/                vanilla web app source (Vite root)
www/                build output, served inside the WebView
android/            Capacitor-generated Android Studio project
.github/workflows/  build-apk.yml — builds signed release APK on every push to main
scripts/            helpers (e.g. inject signing config)
```

### Build locally (Linux/Mac/Termux with Node 18+)

```
npm ci
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

### CI signing

The GitHub Actions workflow expects 4 repository secrets:

| Secret                    | Description                                       |
|---------------------------|---------------------------------------------------|
| `ANDROID_KEYSTORE_BASE64` | base64 of the release `.jks` keystore             |
| `KEYSTORE_PASSWORD`       | keystore password                                 |
| `KEY_ALIAS`               | key alias                                         |
| `KEY_PASSWORD`            | key password                                      |

The workflow decodes the keystore, injects signing config into Gradle, builds a
signed release APK, bumps `versionCode`, and uploads the APK to a GitHub Release.
