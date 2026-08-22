export type ResendConfig = {
  apiKey: string;
  fromEmail: string;
};

/** Resend is optional — skipped when RESEND_API_KEY is unset. */
export function getResendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "THRY <orders@thryco.com>";

  return { apiKey, fromEmail };
}
