/**
 * Build a public read URL for tenant branding assets.
 * Full signed-URL storage comes in build/00 storage pattern; until then we
 * serve static paths under FILES_BASE_URL.
 */
export function publicFileUrl(filesBaseUrl: string, path: string | null): string | null {
  if (!path) return null;
  const base = filesBaseUrl.replace(/\/$/, '');
  const key = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/${key}`;
}
