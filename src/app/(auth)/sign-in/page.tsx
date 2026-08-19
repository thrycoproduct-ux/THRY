import { type Metadata } from "next";
import Link from "next/link";

import { AuthOrDivider } from "@/features/auth/components/AuthOrDivider";
import OAuthLoginButtons from "@/features/auth/components/OAuthLoginButtons";
import { SigninForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign In | THRY",
  description: "Sign in to your THRY account",
};

type SignInPageProps = {
  searchParams?: Promise<{
    from?: string;
    next?: string;
    redirect?: string;
    error?: string;
    email?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = searchParams ? await searchParams : {};
  const nextPath = params.from || params.next || params.redirect;

  return (
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">Welcome back to THRY</p>
        </div>
      </div>

      <OAuthLoginButtons nextPath={nextPath} />

      <AuthOrDivider />

      <SigninForm
        initialEmail={params.email}
        nextPath={nextPath}
        error={params.error}
      />

      <div className="flex flex-col gap-3 border-t border-primary/10 pt-4 text-sm">
        <p className="text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create account
          </Link>
        </p>
        <Link
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Continue shopping
        </Link>
      </div>
    </section>
  );
}
