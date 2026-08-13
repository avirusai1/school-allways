import type { ImportVendor } from '../import.types';
import { suggestColumnMapping } from '../import.util';

const ENTAB_SIGNATURE = ['ent_stu_name', 'ent_adm_no', 'ent_class', 'ent_section'];
const TEACHMINT_SIGNATURE = ['tm_student_name', 'tm_admission_number', 'tm_class', 'tm_section'];
const MCB_SIGNATURE = ['mcb_student_name', 'mcb_adm_no', 'mcb_class', 'mcb_div'];

export function normalizeEntabHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const key = h.trim().toLowerCase();
    const map: Record<string, string> = {
      ent_stu_name: 'Student Name',
      ent_adm_no: 'Admission No',
      ent_class: 'Class',
      ent_section: 'Section',
      ent_dob: 'DOB',
      ent_mobile: 'Mobile',
    };
    return map[key] ?? h;
  });
}

export function normalizeTeachmintHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const key = h.trim().toLowerCase();
    const map: Record<string, string> = {
      tm_student_name: 'Student Name',
      tm_admission_number: 'Admission No',
      tm_class: 'Class',
      tm_section: 'Section',
      tm_dob: 'DOB',
      tm_parent_mobile: 'Parent Mobile',
    };
    return map[key] ?? h;
  });
}

export function normalizeMyclassboardHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const key = h.trim().toLowerCase();
    const map: Record<string, string> = {
      mcb_student_name: 'Student Name',
      mcb_adm_no: 'Admission No',
      mcb_class: 'Class',
      mcb_div: 'Section',
      mcb_dob: 'DOB',
      mcb_father_mobile: 'Father Mobile',
    };
    return map[key] ?? h;
  });
}

export function mapHeadersForVendor(headers: string[], vendor: ImportVendor): string[] {
  switch (vendor) {
    case 'entab':
      return normalizeEntabHeaders(headers);
    case 'teachmint':
      return normalizeTeachmintHeaders(headers);
    case 'myclassboard':
      return normalizeMyclassboardHeaders(headers);
    default:
      return headers;
  }
}

export function vendorConfidence(headers: string[], vendor: ImportVendor): number {
  const lower = headers.map((h) => h.toLowerCase());
  const sig =
    vendor === 'entab' ? ENTAB_SIGNATURE
    : vendor === 'teachmint' ? TEACHMINT_SIGNATURE
    : vendor === 'myclassboard' ? MCB_SIGNATURE
    : [];
  if (sig.length === 0) return 0.5;
  const hits = sig.filter((s) => lower.some((h) => h.includes(s))).length;
  return hits / sig.length;
}

export function suggestMappingForVendor(
  headers: string[],
  vendor: ImportVendor,
): Record<string, { field: string; confidence: number }> {
  const normalised = mapHeadersForVendor(headers, vendor);
  const mapping = suggestColumnMapping(normalised);
  const out: Record<string, { field: string; confidence: number }> = {};
  headers.forEach((orig, i) => {
    const mapped = mapping[normalised[i]];
    if (mapped) out[orig] = mapped;
  });
  return out;
}
