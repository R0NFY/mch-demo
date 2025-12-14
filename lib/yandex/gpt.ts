import { getIamToken, getYandexFolderId } from "./iam";

export type YandexGptMessage = { role: "system" | "user" | "assistant"; text: string };

export type YandexGptResult = {
  modelUri: string;
  text: string;
  raw: unknown;
};

function getModelUri(): string {
  const explicit = process.env.YANDEX_GPT_MODEL_URI?.trim();
  if (explicit) return explicit;

  const folderId = getYandexFolderId();
  const model = process.env.YANDEX_GPT_MODEL?.trim() || "yandexgpt-lite";
  const version = process.env.YANDEX_GPT_VERSION?.trim() || "latest";
  return `gpt://${folderId}/${model}/${version}`;
}

function getEndpoint(): string {
  return (
    process.env.YANDEX_GPT_ENDPOINT?.trim() ||
    "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
  );
}

export async function yandexGptComplete(args: {
  messages: YandexGptMessage[];
  temperature?: number;
  maxTokens?: number;
}) : Promise<YandexGptResult> {
  const iamToken = await getIamToken();
  const endpoint = getEndpoint();
  const modelUri = getModelUri();

  const payload = {
    modelUri,
    completionOptions: {
      stream: false,
      temperature: args.temperature ?? 0.2,
      maxTokens: args.maxTokens ?? 800,
    },
    messages: args.messages,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${iamToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(
      `YandexGPT request failed (${res.status}): ${JSON.stringify(json) || res.statusText}`
    );
  }

  const text =
    String(
      json?.result?.alternatives?.[0]?.message?.text ??
        json?.alternatives?.[0]?.message?.text ??
        ""
    ) || "";

  if (!text.trim()) {
    throw new Error(`YandexGPT returned no text: ${JSON.stringify(json)}`);
  }

  return { modelUri, text, raw: json };
}

