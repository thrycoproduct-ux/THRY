"use client";

import { ThemeProvider } from "next-themes";
import { SupabaseAuthProvider } from "./AuthProvider";
import { CheckoutChromeProvider } from "./CheckoutChromeProvider";
import UrqlProvider from "./UrqlProvider";

export default function CustomProvider({ children }: React.PropsWithChildren) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SupabaseAuthProvider>
        <CheckoutChromeProvider>
          <UrqlProvider>{children}</UrqlProvider>
        </CheckoutChromeProvider>
      </SupabaseAuthProvider>
    </ThemeProvider>
  );
}
