type JsonLdObject = Record<string, unknown>;

type Props = {
  data: JsonLdObject | JsonLdObject[];
};

/**
 * Emit one or more JSON-LD script tags.
 *
 * Prefer separate scripts (or a single @graph document) over a bare JSON
 * array root — some Safari / crawler tooling crashes on
 * `undefined["@context"].toLowerCase` when parsing array-shaped ld+json.
 */
export function toJsonLdDocuments(
  data: JsonLdObject | JsonLdObject[],
): JsonLdObject[] {
  if (!Array.isArray(data)) return [data];
  if (data.length === 0) return [];

  // Keep a single root object with @graph when multiple nodes are provided.
  return [
    {
      "@context": "https://schema.org",
      "@graph": data.map((item) => {
        const { ["@context"]: _context, ...rest } = item;
        return rest;
      }),
    },
  ];
}

export function JsonLd({ data }: Props) {
  const documents = toJsonLdDocuments(data);

  return (
    <>
      {documents.map((document, index) => (
        <script
          // Stable enough for static SEO payloads (order is intentional).
          key={`json-ld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(document) }}
        />
      ))}
    </>
  );
}
