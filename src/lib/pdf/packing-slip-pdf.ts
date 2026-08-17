import {
  PACKING_SLIP_BRAND,
  PACKING_SLIP_THANKS,
  buildPackingSlipRecipientLines,
  buildPackingSlipShopFooter,
  formatPackingSlipDate,
  formatPackingSlipOrderHeading,
  formatPackingSlipQuantity,
  resolvePackingSlipShopAddressLines,
  type PackingSlipOrder,
} from "@/lib/pdf/packing-slip-format";

export type {
  PackingSlipItem,
  PackingSlipOrder,
} from "@/lib/pdf/packing-slip-format";

const A4_W = 210;
const A4_H = 297;
const MARGIN = 18;
const THUMB_MM = 12;
const FALLBACK_IMAGE = "/images/thry-hero-statues.svg";

type Doc = {
  addPage: () => void;
  setFont: (font: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  text: (
    text: string | string[],
    x: number,
    y: number,
    options?: { align?: "left" | "center" | "right"; maxWidth?: number },
  ) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  addImage: (
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  output: (type: "blob") => Blob;
  internal: { getNumberOfPages: () => number };
};

function buildTimestampedFilename(prefix: string): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const DD = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  return `${prefix}_${YYYY}${MM}${DD}_${HH}${mm}${SS}.pdf`;
}

function forceDownloadPdf(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function absoluteImageUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function nextImageProxyUrl(url: string): string {
  return `${window.location.origin}/_next/image?url=${encodeURIComponent(url)}&w=128&q=80`;
}

async function blobToSquareJpeg(blob: Blob): Promise<string | null> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = objectUrl;
    });
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.max(size / image.width, size / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchImageAsJpeg(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = blob.type || "";
    if (
      type &&
      !type.startsWith("image/") &&
      type !== "application/octet-stream"
    ) {
      return null;
    }
    return blobToSquareJpeg(blob);
  } catch {
    return null;
  }
}

async function imageUrlToJpegDataUrl(url: string): Promise<string | null> {
  if (typeof window === "undefined" || !url) return null;
  if (url === FALLBACK_IMAGE || url.toLowerCase().endsWith(".svg")) return null;
  const abs = absoluteImageUrl(url);
  const direct = await fetchImageAsJpeg(abs);
  if (direct) return direct;
  if (abs.startsWith("http")) {
    return fetchImageAsJpeg(nextImageProxyUrl(abs));
  }
  return null;
}

async function loadItemImages(
  order: PackingSlipOrder,
): Promise<(string | null)[]> {
  return Promise.all(
    order.items.map((item) => imageUrlToJpegDataUrl(item.imageUrl)),
  );
}

function drawRule(doc: Doc, y: number) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, A4_W - MARGIN, y);
}

function drawHeader(doc: Doc, order: PackingSlipOrder, y: number): number {
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(PACKING_SLIP_BRAND, MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const rightX = A4_W - MARGIN;
  doc.text(formatPackingSlipOrderHeading(order.id), rightX, y, {
    align: "right",
  });
  doc.text(formatPackingSlipDate(order.createdAt), rightX, y + 6, {
    align: "right",
  });
  return y + 18;
}

function drawAddresses(doc: Doc, order: PackingSlipOrder, y: number): number {
  const colW = (A4_W - MARGIN * 2 - 10) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SHIP TO", leftX, y);
  doc.text("BILL TO", rightX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const ship = buildPackingSlipRecipientLines({
    ...order,
    includePhone: true,
  });
  const bill = buildPackingSlipRecipientLines({
    ...order,
    includePhone: false,
  });

  const wrapCol = (lines: string[]) =>
    lines.flatMap((line) => doc.splitTextToSize(line, colW));
  const shipWrapped = wrapCol(ship);
  const billWrapped = wrapCol(bill);
  const maxLines = Math.max(shipWrapped.length, billWrapped.length);
  const lineH = 5;
  for (let i = 0; i < maxLines; i++) {
    const rowY = y + 7 + i * lineH;
    if (shipWrapped[i]) doc.text(shipWrapped[i], leftX, rowY);
    if (billWrapped[i]) doc.text(billWrapped[i], rightX, rowY);
  }
  return y + 7 + maxLines * lineH + 4;
}

function drawItemHeader(doc: Doc, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ITEMS", MARGIN, y);
  doc.text("QUANTITY", A4_W - MARGIN, y, { align: "right" });
  return y + 4;
}

function ensureSpace(doc: Doc, y: number, need: number): number {
  if (y + need <= A4_H - 42) return y;
  doc.addPage();
  return 22;
}

async function fetchAdminShopAddressLines(): Promise<readonly string[]> {
  try {
    const response = await fetch("/api/admin/integrations", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return resolvePackingSlipShopAddressLines(null);
    const payload = (await response.json()) as {
      storefrontContact?: {
        isEnabled?: boolean;
        value?: { addressLines?: unknown } | null;
      } | null;
    };
    return resolvePackingSlipShopAddressLines(payload.storefrontContact);
  } catch {
    return resolvePackingSlipShopAddressLines(null);
  }
}

function drawFooter(
  doc: Doc,
  y: number,
  shopAddressLines?: readonly string[] | null,
) {
  const footer = buildPackingSlipShopFooter(shopAddressLines);
  const contentW = A4_W - MARGIN * 2;
  let cursor = y + 4;
  cursor = ensureSpace(doc, cursor, 36);
  drawRule(doc, cursor);
  cursor += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(PACKING_SLIP_THANKS, A4_W / 2, cursor, { align: "center" });
  cursor += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(footer.brand, A4_W / 2, cursor, { align: "center" });
  cursor += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const addrLines = doc.splitTextToSize(footer.address, contentW);
  doc.text(addrLines, A4_W / 2, cursor, { align: "center" });
  cursor += addrLines.length * 5;
  if (footer.mobile) {
    doc.text(footer.mobile, A4_W / 2, cursor, { align: "center" });
  }
}

async function drawPackingSlip(
  doc: Doc,
  order: PackingSlipOrder,
  shopAddressLines?: readonly string[] | null,
) {
  const thumbs = await loadItemImages(order);
  let y = drawHeader(doc, order, 22);
  y = drawAddresses(doc, order, y);
  y += 4;
  y = drawItemHeader(doc, y);
  // Printed sheet: ITEMS / QUANTITY sit on a full-width rule, then product rows.
  drawRule(doc, y);
  y += 7;

  const nameWidth = A4_W - MARGIN * 2 - THUMB_MM - 28;
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const nameLines = doc
      .splitTextToSize(item.name || "Item", nameWidth)
      .slice(0, 2);
    const rowH = Math.max(THUMB_MM + 5, nameLines.length * 5 + 6);
    y = ensureSpace(doc, y, rowH);
    const thumb = thumbs[i];
    if (thumb) {
      try {
        doc.addImage(thumb, "JPEG", MARGIN, y - 3, THUMB_MM, THUMB_MM);
      } catch {
        /* skip broken thumbnail */
      }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(nameLines, MARGIN + THUMB_MM + 4, y + 2);
    doc.text(formatPackingSlipQuantity(item.quantity), A4_W - MARGIN, y + 2, {
      align: "right",
    });
    y += rowH;
  }

  drawFooter(doc, y, shopAddressLines);
}

export async function downloadOrderPdf(order: PackingSlipOrder) {
  if (typeof window === "undefined") {
    throw new Error("Packing slip PDF is only available in the browser.");
  }
  const { jsPDF } = await import("jspdf");
  const shopAddressLines = await fetchAdminShopAddressLines();
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as unknown as Doc;
  await drawPackingSlip(doc, order, shopAddressLines);
  const blob = doc.output("blob");
  forceDownloadPdf(blob, buildTimestampedFilename("THRY_Order"));
}

export async function downloadOrdersPdf(orders: PackingSlipOrder[]) {
  if (typeof window === "undefined") {
    throw new Error("Packing slip PDF is only available in the browser.");
  }
  if (orders.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const shopAddressLines = await fetchAdminShopAddressLines();
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as unknown as Doc;
  for (let i = 0; i < orders.length; i++) {
    if (i > 0) doc.addPage();
    await drawPackingSlip(doc, orders[i], shopAddressLines);
  }
  const blob = doc.output("blob");
  forceDownloadPdf(blob, buildTimestampedFilename("THRY_Orders"));
}
