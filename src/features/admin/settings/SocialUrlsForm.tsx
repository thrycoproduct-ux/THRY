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

type ApiSettingRecord = {
  key: string;
  isEnabled: boolean;
  value: Record<string, unknown>;
} | null;

type IntegrationsPayload = {
  storefrontSocial: ApiSettingRecord;
};

type FormState = {
  enabled: boolean;
  instagram: string;
  youtube: string;
  facebook: string;
  whatsapp: string;
};

const DEFAULT_FORM: FormState = {
  enabled: true,
  instagram: "",
  youtube: "",
  facebook: "",
  whatsapp: "",
};

function normalizeSocialUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function applyPayload(payload: IntegrationsPayload): FormState {
  const value = payload.storefrontSocial?.value ?? {};
  return {
    enabled: payload.storefrontSocial?.isEnabled ?? true,
    instagram: String(value.instagram ?? ""),
    youtube: String(value.youtube ?? ""),
    facebook: String(value.facebook ?? ""),
    whatsapp: String(value.whatsapp ?? ""),
  };
}

export function SocialUrlsForm() {
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
      if (!res.ok) throw new Error("Could not load social URL settings");

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

  const onSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetchWithTimeout("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "storefront_social",
          isEnabled: form.enabled,
          value: {
            instagram: normalizeSocialUrl(form.instagram),
            youtube: normalizeSocialUrl(form.youtube),
            facebook: normalizeSocialUrl(form.facebook),
            whatsapp: normalizeSocialUrl(form.whatsapp),
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Save failed");
        throw new Error(text || "Save failed");
      }

      await loadSettings();

      toast({
        title: "Social URLs saved",
        description:
          "Footer and menu now use Instagram, YouTube, and Facebook links. WhatsApp is not shown on the shop.",
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
          <CardTitle>Storefront Social URLs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <AdminLoadingState message="Loading social URLs..." />
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
            Use these URLs on the storefront (footer and side menu). WhatsApp is
            not shown to customers.
          </label>
          <p className="text-xs text-muted-foreground">
            Leave a field empty to keep the default link from site settings for
            that network.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="social-instagram">Instagram URL</Label>
            <Input
              id="social-instagram"
              value={form.instagram}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, instagram: e.target.value }))
              }
              placeholder="https://www.instagram.com/..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="social-youtube">YouTube URL</Label>
            <Input
              id="social-youtube"
              value={form.youtube}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, youtube: e.target.value }))
              }
              placeholder="https://www.youtube.com/..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="social-facebook">Facebook URL</Label>
            <Input
              id="social-facebook"
              value={form.facebook}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, facebook: e.target.value }))
              }
              placeholder="https://www.facebook.com/..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="social-whatsapp">WhatsApp URL</Label>
            <Input
              id="social-whatsapp"
              value={form.whatsapp}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, whatsapp: e.target.value }))
              }
              placeholder="https://wa.me/9177..."
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={saveDisabled}>
        <LoadingButtonLabel
          isLoading={isSaving}
          loadingText="Saving..."
          idleText="Save social URLs"
        />
      </Button>
    </div>
  );
}
