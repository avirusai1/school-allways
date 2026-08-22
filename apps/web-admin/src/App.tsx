import { Navigate, Route, Routes } from 'react-router-dom';
import { OnboardingGate } from './features/onboarding/OnboardingGate';
import { AppShell } from './layout/AppShell';
import { useAuth } from './lib/auth';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendancePage } from './pages/AttendancePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ClassesPage } from './pages/academic/ClassesPage';
import { SessionsPage } from './pages/academic/SessionsPage';
import { SubjectsPage } from './pages/academic/SubjectsPage';
import { HandoffPage } from './pages/HandoffPage';
import { ImportPage } from './pages/ImportPage';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { MobileRolePage } from './pages/MobileRolePage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StaffAttendancePage } from './pages/StaffAttendancePage';
import { GuardianAccountsPage } from './pages/GuardianAccountsPage';
import { StaffAccountsPage } from './pages/StaffAccountsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { StudentsPage } from './pages/StudentsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { NAV_REGISTRY, navForManifest } from './nav/registry';

const REAL_NAV_IDS = new Set([
  'dashboard',
  'approvals',
  'students',
  'students.guardian_accounts',
  'students.subscriptions',
  'staff.accounts',
  'notifications',
  'students.imports',
  'academics.sessions',
  'academics.classes',
  'academics.subjects',
  'attendance',
  'staff_attendance',
]);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-body-small text-grey-600">
        Loading session…
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

/**
 * The admin landing screen.
 *
 * This route used to render <DashboardPage /> for every role. That page calls
 * `/dashboard/principal`, which requires `dashboard.principal.read` — a
 * permission 22 of the 26 admin roles do not hold. A teacher, cashier,
 * librarian, driver or security guard therefore logged in straight onto a
 * permission error, the same failure a student hit on the family app.
 *
 * The server already says where each role belongs, so honour it: only roles
 * that can actually read the dashboard get it; everyone else lands on the
 * first screen their own nav manifest grants.
 */
function AdminHomeRoute() {
  const { session } = useAuth();

  if (session?.permissions?.includes('dashboard.principal.read')) {
    return <DashboardPage />;
  }

  const nav = navForManifest(
    session?.navManifest ?? [],
    session?.permissions ?? [],
  ).filter((n) => n.id !== 'dashboard');
  if (nav.length > 0) return <Navigate to={nav[0]!.path} replace />;

  // No web screen at all: a mobile-first role. Say so, rather than implying a
  // web version is on the way.
  return <MobileRolePage />;
}

export function App() {
  const placeholders = NAV_REGISTRY.filter((n) => !REAL_NAV_IDS.has(n.id));

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Outside RequireAuth and the onboarding gate: this is how an invited
          teacher gets a session in the first place. */}
      <Route path="/join/:token" element={<JoinPage />} />
      {/* Same reason, for a school that just signed up on the marketing site. */}
      <Route path="/handoff" element={<HandoffPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding/:step"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <OnboardingGate>
              <AppShell />
            </OnboardingGate>
          </RequireAuth>
        }
      >
        <Route index element={<AdminHomeRoute />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="students/guardian-accounts" element={<GuardianAccountsPage />} />
        <Route path="staff/accounts" element={<StaffAccountsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="imports" element={<ImportPage />} />
        <Route path="imports/:id" element={<ImportPage />} />
        <Route path="students/imports" element={<Navigate to="/imports" replace />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="staff/attendance" element={<StaffAttendancePage />} />
        <Route path="setup/classes" element={<ClassesPage />} />
        <Route path="setup/subjects" element={<SubjectsPage />} />
        <Route path="setup/sessions" element={<SessionsPage />} />
        <Route path="academics/classes" element={<Navigate to="/setup/classes" replace />} />
        <Route path="academics/subjects" element={<Navigate to="/setup/subjects" replace />} />
        <Route path="academics/sessions" element={<Navigate to="/setup/sessions" replace />} />
        {placeholders.map((n) => (
          <Route
            key={n.id}
            path={n.path.replace(/^\//, '')}
            element={<PlaceholderPage title={n.label} />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
