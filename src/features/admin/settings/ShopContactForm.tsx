"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminLoadingState,
  LoadingButtonLabel,
} from "@/components/admin/AdminLoadingState";
import { siteConfig } from "@/config/site";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import { Plus, Trash2 } from "lucide-react";

type ApiSettingRecord = {
  key: string;
  isEnabled: boolean;
  value: Record<string, unknown>;
} | null;

type IntegrationsPayload = {
  storefrontContact: ApiSettingRecord;
};

type ContactRow = {
  name: string;
  phone: string;
};

type FormState = {
  enabled: boolean;
  addressText: string;
  gstin: string;
  email: string;
  contacts: ContactRow[];
};

const DEFAULT_CONTACTS: ContactRow[] = siteConfig.contacts.map((contact) => ({
  name: contact.name,
  phone: contact.phone,
}));

const DEFAULT_FORM: FormState = {
  enabled: true,
  addressText: siteConfig.addressLines.join("\n"),
  gstin: siteConfig.gstin,
  email: siteConfig.email,
  contacts: DEFAULT_CONTACTS,
};

function applyPayload(payload: IntegrationsPayload): FormState {
  const value = payload.storefrontContact?.value ?? {};
  const rawContacts = Array.isArray(value.contacts) ? value.contacts : [];
  const contacts = rawContacts
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: String(row.name ?? "").trim(),
        phone: String(row.phone ?? "").trim(),
      };
    })
    .filter((row) => row.name || row.phone);

  const addressLines = Array.isArray(value.addressLines)
    ? value.addressLines.map((line) => String(line).trim()).filter(Boolean)
    : [];

  return {
    enabled: payload.storefrontContact?.isEnabled ?? true,
    addressText:
      addressLines.length > 0
        ? addressLines.join("\n")
        : siteConfig.addressLines.join("\n"),
    gstin: String(value.gstin ?? siteConfig.gstin),
    email: String(value.email ?? siteConfig.email),
    contacts: contacts.length > 0 ? contacts : DEFAULT_CONTACTS,
  };
}

export function ShopContactForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/integrations", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load shop contact settings");

      const payload = (await res.json()) as IntegrationsPayload;
      setForm(applyPayload(payload));
    } catch (error) {
      toast({
        title: "Could not load settings",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDisabled = useMemo(
    () => isSaving || isLoading,
    [isSaving, isLoading],
  );

  const updateContact = (index: number, patch: Partial<ContactRow>) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", phone: "" }],
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => ({
      ...prev,
      contacts:
        prev.contacts.length <= 1
          ? prev.contacts
          : prev.contacts.filter((_, i) => i !== index),
    }));
  };

  const onSave = async () => {
    const addressLines = form.addressText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const contacts = form.contacts
      .map((row) => ({
        name: row.name.trim(),
        phone: row.phone.trim(),
      }))
      .filter((row) => row.name && row.phone);

    if (addressLines.length === 0) {
      toast({
        title: "Address required",
        description: "Add at least one address line.",
        variant: "destructive",
      });
      return;
    }

    if (!form.email.trim()) {
      toast({
        title: "Email required",
        description: "Shop email is shown on the storefront and mail button.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetchWithTimeout("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "storefront_contact",
          isEnabled: form.enabled,
          value: {
            addressLines,
            gstin: form.gstin.trim(),
            email: form.email.trim(),
            contacts,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Save failed");
        throw new Error(text || "Save failed");
      }

      await loadSettings();

      toast({
        title: "Shop contact saved",
        description:
          "Footer, contact page, and the mail floating button now use these details.",
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
      <Card>
        <CardHeader>
          <CardTitle>Shop contact</CardTitle>
          <CardDescription>
            Address, GSTIN, and email shown on the storefront footer, contact
            page, and mail floating button. Shop phone numbers are not shown to
            customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <AdminLoadingState message="Loading shop contact..." />
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
            Use these details on the storefront
          </label>
          <p className="text-xs text-muted-foreground">
            Uncheck to fall back to the default values from site configuration.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="shop-address">Store address</Label>
            <Textarea
              id="shop-address"
              rows={4}
              value={form.addressText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, addressText: e.target.value }))
              }
              placeholder="One line per address row"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="shop-gstin">GSTIN</Label>
              <Input
                id="shop-gstin"
                value={form.gstin}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, gstin: e.target.value }))
                }
                placeholder="33BMCPV3652G1Z1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shop-email">Email</Label>
              <Input
                id="shop-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="orders@example.com"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Contact persons</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addContact}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add contact
              </Button>
            </div>
            {form.contacts.map((contact, index) => (
              <div
                key={`contact-${index}`}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div className="grid gap-1">
                  <Label htmlFor={`contact-name-${index}`}>Name</Label>
                  <Input
                    id={`contact-name-${index}`}
                    value={contact.name}
                    onChange={(e) =>
                      updateContact(index, { name: e.target.value })
                    }
                    placeholder="J. Moulee"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`contact-phone-${index}`}>Phone</Label>
                  <Input
                    id={`contact-phone-${index}`}
                    value={contact.phone}
                    onChange={(e) =>
                      updateContact(index, { phone: e.target.value })
                    }
                    placeholder="+91 80127 15132"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeContact(index)}
                    disabled={form.contacts.length <= 1}
                    aria-label={`Remove contact ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={saveDisabled}>
        <LoadingButtonLabel
          isLoading={isSaving}
          loadingText="Saving..."
          idleText="Save shop contact"
        />
      </Button>
    </div>
  );
}
