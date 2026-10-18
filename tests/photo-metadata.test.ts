import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { stripPhotoMetadata } from "../src/features/uploads/photo-metadata";
import { scrubPhotoMetadata } from "../src/features/uploads/photo-scrub";

// A 40 × 20 photo taken with the phone on its side: the orientation tag (6)
// says to show it rotated, 20 × 40. It carries a camera model, a GPS
// position and a Display P3 profile, like a photo straight off a phone.
async function phonePhoto(format: "jpeg" | "png" | "webp") {
  const image = sharp({
    create: { width: 40, height: 20, channels: 3, background: "#c33" },
  })
    .withIccProfile("p3")
    .withExif({
      IFD0: { Make: "Phone", Model: "Phone 15" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40/1 35/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "111/1 56/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 });
  return new Uint8Array(await image.toFormat(format).toBuffer());
}

for (const [format, contentType] of [
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
] as const)
  test(`a ${format} photo loses its EXIF and GPS, stays upright, and keeps its colour profile`, async () => {
    const original = await phonePhoto(format);
    const before = await sharp(original).metadata();
    assert.ok(before.exif, "the fixture carries EXIF");
    assert.equal(before.orientation, 6);

    const clean = await stripPhotoMetadata(original, contentType);
    assert.ok(clean);
    const after = await sharp(clean).metadata();
    assert.equal(after.format, format);
    assert.equal(after.exif, undefined);
    assert.equal(after.xmp, undefined);
    assert.equal(after.orientation ?? 1, 1);
    assert.deepEqual([after.width, after.height], [20, 40]);
    assert.ok(after.icc, "the colour profile is kept");
  });

test("a photo with nothing to remove is left alone", async () => {
  const plain = new Uint8Array(
    await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#3c3" },
    })
      .jpeg()
      .toBuffer(),
  );
  assert.equal(await stripPhotoMetadata(plain, "image/jpeg"), null);
  const once = await stripPhotoMetadata(await phonePhoto("jpeg"), "image/jpeg");
  assert.ok(once);
  assert.equal(await stripPhotoMetadata(once, "image/jpeg"), null);
});

test("bytes that are not an image are refused", async () => {
  await assert.rejects(
    stripPhotoMetadata(
      new TextEncoder().encode("PK not a photo"),
      "image/jpeg",
    ),
  );
});

// Every read answers with the photos given; updates are recorded.
function fakeAdmin(
  photos: { id: string; object_key: string; extension: string }[],
) {
  const updates: unknown[] = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: photos, error: null }).then(resolve),
  };
  for (const method of ["select", "eq"]) query[method] = () => query;
  query.update = (values: unknown) => {
    updates.push(values);
    return query;
  };
  const admin = { from: () => query } as unknown as Parameters<
    typeof scrubPhotoMetadata
  >[0];
  return { admin, updates };
}

test("the scrub rewrites photos that had metadata, counts failures, and writes nothing on a dry run", async () => {
  const photos = ["gps", "clean", "broken"].map((name) => ({
    id: name,
    object_key: `designs/d/${name}.jpg`,
    extension: "jpg",
  }));
  const strip = async (key: string, _extension: string, dryRun: boolean) => {
    if (key.includes("broken")) throw new Error("not an image");
    if (key.includes("clean")) return null;
    if (!dryRun) written.push(key);
    return 1234;
  };
  const written: string[] = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    const dry = fakeAdmin(photos);
    assert.deepEqual(
      await scrubPhotoMetadata(dry.admin, strip, { dryRun: true }),
      { dryRun: true, photos: 3, withMetadata: 1, failures: 1 },
    );
    assert.deepEqual(dry.updates, []);
    assert.deepEqual(written, []);

    const real = fakeAdmin(photos);
    assert.deepEqual(await scrubPhotoMetadata(real.admin, strip), {
      dryRun: false,
      photos: 3,
      withMetadata: 1,
      failures: 1,
    });
    assert.deepEqual(real.updates, [{ bytes: 1234 }]);
    assert.deepEqual(written, ["designs/d/gps.jpg"]);
  } finally {
    console.error = quiet;
  }
});
