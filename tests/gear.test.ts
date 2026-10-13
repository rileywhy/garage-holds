import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GEAR, filamentFor, gearUrl } from "../src/features/gear/gear";

describe("gear links", () => {
  it("tags Amazon links when the site has an associate tag", () => {
    const url = new URL(gearUrl(GEAR.petg, "garageholds-20"));
    assert.equal(url.hostname, "www.amazon.com");
    assert.equal(url.searchParams.get("tag"), "garageholds-20");
    assert.equal(url.searchParams.get("k"), GEAR.petg.search);
  });

  it("links the same page untagged when there is no tag", () => {
    const url = new URL(gearUrl(GEAR.woodScrews, null));
    assert.equal(url.searchParams.get("tag"), null);
    assert.equal(url.searchParams.get("k"), GEAR.woodScrews.search);
  });

  it("prefers a pinned product over a search", () => {
    const item = { ...GEAR.printer, asin: "B0ABCDEFGH" };
    assert.equal(
      gearUrl(item, "garageholds-20"),
      "https://www.amazon.com/dp/B0ABCDEFGH?tag=garageholds-20",
    );
  });

  it("knows PETG and nothing else", () => {
    assert.equal(filamentFor("PETG"), GEAR.petg);
    assert.equal(filamentFor("Polymaker PETG, black"), GEAR.petg);
    assert.equal(filamentFor("PLA+"), null);
  });
});
