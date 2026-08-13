import { describe, expect, it } from 'vitest';

import { normalizePhone, parseIndianDate, suggestColumnMapping } from './import.util';

describe('import.util', () => {
  it('parses DD/MM/YYYY dates', () => {
    expect(parseIndianDate('31/12/2015')).toBe('2015-12-31');
  });

  it('parses DD-MM-YY dates', () => {
    expect(parseIndianDate('15-08-15')).toBe('2015-08-15');
  });

  it('parses Excel serial dates', () => {
    const parsed = parseIndianDate(42369);
    expect(parsed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed).not.toBeNull();
  });

  it('rejects invalid dates like 31/02/2015', () => {
    expect(parseIndianDate('31/02/2015')).toBeNull();
  });

  it('normalises Indian phone numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('09876543210')).toBe('919876543210');
  });

  it('fuzzy-maps common student headers', () => {
    const mapping = suggestColumnMapping(['Student Name', 'Admission No', 'DOB']);
    expect(mapping['Student Name']?.field).toBe('firstName');
    expect(mapping['Admission No']?.field).toBe('admissionNo');
    expect(mapping['DOB']?.field).toBe('dateOfBirth');
  });

  it('suggests only one column per field when several look alike', () => {
    // A real export carries both, and both match the phone aliases. Mapping
    // both means the mapper's second pass overwrites the first — with null
    // when the alternate is blank, leaving the parent uncontactable.
    const mapping = suggestColumnMapping(['Admission No', 'Mobile No', 'Alternate Mobile']);
    const toPhone = Object.entries(mapping).filter(([, m]) => m.field === 'phone');
    expect(toPhone).toHaveLength(1);
    expect(toPhone[0]![0]).toBe('Mobile No');
  });

  it('does not offer the mother as the student when both names are present', () => {
    const mapping = suggestColumnMapping(['Student Name', 'Mother Name']);
    expect(mapping['Student Name']?.field).toBe('firstName');
    expect(mapping['Mother Name']).toBeUndefined();
  });
});
