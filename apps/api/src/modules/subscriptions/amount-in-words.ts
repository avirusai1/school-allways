const ONES = [
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
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const rem = n % 10;
    return rem ? `${TENS[Math.floor(n / 10)]} ${ONES[rem]}` : TENS[Math.floor(n / 10)]!;
  }
  const rem = n % 100;
  return rem ? `${ONES[Math.floor(n / 100)]} Hundred ${chunkToWords(rem)}` : `${ONES[Math.floor(n / 100)]} Hundred`;
}

function rupeesToWords(rupees: number): string {
  if (rupees === 0) return 'Zero';
  const crore = Math.floor(rupees / 1_00_00_000);
  const lakh = Math.floor((rupees % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((rupees % 1_00_000) / 1_000);
  const rest = rupees % 1_000;
  const parts: string[] = [];
  if (crore) parts.push(`${chunkToWords(crore)} Crore`);
  if (lakh) parts.push(`${chunkToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${chunkToWords(thousand)} Thousand`);
  if (rest) parts.push(chunkToWords(rest));
  return parts.join(' ');
}

/** Integer paise → "Eight Thousand Seven Hundred Sixty Rupees Only". */
export function amountInWordsPaise(totalPaise: number): string {
  const rupees = Math.floor(Math.abs(totalPaise) / 100);
  const paise = Math.abs(totalPaise) % 100;
  const prefix = totalPaise < 0 ? 'Minus ' : '';
  if (paise === 0) return `${prefix}${rupeesToWords(rupees)} Rupees Only`;
  return `${prefix}${rupeesToWords(rupees)} Rupees and ${chunkToWords(paise)} Paise Only`;
}
