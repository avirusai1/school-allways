import { describe, expect, it } from 'vitest';

import { mapStudentRow, validateStudentRows } from './student.validator';

describe('student.validator', () => {
  it('reports duplicate admission numbers in the file', () => {
    const mapping = {
      'Student Name': 'firstName',
      'Admission No': 'admissionNo',
    };

    const rows = [
      mapStudentRow(2, { 'Student Name': 'Aarav', 'Admission No': 'ADM-0087' }, mapping),
      mapStudentRow(3, { 'Student Name': 'Riya', 'Admission No': 'ADM-0087' }, mapping),
    ];

    const { errors } = validateStudentRows(rows, { existingAdmissionNos: new Map() });
    expect(errors).toContainEqual(
      expect.objectContaining({
        row: 3,
        column: 'admissionNo',
        value: 'ADM-0087',
        message: 'Admission number ADM-0087 appears more than once in this file.',
      }),
    );
  });

  it('keeps the primary number when a blank second column maps to the same field', () => {
    // The suggester no longer proposes this, but the admin can still choose it
    // in the mapping screen, and losing the phone here costs the parent their
    // account and their invitation.
    const mapping = {
      'Student Name': 'firstName',
      'Admission No': 'admissionNo',
      'Mobile No': 'phone',
      'Alternate Mobile': 'phone',
    };

    const row = mapStudentRow(
      2,
      {
        'Student Name': 'Aarav',
        'Admission No': 'ADM-0087',
        'Mobile No': '9876543210',
        'Alternate Mobile': '',
      },
      mapping,
    );

    expect(row.fields.phone).toBe('919876543210');
  });
});
