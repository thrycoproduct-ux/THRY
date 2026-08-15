import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Forgot Password | THRY",
  description: "Reset your THRY account password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createClient({ cookieStore });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Forgot password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a reset link. Links expire
            within one hour.
          </p>
          {resolvedSearchParams?.error ? (
            <p className="text-sm text-destructive">
              {resolvedSearchParams.error}
            </p>
          ) : null}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
        }
      >
        <ForgotPasswordForm />
      </Suspense>

      <div className="border-t border-primary/10 pt-4 text-sm">
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </section>
  );
}
