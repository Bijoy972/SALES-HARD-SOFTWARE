// Display helpers: money, numbers, dates, number-to-words (Indian English).
export const INR = (n) =>
  '₹' +
  (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const NUM = (n, d = 2) =>
  (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Indian number-to-words (e.g. "One Thousand Two Hundred Fifty Rupees Only").
const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];
function twoDigits(n) {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (h) s += ones[h] + ' Hundred';
  if (r) s += (s ? ' ' : '') + twoDigits(r);
  return s;
}
export function numberToIndianWords(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const rest = num;
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

export function amountInWords(total) {
  const n = Number(total) || 0;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let s = numberToIndianWords(rupees) + ' Rupees';
  if (paise) s += ' and ' + numberToIndianWords(paise) + ' Paise';
  return s + ' Only';
}
