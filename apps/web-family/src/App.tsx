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
import { PrivacyPage } from './pages/PrivacyPage';
import { ResultsPage } from './pages/ResultsPage';

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
        <Route index element={<HomePage />} />
        <Route path="fees" element={<FeesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="diary" element={<DiaryPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="bus" element={<BusPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
