import { getCatalogReadSource, isCatalogD1Enabled } from "./d1-mirror";

describe("catalog d1 mirror flag", () => {
  const original = process.env.CATALOG_READ;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CATALOG_READ;
    } else {
      process.env.CATALOG_READ = original;
    }
  });

  it("defaults to supabase", () => {
    delete process.env.CATALOG_READ;
    expect(getCatalogReadSource()).toBe("supabase");
    expect(isCatalogD1Enabled()).toBe(false);
  });

  it("enables d1 when CATALOG_READ=d1", () => {
    process.env.CATALOG_READ = "d1";
    expect(getCatalogReadSource()).toBe("d1");
    expect(isCatalogD1Enabled()).toBe(true);
  });
});
