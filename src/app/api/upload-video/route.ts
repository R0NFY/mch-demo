import { ensureBucketExists, uploadObject } from "../../../../lib/s3";
import { NextResponse } from "next/server";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const bucket = process.env.YANDEX_BUCKET_NAME;
    if (!bucket) {
      return NextResponse.json(
        { ok: false, error: "Missing env var: YANDEX_BUCKET_NAME" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing form field: file" }, { status: 400 });
    }

    const filename = typeof (file as any).name === "string" ? ((file as any).name as string) : "";
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const lowerName = filename.toLowerCase();
    const ext =
      contentType === "video/mp4" || lowerName.endsWith(".mp4")
        ? "mp4"
        : contentType === "video/webm" || lowerName.endsWith(".webm")
          ? "webm"
          : "bin";
    const objectKey = `uploads/${crypto.randomUUID()}.${ext}`;

    await ensureBucketExists(bucket);
    await uploadObject({
      bucket,
      key: objectKey,
      body: bytes,
      contentType,
    });

    return NextResponse.json({
      ok: true,
      bucket,
      object_key: objectKey,
      bytes: bytes.byteLength,
      content_type: contentType,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Upload failed",
        details: safeError(err),
      },
      { status: 500 }
    );
  }
}
