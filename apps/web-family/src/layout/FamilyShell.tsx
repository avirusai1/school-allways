import { useEffect, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { applyTenantBrand, Brand, Button } from '@saw/ui';
import { familyNavFor } from '../nav/registry';
import { useAuth } from '../lib/auth';

export function FamilyShell() {
  const { session, logout } = useAuth();

  // White-label: regenerate the whole blue ramp from the tenant's chosen
  // color. Restores the platform default on unmount.
  useEffect(() => {
    applyTenantBrand(session?.tenant.primaryColor);
    return () => applyTenantBrand(null);
  }, [session?.tenant.primaryColor]);

  // Server-driven, per roles.ts: "Never hardcode role→screen mapping in the
  // app, or every permission tweak becomes a Play Store release."
  const NAV = useMemo(
    () =>
      familyNavFor(session?.navManifest ?? [], session?.permissions ?? []).map((n) => ({
        to: n.path,
        label: n.label,
        end: n.end,
      })),
    [session?.navManifest, session?.permissions],
  );

  return (
    <div className="flex min-h-screen flex-col bg-grey-25 md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-grey-200 bg-grey-0 md:flex md:flex-col">
        <div className="border-b border-grey-100 px-4 py-4">
          <Brand logoUrl={session?.tenant.logoUrl} name={session?.tenant.name} />
          <div className="mt-1 truncate text-[12px] text-grey-500">
            {session?.tenant.name}
          </div>
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
        <div className="border-t border-grey-100 p-3">
          <Button variant="ghost" size="compact" onClick={() => void logout()} expanded>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="flex h-14 items-center justify-between border-b border-grey-200 bg-grey-0 px-4 md:hidden">
          <Brand logoUrl={session?.tenant.logoUrl} name={session?.tenant.name} />
          <Button variant="ghost" size="inline" onClick={() => void logout()}>
            Out
          </Button>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-grey-200 bg-grey-0 md:hidden">
        {NAV.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center py-2 text-[11px] font-medium',
                isActive ? 'text-blue-700' : 'text-grey-500',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
