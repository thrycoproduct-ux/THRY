/**
 * @jest-environment jsdom
 */
import { clearPersistedCartStorage } from "./clear-persisted-cart";

describe("clearPersistedCartStorage", () => {
  beforeEach(() => {
    window.localStorage.setItem("cart", JSON.stringify({ cart: { a: { quantity: 4 } } }));
    window.sessionStorage.setItem(
      "cart",
      JSON.stringify({ cart: { a: { quantity: 4 } } }),
    );
    document.cookie = "cart=stale; path=/";
  });

  it("removes cookie, localStorage, and sessionStorage copies", () => {
    clearPersistedCartStorage();

    expect(window.localStorage.getItem("cart")).toBeNull();
    expect(window.sessionStorage.getItem("cart")).toBeNull();
    expect(document.cookie.includes("cart=stale")).toBe(false);
  });
});
