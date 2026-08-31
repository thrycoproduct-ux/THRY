import { yieldToMainThread } from "@/lib/pdf/download-packing-slip.client";

describe("yieldToMainThread", () => {
  it("resolves without throwing in jsdom", async () => {
    await expect(yieldToMainThread()).resolves.toBeUndefined();
  });
});
