import { publicErrorMessage } from "@/lib/api/public-error";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  DIGITAL_UPLOAD_URL_TTL_SEC,
  DIGITAL_ZIP_CONTENT_TYPE,
  assertDigitalUploadLimits,
  buildDigitalObjectKey,
  sanitizeDownloadFileName,
} from "@/lib/products/digital-product";
import { createPresignedPutUrl } from "@/lib/s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const initSchema = z.object({
  fileName: z.string().trim().min(1).max(500),
  contentType: z.string().trim().max(128).optional(),
  fileSize: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = initSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid digital upload payload." },
        { status: 400 },
      );
    }

    assertDigitalUploadLimits({
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize,
    });

    const key = buildDigitalObjectKey(parsed.data.fileName);
    const contentType = DIGITAL_ZIP_CONTENT_TYPE;
    const uploadUrl = await createPresignedPutUrl({
      key,
      contentType,
      contentLength: parsed.data.fileSize,
      expiresInSeconds: DIGITAL_UPLOAD_URL_TTL_SEC,
    });

    return NextResponse.json(
      {
        key,
        uploadUrl,
        fileName: sanitizeDownloadFileName(parsed.data.fileName),
        contentType,
        fileSize: parsed.data.fileSize,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[digital-file/init] failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : publicErrorMessage(error, "Could not start digital upload."),
      },
      { status: 400 },
    );
  }
}
