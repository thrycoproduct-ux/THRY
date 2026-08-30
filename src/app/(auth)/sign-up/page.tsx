import { type Metadata } from "next";
import Link from "next/link";

import { AuthOrDivider } from "@/features/auth/components/AuthOrDivider";
import OAuthLoginButtons from "@/features/auth/components/OAuthLoginButtons";
import { SignupForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign Up | THRY",
  description: "Create your THRY account",
};

type SignUpPageProps = {
  searchParams?: Promise<{ email?: string; from?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <section className="space-y-5">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-left">
        Create account
      </h1>

      <OAuthLoginButtons nextPath={params.from} />

      <AuthOrDivider />

      <SignupForm initialEmail={params.email} from={params.from} />

      <div className="space-y-2 border-t border-primary/10 pt-4 text-sm">
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
        <Link
          href="/"
          className="inline-block font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Continue shopping
        </Link>
      </div>
    </section>
  );
}
