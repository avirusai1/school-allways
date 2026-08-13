import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-blue-700">Pricing</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-grey-900">Free for schools.</h1>
      <p className="mt-4 max-w-2xl text-[16px] text-grey-600">
        Every feature is included for every school. No per-school plan, no module gating, no
        student-count cap.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="border border-grey-200 bg-grey-0 p-6">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-blue-700">
            Parents
          </div>
          <div className="mt-3 font-display text-2xl font-semibold text-grey-900">
            ₹1 per day per student
          </div>
          <p className="mt-2 text-[14px] text-grey-600">
            ₹365 per student per academic session, GST included. Charged per child, not per family.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-grey-700">
            <li>· Homework, results, fees, leave, bus, books</li>
            <li>· Today&apos;s attendance is always visible</li>
            <li>· Payment in the mobile app (coming soon)</li>
          </ul>
        </div>
        <div className="border border-grey-200 bg-grey-0 p-6">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-blue-700">
            Schools
          </div>
          <div className="mt-3 font-display text-2xl font-semibold text-grey-900">
            ₹500 + GST / year
          </div>
          <p className="mt-2 text-[14px] text-grey-600">
            Stay Connected Fee. A reminder if unpaid — nothing is blocked. The platform stays free.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-grey-700">
            <li>· Full product for every school</li>
            <li>· Cash collected at the office can be activated by the school</li>
            <li>· We invoice the school for those activations</li>
          </ul>
        </div>
      </div>

      <p className="mt-10 text-[13px] text-grey-500">
        Money in the product is always integer paise. GST on parent Play purchases in India is
        handled by Google.
      </p>
      <Link
        href="/signup/"
        className="mt-6 inline-flex h-12 items-center rounded-md bg-amber-500 px-5 text-[15px] font-semibold text-grey-900 hover:bg-amber-600"
      >
        Get started free
      </Link>
    </main>
  );
}
