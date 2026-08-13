import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      {/* Hero — brand + one line + amber CTA + product plane. No cards, no purple. */}
      <section className="relative overflow-hidden bg-grey-25">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-16 md:grid-cols-2 md:items-end md:pt-24">
          <div>
            <p className="font-display text-4xl font-semibold tracking-tight text-blue-700 md:text-5xl">
              School All Ways
            </p>
            <h1 className="mt-4 max-w-md text-xl font-medium leading-snug text-grey-800 md:text-2xl">
              The school OS Indian principals actually finish setting up.
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-grey-600">
              Attendance, fees, exams, and APAAR — offline-first apps, transparent pricing, and a
              control plane that physically cannot open student records.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup/"
                className="inline-flex h-12 items-center rounded-md bg-amber-500 px-5 text-[15px] font-semibold text-grey-900 transition hover:bg-amber-600"
              >
                Start free
              </Link>
              <Link
                href="/apaar/"
                className="inline-flex h-12 items-center rounded-md border border-grey-300 bg-grey-0 px-5 text-[15px] font-semibold text-grey-900 hover:bg-grey-50"
              >
                Free APAAR tool
              </Link>
            </div>
          </div>
          <div
            className="relative min-h-[280px] border border-grey-200 bg-grey-0 shadow-[0_24px_48px_-24px_rgba(14,47,79,0.25)] md:min-h-[340px]"
            aria-hidden
          >
            <div className="flex h-9 items-center gap-1.5 border-b border-grey-100 px-3">
              <span className="h-2.5 w-2.5 rounded-full bg-grey-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-grey-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-grey-200" />
              <span className="ml-3 text-[11px] text-grey-400">admin.school.techallways.com</span>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-0">
              <div className="min-h-[240px] border-r border-grey-100 bg-grey-50 p-3">
                <div className="h-2 w-20 bg-blue-200" />
                <div className="mt-4 space-y-2">
                  {['Dashboard', 'Students', 'Fees', 'Attendance'].map((l) => (
                    <div key={l} className="h-7 rounded-sm bg-grey-0 px-2 text-[11px] leading-7 text-grey-600">
                      {l}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[12px] font-semibold text-grey-800">Students</div>
                <div className="mt-3 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-8 items-center gap-2 border-b border-grey-100">
                      <span className="h-6 w-6 rounded-full bg-blue-100" />
                      <span className="h-2 flex-1 bg-grey-100" />
                      <span className="h-2 w-12 bg-grey-100" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-grey-100 bg-grey-0">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="font-display text-2xl font-semibold text-grey-900">
            Every feature, for every school
          </h2>
          <p className="mt-2 max-w-xl text-[15px] text-grey-600">
            The platform is free for schools. No module gating, no per-student school fee. Parents
            subscribe per child; you keep the full product.
          </p>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                t: 'Daily attendance',
                d: 'Teachers mark offline; parents see it the moment the phone reconnects.',
              },
              {
                t: 'Parent portal',
                d: 'Web + app — because many parents will never install another APK.',
              },
              {
                t: 'APAAR worklist',
                d: 'Deadline-driven compliance that also gets your roster clean.',
              },
            ].map((f) => (
              <li key={f.t}>
                <h3 className="text-[16px] font-semibold text-blue-700">{f.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-grey-600">{f.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-grey-100 bg-grey-25">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-4 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold text-grey-900">
              Free for schools
            </h2>
            <p className="mt-2 max-w-md text-[15px] text-grey-600">
              ₹1 per day per student, paid by parents. ₹500 + GST a year Stay Connected Fee for the
              school — a reminder if unpaid, never a lock.
            </p>
          </div>
          <Link
            href="/pricing/"
            className="inline-flex h-12 items-center rounded-md bg-amber-500 px-5 text-[15px] font-semibold text-grey-900 hover:bg-amber-600"
          >
            See pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
