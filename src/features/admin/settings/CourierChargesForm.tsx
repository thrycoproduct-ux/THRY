"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
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
  courierCharges: ApiSettingRecord;
};

type CourierFormState = {
  enabled: boolean;
  tamilNaduBase: number;
  southStatesBase: number;
  restOfIndiaBase: number;
  qty2To4AddOn: number;
  qty5PlusFlat: number;
  freeShippingEnabled: boolean;
  freeShippingMin: number;
  gstEnabled: boolean;
  gstPercentage: number;
};

const DEFAULT_VALUES: CourierFormState = {
  enabled: true,
  tamilNaduBase: 40,
  southStatesBase: 60,
  restOfIndiaBase: 75,
  qty2To4AddOn: 40,
  qty5PlusFlat: 200,
  freeShippingEnabled: false,
  freeShippingMin: 999,
  gstEnabled: true,
  gstPercentage: 5,
};

function toAmount(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed))
    : Math.max(0, Math.round(fallback));
}

function toPercentage(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(50, Math.max(0, Math.round(parsed * 100) / 100));
}

export function CourierChargesForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<CourierFormState>(DEFAULT_VALUES);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetchWithTimeout("/api/admin/integrations", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not load courier charges.");
        const payload = (await response.json()) as IntegrationsPayload;
        if (cancelled) return;

        const value = payload.courierCharges?.value ?? {};
        setForm({
          enabled: payload.courierCharges?.isEnabled ?? true,
          tamilNaduBase: toAmount(
            value.tamilNaduBase,
            DEFAULT_VALUES.tamilNaduBase,
          ),
          southStatesBase: toAmount(
            value.southStatesBase,
            DEFAULT_VALUES.southStatesBase,
          ),
          restOfIndiaBase: toAmount(
            value.restOfIndiaBase,
            DEFAULT_VALUES.restOfIndiaBase,
          ),
          qty2To4AddOn: toAmount(
            value.qty2To4AddOn,
            DEFAULT_VALUES.qty2To4AddOn,
          ),
          qty5PlusFlat: toAmount(
            value.qty5PlusFlat,
            DEFAULT_VALUES.qty5PlusFlat,
          ),
          freeShippingEnabled: Boolean(
            value.freeShippingEnabled ?? DEFAULT_VALUES.freeShippingEnabled,
          ),
          freeShippingMin: toAmount(
            value.freeShippingMin,
            DEFAULT_VALUES.freeShippingMin,
          ),
          gstEnabled: Boolean(value.gstEnabled ?? DEFAULT_VALUES.gstEnabled),
          gstPercentage: toPercentage(
            value.gstPercentage,
            DEFAULT_VALUES.gstPercentage,
          ),
        });
      } catch (error) {
        toast({
          title: "Could not load courier settings",
          description: error instanceof Error ? error.message : "Please retry.",
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

  const disabled = useMemo(() => isLoading || isSaving, [isLoading, isSaving]);

  const setAmount = (key: keyof CourierFormState, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setForm((prev) => ({ ...prev, [key]: Math.max(0, Math.round(value)) }));
  };

  const onSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetchWithTimeout("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "courier_charges",
          isEnabled: form.enabled,
          value: {
            tamilNaduBase: form.tamilNaduBase,
            southStatesBase: form.southStatesBase,
            restOfIndiaBase: form.restOfIndiaBase,
            qty2To4AddOn: form.qty2To4AddOn,
            qty5PlusFlat: form.qty5PlusFlat,
            freeShippingEnabled: form.freeShippingEnabled,
            freeShippingMin: form.freeShippingMin,
            gstEnabled: form.gstEnabled,
            gstPercentage: toPercentage(form.gstPercentage, 5),
          },
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "Save failed");
        throw new Error(text || "Save failed");
      }

      toast({
        title: "Courier & GST settings saved",
        description:
          "Checkout now uses updated courier, free shipping, and GST settings.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Courier & GST</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <AdminLoadingState message="Loading courier settings..." />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, enabled: event.target.checked }))
            }
          />
          Enable state-wise courier calculation
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tn-base">Tamil Nadu (qty 1)</Label>
            <Input
              id="tn-base"
              type="number"
              min={0}
              value={form.tamilNaduBase}
              onChange={(event) =>
                setAmount("tamilNaduBase", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="south-base">
              Karnataka/Andhra/Telangana/Kerala (qty 1)
            </Label>
            <Input
              id="south-base"
              type="number"
              min={0}
              value={form.southStatesBase}
              onChange={(event) =>
                setAmount("southStatesBase", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rest-base">Rest of India (qty 1)</Label>
            <Input
              id="rest-base"
              type="number"
              min={0}
              value={form.restOfIndiaBase}
              onChange={(event) =>
                setAmount("restOfIndiaBase", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty-2-4">Qty 2-4 add-on</Label>
            <Input
              id="qty-2-4"
              type="number"
              min={0}
              value={form.qty2To4AddOn}
              onChange={(event) =>
                setAmount("qty2To4AddOn", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty-5-plus">Qty 5+ flat courier</Label>
            <Input
              id="qty-5-plus"
              type="number"
              min={0}
              value={form.qty5PlusFlat}
              onChange={(event) =>
                setAmount("qty5PlusFlat", event.target.value)
              }
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Qty 2-4 uses base + add-on. Qty 5+ uses flat courier value.
        </p>

        <div className="rounded-md border border-border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.freeShippingEnabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  freeShippingEnabled: event.target.checked,
                }))
              }
            />
            Enable free shipping
          </label>
          <div className="space-y-2">
            <Label htmlFor="free-shipping-min">Free shipping above (₹)</Label>
            <Input
              id="free-shipping-min"
              type="number"
              min={0}
              disabled={!form.freeShippingEnabled}
              value={form.freeShippingMin}
              onChange={(event) =>
                setAmount("freeShippingMin", event.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              When order value after discount reaches this amount, courier is
              ₹0. Below it, state and quantity rates still apply.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.gstEnabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  gstEnabled: event.target.checked,
                }))
              }
            />
            Enable GST
          </label>
          <p className="text-xs text-muted-foreground">
            Applied once on discounted merchandise plus courier. Storefront
            product prices show GST-inclusive amounts; admin orders and packing
            keep exclusive price plus a separate GST line.
          </p>
          <div className="mt-3 space-y-2">
            <Label htmlFor="gst-percentage">GST percentage</Label>
            <Input
              id="gst-percentage"
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={form.gstPercentage}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  gstPercentage: toPercentage(
                    event.target.value,
                    prev.gstPercentage,
                  ),
                }))
              }
            />
          </div>
        </div>

        <Button onClick={onSave} disabled={disabled}>
          <LoadingButtonLabel
            isLoading={isSaving}
            loadingText="Saving..."
            idleText="Save courier & GST settings"
          />
        </Button>
      </CardContent>
    </Card>
  );
}

export default CourierChargesForm;
