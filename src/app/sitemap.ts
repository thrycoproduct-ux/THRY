import type { MetadataRoute } from "next";
import { SEO_STATIC_PAGES } from "@/lib/seo/constants";
import {
  getCollectionSlugs,
  getPublishedProductSlugs,
} from "@/lib/seo/sitemap-data";
import { getURL } from "@/lib/utils";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getURL();
  const now = new Date();

  const collectionRows = await getCollectionSlugs();
  const productRows = await getPublishedProductSlugs();

  const staticEntries: MetadataRoute.Sitemap = SEO_STATIC_PAGES.map((page) => ({
    url: `${base}${page.path.slice(1)}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const collectionEntries: MetadataRoute.Sitemap = collectionRows.map(
    (row) => ({
      url: `${base}collections/${encodeURIComponent(row.slug)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  const productEntries: MetadataRoute.Sitemap = productRows.map((row) => ({
    url: `${base}shop/${encodeURIComponent(row.slug)}`,
    lastModified: row.createdAt ?? now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...collectionEntries, ...productEntries];
}
