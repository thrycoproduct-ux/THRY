"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminLoadingState,
  LoadingButtonLabel,
} from "@/components/admin/AdminLoadingState";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import {
  CASHFREE_PRODUCTION_BASE_URL,
  CASHFREE_SANDBOX_BASE_URL,
  resolveCashfreeBaseUrl,
} from "@/lib/integrations/payment-settings";
import { getCanonicalSiteOrigin } from "@/lib/auth/site-urls";

function parseIntegrationSaveError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Save failed";

  try {
    const payload = JSON.parse(trimmed) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    // Plain-text error from the API.
  }

  return trimmed;
}

type ApiSettingRecord = {
  key: string;
  isEnabled: boolean;
  value: Record<string, unknown>;
} | null;

type IntegrationsPayload = {
  cashfree: ApiSettingRecord;
  phonepe: ApiSettingRecord;
  razorpay: ApiSettingRecord;
  whatsapp: ApiSettingRecord;
};

type FormState = {
  cashfree: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    apiVersion: string;
    environment: "sandbox" | "production";
  };
  razorpay: {
    enabled: boolean;
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    environment: "sandbox" | "production";
  };
  phonepe: {
    enabled: boolean;
    merchantId: string;
    saltKey: string;
    saltIndex: string;
    baseUrl: string;
    merchantUserIdPrefix: string;
  };
  whatsapp: {
    enabled: boolean;
    accessToken: string;
    phoneNumberId: string;
    templateName: string;
    templateLanguage: string;
    notifySeller: boolean;
    sellerMobiles: string;
  };
};

const DEFAULT_FORM: FormState = {
  cashfree: {
    enabled: false,
    clientId: "",
    clientSecret: "",
    baseUrl: "https://sandbox.cashfree.com/pg",
    apiVersion: "2025-01-01",
    environment: "sandbox",
  },
  razorpay: {
    enabled: false,
    keyId: "",
    keySecret: "",
    webhookSecret: "",
    environment: "sandbox",
  },
  phonepe: {
    enabled: false,
    merchantId: "",
    saltKey: "",
    saltIndex: "",
    baseUrl: "https://api.phonepe.com/apis/hermes",
    merchantUserIdPrefix: "USR",
  },
  whatsapp: {
    enabled: false,
    accessToken: "",
    phoneNumberId: "",
    templateName: "",
    templateLanguage: "en",
    notifySeller: false,
    sellerMobiles: "",
  },
};

export function ApiIntegrationsForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetchWithTimeout("/api/admin/integrations", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Could not load API settings");

        const payload = (await res.json()) as IntegrationsPayload;
        if (cancelled) return;

        const cashfreeValue = payload.cashfree?.value ?? {};
        const phonepeValue = payload.phonepe?.value ?? {};
        const razorpayValue = payload.razorpay?.value ?? {};
        const whatsappValue = payload.whatsapp?.value ?? {};

        const cashfreeEnabled = payload.cashfree?.isEnabled ?? false;
        const phonepeEnabled = payload.phonepe?.isEnabled ?? false;
        const razorpayEnabled = payload.razorpay?.isEnabled ?? false;
        const razorpayOn = razorpayEnabled;
        const cashfreeOn = !razorpayOn && cashfreeEnabled;
        const phonepeOn = !razorpayOn && !cashfreeOn && phonepeEnabled;

        setForm({
          cashfree: {
            enabled: cashfreeOn,
            clientId: String(cashfreeValue.clientId ?? ""),
            clientSecret: String(cashfreeValue.clientSecret ?? ""),
            baseUrl: resolveCashfreeBaseUrl({
              environment:
                String(cashfreeValue.environment ?? "sandbox").toLowerCase() ===
                "production"
                  ? "production"
                  : "sandbox",
              baseUrl: String(
                cashfreeValue.baseUrl ?? CASHFREE_SANDBOX_BASE_URL,
              ),
            }),
            apiVersion: String(cashfreeValue.apiVersion ?? "2025-01-01"),
            environment:
              String(cashfreeValue.environment ?? "sandbox").toLowerCase() ===
              "production"
                ? "production"
                : "sandbox",
          },
          razorpay: {
            enabled: razorpayOn,
            keyId: String(razorpayValue.keyId ?? ""),
            keySecret: String(razorpayValue.keySecret ?? ""),
            webhookSecret: String(razorpayValue.webhookSecret ?? ""),
            environment:
              String(razorpayValue.environment ?? "sandbox").toLowerCase() ===
              "production"
                ? "production"
                : "sandbox",
          },
          phonepe: {
            enabled: phonepeOn,
            merchantId: String(phonepeValue.merchantId ?? ""),
            saltKey: String(phonepeValue.saltKey ?? ""),
            saltIndex: String(phonepeValue.saltIndex ?? ""),
            baseUrl: String(
              phonepeValue.baseUrl ?? "https://api.phonepe.com/apis/hermes",
            ),
            merchantUserIdPrefix: String(
              phonepeValue.merchantUserIdPrefix ?? "USR",
            ),
          },
          whatsapp: {
            enabled: payload.whatsapp?.isEnabled ?? false,
            accessToken: String(whatsappValue.accessToken ?? ""),
            phoneNumberId: String(whatsappValue.phoneNumberId ?? ""),
            templateName: String(whatsappValue.templateName ?? ""),
            templateLanguage: String(whatsappValue.templateLanguage ?? "en"),
            notifySeller: Boolean(whatsappValue.notifySeller ?? false),
            sellerMobiles: String(whatsappValue.sellerMobiles ?? ""),
          },
        });
      } catch (error) {
        toast({
          title: "Could not load settings",
          description: error instanceof Error ? error.message : "Please retry",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const saveDisabled = useMemo(
    () => isSaving || isLoading,
    [isSaving, isLoading],
  );

  const updateCashfree = <K extends keyof FormState["cashfree"]>(
    key: K,
    value: FormState["cashfree"][K],
  ) => {
    setForm((prev) => {
      const nextCashfree = { ...prev.cashfree, [key]: value };
      if (key === "environment") {
        nextCashfree.baseUrl = resolveCashfreeBaseUrl({
          environment: value as FormState["cashfree"]["environment"],
          baseUrl: prev.cashfree.baseUrl,
        });
      }
      return {
        ...prev,
        cashfree: nextCashfree,
      };
    });
  };

  const updateRazorpay = <K extends keyof FormState["razorpay"]>(
    key: K,
    value: FormState["razorpay"][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      razorpay: { ...prev.razorpay, [key]: value },
    }));
  };

  const updatePhonePe = <K extends keyof FormState["phonepe"]>(
    key: K,
    value: FormState["phonepe"][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      phonepe: { ...prev.phonepe, [key]: value },
    }));
  };

  const updateWhatsApp = <K extends keyof FormState["whatsapp"]>(
    key: K,
    value: FormState["whatsapp"][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      whatsapp: { ...prev.whatsapp, [key]: value },
    }));
  };

  const activePaymentGateway = form.razorpay.enabled
    ? "razorpay"
    : form.cashfree.enabled
      ? "cashfree"
      : form.phonepe.enabled
        ? "phonepe"
        : null;

  const saveKey = async (
    key: "cashfree" | "phonepe" | "razorpay" | "whatsapp",
    body: Record<string, unknown>,
  ) =>
    fetchWithTimeout("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "Save failed");
        throw new Error(parseIntegrationSaveError(text));
      }
    });

  const onSave = async () => {
    setIsSaving(true);
    try {
      await saveKey("cashfree", {
        key: "cashfree",
        isEnabled: form.cashfree.enabled,
        value: {
          clientId: form.cashfree.clientId.trim(),
          clientSecret: form.cashfree.clientSecret.trim(),
          baseUrl: form.cashfree.baseUrl.trim(),
          apiVersion: form.cashfree.apiVersion.trim() || "2025-01-01",
          environment: form.cashfree.environment,
        },
      });

      await saveKey("razorpay", {
        key: "razorpay",
        isEnabled: form.razorpay.enabled,
        value: {
          keyId: form.razorpay.keyId.trim(),
          keySecret: form.razorpay.keySecret.trim(),
          webhookSecret: form.razorpay.webhookSecret.trim(),
          environment: form.razorpay.environment,
        },
      });

      await saveKey("phonepe", {
        key: "phonepe",
        isEnabled: form.phonepe.enabled,
        value: {
          merchantId: form.phonepe.merchantId.trim(),
          saltKey: form.phonepe.saltKey.trim(),
          saltIndex: form.phonepe.saltIndex.trim(),
          baseUrl: form.phonepe.baseUrl.trim(),
          merchantUserIdPrefix: form.phonepe.merchantUserIdPrefix.trim(),
        },
      });

      await saveKey("whatsapp", {
        key: "whatsapp",
        isEnabled: form.whatsapp.enabled,
        value: {
          accessToken: form.whatsapp.accessToken.trim(),
          phoneNumberId: form.whatsapp.phoneNumberId.trim(),
          templateName: form.whatsapp.templateName.trim(),
          templateLanguage: form.whatsapp.templateLanguage.trim() || "en",
          notifySeller: form.whatsapp.notifySeller,
          sellerMobiles: form.whatsapp.sellerMobiles.trim(),
        },
      });

      toast({
        title: "API settings saved",
        description:
          "Razorpay, Cashfree, PhonePe and WhatsApp credentials updated.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {isLoading ? (
        <AdminLoadingState message="Loading API settings..." />
      ) : null}
      <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          One checkout gateway at a time
        </p>
        <p className="mt-1">
          Enable Razorpay, Cashfree, or PhonePe — only one checkout gateway at a
          time. Paste Key ID and Key Secret from the Razorpay Dashboard.
        </p>
        {activePaymentGateway ? (
          <p className="mt-2 text-xs font-medium text-foreground">
            Active checkout gateway:{" "}
            {activePaymentGateway === "razorpay"
              ? "Razorpay"
              : activePaymentGateway === "cashfree"
                ? "Cashfree"
                : "PhonePe"}
          </p>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Razorpay Payment Gateway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Docs:{" "}
            <a
              className="text-primary underline underline-offset-2"
              href="https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Razorpay Standard Checkout
            </a>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.razorpay.enabled}
              disabled={form.cashfree.enabled || form.phonepe.enabled}
              onChange={(e) => updateRazorpay("enabled", e.target.checked)}
            />
            Enable Razorpay checkout
          </label>
          <p className="text-xs text-muted-foreground">
            {form.cashfree.enabled || form.phonepe.enabled
              ? "Turn off Cashfree or PhonePe to switch to Razorpay."
              : "Storefront checkout uses Razorpay Standard Checkout when this is enabled."}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="razorpay-key-id">Key ID</Label>
            <Input
              id="razorpay-key-id"
              value={form.razorpay.keyId}
              onChange={(e) => updateRazorpay("keyId", e.target.value)}
              placeholder="rzp_test_xxxxxxxxxxxx"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="razorpay-key-secret">Key Secret</Label>
            <Input
              id="razorpay-key-secret"
              type="password"
              value={form.razorpay.keySecret}
              onChange={(e) => updateRazorpay("keySecret", e.target.value)}
              placeholder="Leave blank to keep existing"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="razorpay-webhook-secret">Webhook Secret</Label>
            <Input
              id="razorpay-webhook-secret"
              type="password"
              value={form.razorpay.webhookSecret}
              onChange={(e) => updateRazorpay("webhookSecret", e.target.value)}
              placeholder="From Razorpay Dashboard → Webhooks"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="razorpay-environment">Environment</Label>
            <select
              id="razorpay-environment"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.razorpay.environment}
              onChange={(e) =>
                updateRazorpay(
                  "environment",
                  e.target.value === "production" ? "production" : "sandbox",
                )
              }
            >
              <option value="sandbox">Test (rzp_test_)</option>
              <option value="production">Live (rzp_live_)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Webhook URL: {getCanonicalSiteOrigin()}/api/razorpay/webhook —
              enable <strong>payment.captured</strong> and{" "}
              <strong>order.paid</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Webhook Secret = the secret string from Razorpay Dashboard →
              Webhooks (not the webhook URL, not the Key Secret, not a
              dashboard.razorpay.com link).
            </p>
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Live payments are blocked until <strong>thryco.com</strong> is
              registered on this Razorpay account (MID). Razorpay Dashboard →
              Account & Settings →{" "}
              <a
                className="underline underline-offset-2"
                href="https://razorpay.com/docs/payments/dashboard/account-settings/business-website-details/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Business website details
              </a>
              . Add <strong>https://thryco.com</strong>,{" "}
              <strong>https://www.thryco.com</strong>, and{" "}
              <strong>https://thry-thryco.vercel.app</strong>. Until Razorpay
              approves the domain, UPI Continue will fail even if checkout
              opens.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cashfree Payment Gateway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Docs:{" "}
            <a
              className="text-primary underline underline-offset-2"
              href="https://www.cashfree.com/docs/payments/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cashfree integration overview
            </a>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.cashfree.enabled}
              disabled={form.phonepe.enabled || form.razorpay.enabled}
              onChange={(e) => updateCashfree("enabled", e.target.checked)}
            />
            Enable Cashfree checkout
          </label>
          <p className="text-xs text-muted-foreground">
            {form.phonepe.enabled || form.razorpay.enabled
              ? "Turn off PhonePe or Razorpay to switch to Cashfree."
              : "Storefront checkout uses Cashfree when this is enabled."}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="cashfree-client-id">Client ID</Label>
            <Input
              id="cashfree-client-id"
              value={form.cashfree.clientId}
              onChange={(e) => updateCashfree("clientId", e.target.value)}
              placeholder="CFxxxxxxxxxxxx"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cashfree-client-secret">Client Secret</Label>
            <Input
              id="cashfree-client-secret"
              type="password"
              value={form.cashfree.clientSecret}
              onChange={(e) => updateCashfree("clientSecret", e.target.value)}
              placeholder="Leave blank to keep existing"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cashfree-base-url">Base URL</Label>
            <Input
              id="cashfree-base-url"
              value={form.cashfree.baseUrl}
              onChange={(e) => updateCashfree("baseUrl", e.target.value)}
              placeholder={CASHFREE_SANDBOX_BASE_URL}
            />
            <p className="text-xs text-muted-foreground">
              Sandbox: {CASHFREE_SANDBOX_BASE_URL}. Production:{" "}
              {CASHFREE_PRODUCTION_BASE_URL}. This updates automatically when
              you change Environment.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cashfree-api-version">API Version</Label>
            <Input
              id="cashfree-api-version"
              value={form.cashfree.apiVersion}
              onChange={(e) => updateCashfree("apiVersion", e.target.value)}
              placeholder="2025-01-01"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cashfree-environment">Environment</Label>
            <select
              id="cashfree-environment"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.cashfree.environment}
              onChange={(e) =>
                updateCashfree(
                  "environment",
                  e.target.value === "production" ? "production" : "sandbox",
                )
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Whitelist <strong>{getCanonicalSiteOrigin()}</strong> in Cashfree
              Dashboard → Developers → Whitelisting. Set webhook URL to{" "}
              {getCanonicalSiteOrigin()}/api/cashfree/webhook
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PhonePe Payment Gateway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.phonepe.enabled}
              disabled={form.cashfree.enabled || form.razorpay.enabled}
              onChange={(e) => updatePhonePe("enabled", e.target.checked)}
            />
            Enable PhonePe checkout
          </label>
          <p className="text-xs text-muted-foreground">
            {form.cashfree.enabled || form.razorpay.enabled
              ? "Turn off Cashfree or Razorpay to switch to PhonePe."
              : "Storefront checkout uses PhonePe when this is enabled."}
          </p>

          <div className="grid gap-2">
            <Label htmlFor="phonepe-merchant">Merchant ID</Label>
            <Input
              id="phonepe-merchant"
              value={form.phonepe.merchantId}
              onChange={(e) => updatePhonePe("merchantId", e.target.value)}
              placeholder="PGTESTPAYUAT..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phonepe-salt-key">Salt Key</Label>
            <Input
              id="phonepe-salt-key"
              type="password"
              value={form.phonepe.saltKey}
              onChange={(e) => updatePhonePe("saltKey", e.target.value)}
              placeholder="Leave blank to keep existing"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phonepe-salt-index">Salt Index</Label>
            <Input
              id="phonepe-salt-index"
              value={form.phonepe.saltIndex}
              onChange={(e) => updatePhonePe("saltIndex", e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phonepe-base-url">Base URL</Label>
            <Input
              id="phonepe-base-url"
              value={form.phonepe.baseUrl}
              onChange={(e) => updatePhonePe("baseUrl", e.target.value)}
              placeholder="https://api.phonepe.com/apis/hermes"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phonepe-user-prefix">Merchant User Prefix</Label>
            <Input
              id="phonepe-user-prefix"
              value={form.phonepe.merchantUserIdPrefix}
              onChange={(e) =>
                updatePhonePe("merchantUserIdPrefix", e.target.value)
              }
              placeholder="USR"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.whatsapp.enabled}
              onChange={(e) => updateWhatsApp("enabled", e.target.checked)}
            />
            Enable post-payment WhatsApp notification
          </label>

          <div className="grid gap-2">
            <Label htmlFor="wa-token">Access Token</Label>
            <Input
              id="wa-token"
              type="password"
              value={form.whatsapp.accessToken}
              onChange={(e) => updateWhatsApp("accessToken", e.target.value)}
              placeholder="Leave blank to keep existing"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wa-phone-id">Phone Number ID</Label>
            <Input
              id="wa-phone-id"
              value={form.whatsapp.phoneNumberId}
              onChange={(e) => updateWhatsApp("phoneNumberId", e.target.value)}
              placeholder="e.g. 123456789012345"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wa-template-name">Template Name (optional)</Label>
            <Input
              id="wa-template-name"
              value={form.whatsapp.templateName}
              onChange={(e) => updateWhatsApp("templateName", e.target.value)}
              placeholder="order_confirmed"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wa-template-lang">Template Language</Label>
            <Input
              id="wa-template-lang"
              value={form.whatsapp.templateLanguage}
              onChange={(e) =>
                updateWhatsApp("templateLanguage", e.target.value)
              }
              placeholder="en"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.whatsapp.notifySeller}
              onChange={(e) => updateWhatsApp("notifySeller", e.target.checked)}
            />
            Notify seller on each paid order
          </label>
          <div className="grid gap-2">
            <Label htmlFor="wa-seller-mobiles">Seller mobile numbers</Label>
            <Input
              id="wa-seller-mobiles"
              value={form.whatsapp.sellerMobiles}
              onChange={(e) => updateWhatsApp("sellerMobiles", e.target.value)}
              placeholder="7708069049, 9123456789"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={saveDisabled}>
        <LoadingButtonLabel
          isLoading={isSaving}
          loadingText="Saving..."
          idleText="Save API settings"
        />
      </Button>
    </div>
  );
}
