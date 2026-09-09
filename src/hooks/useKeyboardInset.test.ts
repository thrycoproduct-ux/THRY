import { computeKeyboardInset } from "./useKeyboardInset";

describe("computeKeyboardInset", () => {
  it("returns keyboard height when only the visual viewport shrank (resizes-visual WebView)", () => {
    // 745px layout viewport, keyboard 320px → visual 425px, no pan
    expect(computeKeyboardInset(745, 425, 0)).toBe(320);
  });

  it("accounts for visual viewport pan (offsetTop) when the browser scrolls a focused input into view", () => {
    // Visual viewport panned down 100px while keyboard is open
    expect(computeKeyboardInset(745, 425, 100)).toBe(220);
  });

  it("is 0 when the layout viewport already shrank with the keyboard (iOS / resizes-content / host-resized WebView)", () => {
    expect(computeKeyboardInset(425, 425, 0)).toBe(0);
  });

  it("ignores URL-bar / scrollbar jitter below the keyboard threshold", () => {
    expect(computeKeyboardInset(745, 700, 0)).toBe(0);
    expect(computeKeyboardInset(745, 745, 0)).toBe(0);
  });

  it("never goes negative", () => {
    expect(computeKeyboardInset(700, 745, 0)).toBe(0);
  });
});
