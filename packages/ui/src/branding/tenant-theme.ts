/**
 * Runtime white-label theming.
 *
 * `--color-primary-500` has existed as a CSS custom property since the
 * original tokens.css, with a comment saying "a school overrides
 * --color-primary-500 at runtime for white-label" — but nothing ever set it,
 * and almost nothing in the app reads that variable anyway: every screen is
 * built on `bg-blue-500`, `text-blue-700`, `border-blue-200`, the full
 * numbered ramp, not the single primary alias. Setting one variable would
 * have changed nothing visible.
 *
 * This regenerates the WHOLE blue-50..900 ramp from a tenant's chosen hex
 * color, using the same OKLCH tone-stepping approach the M3 palette used —
 * same reasoning: a perceptually-uniform color space keeps hue and chroma
 * consistent across every stop instead of picking each one by eye. Flutter
 * already does the equivalent (`ColorScheme.fromSeed` inside `AppTheme.build`)
 * — this is what makes web match it.
 */

const RAMP_LIGHTNESS: Record<string, number> = {
  '50': 0.971, '100': 0.926, '200': 0.838, '300': 0.719, '400': 0.592,
  '500': 0.470, '600': 0.417, '700': 0.358, '800': 0.299, '900': 0.243,
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
}

function rgbToOklab(r: number, g: number, b: number) {
  const [rl, gl, bl] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const [l_, m_, s_] = [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)];
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb)];
}

/** Every stop of a numbered ramp, as space-separated RGB triples for Tailwind. */
export function tonalRamp(hex: string): Record<string, string> | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { a, b } = rgbToOklab(...rgb);
  const C = Math.hypot(a, b);
  const H = Math.atan2(b, a);

  const out: Record<string, string> = {};
  for (const [stop, L] of Object.entries(RAMP_LIGHTNESS)) {
    const taper = 1 - Math.abs(L - 0.5) * 0.9;
    const c = C * Math.max(0, taper);
    const [r, g, bl] = oklabToRgb(L, c * Math.cos(H), c * Math.sin(H));
    out[stop] = `${r} ${g} ${bl}`;
  }
  return out;
}

const RAMP_STOPS = Object.keys(RAMP_LIGHTNESS);

/**
 * Applies (or clears) a tenant's white-label color to the document root.
 * Call once per session load / tenant change — cheap, synchronous, no
 * network request. Passing null/undefined restores the platform default.
 */
export function applyTenantBrand(primaryColor: string | null | undefined): void {
  const root = document.documentElement.style;
  const ramp = primaryColor ? tonalRamp(primaryColor) : null;

  if (!ramp) {
    for (const stop of RAMP_STOPS) root.removeProperty(`--color-blue-${stop}`);
    root.removeProperty('--color-primary-500');
    return;
  }
  for (const stop of RAMP_STOPS) root.setProperty(`--color-blue-${stop}`, ramp[stop]!);
  root.setProperty('--color-primary-500', ramp['500']!);
}
