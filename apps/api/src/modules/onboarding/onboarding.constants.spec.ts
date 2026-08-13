import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_STEPS,
  SAMPLE_STUDENT_NAMES,
  isOnboardingStep,
  nextStep,
} from './onboarding.constants';

describe('onboarding constants', () => {
  it('has nine wizard steps in order', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'school_profile',
      'academic_session',
      'classes',
      'subjects',
      'import_staff',
      'import_students',
      'invite_staff',
      'invite_parents',
      'first_attendance',
    ]);
  });

  it('advances to the next step', () => {
    expect(nextStep('school_profile')).toBe('academic_session');
    expect(nextStep('first_attendance')).toBeNull();
  });

  it('rejects unknown steps', () => {
    expect(isOnboardingStep('classes')).toBe(true);
    expect(isOnboardingStep('billing')).toBe(false);
  });

  it('uses clearly fictional sample names', () => {
    expect(SAMPLE_STUDENT_NAMES).toHaveLength(20);
    expect(SAMPLE_STUDENT_NAMES.every((n) => n.startsWith('Demo '))).toBe(true);
  });
});

describe('slugify behaviour (inline)', () => {
  it('builds a URL-safe slug from a school name', () => {
    const slug = 'Delhi Public School, Rohini'
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
      .replace(/-$/, '');
    expect(slug).toBe('delhi-public-school-rohini');
  });
});
