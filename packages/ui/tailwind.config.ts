import type { Config } from 'tailwindcss';

/**
 * Identical tokens to packages/flutter/design_system (build/11).
 * Colours are referenced as space-separated RGB so Tailwind /opacity works:
 *   bg-primary-500/10 → rgb(var(--color-primary-500) / 0.1)
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../apps/web-*/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50: 'rgb(var(--color-blue-50) / <alpha-value>)',
          100: 'rgb(var(--color-blue-100) / <alpha-value>)',
          200: 'rgb(var(--color-blue-200) / <alpha-value>)',
          300: 'rgb(var(--color-blue-300) / <alpha-value>)',
          400: 'rgb(var(--color-blue-400) / <alpha-value>)',
          500: 'rgb(var(--color-blue-500) / <alpha-value>)',
          600: 'rgb(var(--color-blue-600) / <alpha-value>)',
          700: 'rgb(var(--color-blue-700) / <alpha-value>)',
          800: 'rgb(var(--color-blue-800) / <alpha-value>)',
          900: 'rgb(var(--color-blue-900) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--color-amber-50) / <alpha-value>)',
          100: 'rgb(var(--color-amber-100) / <alpha-value>)',
          200: 'rgb(var(--color-amber-200) / <alpha-value>)',
          300: 'rgb(var(--color-amber-300) / <alpha-value>)',
          400: 'rgb(var(--color-amber-400) / <alpha-value>)',
          500: 'rgb(var(--color-amber-500) / <alpha-value>)',
          600: 'rgb(var(--color-amber-600) / <alpha-value>)',
          700: 'rgb(var(--color-amber-700) / <alpha-value>)',
        },
        grey: {
          0: 'rgb(var(--color-grey-0) / <alpha-value>)',
          25: 'rgb(var(--color-grey-25) / <alpha-value>)',
          50: 'rgb(var(--color-grey-50) / <alpha-value>)',
          100: 'rgb(var(--color-grey-100) / <alpha-value>)',
          200: 'rgb(var(--color-grey-200) / <alpha-value>)',
          300: 'rgb(var(--color-grey-300) / <alpha-value>)',
          400: 'rgb(var(--color-grey-400) / <alpha-value>)',
          500: 'rgb(var(--color-grey-500) / <alpha-value>)',
          600: 'rgb(var(--color-grey-600) / <alpha-value>)',
          700: 'rgb(var(--color-grey-700) / <alpha-value>)',
          800: 'rgb(var(--color-grey-800) / <alpha-value>)',
          900: 'rgb(var(--color-grey-900) / <alpha-value>)',
        },
        green: {
          50: 'rgb(var(--color-green-50) / <alpha-value>)',
          500: 'rgb(var(--color-green-500) / <alpha-value>)',
          700: 'rgb(var(--color-green-700) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--color-red-50) / <alpha-value>)',
          500: 'rgb(var(--color-red-500) / <alpha-value>)',
          700: 'rgb(var(--color-red-700) / <alpha-value>)',
        },
        orange: {
          50: 'rgb(var(--color-orange-50) / <alpha-value>)',
          500: 'rgb(var(--color-orange-500) / <alpha-value>)',
          700: 'rgb(var(--color-orange-700) / <alpha-value>)',
        },
        cyan: {
          50: 'rgb(var(--color-cyan-50) / <alpha-value>)',
          500: 'rgb(var(--color-cyan-500) / <alpha-value>)',
          700: 'rgb(var(--color-cyan-700) / <alpha-value>)',
        },
        primary: {
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
        },
        // —— M3 role tokens ——
        'primary-container': 'rgb(var(--color-primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--color-on-primary-container) / <alpha-value>)',
        'secondary-container': 'rgb(var(--color-secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--color-on-secondary-container) / <alpha-value>)',
        tertiary: 'rgb(var(--color-tertiary) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--color-on-tertiary) / <alpha-value>)',
        'tertiary-container': 'rgb(var(--color-tertiary-container) / <alpha-value>)',
        'on-tertiary-container': 'rgb(var(--color-on-tertiary-container) / <alpha-value>)',
        'error-container': 'rgb(var(--color-error-container) / <alpha-value>)',
        'on-error-container': 'rgb(var(--color-on-error-container) / <alpha-value>)',
        'surface-dim': 'rgb(var(--color-surface-dim) / <alpha-value>)',
        'surface-bright': 'rgb(var(--color-surface-bright) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--color-surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--color-surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--color-surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--color-surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--color-surface-container-highest) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--color-on-surface-variant) / <alpha-value>)',
        outline: 'rgb(var(--color-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--color-outline-variant) / <alpha-value>)',
        'inverse-surface': 'rgb(var(--color-inverse-surface) / <alpha-value>)',
        'inverse-on-surface': 'rgb(var(--color-inverse-on-surface) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--color-inverse-primary) / <alpha-value>)',
        scrim: 'rgb(var(--color-scrim) / <alpha-value>)',
      },
      spacing: {
        0: '0px',
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },
      // M3 canonical shape scale — sm/md retuned from 6/10 to M3's 8/12;
      // xl (28) is new, used by dialogs and sheets.
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '28px',
        full: '999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(22, 32, 43, 0.06)',
        md: '0 4px 12px rgba(22, 32, 43, 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '34px', fontWeight: '700', letterSpacing: '-0.4px' }],
        h1: ['22px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.3px' }],
        h2: ['18px', { lineHeight: '24px', fontWeight: '600', letterSpacing: '-0.2px' }],
        h3: ['16px', { lineHeight: '22px', fontWeight: '600', letterSpacing: '-0.1px' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-medium': ['15px', { lineHeight: '22px', fontWeight: '500' }],
        'body-small': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        label: ['13px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.1px' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.2px' }],
        overline: ['11px', { lineHeight: '14px', fontWeight: '600', letterSpacing: '0.8px' }],
        numeric: ['15px', { lineHeight: '22px', fontWeight: '500' }],
        'numeric-large': ['24px', { lineHeight: '30px', fontWeight: '600', letterSpacing: '-0.2px' }],
      },
      transitionDuration: {
        instant: '100ms',
        fast: '160ms',
        base: '220ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        decelerate: 'cubic-bezier(0, 0, 0, 1)',
        accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
