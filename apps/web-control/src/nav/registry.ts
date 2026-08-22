/**
 * Server-driven navigation for the platform console.
 *
 * Same contract the admin and family apps use: the session carries
 * `navManifest` and `homeScreen`, resolved from the role. This app previously
 * hardcoded one nav list and always landed on the fleet dashboard, so a Support
 * Agent — whose role declares `homeScreen: 'support_queue'` and a four-item
 * manifest — was dropped on the super-admin's fleet view and shown Billing,
 * Announcements and Referrals that their role never granted.
 *
 * Keys MUST match the manifest keys in db/seeds/roles.ts.
 */
export type ControlNavItem = {
  key: string;
  path: string;
  label: string;
  end?: boolean;
};

export const CONTROL_NAV_REGISTRY: ControlNavItem[] = [
  { key: 'control_home', path: '/', label: 'Fleet', end: true },
  { key: 'tenants', path: '/schools', label: 'Schools' },
  { key: 'activation', path: '/funnel', label: 'Funnel' },
  { key: 'flags', path: '/flags', label: 'Flags' },
  { key: 'billing', path: '/billing', label: 'Billing' },
  { key: 'support_queue', path: '/support', label: 'Support' },
  // A support agent reaches impersonation from the support queue; both keys
  // resolve to the same screen rather than being dropped.
  { key: 'support', path: '/support', label: 'Support' },
  { key: 'impersonate', path: '/support', label: 'Support' },
  { key: 'helpdesk', path: '/helpdesk', label: 'Helpdesk' },
];

/** Manifest key → the route a role should land on. */
export function controlHomePath(homeScreen: string | null | undefined): string {
  const found = CONTROL_NAV_REGISTRY.find((n) => n.key === homeScreen);
  return found?.path ?? '/';
}

export function controlNavFor(manifest: string[]): ControlNavItem[] {
  const seen = new Set<string>();
  const items: ControlNavItem[] = [];
  for (const key of manifest) {
    const found = CONTROL_NAV_REGISTRY.find((n) => n.key === key);
    // Unknown key from a newer server: skip rather than crash an older client.
    if (!found || seen.has(found.path)) continue;
    seen.add(found.path);
    items.push(found);
  }
  // Never leave the console with no navigation at all.
  if (items.length === 0) return [CONTROL_NAV_REGISTRY[0]!];
  return items;
}
