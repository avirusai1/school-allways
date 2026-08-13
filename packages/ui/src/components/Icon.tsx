import type { ComponentType, SVGProps } from 'react';

/**
 * Phosphor Icons wrapper — build/11 §8.
 * regular weight only; sizes locked to the three allowed values.
 * Colour always comes from adjacent text (currentColor).
 */

export type IconSize = 'inline' | 'standalone' | 'empty';

const SIZE_PX: Record<IconSize, number> = {
  inline: 20,
  standalone: 24,
  empty: 32,
};

export type PhosphorIcon = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
    color?: string;
  }
>;

export interface IconProps {
  icon: PhosphorIcon;
  size?: IconSize;
  className?: string;
  /** Decorative by default; set aria-label when the icon is the sole label. */
  'aria-label'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export function Icon({
  icon: Glyph,
  size = 'standalone',
  className = '',
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: IconProps) {
  const decorative = ariaLabel == null;
  return (
    <Glyph
      weight="regular"
      size={SIZE_PX[size]}
      color="currentColor"
      className={['shrink-0', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-hidden={decorative ? true : ariaHidden}
    />
  );
}
