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
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StaffAttendancePage } from './pages/StaffAttendancePage';
import { GuardianAccountsPage } from './pages/GuardianAccountsPage';
import { StaffAccountsPage } from './pages/StaffAccountsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { StudentsPage } from './pages/StudentsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { NAV_REGISTRY } from './nav/registry';

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
        <Route index element={<DashboardPage />} />
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
