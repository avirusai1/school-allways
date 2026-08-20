/**
 * Server-driven navigation for the family web app.
 *
 * roles.ts states the rule plainly: "`nav` — the server-driven navigation
 * manifest... Never hardcode role→screen mapping in the app." This app used to
 * do exactly that: a single hardcoded guardian nav, which is why a STUDENT
 * logging in was shown the guardian home and refused by the API guard
 * (`family.child.read` — a permission the student role deliberately withholds).
 *
 * Keys here MUST match the manifest keys emitted in db/seeds/roles.ts.
 * A key with `implemented: false` still renders — as a placeholder — so a nav
 * entry the server promises is never silently dropped.
 */
export type FamilyNavItem = {
  key: string;
  path: string;
  label: string;
  end?: boolean;
  implemented: boolean;
};

export const FAMILY_NAV_REGISTRY: FamilyNavItem[] = [
  { key: 'family_home', path: '/', label: 'Home', end: true, implemented: true },
  { key: 'student_home', path: '/', label: 'Home', end: true, implemented: true },
  // DiaryPage already serves /homework/feed + /diary — it was simply never
  // keyed to the `homework` manifest entry that every family role asks for.
  { key: 'homework', path: '/diary', label: 'Homework', implemented: true },
  { key: 'notices', path: '/notifications', label: 'Notices', implemented: true },
  { key: 'results', path: '/results', label: 'Results', implemented: true },
  { key: 'books', path: '/books', label: 'Books', implemented: true },
  { key: 'fees', path: '/fees', label: 'Fees', implemented: true },
  { key: 'bus', path: '/bus', label: 'Bus', implemented: true },
  { key: 'privacy', path: '/privacy', label: 'Privacy', implemented: true },
  // Promised by a role's nav, no screen built yet. Placeholder, never a 404.
  { key: 'attendance', path: '/attendance', label: 'Attendance', implemented: false },
  { key: 'timetable', path: '/timetable', label: 'Timetable', implemented: false },
  { key: 'library', path: '/library', label: 'Library', implemented: false },
  { key: 'gallery', path: '/gallery', label: 'Gallery', implemented: false },
  { key: 'messages', path: '/messages', label: 'Messages', implemented: false },
  { key: 'pickup', path: '/pickup', label: 'Pickup', implemented: false },
];

/**
 * Leave has no manifest key in any family role, but `family.leave.request` is a
 * real granted permission with a working screen. Surface it by permission so the
 * capability is not stranded — and so a student, who lacks it, never sees it.
 */
export const PERMISSION_NAV: Array<{ permission: string; item: FamilyNavItem }> = [
  {
    permission: 'family.leave.request',
    item: { key: 'leave', path: '/leave', label: 'Leave', implemented: true },
  },
];

export function familyNavFor(
  manifest: string[],
  permissions: string[],
): FamilyNavItem[] {
  const seen = new Set<string>();
  const items: FamilyNavItem[] = [];

  for (const key of manifest) {
    const found = FAMILY_NAV_REGISTRY.find((n) => n.key === key);
    // Unknown key from a newer server: skip rather than crash an older client.
    if (!found || seen.has(found.path)) continue;
    seen.add(found.path);
    items.push(found);
  }

  // An empty/unrecognised manifest must still leave the user somewhere real.
  if (items.length === 0) {
    const home = FAMILY_NAV_REGISTRY[0];
    seen.add(home.path);
    items.push(home);
  }

  for (const { permission, item } of PERMISSION_NAV) {
    if (permissions.includes(permission) && !seen.has(item.path)) {
      seen.add(item.path);
      items.push(item);
    }
  }

  return items;
}
