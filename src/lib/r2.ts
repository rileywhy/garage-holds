import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 through its S3-compatible API. Credentials are server-only;
// browsers only ever see short-lived signed URLs for one object at a time.

const UPLOAD_URL_SECONDS = 30 * 60;
const DOWNLOAD_URL_SECONDS = 60 * 60;

export function isR2Configured() {
  return Boolean(r2Config());
}

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  return accountId && accessKeyId && secretAccessKey && bucket
    ? { accountId, accessKeyId, secretAccessKey, bucket }
    : null;
}

let client: { s3: S3Client; bucket: string } | undefined;

function r2() {
  if (client) return client;
  const config = r2Config();
  if (!config) throw new Error("R2 storage is not configured.");
  client = {
    bucket: config.bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
  return client;
}

export function signUpload(key: string) {
  const { s3, bucket } = r2();
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: UPLOAD_URL_SECONDS,
  });
}

// The download name and type are fixed server-side so a stored object is
// always served as the file the creator uploaded, never as something a
// browser might execute.
export function signDownload(key: string, filename: string) {
  const { s3, bucket } = r2();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeFilename(filename)}"`,
      ResponseContentType: "application/octet-stream",
    }),
    { expiresIn: DOWNLOAD_URL_SECONDS },
  );
}

export function signImage(key: string, contentType: string) {
  const { s3, bucket } = r2();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: "inline",
      ResponseContentType: contentType,
    }),
    { expiresIn: DOWNLOAD_URL_SECONDS },
  );
}

export async function headObject(key: string) {
  const { s3, bucket } = r2();
  try {
    const result = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return { exists: true as const, bytes: result.ContentLength ?? 0 };
  } catch (error) {
    if (isNotFound(error)) return { exists: false as const, bytes: 0 };
    throw error;
  }
}

export async function deleteObject(key: string) {
  const { s3, bucket } = r2();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

function isNotFound(error: unknown) {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;
  const name = (error as { name?: string })?.name;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

function safeFilename(name: string) {
  return name.replace(/[^\w.() -]+/g, "_").slice(0, 150) || "download";
}
