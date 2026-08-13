import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton } from '@saw/ui';
import { OnboardingLayout } from '../features/onboarding/OnboardingLayout';
import { AcademicSessionStep } from '../features/onboarding/steps/AcademicSessionStep';
import type { AcademicSessionStepHandle } from '../features/onboarding/steps/AcademicSessionStep';
import { ClassesStep } from '../features/onboarding/steps/ClassesStep';
import type { ClassesStepHandle } from '../features/onboarding/steps/ClassesStep';
import { FirstAttendanceStep } from '../features/onboarding/steps/FirstAttendanceStep';
import { ImportStaffStep } from '../features/onboarding/steps/ImportStaffStep';
import { ImportStudentsStep } from '../features/onboarding/steps/ImportStudentsStep';
import type { ImportStepHandle } from '../features/onboarding/steps/ImportStep';
import { InviteParentsStep } from '../features/onboarding/steps/InviteParentsStep';
import type { InviteStepHandle } from '../features/onboarding/steps/InviteStaffStep';
import { InviteStaffStep } from '../features/onboarding/steps/InviteStaffStep';
import { SchoolProfileStep } from '../features/onboarding/steps/SchoolProfileStep';
import type { SchoolProfileStepHandle } from '../features/onboarding/steps/SchoolProfileStep';
import { SubjectsStep } from '../features/onboarding/steps/SubjectsStep';
import type { SubjectsStepHandle } from '../features/onboarding/steps/SubjectsStep';
import {
  ONBOARDING_STEP_KEYS,
  boardToTemplate,
  isOnboardingStepKey as isStepKey,
  resolveOnboardingStep,
  setOnboardingSkippedLocally,
  useOnboardingActions,
  useOnboardingState,
  type OnboardingStepKey,
} from '../features/onboarding/useOnboardingState';
import { useAuth } from '../lib/auth';

export function OnboardingPage() {
  const { step: stepParam } = useParams<{ step?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const stateQ = useOnboardingState();
  const { emitStep, requestCallback } = useOnboardingActions();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const startedStepRef = useRef<string | null>(null);

  const profileRef = useRef<SchoolProfileStepHandle>(null);
  const sessionRef = useRef<AcademicSessionStepHandle>(null);
  const classesRef = useRef<ClassesStepHandle>(null);
  const subjectsRef = useRef<SubjectsStepHandle>(null);
  const importStaffRef = useRef<ImportStepHandle>(null);
  const importStudentsRef = useRef<ImportStepHandle>(null);
  const inviteStaffRef = useRef<InviteStepHandle>(null);
  const inviteParentsRef = useRef<InviteStepHandle>(null);

  const state = stateQ.data;
  const resumeStep = state ? resolveOnboardingStep(state) : 'school_profile';
  const step: OnboardingStepKey = isStepKey(stepParam) ? stepParam : resumeStep;
  const stepIndex = ONBOARDING_STEP_KEYS.indexOf(step);

  // Resume from server currentStep when hitting /onboarding with no :step.
  useEffect(() => {
    if (!state) return;
    if (!stepParam) {
      navigate(`/onboarding/${resumeStep}`, { replace: true });
    }
  }, [state, stepParam, resumeStep, navigate]);

  // Telemetry: started on every step mount.
  useEffect(() => {
    if (!state) return;
    if (startedStepRef.current === step) return;
    startedStepRef.current = step;
    startedAtRef.current = Date.now();
    void emitStep.mutateAsync({ step, action: 'started' }).catch(() => undefined);
  }, [step, state, emitStep]);

  if (stateQ.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Skeleton height={240} />
      </div>
    );
  }

  if (stateQ.isError || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <ErrorState
          message={
            stateQ.error instanceof Error
              ? stateQ.error.message
              : 'Could not load onboarding state.'
          }
          onRetry={() => void stateQ.refetch()}
        />
      </div>
    );
  }

  if (!branchId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <EmptyState
          headline="No branch selected"
          body="Choose a branch before continuing setup."
        />
      </div>
    );
  }

  if (stepParam && !isStepKey(stepParam)) {
    return <Navigate to={`/onboarding/${resumeStep}`} replace />;
  }

  const durationSeconds = () =>
    Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));

  const goTo = (key: OnboardingStepKey) => {
    navigate(`/onboarding/${key}`);
  };

  const onBack = () => {
    if (stepIndex <= 0) return;
    goTo(ONBOARDING_STEP_KEYS[stepIndex - 1]!);
  };

  const onSkipSetup = () => {
    setOnboardingSkippedLocally(true);
    navigate('/', { replace: true });
  };

  const onSkip = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const next = await emitStep.mutateAsync({
        step,
        action: 'skipped',
        durationSeconds: durationSeconds(),
      });
      const nxt = next.currentStep;
      if (isStepKey(nxt) && nxt !== step) goTo(nxt);
      else if (stepIndex < ONBOARDING_STEP_KEYS.length - 1) {
        goTo(ONBOARDING_STEP_KEYS[stepIndex + 1]!);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not skip step.');
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    setBusy(true);
    setActionError(null);
    try {
      let data: Record<string, unknown> | undefined;
      let itemCount = 0;

      if (step === 'school_profile') {
        const saved = await profileRef.current!.save();
        data = saved.data;
        itemCount = saved.itemCount;
      } else if (step === 'academic_session') {
        const saved = await sessionRef.current!.save();
        data = saved.data;
        itemCount = saved.itemCount;
      } else if (step === 'classes') {
        itemCount = await classesRef.current!.save();
        data = { board: boardToTemplate(state.profile.board) };
      } else if (step === 'subjects') {
        itemCount = await subjectsRef.current!.save();
        data = { board: boardToTemplate(state.profile.board) };
      } else if (step === 'import_staff' || step === 'import_students') {
        const handle =
          step === 'import_staff' ? importStaffRef.current : importStudentsRef.current;
        itemCount = (await handle?.save()) ?? 0;
        if (itemCount === 0) {
          setActionError(
            'Finish an import first, or use Skip if you want to come back to this later.',
          );
          return;
        }
        // These steps have no server-side apply; the count only travels as data.
        data = { itemCount };
      } else if (step === 'invite_staff' || step === 'invite_parents') {
        const handle =
          step === 'invite_staff' ? inviteStaffRef.current : inviteParentsRef.current;
        itemCount = (await handle?.save()) ?? 0;
        if (itemCount === 0) {
          setActionError(
            'Send invitations first, or use Skip to continue without sending.',
          );
          return;
        }
        data = { itemCount };
      }

      const next = await emitStep.mutateAsync({
        step,
        action: 'completed',
        durationSeconds: durationSeconds(),
        itemCount,
        data,
      });

      const nxt = next.currentStep;
      if (isStepKey(nxt) && nxt !== step) goTo(nxt);
      else if (stepIndex < ONBOARDING_STEP_KEYS.length - 1) {
        goTo(ONBOARDING_STEP_KEYS[stepIndex + 1]!);
      } else {
        setOnboardingSkippedLocally(false);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not save this step.',
      );
    } finally {
      setBusy(false);
    }
  };

  const defaultBoard = boardToTemplate(state.profile.board);
  // The register is marked, so the last step is showing its completion screen.
  const activated = step === 'first_attendance' && Boolean(state.activatedAt);

  let body: React.ReactNode;
  switch (step) {
    case 'school_profile':
      body = <SchoolProfileStep ref={profileRef} profile={state.profile} />;
      break;
    case 'academic_session':
      body = <AcademicSessionStep ref={sessionRef} branchId={branchId} />;
      break;
    case 'classes':
      body = (
        <ClassesStep
          ref={classesRef}
          variant="wizard"
          branchId={branchId}
          defaultBoard={defaultBoard}
        />
      );
      break;
    case 'subjects':
      body = (
        <SubjectsStep
          ref={subjectsRef}
          variant="wizard"
          branchId={branchId}
          defaultBoard={defaultBoard}
        />
      );
      break;
    case 'import_staff':
      body = <ImportStaffStep ref={importStaffRef} branchId={branchId} />;
      break;
    case 'import_students':
      body = <ImportStudentsStep ref={importStudentsRef} branchId={branchId} />;
      break;
    case 'invite_staff':
      body = <InviteStaffStep ref={inviteStaffRef} schoolName={state.profile.name} />;
      break;
    case 'invite_parents':
      body = (
        <InviteParentsStep ref={inviteParentsRef} schoolName={state.profile.name} />
      );
      break;
    case 'first_attendance':
      body = (
        <FirstAttendanceStep
          branchId={branchId}
          activatedAt={state.activatedAt}
          busy={busy}
          onSkipStep={() => void onSkip()}
          onFinish={() => void onContinue()}
        />
      );
      break;
  }

  return (
    <OnboardingLayout
      state={state}
      step={step}
      stepIndex={Math.max(0, stepIndex)}
      busy={busy}
      hideContinue={step === 'first_attendance'}
      hideSkip={activated}
      hideHeader={activated}
      onBack={onBack}
      onSkip={() => void onSkip()}
      onContinue={() => void onContinue()}
      onSelectStep={goTo}
      onSkipSetup={onSkipSetup}
      onRequestCallback={() => {
        void requestCallback
          .mutateAsync({ note: `Callback requested from step ${step}` })
          .catch(() => undefined);
      }}
    >
      {actionError ? (
        <p className="mb-4 text-body-small text-red-700">{actionError}</p>
      ) : null}
      {body}
    </OnboardingLayout>
  );
}
