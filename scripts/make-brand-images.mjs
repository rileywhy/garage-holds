// Generates the committed brand images from src/app/icon.svg and the lab
// renders in public/images/hold-labs: the apple touch icon, favicon.ico, and
// the 1200×630 Open Graph images for the site, the Hold Labs hub, and each
// lab. Run after changing the mark, the lab renders, or the copy below:
//
//   node scripts/make-brand-images.mjs
//
// Design pages get their photo through /holds/<id>/og instead.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const app = path.join(root, "src", "app");
const icon = await readFile(path.join(app, "icon.svg"));

// Dark theme tokens from globals.css; the dark card reads well on every
// chat and social background.
const BG = "#202027";
const INK = "#efedf5";
const MUTED = "#aaa6b8";
const ACCENT = "#b5a3df";

const W = 1200;
const H = 630;

await sharp(icon).resize(180, 180).png().toFile(path.join(app, "apple-icon.png"));
await writeFile(path.join(app, "favicon.ico"), await ico([16, 32, 48]));

await card({
  file: path.join(app, "opengraph-image.png"),
  eyebrow: "garageholds.com",
  title: "Free 3D printable\nclimbing holds",
  text: "A library with print recipes, and labs\nthat shape a hold from a few sliders.",
  render: "crimp",
});
await card({
  file: path.join(app, "make", "opengraph-image.png"),
  eyebrow: "Hold Labs · garageholds.com",
  title: "Shape your own\nclimbing hold",
  text: "Crimp, sloper, jug, or a shape you paint.\nLive preview, filament estimate, STL export.",
  render: "jug",
});
const labs = {
  crimp: ["Crimp Lab", "Edge depth, incut, lip rounding, and\nscrew holes. Export a printable STL."],
  sloper: ["Sloper Lab", "Curve, incut lift, and slope. Preview it\non a 40° board and export an STL."],
  jug: ["Jug Lab", "Board jug, deep jug, or two-handed.\nFind the bite and export an STL."],
  "custom-shape": ["Custom Shape Lab", "Paint a silhouette, shape the grip, place\nthe screws. Export a printable STL."],
};
for (const [slug, [title, text]] of Object.entries(labs))
  await card({
    file: path.join(app, "make", slug, "opengraph-image.png"),
    eyebrow: "Hold Labs · garageholds.com",
    title,
    text,
    render: slug,
  });

async function card({ file, eyebrow, title, text, render }) {
  const image = await sharp(
    path.join(root, "public", "images", "hold-labs", `${render}.webp`),
  )
    .resize({ width: 560, withoutEnlargement: true })
    .png()
    .toBuffer();
  const { width: imageWidth = 0, height: imageHeight = 0 } = await sharp(
    image,
  ).metadata();
  const mark = await sharp(icon).resize(72, 72).png().toBuffer();
  const lines = (value, x, y, size, fill, family, weight = "normal") =>
    value
      .split("\n")
      .map(
        (line, i) =>
          `<text x="${x}" y="${y + i * size * 1.15}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(line)}</text>`,
      )
      .join("");
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${ACCENT}"/>
      ${lines(eyebrow, 72, 118, 26, ACCENT, "Arial, sans-serif", "bold")}
      ${lines(title, 72, 232, 64, INK, "Georgia, serif")}
      ${lines(text, 72, 440, 30, MUTED, "Arial, sans-serif")}
      <text x="160" y="562" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="${INK}">garage holds</text>
    </svg>`,
  );
  await sharp(overlay)
    .composite([
      { input: mark, left: 72, top: 514 },
      {
        input: image,
        left: W - imageWidth - 40,
        top: Math.round((H - 10 - imageHeight) / 2),
      },
    ])
    .png()
    .toFile(file);
}

// An .ico is a small directory of images; browsers accept PNG entries.
async function ico(sizes) {
  const images = await Promise.all(
    sizes.map((size) => sharp(icon).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  images.forEach((image, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...images]);
}

function escape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
