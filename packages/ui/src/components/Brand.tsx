export interface BrandProps {
  /** session.tenant.logoUrl — a school's uploaded logo, or null/undefined. */
  logoUrl?: string | null;
  /** Shown as alt text, and as the visible label in compact mode. */
  name?: string;
  /**
   * 'compact' for shell headers/sidebars — a narrow, height-constrained row.
   * 'large' for login/standalone screens with room to breathe.
   *
   * The platform default asset is a SQUARE, vertically-stacked icon+wordmark
   * (an app-icon lockup). Shrinking that whole square into a 32px-tall
   * sidebar row made the wordmark illegible — a stacked lockup forced into a
   * short, wide space never reads well at any size. Compact mode instead
   * pairs a tightly-cropped icon-only mark with real HTML text, which is how
   * this shape is meant to sit in a horizontal header. Large mode shows the
   * full lockup, which is the right shape for a page with vertical room.
   *
   * A school's OWN uploaded logo (logoUrl set) is rendered as-is in both
   * modes, at a size appropriate to the context — we don't know its internal
   * composition, so no cropping is applied to it.
   */
  size?: 'compact' | 'large';
  className?: string;
}

function base(): string {
  return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
}

/**
 * The wordmark shown in every app shell.
 *
 * A school's own logo takes priority. With none set, this falls back to the
 * platform's own mark rather than a plain text string — every shell reads
 * through this one component, so a school's upload replaces it everywhere.
 */
export function Brand({ logoUrl, name, size = 'compact', className = '' }: BrandProps) {
  if (logoUrl) {
    const heightClass = size === 'large' ? 'h-16' : 'h-8';
    return (
      <img
        src={logoUrl}
        alt={name ? `${name} logo` : 'School logo'}
        className={`${heightClass} w-auto max-w-[220px] object-contain ${className}`}
      />
    );
  }

  if (size === 'large') {
    return (
      <img
        src={`${base()}brand/logo.png`}
        alt="School Allways"
        className={`h-16 w-auto max-w-[220px] object-contain ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src={`${base()}brand/icon-mark.png`} alt="" className="h-7 w-auto shrink-0" />
      <span className="truncate text-[15px] font-semibold text-blue-700">School Allways</span>
    </span>
  );
}
