"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
   * `value` is the raw decoded string from `BarcodeDetector`.
   */
  onDetected: (value: string) => void;
};

function stopStream(stream: MediaStream | null) {
  try {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  } catch {
    // Best effort cleanup only.
  }
}

export default function BarcodeScannerModal({
  open,
  onOpenChange,
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "streaming" | "scanning" | "unsupported"
  >("idle");

  const BarcodeDetectorCtor = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (window as any).BarcodeDetector as
      | (new (formats?: string[]) => {
          detect: (
            input: VideoFrame | HTMLVideoElement,
          ) => Promise<Array<{ rawValue?: string | null }>>;
        })
      | undefined;
  }, []);

  useEffect(() => {
    if (!open) return;

    // Reset UI per open.
    setCameraError(null);

    const detectorCtor = (window as any).BarcodeDetector as
      | undefined
      | (new (...args: any[]) => { detect: (...args: any[]) => Promise<any> });

    if (!detectorCtor) {
      setStatus("unsupported");
      setCameraError(
        "Barcode scanning is not supported in this browser. Please enter the tracking number manually.",
      );
      return;
    }

    let cancelled = false;
    let detector: any = null;
    let timer: number | null = null;

    const run = async () => {
      try {
        setStatus("requesting");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        setActiveStream(stream);
        setStatus("streaming");

        const video = videoRef.current;
        if (!video) throw new Error("Video element not ready.");

        video.srcObject = stream;
        // Ensure metadata is loaded before scanning.
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () =>
            reject(new Error("Video metadata failed to load."));
        });
        await video.play();

        detector = new detectorCtor();
        setStatus("scanning");

        const scanLoop = async () => {
          if (cancelled) return;
          try {
            const input = videoRef.current;
            if (!input) return;
            const barcodes = await detector.detect(input);
            const first = barcodes?.[0];
            const raw = first?.rawValue ?? null;

            if (typeof raw === "string" && raw.trim()) {
              // Stop immediately after first success.
              onDetected(raw);
              onOpenChange(false);
              return;
            }
          } catch {
            // Ignore scan errors; keep scanning.
          } finally {
            timer = window.setTimeout(scanLoop, 250);
          }
        };

        timer = window.setTimeout(scanLoop, 250);
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

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stopStream(activeStream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onDetected, onOpenChange, BarcodeDetectorCtor]);

  // Cleanup stream when modal closes.
  useEffect(() => {
    if (open) return;
    stopStream(activeStream);
    setActiveStream(null);
    setStatus("idle");
  }, [open, activeStream]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Scan barcode</DialogTitle>
          <DialogDescription>
            Point your camera at the QR/code. We’ll auto-fill once detected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-black">
            {status === "unsupported" ? (
              <div className="flex h-full w-full items-center justify-center p-4 text-sm text-muted-foreground">
                Scanner unsupported
              </div>
            ) : (
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />
            )}
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
