import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { build } from "esbuild";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type Locator,
  type Page,
} from "playwright";
import sharp from "sharp";

// The 3D previews, drawn by real browsers: a library card's thumbnail and
// the design page's interactive viewer, in Chromium, WebKit (Safari's
// engine) and Firefox.
//
// Firefox runs three ways. With resistFingerprinting on (the default in
// LibreWolf, Mullvad Browser and Tor Browser) a canvas read back with
// toDataURL, toBlob or getImageData comes out as noise; in November 2026
// the thumbnails were made that way and those browsers showed stripes
// where the hold should be. With WebGL off, which Firefox does on graphics
// drivers it distrusts, both previews must say so instead of staying blank.
//
// Needs Playwright's browsers (npm run test:browser:install, once). On
// Linux without a screen, Firefox has no WebGL unless a display exists:
// xvfb-run -a npm run test:browser, as CI does.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(new URL(path, import.meta.url));

interface Setup {
  name: string;
  launch: () => Promise<Browser>;
  webgl: boolean;
}
const SETUPS: Setup[] = [
  { name: "Chromium", launch: () => chromium.launch(), webgl: true },
  { name: "WebKit", launch: () => webkit.launch(), webgl: true },
  { name: "Firefox", launch: () => firefox.launch(), webgl: true },
  {
    name: "Firefox resisting fingerprinting",
    launch: () =>
      firefox.launch({
        firefoxUserPrefs: { "privacy.resistFingerprinting": true },
      }),
    webgl: true,
  },
  {
    name: "Firefox without WebGL",
    launch: () =>
      firefox.launch({ firefoxUserPrefs: { "webgl.disabled": true } }),
    webgl: false,
  },
];

let server: Server;
let origin = "";
const requests: string[] = [];

before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./page.tsx", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: `${ROOT}tsconfig.json`,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
    // The server action that renews a link cannot run here.
    plugins: [
      {
        name: "stub-preview-actions",
        setup(build) {
          build.onResolve({ filter: /\/preview-actions$/ }, () => ({
            path: fileURLToPath(
              new URL("./preview-actions-stub.ts", import.meta.url),
            ),
          }));
        },
      },
    ],
  });
  const files: Record<string, [string, Uint8Array]> = {
    "/": [
      "text/html",
      Buffer.from(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/globals.css"><div id="root"></div><script src="/page.js"></script>',
      ),
    ],
    "/page.js": ["text/javascript", bundle.outputFiles[0].contents],
    // The site's own stylesheet, so the canvases are sized as they are there.
    "/globals.css": ["text/css", read("../../src/app/globals.css")],
    "/hold.stl": [
      "application/octet-stream",
      read("../fixtures/preview-shape.stl"),
    ],
  };
  // The plywood the previews draw the hold on and against.
  for (const name of ["table", "bench", "panel-front", "panel-back"])
    files[`/images/plywood/${name}.webp`] = [
      "image/webp",
      read(`../../public/images/plywood/${name}.webp`),
    ];
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    const file = files[(request.url ?? "").replace("?expired", "")];
    response.writeHead(file ? 200 : 404, { "Content-Type": file?.[0] ?? "" });
    response.end(file?.[1]);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server?.close());

// What the browser put on screen, read from a screenshot: the page cannot
// be asked, since reading a canvas is the very thing that gets blocked.
async function pixels(target: Locator) {
  const { data, info } = await sharp(await target.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // The mean colour of a square patch, and how far its pixels stray from it.
  return (centreX: number, centreY: number, size = 16) => {
    const left = Math.round(centreX * info.width - size / 2);
    const top = Math.round(centreY * info.height - size / 2);
    const sum = [0, 0, 0];
    const low = [255, 255, 255];
    const high = [0, 0, 0];
    for (let y = top; y < top + size; y++)
      for (let x = left; x < left + size; x++)
        for (let channel = 0; channel < 3; channel++) {
          const value = data[(y * info.width + x) * 3 + channel];
          sum[channel] += value;
          low[channel] = Math.min(low[channel], value);
          high[channel] = Math.max(high[channel], value);
        }
    const [r, g, b] = sum.map((total) => total / (size * size));
    return {
      r,
      g,
      b,
      spread: Math.max(...high.map((value, channel) => value - low[channel])),
    };
  };
}

// The fixture is drawn green, on and against plywood, which is not.
function assertHold(patch: { r: number; g: number; b: number }, what: string) {
  assert.ok(
    patch.g > patch.r + 25 && patch.g > patch.b + 25,
    `${what} should show the green hold, got rgb(${[patch.r, patch.g, patch.b].map(Math.round)})`,
  );
}

async function hasWebGL(page: Page) {
  return page.evaluate(
    () => !!document.createElement("canvas").getContext("webgl2"),
  );
}

for (const setup of SETUPS)
  test(`${setup.name} draws the card thumbnail and the interactive viewer`, async () => {
    const browser = await setup.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 720, height: 340 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(origin);
      const card = page.locator("#card");
      const viewer = page.locator("#viewer");

      if (!setup.webgl) {
        await card.getByText("STL preview unavailable").waitFor();
        await viewer.getByText("STL preview unavailable").waitFor();
        assert.deepEqual(errors, []);
        return;
      }
      assert.ok(
        await hasWebGL(page),
        `${setup.name} has no WebGL here, so nothing can be checked. On Linux without a screen, run under xvfb-run.`,
      );

      // The card: the hold in the middle, and above it the plywood board
      // behind, whose grain varies gently. Noise in place of the picture
      // fails both.
      const thumbnail = card.locator(".stl-preview-image");
      await thumbnail.waitFor();
      assert.equal(
        await thumbnail.getAttribute("aria-label"),
        "STL preview of Fixture, side view",
      );
      const cardPatch = await pixels(card);
      assertHold(cardPatch(0.5, 0.5), "The middle of the thumbnail");
      for (const x of [0.06, 0.94]) {
        const corner = cardPatch(x, 0.06);
        assert.ok(
          corner.spread < 40,
          `The thumbnail's top corners should be plain plywood, but vary by ${corner.spread}`,
        );
      }

      // The viewer: drawn, filling its frame, and turning when dragged.
      await viewer.getByText("drag to rotate").waitFor();
      const canvas = viewer.locator("canvas");
      const box = (await canvas.boundingBox())!;
      assert.ok(
        box.width > 300 && box.height > 200,
        `The viewer's canvas should fill its frame, got ${box.width}×${box.height}`,
      );
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      // A click stops the slow turn, so only the drag moves the hold.
      await page.mouse.click(x, y);
      await page.waitForTimeout(200);
      const before = await canvas.screenshot();
      assertHold((await pixels(canvas))(0.5, 0.5), "The middle of the viewer");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 90, y + 30, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      assert.ok(
        !before.equals(await canvas.screenshot()),
        "Dragging should turn the hold",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

// A page open for over an hour holds links the bucket refuses. Each preview
// asks for a fresh one and draws, instead of giving up until a reload.
test("an expired link is renewed and both previews still draw", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 720, height: 340 },
    });
    requests.length = 0;
    await page.goto(`${origin}/?expired`);
    await page.locator("#card .stl-preview-image").waitFor();
    await page.locator("#viewer").getByText("drag to rotate").waitFor();
    assertHold(
      (await pixels(page.locator("#card")))(0.5, 0.5),
      "The middle of the thumbnail",
    );
    assert.ok(requests.includes("/expired.stl"), "the old link was tried");
    assert.ok(requests.includes("/hold.stl"), "the fresh link was fetched");
  } finally {
    await browser.close();
  }
});
