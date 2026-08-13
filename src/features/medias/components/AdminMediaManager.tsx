"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  AdminLoadingState,
  LoadingButtonLabel,
} from "@/components/admin/AdminLoadingState";
import {
  type UploadFileFailure,
  type UploadProgressUpdate,
  uploadMediaFilesQueue,
} from "@/lib/admin/client-image-upload";
import {
  fetchWithRetry,
  fetchWithTimeout,
} from "@/lib/network/fetchWithTimeout";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { cn, keytoUrl } from "@/lib/utils";

type MediaSection = "banner" | "product";

type MediaLibraryItem = {
  id: string;
  key: string;
  alt: string;
  createdAt: string;
  section: MediaSection;
  usage: {
    bannerSlideCount: number;
    productCount: number;
    collectionCount: number;
    testimonialCount: number;
  };
};

type DeleteResponse = {
  deletedMediaIds: string[];
  deletedProductIds: string[];
  blocked: { mediaId: string; reason: string }[];
};

type DragState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  startSelection: Set<string>;
};

const MEDIA_LIBRARY_PAGE_SIZE = 48;

function intersects(a: DOMRect, b: DOMRect) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

export function AdminMediaManager() {
  const { toast } = useToast();
  const [medias, setMedias] = useState<MediaLibraryItem[]>([]);
  const [activeSection, setActiveSection] = useState<MediaSection>("product");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [counts, setCounts] = useState({ banner: 0, product: 0 });
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressUpdate | null>(null);
  const [failedUploads, setFailedUploads] = useState<UploadFileFailure[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const sectionItems = medias;
  const sectionItemIds = useMemo(
    () => new Set(sectionItems.map((item) => item.id)),
    [sectionItems],
  );
  const bannerCount = counts.banner;
  const productCount = counts.product;

  const loadLibrary = async (options?: {
    reset?: boolean;
    page?: number;
    section?: MediaSection;
  }) => {
    const section = options?.section ?? activeSection;
    const targetPage = options?.page ?? 1;
    const reset = options?.reset ?? targetPage === 1;

    if (reset) {
      setIsLoading(true);
      setLoadError(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(MEDIA_LIBRARY_PAGE_SIZE),
        section,
        _t: String(Date.now()),
      });
      const res = await fetchWithRetry(
        `/api/admin/medias/library?${params.toString()}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!res.ok) throw new Error("Could not load media library.");

      const payload = (await res.json()) as {
        medias: MediaLibraryItem[];
        pageInfo: { page: number; hasNextPage: boolean };
        counts: { banner: number; product: number };
      };

      setCounts(payload.counts ?? { banner: 0, product: 0 });
      setPage(payload.pageInfo?.page ?? targetPage);
      setHasNextPage(Boolean(payload.pageInfo?.hasNextPage));
      setMedias((prev) =>
        reset ? payload.medias ?? [] : [...prev, ...(payload.medias ?? [])],
      );
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please retry.";
      setLoadError(message);
      if (reset) {
        setMedias([]);
        toast({
          title: "Failed to load medias",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    setSelectedIds([]);
    setPage(1);
    void loadLibrary({ reset: true, page: 1, section: activeSection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const requestMore = useCallback(() => {
    if (!hasNextPage || isLoading || isLoadingMore) return;
    void loadLibrary({
      reset: false,
      page: page + 1,
      section: activeSection,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNextPage, isLoading, isLoadingMore, page, activeSection]);

  const loadMoreSentinelRef = useInfiniteScrollSentinel({
    enabled: hasNextPage && !isLoading && !isLoadingMore,
    onLoadMore: requestMore,
  });

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => sectionItemIds.has(id)));
  }, [sectionItemIds]);

  useEffect(() => {
    if (!drag) return;

    const onMouseMove = (event: MouseEvent) => {
      setDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: event.clientX,
              currentY: event.clientY,
            }
          : null,
      );
    };

    const onMouseUp = () => {
      setDrag(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [drag]);

  useEffect(() => {
    if (!drag) return;

    const rect = new DOMRect(
      Math.min(drag.startX, drag.currentX),
      Math.min(drag.startY, drag.currentY),
      Math.abs(drag.currentX - drag.startX),
      Math.abs(drag.currentY - drag.startY),
    );

    const hitIds = new Set<string>();
    for (const item of sectionItems) {
      const node = itemRefs.current[item.id];
      if (!node) continue;
      if (intersects(rect, node.getBoundingClientRect())) {
        hitIds.add(item.id);
      }
    }

    const merged = drag.additive
      ? new Set([...drag.startSelection, ...hitIds])
      : hitIds;
    setSelectedIds([...merged]);
  }, [drag, sectionItems]);

  const runUpload = async (files: File[], options?: { retry?: boolean }) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({
      phase: "validating",
      current: 0,
      total: files.length,
      percent: 1,
      message: options?.retry
        ? `Retrying ${files.length} failed image(s)...`
        : `Optimizing ${files.length} photo(s)...`,
    });

    try {
      const result = await uploadMediaFilesQueue(files, {
        onProgress: setUploadProgress,
        skipPrepare: options?.retry,
        preparedItems: options?.retry
          ? files.map((file) => ({
              sourceName: file.name,
              file,
              sourceFile: file,
            }))
          : undefined,
        preferDirectUpload: true,
      });

      setUploadProgress({
        phase: "complete",
        current: files.length,
        total: files.length,
        percent: 98,
        message: "Refreshing media library...",
      });
      await loadLibrary({ reset: true, section: activeSection });

      const validationMessages = result.validationErrors.map(
        (entry) => entry.reason,
      );
      const allIssues = [
        ...validationMessages,
        ...result.failures.map((entry) => entry.reason),
      ];

      setFailedUploads(result.failures);

      if (result.uploadedCount === 0) {
        throw new Error(allIssues[0] || "No images were uploaded.");
      }

      toast({
        title: "Upload complete",
        description:
          allIssues.length > 0
            ? `${result.uploadedCount} uploaded, ${allIssues.length} skipped or failed.`
            : `${result.uploadedCount} image(s) uploaded successfully.`,
      });

      if (allIssues.length > 0) {
        console.warn("[media-upload] issues:", allIssues);
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFailedUploads([]);
    await runUpload(Array.from(files));
  };

  const onRetryFailedUploads = async () => {
    if (failedUploads.length === 0) return;
    const retryFiles = failedUploads.map((entry) => entry.file);
    setFailedUploads([]);
    await runUpload(retryFiles, { retry: true });
  };

  const onDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetchWithTimeout("/api/admin/medias/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: activeSection,
          mediaIds: selectedIds,
        }),
      });
      const payload = (await res.json()) as
        | DeleteResponse
        | { message?: string };
      if (!res.ok) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Delete request failed.",
        );
      }

      const result = payload as DeleteResponse;
      const blockedCount = result.blocked.length;
      const deletedCount = result.deletedMediaIds.length;
      const deletedProducts = result.deletedProductIds.length;

      await loadLibrary({ reset: true, section: activeSection });
      setSelectedIds([]);

      toast({
        title: "Delete completed",
        description: `Deleted medias: ${deletedCount}, deleted products: ${deletedProducts}, blocked: ${blockedCount}.`,
      });
      if (blockedCount > 0) {
        console.warn("[media-delete] blocked items:", result.blocked);
      }
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const onGridMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-media-id]")) return;

    setDrag({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      startSelection: new Set(selectedIds),
    });
  };

  const dragOverlayStyle = useMemo(() => {
    if (!drag || !gridRef.current) return undefined;
    const rootRect = gridRef.current.getBoundingClientRect();
    const left = Math.min(drag.startX, drag.currentX) - rootRect.left;
    const top = Math.min(drag.startY, drag.currentY) - rootRect.top;
    const width = Math.abs(drag.currentX - drag.startX);
    const height = Math.abs(drag.currentY - drag.startY);
    return { left, top, width, height };
  }, [drag]);

  return (
    <div className="space-y-4">
      {uploadProgress ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
          <div className="w-[320px] rounded-xl border border-[#E8A317]/40 bg-card p-5 shadow-2xl">
            <p className="text-center text-sm font-semibold text-[#8A5A00]">
              {uploadProgress.message}
            </p>
            <p className="mt-2 text-center text-3xl font-bold text-[#8A5A00]">
              {uploadProgress.percent}%
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#FDECC8]">
              <div
                className="h-full rounded-full bg-[#E8A317] transition-all"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={activeSection === "banner" ? "default" : "outline"}
          onClick={() => setActiveSection("banner")}
        >
          Banner Images ({bannerCount})
        </Button>
        <Button
          variant={activeSection === "product" ? "default" : "outline"}
          onClick={() => setActiveSection("product")}
        >
          Product Images ({productCount})
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <LoadingButtonLabel
              isLoading={isUploading}
              loadingText="Uploading..."
              idleText="Upload Images"
            />
          </Button>
          {failedUploads.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRetryFailedUploads()}
              disabled={isUploading}
            >
              Retry failed ({failedUploads.length})
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelectedIds(sectionItems.map((item) => item.id))}
            disabled={sectionItems.length === 0}
          >
            Select All Loaded
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelectedIds([])}
            disabled={selectedIds.length === 0}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDeleteSelected}
            disabled={selectedIds.length === 0 || isDeleting}
          >
            <LoadingButtonLabel
              isLoading={isDeleting}
              loadingText="Deleting..."
              idleText={`Delete Selected (${selectedIds.length})`}
            />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: click to multi-select. Drag on empty space to box-select many
        images quickly. Max 15 MB per image; uploads go to R2 via the media
        worker (image bytes skip Vercel), then are optimized on the server.
      </p>

      {failedUploads.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            {failedUploads.length} image(s) failed to upload
          </p>
          <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-muted-foreground">
            {failedUploads.map((entry) => (
              <li key={`${entry.fileName}:${entry.reason}`}>{entry.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={(event) => {
          void onUploadFiles(event.target.files);
        }}
      />

      {isLoading ? (
        <AdminLoadingState message="Loading media library..." />
      ) : loadError && sectionItems.length === 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() =>
              void loadLibrary({ reset: true, section: activeSection })
            }
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={gridRef}
            className="relative grid grid-cols-3 gap-3 rounded-md border p-3 md:grid-cols-6 xl:grid-cols-8"
            onMouseDown={onGridMouseDown}
          >
            {sectionItems.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No images in this section yet.
              </p>
            ) : null}
            {sectionItems.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  data-media-id={item.id}
                  ref={(el) => {
                    itemRefs.current[item.id] = el;
                  }}
                  type="button"
                  className={cn(
                    "relative overflow-hidden rounded-md border text-left",
                    selected ? "ring-2 ring-primary ring-offset-2" : "",
                  )}
                  onClick={(event) => {
                    const multi = event.ctrlKey || event.metaKey;
                    setSelectedIds((prev) => {
                      if (multi) {
                        return prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id];
                      }
                      return prev.includes(item.id) && prev.length === 1
                        ? []
                        : [item.id];
                    });
                  }}
                >
                  <Image
                    src={keytoUrl(item.key)}
                    alt={item.alt || "media"}
                    width={120}
                    height={120}
                    className="h-[120px] w-full object-cover"
                  />
                  <div className="space-y-0.5 bg-background/95 p-1.5 text-[10px]">
                    <p className="truncate font-medium">
                      {item.alt || "image"}
                    </p>
                    <p className="text-muted-foreground">
                      Products: {item.usage.productCount}
                    </p>
                    {activeSection === "banner" ? (
                      <p className="text-muted-foreground">
                        Slides: {item.usage.bannerSlideCount}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}

            {dragOverlayStyle ? (
              <div
                className="pointer-events-none absolute z-20 border border-primary/70 bg-primary/15"
                style={dragOverlayStyle}
              />
            ) : null}
          </div>

          {hasNextPage ? (
            <div
              ref={loadMoreSentinelRef}
              className="flex min-h-10 justify-center pt-2"
            >
              {isLoadingMore ? (
                <p className="text-xs text-muted-foreground">
                  Loading more images…
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
