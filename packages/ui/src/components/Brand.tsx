export interface BrandProps {
  /** session.tenant.logoUrl — a school's uploaded logo, or null/undefined. */
  logoUrl?: string | null;
  /** Shown as alt text, and used in the platform-default fallback's alt text. */
  name?: string;
  /**
   * 'compact' for shell headers/sidebars, 'large' for login/standalone
   * screens with room to breathe. A single height class is always chosen
   * here rather than left to `className` override, because two conflicting
   * Tailwind height utilities in one class string do not reliably resolve by
   * source order — Tailwind's generated stylesheet order isn't the same as
   * string-concatenation order.
   */
  size?: 'compact' | 'large';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<BrandProps['size']>, string> = {
  compact: 'h-8',
  large: 'h-16',
};

/**
 * The wordmark shown in every app shell.
 *
 * A school's own logo (tenant.logoUrl — in the schema and returned on session
 * since day one, but never rendered anywhere but a couple of avatar spots)
 * takes priority. With no school logo set, this falls back to the platform's
 * own mark (public/brand/logo.png, identical asset in each web app) rather
 * than a plain text string — every shell reads through this one component,
 * so a school's upload replaces it everywhere at once.
 */
export function Brand({ logoUrl, name, size = 'compact', className = '' }: BrandProps) {
  // BASE_URL is each app's own Vite `base` ('/admin/', '/family/', '/control/')
  // — @saw/ui ships as raw source, so this resolves per consuming app, not
  // per this shared package. Typed via a cast rather than `vite/client`
  // ambient types, since this package has no Vite dependency of its own.
  const base =
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const defaultLogo = `${base}brand/logo.png`;
  return (
    <img
      src={logoUrl || defaultLogo}
      alt={logoUrl ? (name ? `${name} logo` : 'School logo') : 'School Allways'}
      className={`${SIZE_CLASS[size]} w-auto max-w-[220px] object-contain ${className}`}
    />
  );
}
