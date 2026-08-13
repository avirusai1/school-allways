export const ONBOARDING_STEPS = [
  'school_profile',
  'academic_session',
  'classes',
  'subjects',
  'import_staff',
  'import_students',
  'invite_staff',
  'invite_parents',
  'first_attendance',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface StepProgress {
  status: StepStatus;
  completedAt?: string;
  itemCount?: number;
  startedAt?: string;
}

/** Minutes remaining estimate per unfinished step — rough UX only. */
export const STEP_ESTIMATE_MINUTES: Record<OnboardingStep, number> = {
  school_profile: 2,
  academic_session: 1,
  classes: 2,
  subjects: 1,
  import_staff: 8,
  import_students: 12,
  invite_staff: 2,
  invite_parents: 3,
  first_attendance: 3,
};

export function nextStep(current: OnboardingStep): OnboardingStep | null {
  const i = ONBOARDING_STEPS.indexOf(current);
  if (i < 0 || i >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[i + 1]!;
}

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Clearly fictional — never realistic names that could be mistaken for real kids. */
export const SAMPLE_STUDENT_NAMES = [
  'Demo Alpha',
  'Demo Bravo',
  'Demo Charlie',
  'Demo Delta',
  'Demo Echo',
  'Demo Foxtrot',
  'Demo Golf',
  'Demo Hotel',
  'Demo India',
  'Demo Juliet',
  'Demo Kilo',
  'Demo Lima',
  'Demo Mike',
  'Demo November',
  'Demo Oscar',
  'Demo Papa',
  'Demo Quebec',
  'Demo Romeo',
  'Demo Sierra',
  'Demo Tango',
] as const;
