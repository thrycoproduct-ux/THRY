import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Vercel function region", () => {
  it("pins a single Mumbai region next to THRY Supabase (ap-south-1)", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { regions?: string[] };
    expect(config.regions).toEqual(["bom1"]);
  });
});
