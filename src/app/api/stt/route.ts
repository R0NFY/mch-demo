import { NextResponse } from "next/server";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function POST(req: Request) {
  try {
    const apiKey = requiredEnv("DEEPGRAM_API_KEY");
    const model = process.env.DEEPGRAM_STT_MODEL?.trim() || "nova-2";

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing form field: file" }, { status: 400 });
    }

    const audioBytes = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";

    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", model);
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Token ${apiKey}`,
        "content-type": contentType,
      },
      body: audioBytes,
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Deepgram STT failed (${res.status})`, details: json },
        { status: 502 }
      );
    }

    const transcript =
      json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
      json?.channels?.[0]?.alternatives?.[0]?.transcript ??
      "";

    const trimmed = String(transcript ?? "").trim();
    if (!trimmed) {
      return NextResponse.json(
        { ok: false, error: "No speech detected in audio.", details: { model, raw: json } },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, model, transcript: trimmed, raw: json });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "STT failed", details: safeError(err) },
      { status: 500 }
    );
  }
}
