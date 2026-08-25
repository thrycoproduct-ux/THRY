/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useProductSizePreviews } from "./useProductSizePreviews";

const SEEDED = {
  a: { enabled: true, optionName: "Size", labels: ["S : 1"] },
  b: { enabled: false, optionName: "Size", labels: [] },
} as const;

const PARTIAL_SEED = {
  a: { enabled: true, optionName: "Size", labels: ["S : 1"] },
} as const;

describe("useProductSizePreviews", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("seeds from initial previews without fetching", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result, unmount } = renderHook(() =>
      useProductSizePreviews(["a", "b"], SEEDED),
    );

    expect(result.current.a?.labels).toEqual(["S : 1"]);
    expect(result.current.b).toBeUndefined();
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
    unmount();
  });

  it("batches missing ids in one request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        c: {
          enabled: true,
          name: "Size",
          options: [{ value: "M", qty: 3 }],
          groups: [
            {
              name: "Size",
              options: [{ value: "M", qty: 3 }],
            },
          ],
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result, unmount } = renderHook(() =>
      useProductSizePreviews(["a", "c"], PARTIAL_SEED),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.c?.labels).toEqual(["M : 3"]);
    });

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/products/size-config?productIds=");
    expect(decodeURIComponent(calledUrl)).toContain("c");
    expect(calledUrl).not.toMatch(/[?&]productId=/);
    unmount();
  });
});
