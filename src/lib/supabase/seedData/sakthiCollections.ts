import { eq, inArray } from "drizzle-orm";
import db from "../db";
import * as schema from "../schema";
import { slugify } from "@/lib/utils";
import { collectionImageForLabel } from "./collectionPlaceholders";

/** HOC saree categories (homepage carousel + /collections/[slug]) */
export const SAKTHI_COLLECTION_LABELS = [
  "Softie Sarees",
  "Kanjivaram Wedding Sarees",
  "Soft Silk Sarees",
  "Banaras Tissue Silk Sarees",
  "Traditional Silk Sarees",
  "Kubera Pattu Sarees",
  "Wedding Collections",
  "Cotton Sarees",
  "Silk Cotton Sarees",
  "Fancy Silk Sarees",
  "Mysore Silk",
  "Space Silk Saree",
  "Fancy Sarees",
  "Celebrity Inspired Saree",
] as const;

const DEMO_COLLECTION_SLUGS = [
  "bathroom",
  "kitchen-planning",
  "living-room-planning",
  "Bedroom-planning",
];

function collectionCopy(label: string) {
  return {
    title: label,
    description: `Explore our ${label} at THRY.`,
  };
}

export type SeedSakthiCollectionsOptions = {
  /** Remove old demo furniture collections (Bathroom, Kitchen, etc.) */
  removeDemo?: boolean;
};

export default async function seedSakthiCollections(
  options: SeedSakthiCollectionsOptions = {},
) {
  const { removeDemo = false } = options;

  if (removeDemo) {
    const deleted = await db
      .delete(schema.collections)
      .where(inArray(schema.collections.slug, DEMO_COLLECTION_SLUGS))
      .returning({ slug: schema.collections.slug });
    if (deleted.length) {
      console.log(
        `Removed ${deleted.length} demo collection(s): ${deleted.map((c) => c.slug).join(", ")}`,
      );
    }
  }

  let created = 0;
  let updated = 0;

  for (let i = 0; i < SAKTHI_COLLECTION_LABELS.length; i++) {
    const label = SAKTHI_COLLECTION_LABELS[i];
    const slug = slugify(label);
    const { title, description } = collectionCopy(label);
    const order = i + 1;
    const imageKey = collectionImageForLabel(label, i);
    const imageAlt = `${label} — THRY`;

    const existing = await db
      .select()
      .from(schema.collections)
      .where(eq(schema.collections.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      if (row.featuredImageId) {
        await db
          .update(schema.medias)
          .set({ key: imageKey, alt: imageAlt })
          .where(eq(schema.medias.id, row.featuredImageId));
      }
      await db
        .update(schema.collections)
        .set({ label, title, description, order })
        .where(eq(schema.collections.id, row.id));
      updated++;
      console.log(`Updated: ${label} → /collections/${slug}`);
      continue;
    }

    const [media] = await db
      .insert(schema.medias)
      .values({
        key: imageKey,
        alt: imageAlt,
      })
      .returning();

    if (!media) {
      throw new Error(`Failed to create media for ${label}`);
    }

    await db.insert(schema.collections).values({
      label,
      slug,
      title,
      description,
      order,
      featuredImageId: media.id,
    });

    created++;
    console.log(`Created: ${label} → /collections/${slug}`);
  }

  console.log(
    `\nDone. ${created} created, ${updated} updated (${SAKTHI_COLLECTION_LABELS.length} categories total).`,
  );
}
