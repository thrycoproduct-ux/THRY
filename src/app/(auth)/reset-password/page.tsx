import { type Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | THRY",
  description: "Choose a new password for your account",
};

export default function ResetPasswordPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Reset password
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
        }
      >
        <ResetPasswordForm />
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
