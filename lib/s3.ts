import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getRegion(): string {
  return process.env.YANDEX_REGION ?? "ru-central1";
}

export function getS3Client() {
  const accessKeyId = requiredEnv("YANDEX_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("YANDEX_SECRET_ACCESS_KEY");

  const endpoint = (process.env.YANDEX_S3_ENDPOINT ?? "https://storage.yandexcloud.net").replace(
    /\/+$/,
    ""
  );
  const region = getRegion();

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function isBucketMissingError(err: unknown): boolean {
  const anyErr = err as any;
  const code = anyErr?.$metadata?.httpStatusCode;
  if (code === 404) return true;
  const name = String(anyErr?.name ?? "");
  return name === "NotFound" || name === "NoSuchBucket";
}

export async function ensureBucketExists(bucketName: string) {
  const s3 = getS3Client();
  const region = getRegion();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    return;
  } catch (err) {
    if (!isBucketMissingError(err)) throw err;
  }

  await s3.send(
    new CreateBucketCommand({
      Bucket: bucketName,
      // Yandex requires LocationConstraint and rejects an empty config with UnknownError.
      CreateBucketConfiguration: { LocationConstraint: region },
    })
  );
}

export async function uploadObject(args: {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  );
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function headObject(args: { bucket: string; key: string }) {
  const s3 = getS3Client();
  await s3.send(new HeadObjectCommand({ Bucket: args.bucket, Key: args.key }));
}

export async function getObjectBytes(args: { bucket: string; key: string }): Promise<Buffer> {
  const s3 = getS3Client();
  const resp = await s3.send(new GetObjectCommand({ Bucket: args.bucket, Key: args.key }));
  if (!resp.Body) throw new Error("Missing S3 response body.");
  return await streamToBuffer(resp.Body);
}
