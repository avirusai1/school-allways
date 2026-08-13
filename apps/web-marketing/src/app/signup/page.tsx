import type { Metadata } from 'next';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Sign up' };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-3xl font-semibold text-grey-900">Start free</h1>
      <p className="mt-3 text-[15px] text-grey-600">
        Create your school in two minutes. You will be taken straight into setup — classes,
        students and your first attendance register.
      </p>
      <SignupForm />
    </main>
  );
}
