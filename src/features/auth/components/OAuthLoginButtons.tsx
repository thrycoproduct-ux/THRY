"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildOAuthCallbackUrl } from "@/lib/auth/callback";
import { resolveOAuthBrowserOrigin } from "@/lib/auth/site-urls";

import { Icons } from "@/components/layouts/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type OAuthLoginButtonsProps = {
  nextPath?: string;
};

function OAuthLoginButtons({ nextPath }: OAuthLoginButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const signWithGoogle = async () => {
    setIsLoading(true);

    // Stay on the same host the shopper opened (www vs apex). Forcing
    // canonical origin here breaks PKCE after Google redirects back.
    const origin = resolveOAuthBrowserOrigin(window.location.origin);
    const redirectTo = buildOAuthCallbackUrl(origin, nextPath || "/");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: false,
        queryParams: {
          // One-tap style account picker; skip if already consented.
          prompt: "select_account",
          access_type: "online",
        },
      },
    });

    if (error) {
      console.error("[auth] Google OAuth start failed:", error.message);
      const message = /provider is not enabled|unsupported provider/i.test(
        error.message,
      )
        ? "Google sign-in is not enabled yet. Please use email and password, or try again shortly."
        : "Google sign-in failed. Please try again.";
      toast({ title: "Sign-in", description: message, variant: "destructive" });
      router.push(
        `/sign-in?error=${encodeURIComponent(message)}${
          nextPath ? `&from=${encodeURIComponent(nextPath)}` : ""
        }`,
      );
      setIsLoading(false);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    toast({
      title: "Sign-in",
      description: "Google sign-in could not start. Please try again.",
      variant: "destructive",
    });
    setIsLoading(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/[0.05] p-4",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]",
      )}
    >
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-12 w-full border-border/80 bg-background text-base font-semibold shadow-sm",
          "transition-colors hover:border-primary/30 hover:bg-background hover:shadow-md",
          "focus-visible:ring-primary/30",
        )}
        onClick={signWithGoogle}
        disabled={isLoading}
        aria-label="Continue with Google"
      >
        {isLoading ? (
          <Spinner className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Icons.google className="mr-2 h-4 w-4 shrink-0" />
        )}
        Continue with Google
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Fastest — no password needed
      </p>
    </div>
  );
}

export default OAuthLoginButtons;
