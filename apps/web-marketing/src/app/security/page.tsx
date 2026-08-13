import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Security & DPDP' };

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-3xl font-semibold text-grey-900">Security & DPDP</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-grey-600">
        Under-18 students are children under the DPDP Act. We do not ship behavioural analytics or
        advertising SDKs. Restricted counselling and safety notes require an extra grant and write
        an access log on every read.
      </p>
      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-grey-700">
        <section>
          <h2 className="text-[17px] font-semibold text-blue-700">
            We cannot see your student data
          </h2>
          <p className="mt-2">
            The platform control console reads only aggregate rollup tables. It is structurally
            incapable of querying students, marks, invoices, or messages. That is a commercial
            promise with a CI grep behind it.
          </p>
        </section>
        <section>
          <h2 className="text-[17px] font-semibold text-blue-700">Tenant isolation</h2>
          <p className="mt-2">
            Every school query runs through a tenant-scoped database session. The tenant id comes
            from the verified JWT — never from a header you can spoof.
          </p>
        </section>
        <section>
          <h2 className="text-[17px] font-semibold text-blue-700">Portability</h2>
          <p className="mt-2">
            One-button full export, open formats, time-limited signed URL. Making it easy to leave
            is what makes schools willing to arrive.
          </p>
        </section>
      </div>
    </main>
  );
}
