import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectVendor } from '../import.util';
import { suggestMappingForVendor, vendorConfidence } from './generic.mapper';

const fixturesDir = join(__dirname, '..', '__fixtures__');

describe('vendor mappers', () => {
  it('detects entab from fixture headers', () => {
    const headers = JSON.parse(readFileSync(join(fixturesDir, 'entab.headers.json'), 'utf8')) as string[];
    expect(detectVendor(headers)).toBe('entab');
    expect(vendorConfidence(headers, 'entab')).toBeGreaterThan(0.8);
    const mapping = suggestMappingForVendor(headers, 'entab');
    expect(mapping['ent_stu_name']?.field).toBe('firstName');
  });

  it('detects teachmint from fixture headers', () => {
    const headers = JSON.parse(readFileSync(join(fixturesDir, 'teachmint.headers.json'), 'utf8')) as string[];
    expect(detectVendor(headers)).toBe('teachmint');
  });

  it('detects myclassboard from fixture headers', () => {
    const headers = JSON.parse(readFileSync(join(fixturesDir, 'myclassboard.headers.json'), 'utf8')) as string[];
    expect(detectVendor(headers)).toBe('myclassboard');
  });
});
