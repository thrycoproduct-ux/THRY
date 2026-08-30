import {
  computeRazorpayModalDwellMs,
  isLongRazorpayModalDwell,
  startRazorpayModalHostGuard,
} from "@/lib/payments/razorpay-checkout-client";

describe("computeRazorpayModalDwellMs", () => {
  it("returns null when modal never opened", () => {
    expect(computeRazorpayModalDwellMs(null, 1000)).toBeNull();
  });

  it("rounds dwell from open to end", () => {
    expect(computeRazorpayModalDwellMs(1000, 4550.7)).toBe(3551);
  });

  it("flags long dwell as stuck/intent proxy", () => {
    expect(isLongRazorpayModalDwell(19_999)).toBe(false);
    expect(isLongRazorpayModalDwell(20_000)).toBe(true);
    expect(isLongRazorpayModalDwell(null)).toBe(false);
  });
});

const flushMutations = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("startRazorpayModalHostGuard", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    stop?.();
    stop = null;
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.removeAttribute("style");
    document.body.removeAttribute("data-scroll-locked");
    document.body.removeAttribute("aria-hidden");
    document.body.removeAttribute("inert");
    document.body.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  it("unlocks a host body that Radix left blocked", async () => {
    document.body.style.pointerEvents = "none";
    document.body.setAttribute("data-scroll-locked", "1");
    document.body.setAttribute("aria-hidden", "true");

    stop = startRazorpayModalHostGuard();

    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(document.body.hasAttribute("aria-hidden")).toBe(false);
  });

  it("re-unlocks when a dialog blocks the body after Razorpay opens", async () => {
    stop = startRazorpayModalHostGuard();

    document.body.style.pointerEvents = "none";
    await flushMutations();

    expect(document.body.style.pointerEvents).toBe("");
  });

  it("never writes to an unblocked body", async () => {
    stop = startRazorpayModalHostGuard();

    const seen: string[] = [];
    const spy = new MutationObserver((records) => {
      records.forEach((record) => seen.push(record.attributeName ?? ""));
    });
    spy.observe(document.body, { attributes: true });

    // An unrelated attribute change must not trigger a write from the guard.
    // Writing unconditionally makes the guard observe its own mutation and
    // spin the microtask queue forever, freezing the tab before Razorpay paints.
    document.body.setAttribute("data-theme", "light");
    await flushMutations();
    spy.disconnect();

    expect(seen).toEqual(["data-theme"]);
    expect(document.body.getAttribute("style")).toBeNull();
  });
});
