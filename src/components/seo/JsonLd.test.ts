import { toJsonLdDocuments } from "./JsonLd";

describe("toJsonLdDocuments", () => {
  it("keeps a single object as-is", () => {
    const input = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "THRY",
    };
    expect(toJsonLdDocuments(input)).toEqual([input]);
  });

  it("wraps arrays in a single @graph document", () => {
    const docs = toJsonLdDocuments([
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "THRY",
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "THRY",
      },
    ]);

    expect(docs).toHaveLength(1);
    expect(docs[0]?.["@context"]).toBe("https://schema.org");
    expect(docs[0]?.["@graph"]).toEqual([
      { "@type": "Organization", name: "THRY" },
      { "@type": "WebSite", name: "THRY" },
    ]);
  });

  it("returns empty list for empty arrays", () => {
    expect(toJsonLdDocuments([])).toEqual([]);
  });
});
