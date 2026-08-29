import Link from "next/link";

export function CheckoutTermsNotice() {
  return (
    <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
      By continuing to payment, you agree to our{" "}
      <Link
        href="/terms-and-conditions"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        Terms &amp; Conditions
      </Link>
      ,{" "}
      <Link
        href="/terms-and-conditions#terms-of-use"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        Terms of Use
      </Link>
      , and{" "}
      <Link
        href="/privacy-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}

export default CheckoutTermsNotice;
