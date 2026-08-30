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

  const signUpParams = new URLSearchParams();
  if (params.email) signUpParams.set("email", params.email);
  if (nextPath) signUpParams.set("from", nextPath);
  const signUpHref = signUpParams.toString()
    ? `/sign-up?${signUpParams.toString()}`
    : "/sign-up";

  return (
    <section className="space-y-5">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-left">
        Sign in
      </h1>

      <OAuthLoginButtons nextPath={nextPath} />

      <AuthOrDivider />

      <SigninForm
        initialEmail={params.email}
        nextPath={nextPath}
        error={params.error}
      />

      <div className="space-y-2 border-t border-primary/10 pt-4 text-sm">
        <p className="text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={signUpHref}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Create account
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
