import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '@saw/ui';
import { controlNavFor } from '../nav/registry';
import { useAuth } from '../lib/auth';

export function ControlShell() {
  const { session, logout } = useAuth();

  // Server-driven: a Support Agent must not be shown the super-admin's nav.
  const NAV = useMemo(
    () =>
      controlNavFor(session?.navManifest ?? []).map((n) => ({
        to: n.path,
        label: n.label,
        end: n.end,
      })),
    [session?.navManifest],
  );

  return (
    <div className="flex min-h-screen bg-grey-25">
      <aside className="flex w-56 shrink-0 flex-col border-r border-grey-200 bg-grey-0">
        <div className="border-b border-grey-100 px-4 py-4">
          <div className="flex items-center gap-2">
            <img src="/control/brand/logo.png" alt="School Allways" className="h-7 w-7 object-contain" />
            <span className="text-[15px] font-semibold text-blue-700">Control</span>
          </div>
          <div className="mt-1 text-[12px] text-grey-500">Platform · IP-restricted</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-sm px-3 py-2 text-[13px] font-medium',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-grey-700 hover:bg-grey-50',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-grey-100 p-3 text-[12px] text-grey-500">
          {session?.user.fullName}
          <Button variant="ghost" size="compact" className="mt-2" onClick={() => void logout()} expanded>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
