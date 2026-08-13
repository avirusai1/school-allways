import { Navigate, Route, Routes } from 'react-router-dom';
import { ControlShell } from './layout/ControlShell';
import { useAuth } from './lib/auth';
import { FlagsPage } from './pages/FlagsPage';
import { FleetPage } from './pages/FleetPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SchoolDetailPage } from './pages/SchoolDetailPage';
import { SchoolsPage } from './pages/SchoolsPage';

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
      <Route
        element={
          <RequireAuth>
            <ControlShell />
          </RequireAuth>
        }
      >
        <Route index element={<FleetPage />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="schools/:id" element={<SchoolDetailPage />} />
        <Route path="flags" element={<FlagsPage />} />
        <Route
          path="funnel"
          element={
            <PlaceholderPage
              title="Onboarding funnel"
              body="Step drop-off from /platform/funnel — wire charts next."
            />
          }
        />
        <Route
          path="billing"
          element={
            <PlaceholderPage
              title="Billing"
              body="MRR, subscriptions and dunning from /platform/revenue."
            />
          }
        />
        <Route
          path="support"
          element={
            <PlaceholderPage
              title="Support queue"
              body="Open support sessions with mandatory reason and auto-expiry."
            />
          }
        />
        <Route
          path="announcements"
          element={
            <PlaceholderPage
              title="Announcements"
              body="Compose platform → school messages."
            />
          }
        />
        <Route
          path="referrals"
          element={
            <PlaceholderPage
              title="Referrals & partners"
              body="Rewards fire on activation, never signup."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
