import { Navigate, Route, Routes } from 'react-router-dom';
import { FamilyShell } from './layout/FamilyShell';
import { useAuth } from './lib/auth';
import { BooksPage } from './pages/BooksPage';
import { BusPage } from './pages/BusPage';
import { DiaryPage } from './pages/DiaryPage';
import { FeesPage } from './pages/FeesPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { LeavePage } from './pages/LeavePage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ResultsPage } from './pages/ResultsPage';
import { LibraryPage } from './pages/LibraryPage';
import { StudentHomePage } from './pages/StudentHomePage';
import { TimetablePage } from './pages/TimetablePage';
import { FAMILY_NAV_REGISTRY } from './nav/registry';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-body-small text-grey-600">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

/**
 * The landing screen is the server's call, not the client's.
 *
 * `session.homeScreen` was previously ignored by every web app, so a student —
 * whose role declares `homeScreen: 'student_home'` — was dropped on the
 * guardian home and refused by the API guard.
 */
function HomeRoute() {
  const { session } = useAuth();
  return session?.homeScreen === 'student_home' ? <StudentHomePage /> : <HomePage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Outside RequireAuth: arriving here is how a parent gets a session. */}
      <Route path="/join/:token" element={<JoinPage />} />
      <Route
        element={
          <RequireAuth>
            <FamilyShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRoute />} />
        <Route path="fees" element={<FeesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="diary" element={<DiaryPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="bus" element={<BusPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="library" element={<LibraryPage />} />
        {/* Manifest keys with no screen yet: a placeholder, never a silent 404. */}
        {FAMILY_NAV_REGISTRY.filter((n) => !n.implemented).map((n) => (
          <Route
            key={n.key}
            path={n.path.replace(/^\//, '')}
            element={<PlaceholderPage title={n.label} />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
