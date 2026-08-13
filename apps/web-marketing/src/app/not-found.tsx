import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold text-grey-900">
        Page not found
      </h1>
      <p className="mt-3 text-[15px] text-grey-600">
        The page you were looking for has moved or never existed.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-md bg-amber-500 px-6 text-[15px] font-semibold text-grey-900 hover:bg-amber-600"
      >
        Go to the home page
      </Link>
    </main>
  );
}
