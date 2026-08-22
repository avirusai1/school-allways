import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { applyTenantBrand, Brand, Button, Select } from '@saw/ui';
import { useAuth } from '../lib/auth';
import { groupNav, navForManifest } from '../nav/registry';
import { StayConnectedBanner } from '../features/subscriptions/StayConnectedBanner';

export function AppShell() {
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // White-label: regenerate the whole blue ramp from the tenant's chosen
  // color. Restores the platform default on unmount, so the NEXT login
  // (a different school, or logged out entirely) never inherits it.
  useEffect(() => {
    applyTenantBrand(session?.tenant.primaryColor);
    return () => applyTenantBrand(null);
  }, [session?.tenant.primaryColor]);

  const groups = useMemo(
    () => groupNav(navForManifest(session?.navManifest ?? [], session?.permissions ?? [])),
    [session?.navManifest, session?.permissions],
  );

  const width = collapsed ? 64 : 240;

  return (
    <div className="flex h-full min-h-screen bg-grey-25">
      <aside
        className="sticky top-0 flex h-screen shrink-0 flex-col border-r border-grey-200 bg-grey-0 transition-[width] duration-150"
        style={{ width }}
      >
        <div className="flex h-14 items-center gap-2 border-b border-grey-100 px-3">
          {!collapsed && (
            <Link to="/" className="min-w-0 truncate">
              <Brand logoUrl={session?.tenant.logoUrl} name={session?.tenant.name} />
            </Link>
          )}
          <button
            type="button"
            className="ml-auto rounded-sm p-2 text-grey-600 hover:bg-grey-50"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g.section} className="mb-4">
              {!collapsed && (
                <div className="mb-1 px-2 text-overline uppercase text-grey-500">
                  {g.section}
                </div>
              )}
              <ul className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      title={item.label}
                      className={({ isActive }) =>
                        [
                          'flex h-9 items-center rounded-sm px-2 text-[13px] font-medium',
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-grey-700 hover:bg-grey-50',
                        ].join(' ')
                      }
                    >
                      {collapsed ? item.label.slice(0, 1) : item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-grey-200 bg-grey-0 px-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-grey-900">
              {session?.tenant.name ?? 'School'}
            </div>
            <div className="truncate text-[12px] text-grey-500">
              {session?.user.fullName}
              {session?.roles[0] ? ` · ${session.roles[0].name}` : ''}
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Select
              label=""
              aria-label="Branch"
              className="w-40 [&_label]:hidden"
              options={[
                {
                  value: session?.branch?.id ?? '',
                  label: session?.branch?.name ?? 'Branch',
                },
              ]}
              value={session?.branch?.id ?? ''}
              disabled
            />
            <Select
              label=""
              aria-label="Academic session"
              className="w-44 [&_label]:hidden"
              options={[
                {
                  value: session?.tenant.currentAcademicSessionId ?? '',
                  label: 'Current session',
                },
              ]}
              value={session?.tenant.currentAcademicSessionId ?? ''}
              disabled
            />
          </div>
          <Button variant="ghost" size="compact" onClick={() => void logout()}>
            Sign out
          </Button>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6">
          <StayConnectedBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
