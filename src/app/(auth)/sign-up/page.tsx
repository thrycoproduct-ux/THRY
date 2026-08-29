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
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Create account
          </h1>
          <p className="text-sm text-muted-foreground">
            One tap with Google, or use email — for orders and wishlist
          </p>
        </div>
      </div>

      <OAuthLoginButtons nextPath={params.from} />

      <AuthOrDivider />

      <SignupForm initialEmail={params.email} from={params.from} />

      <div className="flex flex-col gap-3 border-t border-primary/10 pt-4 text-sm">
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
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
