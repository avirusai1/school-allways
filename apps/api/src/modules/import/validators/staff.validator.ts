import type { ColumnMapping, MappedImportRow, ValidationErrorItem, ValidationWarningItem } from '../import.types';
import { invalidDateMessage, parseIndianDate } from '../normalizers/date.normalizer';
import { parseName } from '../normalizers/name.normalizer';
import { normalizePhone } from '../normalizers/phone.normalizer';

export interface StaffValidationContext {
  existingEmployeeCodes: Map<string, { name: string }>;
}

export function mapStaffRow(
  rowNumber: number,
  values: Record<string, string>,
  mapping: ColumnMapping,
): MappedImportRow {
  const fields: Record<string, string | null> = {};

  for (const [header, target] of Object.entries(mapping)) {
    if (target === 'skip') continue;
    // Same rule as the student mapper: first non-empty column wins, so a blank
    // second column mapped to the same field cannot erase the first.
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

  if (fields.joinedOn) {
    fields.joinedOn = parseIndianDate(fields.joinedOn);
  }

  return { rowNumber, fields };
}

export function validateStaffRow(
  mapped: MappedImportRow,
  ctx: StaffValidationContext,
  fileCodes: Map<string, number>,
): { errors: ValidationErrorItem[]; warnings: ValidationWarningItem[] } {
  const errors: ValidationErrorItem[] = [];
  const warnings: ValidationWarningItem[] = [];
  const { rowNumber, fields } = mapped;

  if (!fields.firstName?.trim()) {
    errors.push({
      row: rowNumber,
      column: 'firstName',
      value: fields.firstName ?? '',
      message: 'Staff name is required.',
    });
  }

  if (!fields.employeeCode?.trim()) {
    errors.push({
      row: rowNumber,
      column: 'employeeCode',
      value: fields.employeeCode ?? '',
      message: 'Employee code is required.',
    });
  } else {
    const code = fields.employeeCode;
    const dupRow = fileCodes.get(code);
    if (dupRow !== undefined && dupRow !== rowNumber) {
      errors.push({
        row: rowNumber,
        column: 'employeeCode',
        value: code,
        message: `Employee code ${code} appears more than once in this file.`,
      });
    }

    const existing = ctx.existingEmployeeCodes.get(code);
    if (existing) {
      errors.push({
        row: rowNumber,
        column: 'employeeCode',
        value: code,
        message: `Employee code ${code} is already used by ${existing.name}.`,
      });
    }
  }

  if (fields._rawDob) {
    errors.push({
      row: rowNumber,
      column: 'dateOfBirth',
      value: fields._rawDob,
      message: invalidDateMessage(fields._rawDob),
    });
  }

  if (fields._rawPhone) {
    errors.push({
      row: rowNumber,
      column: 'phone',
      value: fields._rawPhone,
      message: `${fields._rawPhone} is not a valid Indian mobile number.`,
    });
  }

  return { errors, warnings };
}

export function validateStaffRows(
  rows: MappedImportRow[],
  ctx: StaffValidationContext,
): { errors: ValidationErrorItem[]; warnings: ValidationWarningItem[] } {
  const fileCodes = new Map<string, number>();
  for (const row of rows) {
    const code = row.fields.employeeCode;
    if (code && !fileCodes.has(code)) fileCodes.set(code, row.rowNumber);
  }

  const errors: ValidationErrorItem[] = [];
  const warnings: ValidationWarningItem[] = [];

  for (const row of rows) {
    const result = validateStaffRow(row, ctx, fileCodes);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { errors, warnings };
}
