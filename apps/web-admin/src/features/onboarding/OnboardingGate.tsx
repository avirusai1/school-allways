import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { isOnboardingSkippedLocally } from './useOnboardingState';

/**
 * Redirects into the wizard when onboarding is incomplete — unless the user
 * chose "Skip setup for now" (local flag) or is already on /onboarding.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-body-small text-grey-600">
        Loading session…
      </div>
    );
  }

  if (!session) return children;

  const onOnboarding = location.pathname.startsWith('/onboarding');
  const completed = Boolean(session.tenant.onboardingCompletedAt);
  const skipped = isOnboardingSkippedLocally();

  // The last step hands off to the real attendance screen and expects to be
  // handed back. Without this the gate bounces that deep link straight back
  // into the wizard and the school can never activate.
  const wizardHandoff =
    new URLSearchParams(location.search).get('returnTo') === 'onboarding';

  if (!completed && !skipped && !onOnboarding && !wizardHandoff) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
