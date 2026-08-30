"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Icons } from "@/components/layouts/icons";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { safeAuthErrorMessage } from "@/lib/auth/safe-auth-errors";
import { resetPasswordSchema } from "@/features/auth/validations";
import { PasswordInput } from "./PasswordInput";

type FormData = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState<boolean | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    let cancelled = false;

    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setSessionReady(false);
        return;
      }
      setSessionReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit({ password }: FormData) {
    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Could not update password",
        description: safeAuthErrorMessage(
          error,
          "Could not update password. Please try again.",
        ),
      });
      return;
    }

    toast({
      title: "Password updated",
      description: "You can now sign in with your new password.",
    });
    router.push("/sign-in");
    router.refresh();
  }

  if (sessionReady === null) {
    return (
      <div
        className="h-32 w-full animate-pulse rounded-lg bg-muted"
        aria-hidden
      />
    );
  }

  if (sessionReady === false) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          This reset link is invalid or has expired. Request a new link — reset
          links expire within one hour.
        </p>
        <Button asChild variant="outline" className="w-full">
          <a href="/forgot-password">Request new reset link</a>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        onSubmit={(...args) => void form.handleSubmit(onSubmit)(...args)}
      >
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput placeholder="**********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput placeholder="**********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          disabled={isLoading}
          className="w-full bg-primary hover:bg-brand-rose"
        >
          {isLoading && (
            <Icons.spinner
              className="mr-2 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          )}
          Update password
        </Button>
      </form>
    </Form>
  );
}

export default ResetPasswordForm;
