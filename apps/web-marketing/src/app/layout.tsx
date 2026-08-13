import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'School All Ways',
    template: '%s · School All Ways',
  },
  description:
    'School management for Indian K–12 — attendance, fees, exams, APAAR — with DPDP-first privacy.',
};

const NAV = [
  { href: '/pricing/', label: 'Pricing' },
  { href: '/apaar/', label: 'APAAR' },
  { href: '/security/', label: 'Security' },
  { href: '/signup/', label: 'Start free' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="border-b border-grey-100 bg-grey-25/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-[15px] font-semibold tracking-tight text-blue-700">
              School All Ways
            </Link>
            <nav className="flex items-center gap-4 text-[13px] font-medium text-grey-700">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={
                    n.href === '/signup/'
                      ? 'rounded-sm bg-amber-500 px-3 py-1.5 text-grey-900 hover:bg-amber-600'
                      : 'hover:text-blue-700'
                  }
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-grey-100 bg-grey-0">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-[13px] text-grey-600 md:flex-row md:justify-between">
            <span>© {new Date().getFullYear()} Tech All Ways · School All Ways</span>
            <div className="flex gap-4">
              <Link href="/security/">Security & DPDP</Link>
              <Link href="/pricing/">Pricing</Link>
              <a href="https://app.school.techallways.com">Parent portal</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
