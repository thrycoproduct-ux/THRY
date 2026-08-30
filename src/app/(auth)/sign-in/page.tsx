import { type Metadata } from "next";
import Link from "next/link";

import { AuthOrDivider } from "@/features/auth/components/AuthOrDivider";
import OAuthLoginButtons from "@/features/auth/components/OAuthLoginButtons";
import { SigninForm } from "@/features/auth";
import { Button } from "@/components/ui/button";

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
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Continue with Google, or use email
          </p>
        </div>
      </div>

      <OAuthLoginButtons nextPath={nextPath} />

      <AuthOrDivider />

      <SigninForm
        initialEmail={params.email}
        nextPath={nextPath}
        error={params.error}
      />

      <div className="flex flex-col gap-3 border-t border-primary/10 pt-4">
        <Button asChild variant="outline" className="h-11 w-full text-base">
          <Link href={signUpHref}>Create account</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground sm:text-left">
          New to THRY? Create an account in a minute — checkout can stay guest
          if you prefer.
        </p>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={signUpHref}
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
