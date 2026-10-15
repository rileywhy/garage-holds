import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  getObjectHead,
  MODEL_CONTENT_TYPE,
  signDownload,
  signUpload,
} from "@/lib/r2";
import { siteUrl } from "@/lib/site-url";
import { createModelPreview } from "./model-preview";

// Binds createModelPreview to R2 and the hosted preview_mesh function.
// PREVIEW_SECRET is shared with the function so nobody else can point it
// at a URL; without it the step is skipped and logged, and the app keeps
// running. PREVIEW_API_URL points `next dev` at a local
// `python tools/mesh-preview/serve_api.py`; on Vercel the site's own
// origin serves /api/preview_mesh.

export function isModelPreviewConfigured() {
  return Boolean(process.env.PREVIEW_SECRET);
}

const FUNCTION_TIMEOUT_MS = 55_000;

export async function makeModelPreview(file: {
  object_key: string;
  name: string;
  bytes: number;
  extension: string;
}): Promise<string | null> {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) {
    console.warn("model preview skipped: PREVIEW_SECRET is not set", file.name);
    return null;
  }
  const base = (process.env.PREVIEW_API_URL || siteUrl()).replace(/\/$/, "");
  return createModelPreview(file, {
    readHead: getObjectHead,
    signSource: signDownload,
    signTarget: (key) => signUpload(key, { contentType: MODEL_CONTENT_TYPE }),
    decimate: async (request) => {
      const response = await fetch(`${base}/api/preview_mesh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(FUNCTION_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as {
        triangles?: number;
        bytes?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          `preview_mesh answered ${response.status}: ${body.error ?? "no detail"}`,
        );
      return { triangles: body.triangles ?? 0, bytes: body.bytes ?? 0 };
    },
  });
}

// For the sweep route and any other caller holding a bearer header.
export function previewSecretMatches(header: string | null) {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
