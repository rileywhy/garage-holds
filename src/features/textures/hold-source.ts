import {
  KIND_LABELS,
  loadSchema,
  post,
  type Kind,
} from "@/features/hold-lab/api";
import { readLink } from "@/features/lab-link/lab-link";
import { MAX_STL_PREVIEW_BYTES } from "@/features/holds/stl-limits";
import { holdGeometry } from "@/features/holds/stl-scene";
import { prepareStlGeometry } from "@/features/holds/stl-geometry";
import { textureHoldFile } from "./hold-action";

export function parseHoldLink(input: string, origin: string) {
  const url = new URL(input.trim(), origin);
  if (
    url.origin !== origin &&
    !["https://garageholds.com", "https://www.garageholds.com"].includes(
      url.origin,
    )
  )
    throw new Error("Paste a Garage Holds link, or open a local STL.");
  const path = url.pathname.replace(/\/$/, "");
  const kind = path.match(/^\/make\/([a-z]+)$/)?.[1];
  if (kind && Object.hasOwn(KIND_LABELS, kind))
    return { kind: kind as Kind, search: url.search };
  const id = path.match(
    /^\/holds\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i,
  )?.[1];
  if (id) return { id };
  throw new Error(
    "Use a published hold link or a Crimp, Sloper, Jug, Foot, Pocket, or Pinch Lab link.",
  );
}

async function readModel(response: Response) {
  if (!response.ok) throw new Error("Could not download the STL.");
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_STL_PREVIEW_BYTES)
    throw new Error("Choose an STL under 25 MB.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The STL download was empty.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_STL_PREVIEW_BYTES)
        throw new Error("Choose an STL under 25 MB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}

export async function loadHoldLink(input: string, signal: AbortSignal) {
  const link = parseHoldLink(input, window.location.origin);
  if (link.kind) {
    const schema = await loadSchema(link.kind);
    signal.throwIfAborted();
    const design = readLink(link.search, schema.defaults, schema.presets);
    const settings = design?.parameters ?? schema.defaults;
    const data = await readModel(
      await post(link.kind, "stl", settings, signal),
    );
    // Generator exports already put the back in the XY plane.
    const geometry = prepareStlGeometry(data);
    const radius = Number(geometry.userData.radius);
    geometry.scale(radius, radius, radius);
    geometry.computeBoundingBox();
    geometry.translate(0, 0, -geometry.boundingBox!.min.z);
    return {
      geometry,
      label: design?.preset ?? `${KIND_LABELS[link.kind]} Lab hold`,
    };
  }
  const model = await textureHoldFile(link.id);
  signal.throwIfAborted();
  if (!model)
    throw new Error(
      "This published hold has no STL available here. You can open a downloaded STL instead.",
    );
  const data = await readModel(
    await fetch(model.url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    }),
  );
  return {
    geometry: holdGeometry(data, model.orientation),
    label: model.title,
  };
}
