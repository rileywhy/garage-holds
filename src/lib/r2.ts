import "server-only";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StoredObject } from "@/features/uploads/lifecycle";

// Cloudflare R2 through its S3-compatible API. Credentials are server-only;
// browsers only ever see short-lived signed URLs for one object at a time.

const UPLOAD_URL_SECONDS = 30 * 60;
const DOWNLOAD_URL_SECONDS = 60 * 60;

export function isR2Configured() {
  return Boolean(r2Config());
}

// Accepts the bare 32-character account id or the full S3 endpoint URL that
// Cloudflare shows next to the token, which is easy to paste by mistake.
function accountIdFrom(value: string | undefined) {
  return value?.match(/[0-9a-f]{32}/i)?.[0] ?? "";
}

function r2Config() {
  const accountId = accountIdFrom(process.env.R2_ACCOUNT_ID);
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
      // Path-style keeps the bucket out of the hostname, so the only DNS name
      // involved is the one Cloudflare documents.
      forcePathStyle: true,
      // Newer SDKs sign a checksum of an empty body into presigned PUT URLs,
      // which R2 rejects once the real file arrives. Only compute checksums
      // where the operation requires them.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
  return client;
}

// Model files are stored and served as attachments, whatever the browser
// thinks their type is.
export const MODEL_CONTENT_TYPE = "application/octet-stream";

// A PUT URL for one object, bound to the size and type the browser
// declared: the Content-Length and Content-Type headers are part of the
// signature, so R2 refuses a PUT that sends anything else. The browser
// must send exactly this content type, which the caller hands back to it.
// Before this, a signed URL accepted an object of any size for 30 minutes,
// invisible to the allowance until the sweep removed it.
export function signUpload(
  key: string,
  { bytes, contentType }: { bytes?: number; contentType: string },
) {
  const { s3, bucket } = r2();
  // `bytes` is left out only for the server's own writes, such as a preview
  // copy whose size is not known until it is made; browsers always get an
  // exact size.
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(bytes !== undefined ? { ContentLength: bytes } : {}),
      ContentType: contentType,
    }),
    {
      expiresIn: UPLOAD_URL_SECONDS,
      // The presigner signs content-length on its own; content-type has to
      // be asked for, or the URL would accept any type.
      signableHeaders: new Set(["content-length", "content-type"]),
    },
  );
}

// The first `length` bytes of an object: enough to read a binary STL's
// 84-byte header without downloading the model.
export async function getObjectHead(
  key: string,
  length: number,
): Promise<Uint8Array> {
  const { s3, bucket } = r2();
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${length - 1}`,
    }),
  );
  return result.Body
    ? await result.Body.transformToByteArray()
    : new Uint8Array();
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

// The whole object in memory; used for photos only, which are capped at
// MAX_PHOTO_BYTES by validation before they are ever stored.
export async function getObject(key: string): Promise<Uint8Array> {
  const { s3, bucket } = r2();
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!result.Body) throw new Error(`Object ${key} has no body.`);
  return result.Body.transformToByteArray();
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  const { s3, bucket } = r2();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  const { s3, bucket } = r2();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Server-side copy within the bucket; the bytes never leave R2.
export async function copyObject(fromKey: string, toKey: string) {
  const { s3, bucket } = r2();
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `/${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
      Key: toKey,
    }),
  );
}

// Every object under a prefix, following pagination. Used by the storage
// sweep only (src/features/uploads/lifecycle.ts); nothing user-facing lists
// the bucket.
export async function listObjects(prefix: string): Promise<StoredObject[]> {
  const { s3, bucket } = r2();
  const objects: StoredObject[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? [])
      if (object.Key)
        objects.push({
          key: object.Key,
          lastModified: object.LastModified ?? new Date(0),
        });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
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
