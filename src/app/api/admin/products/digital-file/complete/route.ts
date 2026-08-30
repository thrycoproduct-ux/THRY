import { publicErrorMessage } from "@/lib/api/public-error";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  DIGITAL_UPLOAD_LIMIT_BYTES,
  DIGITAL_ZIP_CONTENT_TYPE,
  assertDigitalUploadLimits,
  isValidDigitalObjectKey,
  sanitizeDownloadFileName,
} from "@/lib/products/digital-product";
import { statObject } from "@/lib/s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const completeSchema = z.object({
  key: z.string().trim().min(1).max(255),
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
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid digital upload complete payload." },
        { status: 400 },
      );
    }

    assertDigitalUploadLimits({
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize,
    });

    if (!isValidDigitalObjectKey(parsed.data.key)) {
      return NextResponse.json(
        { message: "Invalid digital file key." },
        { status: 400 },
      );
    }

    const stat = await statObject(parsed.data.key);
    if (!stat.size || stat.size > DIGITAL_UPLOAD_LIMIT_BYTES) {
      return NextResponse.json(
        { message: "Uploaded file was not found or is too large." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      key: parsed.data.key,
      fileName: sanitizeDownloadFileName(parsed.data.fileName),
      fileSize: stat.size,
      contentType:
        parsed.data.contentType?.trim() ||
        stat.contentType ||
        DIGITAL_ZIP_CONTENT_TYPE,
    });
  } catch (error) {
    console.error("[digital-file/complete] failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : publicErrorMessage(error, "Could not finish digital upload."),
      },
      { status: 400 },
    );
  }
}
