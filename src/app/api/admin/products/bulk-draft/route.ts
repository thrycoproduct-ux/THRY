import { publicErrorMessage } from "@/lib/api/public-error";
import {
  createDraftProductsFromMedia,
  type BulkDraftSharedData,
} from "@/_actions/products";
import { invalidateProductCaches } from "@/lib/cache/invalidate-storefront";
import { parseBulkSharedInput } from "@/lib/admin/normalize-bulk-product-shared";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import { processUploadedImage } from "@/lib/image/processUpload";
import { uploadMediaToSupabase } from "@/lib/storage/uploadMedia";
import {
  toMediaAltText,
  withSafeUploadFile,
} from "@/lib/storage/safeUploadFileName";
import db from "@/lib/supabase/db";
import { medias } from "@/lib/supabase/schema";
import { inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_BULK_FILES = 50;

function errorJson(
  message: string,
  status: number,
  errors: string[] = [message],
) {
  return NextResponse.json(
    {
      message,
      created: [],
      errors,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const isAdmin = await isAdminUser(user);
    if (!user || !isAdmin) {
      return errorJson("Unauthorized", 401);
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const mediaIdsRaw = formData.get("mediaIds");
    const sharedRaw = formData.get("shared");

    let shared: BulkDraftSharedData | undefined;
    if (typeof sharedRaw === "string" && sharedRaw.trim().length > 0) {
      let sharedJson: unknown;
      try {
        sharedJson = JSON.parse(sharedRaw);
      } catch {
        return errorJson("Invalid shared bulk product details.", 400);
      }

      try {
        const normalized = parseBulkSharedInput(sharedJson);
        shared = {
          baseName: normalized.baseName,
          description: normalized.description,
          isDraft: normalized.isDraft,
          collectionId: normalized.collectionId,
          badge: normalized.badge,
          rating: normalized.rating,
          price: normalized.price,
          stock: normalized.stock,
          discountEnabled: normalized.discountEnabled,
          discountPercent: normalized.discountPercent,
          soldAsPack: normalized.soldAsPack,
          packSize: normalized.packSize,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Invalid shared bulk product details.";
        return errorJson(message, 400);
      }
    }

    let requestedMediaIds: string[] = [];
    if (typeof mediaIdsRaw === "string" && mediaIdsRaw.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(mediaIdsRaw);
      } catch {
        return errorJson("Invalid mediaIds payload.", 400);
      }

      const mediaIdsValidation = z.array(z.string().min(1)).safeParse(parsed);
      if (!mediaIdsValidation.success) {
        return errorJson("Invalid mediaIds payload.", 400);
      }
      requestedMediaIds = Array.from(new Set(mediaIdsValidation.data));
    }

    const totalSelected = files.length + requestedMediaIds.length;
    if (totalSelected === 0) {
      return errorJson(
        "Select at least one image from media or computer.",
        400,
      );
    }

    if (totalSelected > MAX_BULK_FILES) {
      return errorJson(
        `You can select up to ${MAX_BULK_FILES} images total at once.`,
        400,
      );
    }

    const uploadErrors: string[] = [];
    const uploadedMedias: { mediaId: string; originalFileName: string }[] = [];

    if (requestedMediaIds.length > 0) {
      const existingMediaRows = await db
        .select({ id: medias.id, alt: medias.alt })
        .from(medias)
        .where(inArray(medias.id, requestedMediaIds));

      const mediaById = new Map(existingMediaRows.map((row) => [row.id, row]));
      requestedMediaIds.forEach((mediaId) => {
        const media = mediaById.get(mediaId);
        if (!media) {
          uploadErrors.push(`${mediaId}: media not found.`);
          return;
        }
        uploadedMedias.push({
          mediaId: media.id,
          originalFileName: media.alt || media.id,
        });
      });
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        uploadErrors.push(`${file.name}: only image files are allowed.`);
        continue;
      }

      const { file: safeFile, fileName, alt } = withSafeUploadFile(file);

      try {
        const processed = await processUploadedImage(safeFile);
        const key = await uploadMediaToSupabase(
          processed.buffer,
          processed.contentType,
          processed.extension,
          "product-draft",
        );

        const [insertedMedia] = await db
          .insert(medias)
          .values({ alt, key })
          .returning({ id: medias.id });

        uploadedMedias.push({
          mediaId: insertedMedia.id,
          originalFileName: fileName,
        });
      } catch (error) {
        console.error("[bulk-draft] file upload failed:", error);
        uploadErrors.push(
          `${fileName}: ${publicErrorMessage(error, "Upload failed.")}`,
        );
      }
    }

    if (uploadedMedias.length === 0) {
      return errorJson(
        "No products were created.",
        400,
        uploadErrors.length > 0
          ? uploadErrors
          : [
              "No valid images were processed. Try smaller image set or retry once.",
            ],
      );
    }

    try {
      const createdProducts = await createDraftProductsFromMedia(
        uploadedMedias,
        shared,
      );

      await invalidateProductCaches({
        productIds: createdProducts.map((row) => row.id),
      });

      if (uploadErrors.length > 0) {
        return NextResponse.json(
          {
            message: "Created with partial errors.",
            created: createdProducts,
            errors: uploadErrors,
          },
          { status: 207 },
        );
      }

      return NextResponse.json(
        {
          message: "Draft products created.",
          created: createdProducts,
          errors: [],
        },
        { status: 201 },
      );
    } catch (error) {
      console.error("[bulk-draft] create products failed:", error);
      const message = publicErrorMessage(
        error,
        "Could not create draft products.",
      );
      return errorJson(message, 500, [...uploadErrors, message]);
    }
  } catch (error) {
    console.error("[bulk-draft] request failed:", error);
    const message = publicErrorMessage(error, "Bulk upload request failed.");
    return errorJson(message, 500, [message]);
  }
}
