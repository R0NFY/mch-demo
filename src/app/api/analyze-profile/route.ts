import { ensureBucketExists, uploadObject } from "../../../../lib/s3";
import { NextResponse } from "next/server";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

type Body = {
  object_key?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const objectKey = String(body?.object_key ?? "").trim();
    if (!objectKey) {
      return NextResponse.json({ ok: false, error: "Missing `object_key`." }, { status: 400 });
    }

    const bucket = requiredEnv("YANDEX_BUCKET_NAME");
    const mock = String(process.env.MOCK_DATASPHERE ?? "").toLowerCase() === "true";

    const jobId = crypto.randomUUID();

    if (mock) {
      await ensureBucketExists(bucket);
      const resultKey = `results/${jobId}.json`;
      const payload = {
        scores: {
          openness: 0.72,
          conscientiousness: 0.64,
          extraversion: 0.55,
          agreeableness: 0.7,
          neuroticism: 0.32,
        },
        summary:
          "Mock result. Enable real DataSphere job execution by configuring the DataSphere env vars and setting MOCK_DATASPHERE=false.",
        source_video_key: objectKey,
        created_at: new Date().toISOString(),
      };
      await uploadObject({
        bucket,
        key: resultKey,
        body: Buffer.from(JSON.stringify(payload, null, 2)),
        contentType: "application/json",
      });

      return NextResponse.json({ ok: true, job_id: jobId, mocked: true });
    }

    requiredEnv("DATASPHERE_FOLDER_ID");
    requiredEnv("YANDEX_SERVICE_ACCOUNT_KEY_JSON");
    requiredEnv("DATASPHERE_JOB_ID");

    return NextResponse.json(
      {
        ok: false,
        error:
          "DataSphere execution is not wired yet. Set MOCK_DATASPHERE=true to test end-to-end, or provide DataSphere integration details.",
        required_env: [
          "YANDEX_SERVICE_ACCOUNT_KEY_JSON",
          "DATASPHERE_FOLDER_ID",
          "DATASPHERE_JOB_ID",
        ],
      },
      { status: 501 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Analyze failed", details: safeError(err) },
      { status: 500 }
    );
  }
}
