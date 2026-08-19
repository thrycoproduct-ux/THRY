"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  NotFoundException,
} from "@zxing/browser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called once when a barcode/QR code is detected.
   */
  onDetected: (value: string) => void;
};

type BarcodeDetectorLike = {
  detect: (
    input: HTMLVideoElement,
  ) => Promise<Array<{ rawValue?: string | null }>>;
};

function stopStream(stream: MediaStream | null) {
  try {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  } catch {
    // Best effort cleanup only.
  }
}

function createNativeBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined") return null;

  const ctor = (
    window as Window & {
      BarcodeDetector?: new () => BarcodeDetectorLike;
    }
  ).BarcodeDetector;

  if (!ctor) return null;

  try {
    return new ctor();
  } catch {
    return null;
  }
}

export default function BarcodeScannerModal({
  open,
  onOpenChange,
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "streaming" | "scanning"
  >("idle");

  useEffect(() => {
    if (!open) return;

    setCameraError(null);

    let cancelled = false;
    let timer: number | null = null;

    const cleanup = () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      try {
        zxingReaderRef.current?.reset();
      } catch {
        // ignore
      }
      zxingReaderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };

    const run = async () => {
      try {
        setStatus("requesting");

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera access is not available in this browser. Please enter the tracking number manually.",
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        setStatus("streaming");

        const video = videoRef.current;
        if (!video) throw new Error("Video element not ready.");

        video.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () =>
            reject(new Error("Video metadata failed to load."));
        });
        await video.play();

        setStatus("scanning");

        const nativeDetector = createNativeBarcodeDetector();
        if (nativeDetector) {
          const scanLoop = async () => {
            if (cancelled) return;
            try {
              const input = videoRef.current;
              if (!input) return;
              const barcodes = await nativeDetector.detect(input);
              const raw = barcodes?.[0]?.rawValue ?? null;

              if (typeof raw === "string" && raw.trim()) {
                onDetected(raw);
                onOpenChange(false);
                return;
              }
            } catch {
              // Ignore scan errors; keep scanning.
            }
            timer = window.setTimeout(scanLoop, 250);
          };

          timer = window.setTimeout(scanLoop, 250);
          return;
        }

        const reader = new BrowserMultiFormatReader();
        zxingReaderRef.current = reader;

        await reader.decodeFromVideoElement(video, (result, error) => {
          if (cancelled) return;

          if (result) {
            const text = result.getText()?.trim();
            if (text) {
              onDetected(text);
              onOpenChange(false);
            }
            return;
          }

          if (
            error &&
            !(error instanceof NotFoundException) &&
            error.name !== "NotFoundException"
          ) {
            // NotFoundException is expected while scanning; ignore it.
          }
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Camera permission denied or unavailable.";
        setCameraError(message);
        setStatus("idle");
      }
    };

    void run();

    return cleanup;
  }, [open, onDetected, onOpenChange]);

  useEffect(() => {
    if (open) return;

    try {
      zxingReaderRef.current?.reset();
    } catch {
      // ignore
    }
    zxingReaderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStatus("idle");
    setCameraError(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[210] max-w-xl">
        <DialogHeader>
          <DialogTitle>Scan barcode</DialogTitle>
          <DialogDescription>
            Point your camera at the QR/code. We’ll auto-fill once detected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
          </div>

          {cameraError ? (
            <p className="text-sm text-destructive">{cameraError}</p>
          ) : null}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {status === "requesting" ||
            status === "streaming" ||
            status === "scanning" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {status === "requesting"
                    ? "Requesting camera…"
                    : status === "streaming"
                      ? "Starting camera…"
                      : "Scanning…"}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
