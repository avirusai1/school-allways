import type { ColumnMapping, MappedImportRow, ValidationErrorItem, ValidationWarningItem } from '../import.types';
import { parseClassLevel } from '../normalizers/class.normalizer';
import { invalidDateMessage, parseIndianDate } from '../normalizers/date.normalizer';
import { parseName } from '../normalizers/name.normalizer';
import { normalizePhone } from '../normalizers/phone.normalizer';

export interface StudentValidationContext {
  existingAdmissionNos: Map<string, { name: string }>;
}

export function mapStudentRow(
  rowNumber: number,
  values: Record<string, string>,
  mapping: ColumnMapping,
): MappedImportRow {
  const fields: Record<string, string | null> = {};

  for (const [header, target] of Object.entries(mapping)) {
    if (target === 'skip') continue;
    // First non-empty column wins when two are mapped to one field. The admin
    // can still do this by hand after the suggester has de-duplicated, and
    // last-write-wins would let a blank "Alternate Mobile" erase the primary
    // number the parent's invitation is addressed to.
    if (fields[target] != null) continue;
    const raw = values[header] ?? '';
    fields[target] = raw.trim() || null;
  }

  if (fields.firstName) {
    const parsed = parseName(fields.firstName);
    if (parsed) {
      fields.firstName = parsed.firstName;
      if (parsed.middleName) fields.middleName = parsed.middleName;
      if (parsed.lastName) fields.lastName = parsed.lastName;
    }
  }

  if (fields.dateOfBirth) {
    const raw = fields.dateOfBirth;
    const parsed = parseIndianDate(raw);
    if (!parsed) fields._rawDob = raw;
    fields.dateOfBirth = parsed;
  }

  if (fields.phone) {
    const raw = fields.phone;
    const parsed = normalizePhone(raw);
    if (!parsed) fields._rawPhone = raw;
    fields.phone = parsed;
  }

  if (fields.className) {
    const level = parseClassLevel(fields.className);
    if (level !== null) fields.classLevel = String(level);
  }

  return { rowNumber, fields };
}

export function validateStudentRow(
  mapped: MappedImportRow,
  ctx: StudentValidationContext,
  fileAdmissionNos: Map<string, number>,
): { errors: ValidationErrorItem[]; warnings: ValidationWarningItem[] } {
  const errors: ValidationErrorItem[] = [];
  const warnings: ValidationWarningItem[] = [];
  const { rowNumber, fields } = mapped;
  const displayRow = rowNumber;

  if (!fields.firstName?.trim()) {
    errors.push({
      row: displayRow,
      column: 'firstName',
      value: fields.firstName ?? '',
      message: 'Student name is required.',
    });
  }

  if (!fields.admissionNo?.trim()) {
    errors.push({
      row: displayRow,
      column: 'admissionNo',
      value: fields.admissionNo ?? '',
      message: 'Admission number is required.',
    });
  } else {
    const adm = fields.admissionNo;
    const dupRow = fileAdmissionNos.get(adm);
    if (dupRow !== undefined && dupRow !== displayRow) {
      errors.push({
        row: displayRow,
        column: 'admissionNo',
        value: adm,
        message: `Admission number ${adm} appears more than once in this file.`,
      });
    }

    const existing = ctx.existingAdmissionNos.get(adm);
    if (existing) {
      errors.push({
        row: displayRow,
        column: 'admissionNo',
        value: adm,
        message: `Admission number ${adm} is already used by ${existing.name}.`,
      });
    }
  }

  if (fields._rawDob) {
    errors.push({
      row: displayRow,
      column: 'dateOfBirth',
      value: fields._rawDob,
      message: invalidDateMessage(fields._rawDob),
    });
  }

  if (fields._rawPhone) {
    errors.push({
      row: displayRow,
      column: 'phone',
      value: fields._rawPhone,
      message: `${fields._rawPhone} is not a valid Indian mobile number.`,
    });
  }

  if (!fields.sectionName?.trim()) {
    warnings.push({ row: displayRow, message: 'No section given — will be unassigned.' });
  }

  return { errors, warnings };
}

export function validateStudentRows(
  rows: MappedImportRow[],
  ctx: StudentValidationContext,
): { errors: ValidationErrorItem[]; warnings: ValidationWarningItem[] } {
  const fileAdmissionNos = new Map<string, number>();
  for (const row of rows) {
    const adm = row.fields.admissionNo;
    if (adm && !fileAdmissionNos.has(adm)) fileAdmissionNos.set(adm, row.rowNumber);
  }

  const errors: ValidationErrorItem[] = [];
  const warnings: ValidationWarningItem[] = [];

  for (const row of rows) {
    const result = validateStudentRow(row, ctx, fileAdmissionNos);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { errors, warnings };
}
