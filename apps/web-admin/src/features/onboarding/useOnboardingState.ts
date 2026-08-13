import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '../../lib/api';

export const ONBOARDING_STEP_KEYS = [
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

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type OnboardingStepRow = {
  key: OnboardingStepKey;
  status: OnboardingStepStatus;
  completedAt: string | null;
  itemCount: number | null;
};

export type OnboardingProfile = {
  name: string;
  board: string;
  affiliationNo: string | null;
  udiseCode: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
};

export type OnboardingState = {
  currentStep: OnboardingStepKey;
  steps: OnboardingStepRow[];
  progressPercent: number;
  hasSampleData: boolean;
  activatedAt: string | null;
  onboardingCompletedAt: string | null;
  canSkipCurrent: boolean;
  estimatedMinutesRemaining: number;
  profile: OnboardingProfile;
};

export const STEP_META: Record<
  OnboardingStepKey,
  { label: string; title: string; body: string }
> = {
  school_profile: {
    label: 'School profile',
    title: 'Tell us about your school',
    body: 'Name, board and address — parents see this on receipts and the app.',
  },
  academic_session: {
    label: 'Academic session',
    title: 'Set the academic year',
    body: 'Dates and term structure. You can change holidays later.',
  },
  classes: {
    label: 'Classes',
    title: 'Add your classes',
    body: 'Pick a template or add them one by one. You can change this later.',
  },
  subjects: {
    label: 'Subjects',
    title: 'Add subjects',
    body: 'Apply board-standard subjects, then map them to classes.',
  },
  import_staff: {
    label: 'Import staff',
    title: 'Import your staff',
    body: 'Upload the list from your previous system. You can undo an import for 24 hours.',
  },
  import_students: {
    label: 'Import students',
    title: 'Import your students',
    body: 'Good rows go through even if a few need fixing — you get the bad rows back as a small file.',
  },
  invite_staff: {
    label: 'Invite staff',
    title: 'Invite your staff',
    body: 'They get a link to set up their account. You can send this later from Staff.',
  },
  invite_parents: {
    label: 'Invite parents',
    title: 'Invite parents',
    body: 'Send to everyone, or one section at a time if you would rather start with a single class.',
  },
  first_attendance: {
    label: 'First attendance',
    title: 'Take your first attendance',
    body: 'This is the moment your school goes live. Parents of absent students will be notified automatically.',
  },
};

export type InviteCounts = { eligible: number; invited: number; joined: number };
export type InviteSectionCounts = InviteCounts & { sectionId: string; label: string };
/** What the delivery ledger says actually happened, excluding in-app rows. */
export type InviteDelivery = { pending: number; sent: number; failed: number };
export type InviteStatus = {
  /** `withoutAccounts`: staff with a number on file but no login to invite yet. */
  staff: InviteCounts & { withoutAccounts: number; delivery: InviteDelivery };
  parents: InviteCounts & {
    sections: InviteSectionCounts[];
    delivery: InviteDelivery;
  };
};

/**
 * Polls only while somebody invited hasn't joined yet, and never in a
 * background tab — "12 of 62 have joined" is a next-morning number, not a
 * reason to hammer the API.
 */
export function useInviteStatus(enabled = true) {
  return useQuery({
    queryKey: ['onboarding', 'invite-status'],
    enabled,
    queryFn: () => apiFetch<InviteStatus>('/onboarding/invite/status'),
    refetchInterval: (q) => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      const d = q.state.data;
      if (!d) return false;
      // Sending is asynchronous, so poll fast while messages are still in
      // flight and slowly while waiting on humans to accept.
      const inFlight = d.staff.delivery.pending > 0 || d.parents.delivery.pending > 0;
      if (inFlight) return 2_000;
      const outstanding =
        d.staff.invited > d.staff.joined || d.parents.invited > d.parents.joined;
      return outstanding ? 10_000 : false;
    },
  });
}

export function isOnboardingStepKey(
  value: string | undefined | null,
): value is OnboardingStepKey {
  return Boolean(value && (ONBOARDING_STEP_KEYS as readonly string[]).includes(value));
}

/**
 * `tenants.onboarding_step` is a free-text column, so it can hold values outside
 * the wizard's step list (older seeds wrote 'done'). Without this fallback the
 * router bounces between /onboarding and /onboarding/<unknown> forever.
 */
export function resolveOnboardingStep(state: OnboardingState): OnboardingStepKey {
  if (isOnboardingStepKey(state.currentStep)) return state.currentStep;
  const unfinished = state.steps.find(
    (s) => s.status !== 'completed' && s.status !== 'skipped',
  );
  return unfinished?.key ?? 'school_profile';
}

export function boardToTemplate(
  board: string | undefined | null,
): 'cbse' | 'icse' | 'state' | 'scratch' {
  if (!board) return 'cbse';
  if (board === 'cbse') return 'cbse';
  if (board === 'icse' || board === 'isc') return 'icse';
  if (board.startsWith('state')) return 'state';
  return 'scratch';
}

export function useOnboardingState() {
  return useQuery({
    queryKey: ['onboarding', 'state'],
    queryFn: () => apiFetch<OnboardingState>('/onboarding/state'),
    staleTime: 30_000,
  });
}

export function useOnboardingActions() {
  const qc = useQueryClient();

  const emitStep = useMutation({
    mutationFn: (args: {
      step: OnboardingStepKey;
      action: 'started' | 'completed' | 'skipped';
      durationSeconds?: number;
      itemCount?: number;
      data?: Record<string, unknown>;
    }) =>
      apiFetch<OnboardingState>(`/onboarding/steps/${args.step}`, {
        method: 'POST',
        body: JSON.stringify({
          action: args.action,
          durationSeconds: args.durationSeconds,
          itemCount: args.itemCount,
          data: args.data,
        }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['onboarding', 'state'], data);
    },
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<{ logoPath: string; logoUrl: string | null }>(
        '/onboarding/logo',
        form,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['onboarding', 'state'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const requestCallback = useMutation({
    mutationFn: (body: { preferredTime?: string; note?: string }) =>
      apiFetch('/onboarding/callback-request', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const invalidateInvites = () => {
    void qc.invalidateQueries({ queryKey: ['onboarding', 'invite-status'] });
  };

  const inviteStaff = useMutation({
    mutationFn: (body: { all?: boolean; userIds?: string[] }) =>
      apiFetch<{ invited: number }>('/onboarding/invite/staff', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateInvites,
  });

  const inviteParents = useMutation({
    mutationFn: (body: { all?: boolean; sectionIds?: string[] }) =>
      apiFetch<{ invited: number }>('/onboarding/invite/parents', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateInvites,
  });

  return { emitStep, uploadLogo, requestCallback, inviteStaff, inviteParents };
}

export const SKIP_ONBOARDING_KEY = 'saw.onboarding.skipped';

export function isOnboardingSkippedLocally(): boolean {
  try {
    return localStorage.getItem(SKIP_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingSkippedLocally(value: boolean): void {
  try {
    if (value) localStorage.setItem(SKIP_ONBOARDING_KEY, '1');
    else localStorage.removeItem(SKIP_ONBOARDING_KEY);
  } catch {
    /* ignore */
  }
}
