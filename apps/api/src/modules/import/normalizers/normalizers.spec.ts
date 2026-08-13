import { describe, expect, it } from 'vitest';

import { parseClassLevel } from './class.normalizer';
import { invalidDateMessage, parseIndianDate } from './date.normalizer';
import { parseName } from './name.normalizer';
import { normalizePhone } from './phone.normalizer';

describe('date.normalizer', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseIndianDate('31/12/2015')).toBe('2015-12-31');
  });

  it('parses DD-MM-YY', () => {
    expect(parseIndianDate('31-12-15')).toBe('2015-12-31');
  });

  it('parses Excel serial 42369', () => {
    expect(parseIndianDate(42369)).toBe('2015-12-31');
  });

  it('parses DD.MM.YYYY', () => {
    expect(parseIndianDate('31.12.2015')).toBe('2015-12-31');
  });

  it('parses ISO YYYY-MM-DD', () => {
    expect(parseIndianDate('2015-12-31')).toBe('2015-12-31');
  });

  it('parses DD Mon YYYY', () => {
    expect(parseIndianDate('31 Dec 2015')).toBe('2015-12-31');
  });

  it('rejects 31/02/2015 with clerk-readable message', () => {
    expect(parseIndianDate('31/02/2015')).toBeNull();
    expect(invalidDateMessage('31/02/2015')).toBe(
      '31 February 2015 is not a real date. Use DD/MM/YYYY.',
    );
  });
});

describe('phone.normalizer', () => {
  it('normalises to 91XXXXXXXXXX', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('09876543210')).toBe('919876543210');
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });
});

describe('name.normalizer', () => {
  it('parses SHARMA,AARAV', () => {
    expect(parseName('SHARMA,AARAV')).toEqual({
      firstName: 'Aarav',
      lastName: 'Sharma',
    });
  });

  it('parses AARAV S/O RAJESH', () => {
    expect(parseName('AARAV S/O RAJESH')).toEqual({
      firstName: 'Aarav',
      lastName: 'Rajesh',
    });
  });
});

describe('class.normalizer', () => {
  it.each([
    ['V', 5],
    ['5', 5],
    ['5th', 5],
    ['Class V', 5],
    ['FIFTH', 5],
  ])('parses %s as level %i', (input, level) => {
    expect(parseClassLevel(input)).toBe(level);
  });
});
