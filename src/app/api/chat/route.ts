import { NextResponse } from "next/server";
import { yandexGptComplete } from "../../../../lib/yandex/gpt";
import { safeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";

type Body = {
  text?: string;
  system?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const text = String(body?.text ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Missing `text`." }, { status: 400 });

    const system =
      String(body?.system ?? "").trim() ||
      "You are a professional HR recruiter conducting a personality assessment.";

    const startedAt = Date.now();

    const resp = await yandexGptComplete({
      messages: [
        { role: "system", text: system },
        { role: "user", text },
      ],
      temperature: 0.2,
      maxTokens: 700,
    });

    return NextResponse.json({
      ok: true,
      ms: Date.now() - startedAt,
      provider: "yandexgpt",
      model_uri: resp.modelUri,
      text: resp.text,
      raw: resp.raw,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
        details: safeError(err),
      },
      { status: 500 }
    );
  }
}
