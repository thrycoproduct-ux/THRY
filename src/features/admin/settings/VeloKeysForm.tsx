"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  AdminLoadingState,
  LoadingButtonLabel,
} from "@/components/admin/AdminLoadingState";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";

type KeyRecord = {
  id: string;
  clientName: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type KeysPayload = {
  keys: KeyRecord[];
};

type CreatedPayload = {
  created: {
    id: string;
    clientName: string;
    keyPrefix: string;
    apiKey: string;
  };
};

export function VeloKeysForm() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [latestApiKey, setLatestApiKey] = useState("");

  const usageSnippet = useMemo(() => {
    const key = latestApiKey || "YOUR_VELO_API_KEY";
    return [
      "const apiKey = '" + key + "';",
      "let since = new Date(0).toISOString();",
      "",
      "async function pollOrders() {",
      "  const res = await fetch(",
      "    `https://YOUR_SITE_URL/api/velo/orders?since=${encodeURIComponent(since)}&limit=50`,",
      "    { headers: { 'x-velo-key': apiKey } },",
      "  );",
      "  if (!res.ok) throw new Error('Failed to fetch orders');",
      "  const data = await res.json();",
      "  if (Array.isArray(data.orders)) {",
      "    data.orders.forEach((order) => {",
      "      console.log('New paid order:', order.orderId, order.customer?.mobile, order.address);",
      "      // Push to your Velo DB/app here",
      "    });",
      "  }",
      "  since = data.nextSince || since;",
      "}",
      "",
      "setInterval(() => {",
      "  pollOrders().catch(console.error);",
      "}, 15000);",
    ].join("\n");
  }, [latestApiKey]);

  const productsUsageSnippet = useMemo(() => {
    const key = latestApiKey || "YOUR_VELO_API_KEY";
    return [
      "const apiKey = '" + key + "';",
      "const site = 'https://YOUR_SITE_URL';",
      "const productsUrl = site + '/api/velo/products';",
      "const mediaInitUrl = site + '/api/velo/medias/direct-upload/init';",
      "const mediaCompleteUrl = site + '/api/velo/medias/direct-upload/complete';",
      "",
      "async function callProductsApi(action, requestId, data) {",
      "  const res = await fetch(productsUrl, {",
      "    method: 'POST',",
      "    headers: {",
      "      'Content-Type': 'application/json',",
      "      'x-velo-key': apiKey,",
      "    },",
      "    body: JSON.stringify({ action, requestId, data }),",
      "  });",
      "  const payload = await res.json();",
      "  if (!res.ok || !payload.ok) throw new Error(payload.message || 'Request failed');",
      "  return payload;",
      "}",
      "",
      "// Preferred: upload image bytes to R2 media proxy (not Vercel)",
      "async function uploadProductImage(file) {",
      "  const initRes = await fetch(mediaInitUrl, {",
      "    method: 'POST',",
      "    headers: { 'Content-Type': 'application/json', 'x-velo-key': apiKey },",
      "    body: JSON.stringify({",
      "      fileName: file.name || 'product.jpg',",
      "      contentType: file.type || 'image/jpeg',",
      "      fileSize: file.size,",
      "    }),",
      "  });",
      "  const init = await initRes.json();",
      "  if (!initRes.ok || !init.ok) throw new Error(init.message || 'init failed');",
      "  if (init.uploadMode === 'proxy' && init.uploadUrl && init.uploadToken) {",
      "    const put = await fetch(init.uploadUrl, {",
      "      method: 'PUT',",
      "      headers: {",
      "        Authorization: 'Bearer ' + init.uploadToken,",
      "        'Content-Type': file.type || 'application/octet-stream',",
      "      },",
      "      body: file,",
      "    });",
      "    if (!put.ok) throw new Error('proxy upload failed');",
      "  } else {",
      "    const form = new FormData();",
      "    form.append('storagePath', init.storagePath);",
      "    form.append('file', file);",
      "    const stage = await fetch(site + '/api/velo/medias/direct-upload/stage', {",
      "      method: 'POST',",
      "      headers: { 'x-velo-key': apiKey },",
      "      body: form,",
      "    });",
      "    if (!stage.ok) throw new Error('stage upload failed');",
      "  }",
      "  const doneRes = await fetch(mediaCompleteUrl, {",
      "    method: 'POST',",
      "    headers: { 'Content-Type': 'application/json', 'x-velo-key': apiKey },",
      "    body: JSON.stringify({ storagePath: init.storagePath, fileName: file.name || 'product.jpg' }),",
      "  });",
      "  const done = await doneRes.json();",
      "  if (!doneRes.ok || !done.ok) throw new Error(done.message || 'complete failed');",
      "  return done.featuredImageMediaId || done.mediaId;",
      "}",
      "",
      "// 1) Fetch collections for dropdown",
      "await callProductsApi('meta', `meta-${Date.now()}`, { type: 'collections' });",
      "",
      "// 2) List products",
      "await callProductsApi('list', `list-${Date.now()}`, {",
      "  search: '',",
      "  draft: 'all', // all | draft | published",
      "  page: 1,",
      "  pageSize: 20,",
      "});",
      "",
      "// 3) Upload photo (proxy) then upsert with media id — avoid imageBase64 on Vercel",
      "const featuredImageMediaId = await uploadProductImage(fileFromCamera);",
      "await callProductsApi('upsert', `upsert-${Date.now()}`, {",
      "  externalProductId: 'APP-1001',",
      "  name: 'Kolam Stamp',",
      "  description: 'New collection piece',",
      "  collectionId: 'COLLECTION_UUID',",
      "  tags: ['stamp'],",
      "  badge: 'featured',",
      "  rating: '4',",
      "  price: '199',",
      "  stock: 1,",
      "  isDraft: false,",
      "  featuredImageMediaId,",
      "  sizeConfig: {",
      "    enabled: true,",
      "    options: [",
      "      { size: '36', qty: 1 },",
      "      { size: '38', qty: 1 },",
      "    ],",
      "  },",
      "});",
      "",
      "// 4) Category create (scoped cache bust; image optional)",
      "await callProductsApi('upsertCollection', `cat-${Date.now()}`, {",
      "  name: 'New Category',",
      "  description: 'Seller-app category',",
      "});",
      "",
      "// 5) Delete empty category is fast; with products, call until done=true",
      "await callProductsApi('deleteCollection', `cat-del-${Date.now()}`, {",
      "  id: 'COLLECTION_UUID',",
      "  batchSize: 3,",
      "});",
    ].join("\n");
  }, [latestApiKey]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/velo/keys", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load Velo keys");
      const payload = (await res.json()) as KeysPayload;
      setKeys(payload.keys ?? []);
    } catch (error) {
      toast({
        title: "Could not load Velo keys",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createKey = async () => {
    if (!clientName.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/admin/velo/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: clientName.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "Could not create key");
        throw new Error(text || "Could not create key");
      }
      const payload = (await res.json()) as CreatedPayload;
      setLatestApiKey(payload.created.apiKey);
      setClientName("");
      await load();
      toast({
        title: "Velo key created",
        description:
          "Copy this key now. For security, plain keys are shown only once.",
      });
    } catch (error) {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      const res = await fetchWithTimeout("/api/admin/velo/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Could not revoke key");
      await load();
      toast({ title: "Key revoked" });
    } catch (error) {
      toast({
        title: "Revoke failed",
        description: error instanceof Error ? error.message : "Please retry",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {loading ? <AdminLoadingState message="Loading Velo keys..." /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Generate Velo API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="velo-client-name">Client Name</Label>
            <Input
              id="velo-client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client A / Velo Site Name"
            />
          </div>
          <Button disabled={saving || !clientName.trim()} onClick={createKey}>
            <LoadingButtonLabel
              isLoading={saving}
              loadingText="Generating..."
              idleText="Generate Unique Key"
            />
          </Button>

          {latestApiKey ? (
            <div className="space-y-2">
              <Label htmlFor="velo-key-once">New API Key (copy now)</Label>
              <Textarea id="velo-key-once" value={latestApiKey} readOnly />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instant order push (Velo app notification)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            When a website order is paid, THRY POSTs to Velo&apos;s{" "}
            <code className="text-xs">notify-velo-order-push</code> edge
            function so the Velo app can alert immediately (not only poll every
            15s).
          </p>
          <p>
            Push secret + shop URL are stored in Supabase{" "}
            <code className="text-xs">api_settings</code> key{" "}
            <code className="text-xs">velo_order_push</code>. Run{" "}
            <code className="text-xs">npm run db:setup-velo-order-push</code> on
            a new environment if needed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Velo app should collect orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Use this code in your other Velo app. It polls for newly paid orders
            and carries customer mobile + full address + line items.
          </p>
          <Textarea value={usageSnippet} readOnly className="min-h-[280px]" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Velo app should manage products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Use this snippet to call the unified products API from your external
            app. Supported actions: meta, list, upsert, bulk_upsert, delete.
          </p>
          <Textarea
            value={productsUsageSnippet}
            readOnly
            className="min-h-[420px]"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Velo Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <AdminLoadingState
              message="Refreshing keys list..."
              className="w-fit"
            />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No keys created yet.
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="rounded-md border p-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">{key.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    Prefix: {key.keyPrefix}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last used: {key.lastUsedAt ?? "Never"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    {key.isActive && !key.revokedAt ? "Active" : "Revoked"}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  disabled={!key.isActive || Boolean(key.revokedAt)}
                  onClick={() => revokeKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
