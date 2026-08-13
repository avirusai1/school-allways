import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'APAAR compliance' };

export default function ApaarPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-amber-700">
        Free tool
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-grey-900">
        APAAR worklist for every school
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-grey-600">
        An externally imposed deadline. Urgency that gets your roster clean — and introduces School
        All Ways without a sales call. Upload, match, track gaps, export for UDISE.
      </p>
      <ul className="mt-8 space-y-3 text-[15px] text-grey-700">
        <li>· Gap list by class and section</li>
        <li>· Guardian contact chase from the parent portal</li>
        <li>· Export that does not lock you in</li>
      </ul>
      <Link
        href="/signup/"
        className="mt-10 inline-flex h-12 items-center rounded-md bg-amber-500 px-5 text-[15px] font-semibold text-grey-900 hover:bg-amber-600"
      >
        Get the free APAAR tool
      </Link>
    </main>
  );
}
