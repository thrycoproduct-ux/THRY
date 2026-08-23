/**
 * Razorpay webhook secret validation.
 *
 * Razorpay Dashboard → Webhooks shows a secret string you choose/copy when
 * creating the webhook. It is NOT:
 * - the API Key Secret
 * - the webhook URL
 * - a Razorpay dashboard deep-link
 */
export function isLikelyRazorpayWebhookSecret(value: string): boolean {
  const secret = String(value ?? "").trim();
  if (!secret) return false;
  if (secret.length < 8) return false;
  if (/^https?:\/\//i.test(secret)) return false;
  if (/dashboard\.razorpay\.com/i.test(secret)) return false;
  if (/\/webhooks\//i.test(secret)) return false;
  if (/\s/.test(secret)) return false;
  return true;
}

export function razorpayWebhookSecretValidationMessage(
  value: string,
): string | null {
  const secret = String(value ?? "").trim();
  if (!secret) return null;
  if (isLikelyRazorpayWebhookSecret(secret)) return null;
  if (/^https?:\/\//i.test(secret) || /dashboard\.razorpay\.com/i.test(secret)) {
    return "Webhook Secret must be the secret string from Razorpay Webhooks — not the dashboard URL.";
  }
  if (secret.length < 8) {
    return "Webhook Secret looks too short. Paste the secret from Razorpay Dashboard → Webhooks.";
  }
  return "Webhook Secret is invalid. Use the secret string from Razorpay Dashboard → Webhooks.";
}
