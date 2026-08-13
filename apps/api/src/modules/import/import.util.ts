import type { ImportEntity } from './import.types';
import { parseIndianDate } from './normalizers/date.normalizer';
import { normalizePhone } from './normalizers/phone.normalizer';

export { normalizePhone, parseIndianDate };

const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ['student name', 'name', 'first name', 'student_name', 'name of student', 'नाम', 'stu name'],
  lastName: ['surname', 'last name', 'family name'],
  admissionNo: ['admission no', 'admission number', 'adm no', 'admission_no', 'adm. no'],
  employeeCode: ['employee code', 'emp code', 'staff code', 'employee id', 'emp id'],
  dateOfBirth: ['dob', 'date of birth', 'birth date', 'date_of_birth', 'birthdate'],
  phone: ['mobile', 'phone', 'parent mobile', 'contact number', 'father mobile', 'mother mobile'],
  guardianName: ['father name', 'parent name', 'guardian name', 'father\'s name'],
  className: ['class', 'grade', 'standard', 'class name'],
  sectionName: ['section', 'division', 'sec'],
  rollNo: ['roll no', 'roll number', 'roll_no'],
  gender: ['sex', 'gender'],
  designation: ['designation', 'post', 'title'],
  department: ['department', 'dept'],
  workEmail: ['work email', 'official email', 'email'],
  joinedOn: ['joining date', 'date of joining', 'joined on'],
};

export function suggestColumnMapping(
  headers: string[],
): Record<string, { field: string; confidence: number }> {
  const result: Record<string, { field: string; confidence: number }> = {};

  for (const header of headers) {
    const normalised = header.trim().toLowerCase().replace(/[_]+/g, ' ');
    let best: { field: string; confidence: number } | null = null;

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalised)) {
        best = { field, confidence: 0.95 };
        break;
      }
      if (aliases.some((a) => normalised.includes(a) || a.includes(normalised))) {
        if (!best || best.confidence < 0.7) {
          best = { field, confidence: 0.7 };
        }
      }
    }

    if (best) result[header] = best;
  }

  return dropDuplicateTargets(result);
}

/**
 * Keeps one column per target field. A real export routinely carries several
 * columns that look like the same thing — "Mobile No" and "Alternate Mobile"
 * both match the phone aliases, "Mother Name" partially matches the student
 * name ones — and suggesting both is worse than suggesting neither: the row
 * mapper applies the mapping in header order, so the second column silently
 * overwrites the first, and overwrites it with null when that cell is blank.
 * A parent whose alternate number is empty would end up with no phone at all,
 * and therefore no account and no invitation.
 *
 * The highest-confidence column wins, ties going to the leftmost, which in
 * every export we have seen is the primary. The loser is left unmapped so the
 * admin sees it as a decision to make rather than a default to trust.
 */
function dropDuplicateTargets(
  suggested: Record<string, { field: string; confidence: number }>,
): Record<string, { field: string; confidence: number }> {
  const winnerByField = new Map<string, string>();

  for (const [header, match] of Object.entries(suggested)) {
    const held = winnerByField.get(match.field);
    if (!held || match.confidence > suggested[held]!.confidence) {
      winnerByField.set(match.field, header);
    }
  }

  const kept = new Set(winnerByField.values());
  return Object.fromEntries(Object.entries(suggested).filter(([header]) => kept.has(header)));
}

export function detectVendor(headers: string[]): string {
  const joined = headers.join('|').toLowerCase();
  if (joined.includes('entab') || joined.includes('ent_stu')) return 'entab';
  if (joined.includes('teachmint') || joined.includes('tm_student')) return 'teachmint';
  if (joined.includes('myclassboard') || joined.includes('mcb_')) return 'myclassboard';
  return 'generic';
}

export function studentImportFields(): string[] {
  return [
    'firstName', 'lastName', 'admissionNo', 'dateOfBirth', 'gender',
    'className', 'sectionName', 'rollNo', 'phone', 'guardianName',
  ];
}

export function staffImportFields(): string[] {
  return [
    'firstName', 'lastName', 'employeeCode', 'dateOfBirth', 'gender',
    'designation', 'department', 'workEmail', 'phone', 'joinedOn',
  ];
}

export function fieldsForEntity(entity: ImportEntity): string[] {
  return entity === 'staff' ? staffImportFields() : studentImportFields();
}
