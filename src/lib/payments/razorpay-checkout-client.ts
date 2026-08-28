import {
  RAZORPAY_CHECKOUT_SCRIPT_URL,
  razorpayCheckoutSessionSchema,
  type RazorpayCheckoutSessionPayload,
} from "@/lib/payments/razorpay-standards";

const SCRIPT_TIMEOUT_MS = 12_000;
const MODAL_OPEN_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [0, 600, 1600] as const;

type RazorpayCtor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};

type RazorpayWindow = Window & { Razorpay?: RazorpayCtor };

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

let loadPromise: Promise<void> | null = null;

export function parseRazorpayCheckoutSessionPayload(
  payload: unknown,
): RazorpayCheckoutSessionPayload {
  const parsed = razorpayCheckoutSessionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid Razorpay checkout response from server.");
  }
  return parsed.data;
}

function getRazorpayCtor(): RazorpayCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as RazorpayWindow).Razorpay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Close the phone keyboard and host focus trap so Razorpay taps work. */
export async function prepareHostPageForRazorpayModal(): Promise<void> {
  if (typeof document === "undefined") return;

  const active = document.activeElement;
  // Only dismiss the focused field — blurring every button/input on the page
  // can interrupt Razorpay's UPI intent / "Open app" handoff on mobile.
  if (active instanceof HTMLElement) active.blur();

  // Radix Dialog sets body pointer-events:none while open. Razorpay’s iframe
  // is a body child, so Continue / Exit buttons never receive clicks.
  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("overflow");
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("inert");
  document.body.removeAttribute("aria-hidden");
  document.querySelectorAll("[data-radix-scroll-lock]").forEach((node) => {
    node.parentElement?.removeChild(node);
  });

  // Only Radix checkout dialog chrome — never generic [role="dialog"], which
  // can match Razorpay's own UPI / "Open app" UI on mobile.
  document
    .querySelectorAll<HTMLElement>(
      "[data-radix-dialog-overlay], [data-radix-focus-guard], [data-radix-dialog-content]",
    )
    .forEach((node) => {
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("pointer-events", "none", "important");
    });

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  // iOS keeps the keyboard up for ~300ms after blur; Radix needs a tick to unmount.
  await sleep(450);

  document.body.style.removeProperty("pointer-events");
}

function isHostBlocked(body: HTMLElement): boolean {
  return (
    body.style.pointerEvents === "none" ||
    body.hasAttribute("data-scroll-locked") ||
    body.hasAttribute("inert") ||
    body.getAttribute("aria-hidden") === "true"
  );
}

/**
 * Radix focus scopes can mark Razorpay's overlay inert once on attach.
 * Run once when the modal opens — never poll; polling breaks UPI intent handoff.
 */
function ensureRazorpayOverlayInteractiveOnce(): void {
  document
    .querySelectorAll<HTMLElement>(".razorpay-container, .razorpay-backdrop")
    .forEach((node) => {
      if (node.getAttribute("aria-hidden") === "true") {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("data-aria-hidden");
      }
      if (node.hasAttribute("inert")) node.removeAttribute("inert");
      if (node.style.pointerEvents === "none") {
        node.style.removeProperty("pointer-events");
      }
    });
}

/**
 * Radix Dialog can re-apply pointer-events:none after we unlock. Keep the host
 * clickable only until Razorpay owns the page — then stop so UPI/GPay intents
 * are not interrupted by DOM writes.
 */
export function startRazorpayModalHostGuard(): () => void {
  if (typeof document === "undefined") return () => undefined;

  const body = document.body;
  let observer: MutationObserver | null = null;
  let stopped = false;

  const observe = () => {
    if (stopped) return;
    observer?.observe(body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked", "aria-hidden", "inert"],
    });
  };

  // Write only when the host is actually blocked. Writing on every callback
  // makes the observer react to its own mutation, which spins the microtask
  // queue forever and freezes the tab before Razorpay can paint.
  const unlock = () => {
    if (stopped || !isHostBlocked(body)) return;
    observer?.disconnect();
    body.style.removeProperty("pointer-events");
    body.removeAttribute("data-scroll-locked");
    body.removeAttribute("inert");
    body.removeAttribute("aria-hidden");
    observer?.takeRecords();
    observe();
  };

  unlock();
  observer = new MutationObserver(unlock);
  observe();

  return () => {
    stopped = true;
    observer?.disconnect();
    observer = null;
  };
}

function findCheckoutScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(
    `script[src="${RAZORPAY_CHECKOUT_SCRIPT_URL}"]`,
  );
}

function removeCheckoutScript(): void {
  findCheckoutScript()?.remove();
}

function waitForConstructor(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getRazorpayCtor()) {
      resolve();
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Razorpay checkout is taking too long. Check your connection and try again.",
        ),
      );
    }, SCRIPT_TIMEOUT_MS);

    const onLoad = () => {
      cleanup();
      if (getRazorpayCtor()) {
        resolve();
        return;
      }
      reject(new Error("Razorpay checkout script failed to initialize."));
    };

    const onError = () => {
      cleanup();
      reject(
        new Error(
          "Razorpay checkout script failed to load. Please retry checkout.",
        ),
      );
    };

    function cleanup() {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    }

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
  });
}

async function insertOfficialCheckoutScript(): Promise<void> {
  if (getRazorpayCtor()) return;

  const existing = findCheckoutScript();
  if (existing) {
    try {
      await waitForConstructor(existing);
      return;
    } catch (error) {
      removeCheckoutScript();
      throw error;
    }
  }

  const script = document.createElement("script");
  script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
  script.async = true;
  script.dataset.razorpayCheckout = "1";
  document.head.appendChild(script);
  await waitForConstructor(script);
}

async function loadRazorpayScriptWithRetry(): Promise<void> {
  let lastError: unknown;
  for (const delayMs of RETRY_DELAYS_MS) {
    if (getRazorpayCtor()) return;
    if (delayMs > 0) await sleep(delayMs);
    try {
      await insertOfficialCheckoutScript();
      if (getRazorpayCtor()) return;
    } catch (error) {
      lastError = error;
      removeCheckoutScript();
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Razorpay checkout script failed to load. Please retry.");
}

export async function ensureRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Razorpay checkout is only available in the browser.");
  }
  if (getRazorpayCtor()) return;

  if (!loadPromise) {
    loadPromise = loadRazorpayScriptWithRetry();
  }

  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }

  if (!getRazorpayCtor()) {
    loadPromise = null;
    throw new Error("Razorpay checkout script loaded but did not initialize.");
  }
}

/** Official CDN script on cart / Buy Now pages so checkout.js is ready before Pay. */
export function preloadRazorpayCheckoutScript(): void {
  if (typeof window === "undefined") return;
  void ensureRazorpayCheckoutScript().catch(() => {
    loadPromise = null;
  });
}

export function preconnectRazorpayCheckout(): void {
  if (typeof document === "undefined") return;
  const href = "https://checkout.razorpay.com";
  if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = href;
  document.head.appendChild(link);
}

function isRazorpayModalVisible(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector("iframe[src*='razorpay']") ||
      document.querySelector("iframe[src*='rzp.io']") ||
      document.querySelector(".razorpay-container") ||
      document.querySelector(".razorpay-checkout-frame"),
  );
}

export async function openRazorpayCheckout(params: {
  payload: RazorpayCheckoutSessionPayload;
  onDismiss?: () => void;
  onOpened?: () => void;
}): Promise<RazorpayHandlerResponse> {
  await ensureRazorpayCheckoutScript();

  const RazorpayCtor = getRazorpayCtor();
  if (!RazorpayCtor) {
    throw new Error("Razorpay SDK did not initialize.");
  }

  const session = params.payload;
  await prepareHostPageForRazorpayModal();
  const stopHostGuard = startRazorpayModalHostGuard();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timers: {
      poll?: ReturnType<typeof window.setInterval> | number;
      open?: ReturnType<typeof window.setTimeout> | number;
      hide?: ReturnType<typeof window.setTimeout> | number;
    } = {};

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timers.poll !== undefined) window.clearInterval(timers.poll);
      if (timers.open !== undefined) window.clearTimeout(timers.open);
      if (timers.hide !== undefined) window.clearTimeout(timers.hide);
      stopHostGuard();
      fn();
    };

    const checkout = new RazorpayCtor({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      name: session.name,
      description: session.description ?? "THRY order",
      order_id: session.razorpayOrderId,
      prefill: session.prefill,
      theme: { color: session.themeColor || "#c03078" },
      // Docs: retry.enabled is for web; max_count is Android/iOS SDK only.
      retry: { enabled: true },
      modal: {
        // Host dialogs must not steal the first click. Do not use confirm_close:
        // that extra Exit popup was unclickable while body still had pointer-events:none.
        confirm_close: false,
        backdropclose: false,
        escape: true,
        animation: true,
        ondismiss: () => {
          params.onDismiss?.();
          settle(() => reject(new Error("Payment cancelled.")));
        },
      },
      handler: (response: RazorpayHandlerResponse) => {
        settle(() => resolve(response));
      },
    });

    checkout.on("payment.failed", (response: unknown) => {
      const description =
        response &&
        typeof response === "object" &&
        "error" in response &&
        response.error &&
        typeof response.error === "object" &&
        "description" in response.error
          ? String(
              (response.error as { description?: string }).description ?? "",
            )
          : "";
      settle(() =>
        reject(new Error(description || "Razorpay payment failed.")),
      );
    });

    let openedAnnounced = false;
    const announceOpened = () => {
      if (settled || openedAnnounced) return;
      openedAnnounced = true;
      if (timers.poll !== undefined) window.clearInterval(timers.poll);
      if (timers.hide !== undefined) window.clearTimeout(timers.hide);
      timers.poll = undefined;
      timers.hide = undefined;
      // Stop touching the host DOM once Razorpay is open — continued writes
      // dismiss the mobile "Open GPay" banner and leave the coin spinner stuck.
      stopHostGuard();
      ensureRazorpayOverlayInteractiveOnce();
      params.onOpened?.();
    };

    try {
      checkout.open();
      // Razorpay docs: modal opens synchronously after open(). Do not wait for
      // iframe polling — that left users stuck on "Opening Razorpay" when the
      // host guard froze the main thread.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => announceOpened());
      });
    } catch (error) {
      settle(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Razorpay checkout failed to open."),
        ),
      );
      return;
    }

    if (isRazorpayModalVisible()) {
      announceOpened();
    }

    timers.poll = window.setInterval(() => {
      if (isRazorpayModalVisible()) {
        if (timers.poll) window.clearInterval(timers.poll);
        timers.poll = undefined;
        announceOpened();
      }
    }, 120);

    timers.hide = window.setTimeout(announceOpened, 1800);

    timers.open = window.setTimeout(() => {
      if (isRazorpayModalVisible()) {
        announceOpened();
        return;
      }
      settle(() =>
        reject(
          new Error("Payment window did not open. Please retry checkout."),
        ),
      );
    }, MODAL_OPEN_TIMEOUT_MS);
  });
}
