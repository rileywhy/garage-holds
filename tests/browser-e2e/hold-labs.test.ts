import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { LABS } from "../../src/features/labs/labs";

const baseURL = process.env.LAB_E2E_URL;
assert.ok(
  baseURL,
  "Run bash scripts/test-lab-e2e.sh to start the local stack.",
);
const validateStl = fileURLToPath(new URL("closed-stl.py", import.meta.url));
const run = promisify(execFile);
let browser: Browser;

before(async () => {
  browser = await chromium.launch({
    args: ["--enable-webgl", "--enable-unsafe-swiftshader"],
  });
});
after(async () => browser?.close());

function browserTest(name: string, body: (page: Page) => Promise<void>) {
  test(name, { timeout: 85_000 }, async () => {
    const page = await browser.newPage({ baseURL, reducedMotion: "reduce" });
    page.setDefaultTimeout(25_000);
    // Vercel injects this asset on its platform. Keep analytics out of the
    // local browser run while collecting all application console errors.
    await page.route("**/_vercel/insights/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      }),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    try {
      await body(page);
      assert.deepEqual(errors, [], "Browser errors");
    } finally {
      await page.close();
    }
  });
}

async function download(page: Page, button: Locator) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  return { name: file.suggestedFilename(), path: await file.path() };
}

async function closedStl(page: Page, button: string, filename: RegExp) {
  const file = await download(
    page,
    page.getByRole("button", { name: button, exact: true }),
  );
  assert.match(file.name, filename);
  await run(process.env.PYTHON ?? "python3", [validateStl, file.path]);
}

function previewResponse(page: Page, endpoint: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint &&
      response.request().method() === "POST" &&
      response.request().postDataJSON().action === "preview",
  );
}

async function previewAfter(
  page: Page,
  endpoint: string,
  action: () => Promise<unknown>,
) {
  const [response] = await Promise.all([
    previewResponse(page, endpoint),
    action(),
  ]);
  assert.ok(
    response.ok(),
    `Preview returned ${response.status()}: ${response.ok() ? "" : await response.text()}`,
  );
  const stage = page.getByRole("region", {
    name: /Model preview|Generated hold/,
  });
  await stage
    .getByRole("status")
    .filter({ hasText: /^Preview is current/ })
    .waitFor();
  await stage.locator("canvas").waitFor();
  return response.body();
}

async function changeSlider(slider: Locator) {
  const original = await slider.inputValue();
  const max = await slider.getAttribute("max");
  await slider.press(
    Number(original) === Number(max) ? "ArrowLeft" : "ArrowRight",
  );
  const changed = await slider.inputValue();
  assert.notEqual(changed, original, "Slider should accept keyboard input");
  return changed;
}

browserTest("home carousel dots, arrows and lab links", async (page) => {
  assert.ok((await page.goto("/"))?.ok());
  const carousel = page.getByRole("region", { name: "Explore Hold Labs" });
  const button = (name: string) =>
    carousel.getByRole("button", { name, exact: true });
  const card = (name: string) =>
    carousel.getByRole("link", { name: `Open ${name}`, exact: true });
  await card(LABS[0].name).waitFor();
  await button("Previous lab").click();
  await card(LABS.at(-1)!.name).waitFor();
  await button("Next lab").click();
  await card(LABS[0].name).waitFor();
  for (const lab of LABS) {
    await button(`Show ${lab.name}`).click();
    const link = card(lab.name);
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), lab.href);
    assert.equal(
      await link.evaluate((element) => {
        const track = element.closest(".lab-carousel-track")!;
        const slide = element.closest("figure")!;
        return (
          Math.abs(
            track.getBoundingClientRect().left -
              slide.getBoundingClientRect().left,
          ) < 2
        );
      }),
      true,
      `${lab.name} should be in the carousel viewport`,
    );
  }
  const last = LABS.at(-1)!;
  await card(last.name).click();
  await page.waitForURL(`**${last.href}`);
});

browserTest("Hold Labs hub and printing guide render", async (page) => {
  assert.ok((await page.goto("/make"))?.ok());
  await page.getByRole("heading", { level: 1, name: "Hold Labs" }).waitFor();
  for (const lab of LABS) {
    assert.ok(
      await page.locator(`main a[href="${lab.href}"]`).count(),
      lab.name,
    );
  }
  assert.ok((await page.goto("/how-to-3d-print-climbing-holds"))?.ok());
  await page
    .getByRole("heading", { level: 1, name: "How to 3D print climbing holds" })
    .waitFor();
});

for (const lab of LABS) {
  if (lab.slug === "custom-shape") continue;

  browserTest(
    `${lab.name}: preview, slider, settings, STL, link and preset`,
    async (page) => {
      const endpoint = `/api/${lab.slug}`;
      const initial = await previewAfter(page, endpoint, () =>
        page.goto(lab.href),
      );
      const metrics = page.getByText(/^[\d,]+ triangles · closed$/);
      await metrics.waitFor();

      // Scale comes first in every lab, above the Grip, Shape and Mounting
      // tabs (RIL-94).
      const controls = page.getByRole("complementary", {
        name: /controls$/,
      });
      assert.equal(
        await controls.getByRole("slider").first().getAttribute("aria-label"),
        "Scale slider",
      );

      const slider = page
        .getByRole("tabpanel", { name: "Grip" })
        .getByRole("slider")
        .first();
      let value = "";
      const edited = await previewAfter(page, endpoint, async () => {
        value = await changeSlider(slider);
      });
      assert.notDeepEqual(
        edited,
        initial,
        "Slider should produce a new preview",
      );
      await metrics.waitFor();
      await page.waitForURL(
        (url) => url.pathname === lab.href && url.search.length > 0,
      );
      const settingsUrl = page.url();

      const settings = await download(
        page,
        page.getByRole("button", { name: "Save settings", exact: true }),
      );
      const stem = new RegExp(`^${lab.slug}-\\d+x\\d+x\\d+mm\\.json$`);
      assert.match(settings.name, stem);
      const design = JSON.parse(await readFile(settings.path, "utf8"));
      assert.equal(design.generator, `garage-holds-${lab.slug}`);
      assert.ok(Object.keys(design.parameters).length > 0);
      await closedStl(
        page,
        "Export STL",
        new RegExp(`^${settings.name.replace(/\.json$/, "")}\\.stl$`),
      );

      const reopened = await previewAfter(page, endpoint, () =>
        page.goto(settingsUrl),
      );
      assert.equal(await slider.inputValue(), value);
      assert.ok(
        reopened.equals(edited),
        "Shared link should reproduce the edited preview",
      );

      const presets = page.getByLabel("Starting point");
      const preset =
        (await presets
          .locator("option:not(:disabled)")
          .first()
          .getAttribute("value")) ??
        (await presets.locator("option:not(:disabled)").first().innerText());
      const presetPreview = await previewAfter(page, endpoint, () =>
        presets.selectOption(preset),
      );
      assert.equal(await presets.inputValue(), preset);
      assert.notDeepEqual(
        presetPreview,
        reopened,
        "Preset should change the preview",
      );
    },
  );
}

browserTest("Custom Shape Lab: preview, slider and STL", async (page) => {
  const endpoint = "/api/custom_shape";
  const initial = await previewAfter(page, endpoint, () =>
    page.goto("/make/custom-shape"),
  );
  const edited = await previewAfter(page, endpoint, () =>
    changeSlider(
      page.getByRole("slider", { name: "Scale slider", exact: true }),
    ),
  );
  assert.ok(!edited.equals(initial), "Scale should change the mesh");
  await closedStl(page, "Download STL", /^custom-shape\.stl$/);
});

browserTest("Texture Lab: depth slider, preview and STL", async (page) => {
  assert.ok((await page.goto("/make/texture"))?.ok());
  const preview = page.getByLabel("Interactive hold preview").locator("canvas");
  await preview.waitFor();
  const slider = page.getByRole("slider", { name: /^Relief depth ·/ });
  const depth = await changeSlider(slider);
  await slider.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const file = await download(
    page,
    page.getByRole("button", { name: "Download approximate STL", exact: true }),
  );
  assert.match(file.name, /^sample-hold--.+\.stl$/);
  assert.ok(
    file.name.includes(`-depth${depth}mm`),
    "STL should use the edited texture depth",
  );
  // This companion lab labels its output approximate. Test the binary
  // download here, and require a closed solid from the hold generators.
  const bytes = await readFile(file.path);
  const triangles = bytes.readUInt32LE(80);
  assert.ok(triangles > 0);
  assert.equal(bytes.length, 84 + 50 * triangles);
});
