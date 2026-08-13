import { Button } from '@saw/ui';
import {
  ONBOARDING_STEP_KEYS,
  STEP_META,
  type OnboardingState,
  type OnboardingStepKey,
} from './useOnboardingState';

type Props = {
  state: OnboardingState;
  step: OnboardingStepKey;
  stepIndex: number;
  children: React.ReactNode;
  busy?: boolean;
  /** The last step supplies its own actions, so the generic Continue is hidden. */
  hideContinue?: boolean;
  /** Once the school is live there is nothing left to skip past. */
  hideSkip?: boolean;
  /** The completion screen is one icon and one sentence — no step heading above it. */
  hideHeader?: boolean;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onSelectStep: (key: OnboardingStepKey) => void;
  onSkipSetup: () => void;
  onRequestCallback: () => void;
};

function RailDot({
  status,
  current,
}: {
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  current: boolean;
}) {
  if (status === 'completed' || status === 'skipped') {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center text-[13px] font-semibold text-green-500"
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (current || status === 'in_progress') {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
      <span className="h-2.5 w-2.5 rounded-full bg-grey-300" />
    </span>
  );
}

export function OnboardingLayout({
  state,
  step,
  stepIndex,
  children,
  busy,
  hideContinue,
  hideSkip,
  hideHeader,
  onBack,
  onSkip,
  onContinue,
  onSelectStep,
  onSkipSetup,
  onRequestCallback,
}: Props) {
  const meta = STEP_META[step];
  const statusByKey = new Map(state.steps.map((s) => [s.key, s.status]));

  return (
    <div className="flex min-h-screen flex-col bg-grey-25 lg:flex-row">
      <aside className="flex w-full flex-col border-b border-grey-200 bg-grey-0 px-6 py-6 lg:w-[280px] lg:border-b-0 lg:border-r lg:py-8">
        <p className="text-h3 font-semibold text-grey-900">School All Ways</p>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Onboarding steps">
          {ONBOARDING_STEP_KEYS.map((key) => {
            const status = statusByKey.get(key) ?? 'pending';
            const current = key === step;
            const clickable = status === 'completed' || status === 'skipped' || current;
            const label = STEP_META[key].label;
            const content = (
              <>
                <RailDot status={status} current={current} />
                <span
                  className={[
                    'text-body-small',
                    current ? 'font-semibold text-grey-900' : 'text-grey-700',
                  ].join(' ')}
                >
                  {label}
                </span>
              </>
            );
            if (clickable && !current) {
              return (
                <button
                  key={key}
                  type="button"
                  className="flex items-center gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-grey-50"
                  onClick={() => onSelectStep(key)}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={key} className="flex items-center gap-2 px-1 py-1.5">
                {content}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <p className="text-body-small text-grey-600">
            ~{state.estimatedMinutesRemaining} min remaining
          </p>
          <p className="mt-3 text-body-small text-grey-600">Need help?</p>
          <button
            type="button"
            className="mt-1 text-body-small font-medium text-blue-600 hover:underline"
            onClick={onRequestCallback}
          >
            Request callback
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex-1 px-6 py-8 lg:px-8">
          <div className="mx-auto w-full max-w-[720px]">
            {hideHeader ? null : (
              <>
                <p className="text-caption uppercase tracking-wide text-grey-500">
                  {stepIndex === ONBOARDING_STEP_KEYS.length - 1
                    ? 'Last step'
                    : `Step ${stepIndex + 1} of ${ONBOARDING_STEP_KEYS.length}`}
                </p>
                <h1 className="mt-2 text-h1 text-grey-900">{meta.title}</h1>
                <p className="mt-2 text-body-small text-grey-600">{meta.body}</p>
              </>
            )}
            <div className={hideHeader ? '' : 'mt-8'}>{children}</div>
          </div>
        </main>

        <footer className="border-t border-grey-200 bg-grey-0 px-6 py-4 lg:px-8">
          <div className="mx-auto flex w-full max-w-[720px] flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="compact"
              disabled={stepIndex === 0 || busy}
              onClick={onBack}
            >
              Back
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              {hideSkip ? null : (
                <button
                  type="button"
                  className="text-body-small text-grey-600 hover:text-grey-900 hover:underline"
                  onClick={onSkipSetup}
                >
                  Skip setup for now
                </button>
              )}
              {state.canSkipCurrent && !hideSkip ? (
                <Button variant="ghost" size="compact" disabled={busy} onClick={onSkip}>
                  Skip
                </Button>
              ) : null}
              {hideContinue ? null : (
                <Button
                  variant="primary"
                  size="compact"
                  loading={busy}
                  onClick={onContinue}
                >
                  Continue →
                </Button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
