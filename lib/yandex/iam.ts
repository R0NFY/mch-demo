import { SignJWT, importPKCS8 } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPrivateKey } from "node:crypto";

type ServiceAccountKey = {
  id: string; // key id
  service_account_id: string;
  private_key: string; // PEM
};

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function parseServiceAccountKey(): ServiceAccountKey {
  const raw = requiredEnv("YANDEX_SERVICE_ACCOUNT_KEY_JSON");
  return parseServiceAccountKeyFromString(raw);
}

async function parseServiceAccountKeyFromEnv(): Promise<ServiceAccountKey> {
  const raw = requiredEnv("YANDEX_SERVICE_ACCOUNT_KEY_JSON");
  const trimmed = raw.trim();

  // Allow pointing to a local JSON file for convenience (e.g. `authorized_key.json`).
  if (!trimmed.startsWith("{") && trimmed.endsWith(".json")) {
    const fullPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
    const contents = await readFile(fullPath, "utf8");
    return parseServiceAccountKeyFromString(contents);
  }

  return parseServiceAccountKeyFromString(trimmed);
}

function parseServiceAccountKeyFromString(jsonString: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(
      "YANDEX_SERVICE_ACCOUNT_KEY_JSON must be valid JSON or a path to a JSON file (e.g. authorized_key.json)."
    );
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (!key.id || !key.service_account_id || !key.private_key) {
    throw new Error(
      "YANDEX_SERVICE_ACCOUNT_KEY_JSON must contain fields: id, service_account_id, private_key"
    );
  }
  return key as ServiceAccountKey;
}

function normalizePrivateKeyPem(input: string): string {
  // Yandex keys sometimes contain escaped newlines and/or extra header text.
  const withNewlines = input.includes("\\n") ? input.replace(/\\n/g, "\n") : input;

  const match = withNewlines.match(
    /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/m
  );
  const pemBlock = (match?.[0] ?? withNewlines).trim();

  // Ensure it's a PKCS#8 PEM for jose importPKCS8
  const keyObj = createPrivateKey(pemBlock);
  return keyObj.export({ format: "pem", type: "pkcs8" }).toString();
}

async function createJwt(): Promise<string> {
  const key = await parseServiceAccountKeyFromEnv();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const pkcs8Pem = normalizePrivateKeyPem(key.private_key);
  const privateKey = await importPKCS8(pkcs8Pem, "PS256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "PS256", kid: key.id, typ: "JWT" })
    .setIssuer(key.service_account_id)
    .setAudience("https://iam.api.cloud.yandex.net/iam/v1/tokens")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
}

export async function getIamToken(): Promise<string> {
  const safetyMs = 30_000;
  if (cachedToken && Date.now() + safetyMs < cachedToken.expiresAtMs) return cachedToken.token;

  const jwt = await createJwt();
  const res = await fetch("https://iam.api.cloud.yandex.net/iam/v1/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jwt }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(
      `Yandex IAM token request failed (${res.status}): ${JSON.stringify(json) || res.statusText}`
    );
  }

  const token = String(json?.iamToken ?? "").trim();
  const expiresAt = String(json?.expiresAt ?? "").trim();
  if (!token || !expiresAt) throw new Error("Invalid IAM token response from Yandex.");

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) throw new Error("Invalid expiresAt in IAM token response.");

  cachedToken = { token, expiresAtMs };
  return token;
}

export function getYandexFolderId(): string {
  return (
    process.env.YANDEX_FOLDER_ID?.trim() ||
    process.env.DATASPHERE_FOLDER_ID?.trim() ||
    requiredEnv("DATASPHERE_FOLDER_ID")
  );
}
