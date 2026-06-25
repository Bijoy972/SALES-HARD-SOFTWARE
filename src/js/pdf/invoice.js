// Build a pdfmake docDefinition for a sale and produce a Blob.
// pdfmake is loaded lazily (only when needed) to keep first paint fast.
import { splitTax, summary } from './gst.js';
import { INR, NUM, fmtDate, amountInWords } from '../utils/format.js';

let pdfMakePromise = null;
async function loadPdfMake() {
  if (pdfMakePromise) return pdfMakePromise;
  pdfMakePromise = (async () => {
    const [{ default: pdfMake }, fontsMod] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]);
    // vfs_fonts in this bundled form exports the font dict at the top
    // level — TTF filenames are keys, not nested under .vfs. Old
    // resolvers that looked for fontsMod.default.vfs found nothing and
    // pdfmake silently hung on font lookup. Probe each candidate for a
    // real Roboto-Regular.ttf entry.
    const candidates = [
      pdfMake.vfs,
      fontsMod && fontsMod.default,
      fontsMod,
      fontsMod && fontsMod.pdfMake && fontsMod.pdfMake.vfs,
    ];
    for (const cand of candidates) {
      if (cand && typeof cand === 'object' && cand['Roboto-Regular.ttf']) {
        pdfMake.vfs = cand;
        break;
      }
    }
    // Bundled pdfmake does not auto-set this from vfs — without it the
    // layout engine cannot resolve the Roboto family and getBlob hangs.
    pdfMake.fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf',
      },
    };
    return pdfMake;
  })();
  return pdfMakePromise;
}

export async function buildInvoicePdf(sale, company) {
  const sellerState = company.stateCode || '';
  const buyerState =
    sale.placeOfSupplyStateCode ||
    sale.partySnapshot?.stateCode ||
    sellerState ||
    '';
  const isIntra =
    sellerState && buyerState && sellerState === buyerState;

  const itemRows = sale.items.map((it, idx) => {
    const sp = splitTax(it.taxableValue, it.gstPct, sellerState, buyerState);
    const cells = [
      { text: String(idx + 1), alignment: 'center' },
      { text: it.name || '' },
      { text: it.hsn || '', alignment: 'center' },
      { text: NUM(it.qty, 2) + ' ' + (it.unit || ''), alignment: 'right' },
      { text: NUM(it.rate, 2), alignment: 'right' },
      { text: NUM(it.taxableValue, 2), alignment: 'right' },
    ];
    if (isIntra) {
      cells.push(
        { text: NUM(it.gstPct / 2, 1) + '%\n' + NUM(sp.cgst, 2), alignment: 'right' },
        { text: NUM(it.gstPct / 2, 1) + '%\n' + NUM(sp.sgst, 2), alignment: 'right' },
      );
    } else {
      cells.push({
        text: NUM(it.gstPct, 1) + '%\n' + NUM(sp.igst, 2),
        alignment: 'right',
      });
    }
    cells.push({ text: NUM(it.amount, 2), alignment: 'right', bold: true });
    return cells;
  });

  const headerCells = [
    { text: '#', style: 'th', alignment: 'center' },
    { text: 'Item', style: 'th' },
    { text: 'HSN', style: 'th', alignment: 'center' },
    { text: 'Qty', style: 'th', alignment: 'right' },
    { text: 'Rate', style: 'th', alignment: 'right' },
    { text: 'Taxable', style: 'th', alignment: 'right' },
  ];
  if (isIntra) {
    headerCells.push(
      { text: 'CGST', style: 'th', alignment: 'right' },
      { text: 'SGST', style: 'th', alignment: 'right' },
    );
  } else {
    headerCells.push({ text: 'IGST', style: 'th', alignment: 'right' });
  }
  headerCells.push({ text: 'Amount', style: 'th', alignment: 'right' });

  const widths = isIntra
    ? [18, '*', 40, 50, 45, 55, 45, 45, 55]
    : [18, '*', 40, 50, 50, 60, 55, 60];

  const tableBody = [headerCells, ...itemRows];

  // Tax summary footer.
  const taxSummary = summary(sale.items, sellerState, buyerState);
  const summaryBody = isIntra
    ? [
        [
          { text: 'GST %', style: 'th' },
          { text: 'Taxable', style: 'th', alignment: 'right' },
          { text: 'CGST', style: 'th', alignment: 'right' },
          { text: 'SGST', style: 'th', alignment: 'right' },
          { text: 'Total Tax', style: 'th', alignment: 'right' },
        ],
        ...taxSummary.map((r) => [
          NUM(r.rate, 1) + '%',
          { text: NUM(r.taxable, 2), alignment: 'right' },
          { text: NUM(r.cgst, 2), alignment: 'right' },
          { text: NUM(r.sgst, 2), alignment: 'right' },
          { text: NUM(r.total, 2), alignment: 'right', bold: true },
        ]),
      ]
    : [
        [
          { text: 'GST %', style: 'th' },
          { text: 'Taxable', style: 'th', alignment: 'right' },
          { text: 'IGST', style: 'th', alignment: 'right' },
          { text: 'Total Tax', style: 'th', alignment: 'right' },
        ],
        ...taxSummary.map((r) => [
          NUM(r.rate, 1) + '%',
          { text: NUM(r.taxable, 2), alignment: 'right' },
          { text: NUM(r.igst, 2), alignment: 'right' },
          { text: NUM(r.total, 2), alignment: 'right', bold: true },
        ]),
      ];

  const headerContent = [];
  if (company.logoDataUrl) {
    headerContent.push({
      image: company.logoDataUrl,
      width: 48,
      height: 48,
      alignment: 'left',
    });
  }
  headerContent.push({
    stack: [
      { text: company.name || 'BIJOY PRODUCTION', style: 'shopName' },
      company.address ? { text: company.address, style: 'shopMeta' } : null,
      {
        text: [
          company.phone ? 'Phone: ' + company.phone : null,
          company.gstin ? '   GSTIN: ' + company.gstin : null,
        ]
          .filter(Boolean)
          .join(''),
        style: 'shopMeta',
      },
    ].filter(Boolean),
    alignment: company.logoDataUrl ? 'center' : 'left',
    margin: company.logoDataUrl ? [12, 0, 0, 0] : [0, 0, 0, 0],
  });

  const docDef = {
    pageSize: 'A4',
    pageMargins: [30, 36, 30, 60],
    info: {
      title: 'Invoice ' + sale.invoiceNo,
      author: company.name || 'BIJOY PRODUCTION',
    },
    content: [
      {
        columns: headerContent,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 535, y2: 4, lineWidth: 0.6, lineColor: '#666' }], margin: [0, 6, 0, 8] },
      {
        text: 'TAX INVOICE',
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Bill To:', style: 'sectionLbl' },
              { text: sale.partyName || 'Cash', style: 'partyName' },
              sale.partySnapshot?.address
                ? { text: sale.partySnapshot.address, style: 'small' }
                : null,
              sale.partySnapshot?.phone
                ? { text: 'Phone: ' + sale.partySnapshot.phone, style: 'small' }
                : null,
              sale.partySnapshot?.gstin
                ? { text: 'GSTIN: ' + sale.partySnapshot.gstin, style: 'small' }
                : null,
              sale.placeOfSupplyStateCode
                ? {
                    text:
                      'Place of Supply (State Code): ' +
                      sale.placeOfSupplyStateCode,
                    style: 'small',
                  }
                : null,
            ].filter(Boolean),
          },
          {
            width: 200,
            stack: [
              {
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      { text: 'Invoice #', style: 'metaLbl' },
                      { text: sale.invoiceNo, style: 'metaVal' },
                    ],
                    [
                      { text: 'Date', style: 'metaLbl' },
                      { text: fmtDate(sale.date), style: 'metaVal' },
                    ],
                    [
                      { text: 'Payment', style: 'metaLbl' },
                      {
                        text:
                          (sale.status || 'unpaid').toUpperCase() +
                          (sale.paid
                            ? ' (₹' + NUM(sale.paid, 2) + ')'
                            : ''),
                        style: 'metaVal',
                      },
                    ],
                  ],
                },
                layout: 'noBorders',
              },
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths,
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? '#222' : null),
          hLineWidth: () => 0.3,
          vLineWidth: () => 0.3,
          hLineColor: () => '#aaa',
          vLineColor: () => '#aaa',
        },
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            margin: [0, 8, 0, 0],
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Sub-total', alignment: 'right' },
                  { text: INR(sale.subtotal), alignment: 'right' },
                ],
                [
                  { text: 'Tax', alignment: 'right' },
                  { text: INR(sale.taxTotal), alignment: 'right' },
                ],
                sale.discount
                  ? [
                      { text: 'Extra Discount', alignment: 'right' },
                      { text: '-' + INR(sale.discount), alignment: 'right' },
                    ]
                  : null,
                sale.roundOff
                  ? [
                      { text: 'Round-off', alignment: 'right' },
                      { text: INR(sale.roundOff), alignment: 'right' },
                    ]
                  : null,
                [
                  { text: 'GRAND TOTAL', alignment: 'right', bold: true },
                  { text: INR(sale.total), alignment: 'right', bold: true },
                ],
              ].filter(Boolean),
            },
            layout: 'lightHorizontalLines',
          },
        ],
      },
      {
        text: 'Amount in words: ' + amountInWords(sale.total),
        style: 'small',
        margin: [0, 10, 0, 0],
      },
      { text: 'Tax breakup', style: 'sectionLbl', margin: [0, 14, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: isIntra ? ['auto', '*', '*', '*', '*'] : ['auto', '*', '*', '*'],
          body: summaryBody,
        },
        layout: 'lightHorizontalLines',
      },
      sale.notes
        ? {
            text: 'Notes: ' + sale.notes,
            style: 'small',
            margin: [0, 12, 0, 0],
          }
        : null,
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 180,
            stack: [
              {
                text: '\n\n_____________________',
                alignment: 'center',
                style: 'small',
              },
              {
                text: 'For ' + (company.name || 'BIJOY PRODUCTION'),
                alignment: 'center',
                style: 'small',
              },
              {
                text: 'Authorised Signatory',
                alignment: 'center',
                style: 'small',
              },
            ],
          },
        ],
        margin: [0, 24, 0, 0],
      },
    ].filter(Boolean),
    footer: (cur, total) => ({
      text: 'Page ' + cur + ' of ' + total,
      alignment: 'center',
      style: 'small',
      margin: [0, 10, 0, 0],
    }),
    styles: {
      title: { fontSize: 14, bold: true, characterSpacing: 1.5 },
      shopName: { fontSize: 18, bold: true },
      shopMeta: { fontSize: 9, color: '#444' },
      sectionLbl: { fontSize: 10, bold: true, color: '#444' },
      partyName: { fontSize: 12, bold: true, margin: [0, 2, 0, 2] },
      small: { fontSize: 9, color: '#555' },
      th: { fillColor: '#222', color: '#fff', bold: true, fontSize: 9 },
      metaLbl: { fontSize: 9, color: '#666' },
      metaVal: { fontSize: 9, bold: true, alignment: 'right' },
    },
    defaultStyle: {
      fontSize: 10,
    },
  };

  const pdfMake = await loadPdfMake();
  return new Promise((resolve, reject) => {
    let done = false;
    const watchdog = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('PDF generation timed out'));
    }, 20000);
    try {
      const doc = pdfMake.createPdf(docDef);
      doc.getBlob((blob) => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        resolve(blob);
      });
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      reject(e);
    }
  });
}
