import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const site = process.env.SMOKE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

test(
  "Crack Lab changes the preview geometry and downloaded STL when the jam angle changes",
  { skip: !site && "the generator only runs on the deployed site" },
  async () => {
    async function generate(action: "preview" | "stl", angle: number) {
      const response = await fetch(new URL("/api/crack", site), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
        },
        body: JSON.stringify({ action, parameters: { jam_angle: angle } }),
        redirect: "manual",
        signal: AbortSignal.timeout(45_000),
      });
      assert.equal(
        response.status,
        200,
        `${action} at ${angle} degrees returned ${response.status}`,
      );
      return response;
    }

    const previewHashes = new Set<string>();
    const stlHashes = new Set<string>();
    for (const angle of [0, 90]) {
      const preview = await (await generate("preview", angle)).json();
      assert.equal(preview.parameters.jam_angle, angle);
      assert.equal(preview.watertight, true);
      assert.ok(preview.vertices.length > 0);
      previewHashes.add(
        createHash("sha256")
          .update(JSON.stringify(preview.vertices))
          .digest("hex"),
      );

      const response = await generate("stl", angle);
      assert.match(response.headers.get("content-type") ?? "", /model\/stl/);
      const stl = Buffer.from(await response.arrayBuffer());
      assert.ok(stl.length > 84);
      assert.equal(
        stl.length,
        84 + 50 * stl.readUInt32LE(80),
        "incomplete binary STL",
      );
      stlHashes.add(
        createHash("sha256").update(stl.subarray(84)).digest("hex"),
      );
    }
    assert.equal(previewHashes.size, 2, "preview vertices did not change");
    assert.equal(stlHashes.size, 2, "STL triangles did not change");
  },
);
