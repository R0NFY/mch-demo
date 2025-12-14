import { NextResponse } from "next/server";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

type Body = {
  text?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = requiredEnv("DEEPGRAM_API_KEY");
    const model = process.env.DEEPGRAM_TTS_MODEL?.trim() || "aura-asteria-en";
    const encoding = process.env.DEEPGRAM_TTS_ENCODING?.trim() || "mp3";

    const body = (await req.json()) as Body;
    const text = String(body?.text ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Missing `text`." }, { status: 400 });

    const url = new URL("https://api.deepgram.com/v1/speak");
    url.searchParams.set("model", model);
    url.searchParams.set("encoding", encoding);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Token ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Deepgram TTS failed (${res.status})`, details },
        { status: 502 }
      );
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": encoding === "wav" ? "audio/wav" : "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "TTS failed", details: safeError(err) },
      { status: 500 }
    );
  }
}
