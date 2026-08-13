/**
 * Deep-link route stamped on every FCM `data` payload so a tap opens the
 * right screen. Absentee alerts always land on attendance — that view is in
 * the unpaid parent's free tier, and bouncing them to a paywall would be
 * the worst possible moment to ask for money.
 */
export function routeForTemplate(templateCode: string): string {
  if (templateCode === 'STUDENT_ABSENT') return '/attendance';
  if (templateCode === 'ANNOUNCEMENT') return '/notices';
  return '/home';
}
