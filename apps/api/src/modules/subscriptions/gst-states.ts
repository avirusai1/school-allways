/**
 * GST place-of-supply: Indian state/UT name or code → two-digit GST state code.
 * Invoice generation fails if the school's branch state cannot be mapped.
 */

const BY_CODE: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

const ALIASES: Record<string, string> = {
  'nct of delhi': '07',
  'nct delhi': '07',
  'new delhi': '07',
  orissa: '21',
  'tamilnadu': '33',
  'pondicherry': '34',
  'andaman and nicobar': '35',
  'dadra and nagar haveli': '26',
  'daman and diu': '26',
  'jammu & kashmir': '01',
};

const NAME_TO_CODE = new Map<string, string>();
for (const [code, name] of Object.entries(BY_CODE)) {
  NAME_TO_CODE.set(name.toLowerCase(), code);
}
for (const [alias, code] of Object.entries(ALIASES)) {
  NAME_TO_CODE.set(alias, code);
}

export function gstStateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{2}$/.test(trimmed) && BY_CODE[trimmed]) return trimmed;
  return NAME_TO_CODE.get(trimmed.toLowerCase()) ?? null;
}

export function gstStateName(code: string): string {
  return BY_CODE[code] ?? code;
}
