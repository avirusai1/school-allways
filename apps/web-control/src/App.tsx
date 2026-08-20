import { Navigate, Route, Routes } from 'react-router-dom';
import { ControlShell } from './layout/ControlShell';
import { useAuth } from './lib/auth';
import { BillingPage } from './pages/BillingPage';
import { FlagsPage } from './pages/FlagsPage';
import { FleetPage } from './pages/FleetPage';
import { FunnelPage } from './pages/FunnelPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SchoolDetailPage } from './pages/SchoolDetailPage';
import { SchoolsPage } from './pages/SchoolsPage';
import { SupportPage } from './pages/SupportPage';
import { controlHomePath } from './nav/registry';

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
 * The console landing screen.
 *
 * This route always rendered <FleetPage />. The Support Agent role declares
 * `homeScreen: 'support_queue'`, so an agent opened the super-admin's fleet
 * dashboard instead of their own queue. There is no 403 here — /platform/* is
 * guarded with @PlatformOnly() rather than per-permission — which is precisely
 * why nobody noticed.
 */
function ControlHomeRoute() {
  const { session } = useAuth();
  const target = controlHomePath(session?.homeScreen);
  if (target !== '/') return <Navigate to={target} replace />;
  return <FleetPage />;
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
        <Route index element={<ControlHomeRoute />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="schools/:id" element={<SchoolDetailPage />} />
        <Route path="flags" element={<FlagsPage />} />
        <Route path="funnel" element={<FunnelPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="support" element={<SupportPage />} />
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
          path="helpdesk"
          element={
            <PlaceholderPage
              title="Helpdesk"
              body="Tickets raised by schools, with SLA and assignment."
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
