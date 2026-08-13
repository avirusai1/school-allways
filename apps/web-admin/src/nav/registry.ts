export type NavItem = {
  id: string;
  label: string;
  path: string;
  section: string;
};

/**
 * Registry of all admin routes. Sidebar only shows items present in
 * session.navManifest (same codes as mobile admin).
 */
export const NAV_REGISTRY: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', section: 'Overview' },
  { id: 'approvals', label: 'Approvals', path: '/approvals', section: 'Overview' },
  { id: 'notifications', label: 'Notifications', path: '/notifications', section: 'Overview' },
  { id: 'students', label: 'Students', path: '/students', section: 'Students' },
  { id: 'students.admissions', label: 'Admissions', path: '/students/admissions', section: 'Students' },
  { id: 'students.apaar', label: 'APAAR worklist', path: '/students/apaar', section: 'Students' },
  { id: 'students.guardian_accounts', label: 'Guardian accounts', path: '/students/guardian-accounts', section: 'Students' },
  { id: 'students.subscriptions', label: 'Subscriptions', path: '/subscriptions', section: 'Students' },
  { id: 'students.imports', label: 'Imports', path: '/imports', section: 'Students' },
  { id: 'staff', label: 'Staff', path: '/staff', section: 'Staff' },
  { id: 'staff.accounts', label: 'Staff accounts', path: '/staff/accounts', section: 'Staff' },
  // Underscore id, not `staff.attendance`: this screen is granted on its own
  // (the security head marks staff in at the gate but sees no staff records),
  // so it must not be reachable by the `staff.` prefix match below.
  { id: 'staff_attendance', label: 'Staff attendance', path: '/staff/attendance', section: 'Staff' },
  { id: 'staff.leave', label: 'Leave', path: '/staff/leave', section: 'Staff' },
  { id: 'academics.sessions', label: 'Sessions', path: '/setup/sessions', section: 'Academics' },
  { id: 'academics.classes', label: 'Classes', path: '/setup/classes', section: 'Academics' },
  { id: 'academics.subjects', label: 'Subjects', path: '/setup/subjects', section: 'Academics' },
  { id: 'academics.timetable', label: 'Timetable', path: '/academics/timetable', section: 'Academics' },
  { id: 'attendance', label: 'Attendance', path: '/attendance', section: 'Attendance' },
  { id: 'exams', label: 'Exams', path: '/exams', section: 'Exams' },
  { id: 'exams.marks', label: 'Marks status', path: '/exams/marks', section: 'Exams' },
  { id: 'fees', label: 'Fee structures', path: '/fees', section: 'Fees' },
  { id: 'fees.invoices', label: 'Invoices', path: '/fees/invoices', section: 'Fees' },
  { id: 'fees.collection', label: 'Collection', path: '/fees/collection', section: 'Fees' },
  { id: 'fees.daybook', label: 'Daybook', path: '/fees/daybook', section: 'Fees' },
  { id: 'comms.circulars', label: 'Circulars', path: '/comms/circulars', section: 'Communication' },
  { id: 'transport', label: 'Routes', path: '/transport', section: 'Transport' },
  { id: 'safety.visitors', label: 'Visitors', path: '/safety/visitors', section: 'Safety' },
  { id: 'library', label: 'Library', path: '/library', section: 'Library' },
  { id: 'compliance', label: 'Compliance', path: '/compliance', section: 'Compliance' },
  { id: 'settings', label: 'Settings', path: '/settings', section: 'Settings' },
];

export function navForManifest(manifest: string[]): NavItem[] {
  if (manifest.length === 0) {
    // Empty manifest = show dashboard only (never "everything").
    return NAV_REGISTRY.filter((n) => n.id === 'dashboard');
  }
  const set = new Set(manifest);
  // Always include dashboard when any nav is present.
  const items = NAV_REGISTRY.filter(
    (n) => n.id === 'dashboard' || set.has(n.id) || [...set].some((m) => n.id.startsWith(`${m}.`) || m.startsWith(`${n.id}.`)),
  );
  return items.length > 0 ? items : NAV_REGISTRY.filter((n) => n.id === 'dashboard');
}

export function groupNav(items: NavItem[]): { section: string; items: NavItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) {
      map.set(item.section, []);
      order.push(item.section);
    }
    map.get(item.section)!.push(item);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}
