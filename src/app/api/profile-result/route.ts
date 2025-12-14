import { getObjectBytes, headObject } from "../../../../lib/s3";
import { NextResponse } from "next/server";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function isNotFoundError(err: unknown): boolean {
  const anyErr = err as any;
  const status = anyErr?.$metadata?.httpStatusCode;
  if (status === 404) return true;
  const name = String(anyErr?.name ?? "");
  return name === "NotFound" || name === "NoSuchKey";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = String(url.searchParams.get("job_id") ?? "").trim();
    if (!jobId) return NextResponse.json({ ok: false, error: "Missing `job_id`." }, { status: 400 });

    const bucket = requiredEnv("YANDEX_BUCKET_NAME");
    const key = `results/${jobId}.json`;

    try {
      await headObject({ bucket, key });
    } catch (err) {
      if (isNotFoundError(err)) return NextResponse.json({ ok: true, status: "pending" });
      throw err;
    }

    const bytes = await getObjectBytes({ bucket, key });
    const parsed = JSON.parse(bytes.toString("utf8"));
    return NextResponse.json({ ok: true, status: "ready", result: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to fetch result", details: safeError(err) },
      { status: 500 }
    );
  }
}
