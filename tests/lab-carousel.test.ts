import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ARTWORK_FRAMING } from "../src/features/labs/artwork-framing";
import { LabCarousel } from "../src/features/labs/lab-carousel";
import { LABS } from "../src/features/labs/labs";

// The home page's carousel as the server renders it: one slide per lab,
// each artwork framed from a table keyed by the lab's slug. A lab missing
// from that table once took the whole home page down with a 500, and the
// build could not catch it because the home page renders per request.
test("the carousel frames a slide for every lab", () => {
  const html = renderToStaticMarkup(createElement(LabCarousel));
  for (const lab of LABS) {
    const { width, left, top } = ARTWORK_FRAMING[lab.slug];
    const style = `width:${width}%;left:${left}%;top:${top}%`;
    assert.match(html, new RegExp(`aria-label="Open ${lab.name}"`), lab.slug);
    assert.ok(html.includes(style), `${lab.slug} slide is framed: ${style}`);
    assert.ok(html.includes(`src="${lab.image}"`), `${lab.slug} artwork`);
  }
  assert.equal(
    (html.match(/aria-roledescription="slide"/g) ?? []).length,
    LABS.length,
  );
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("the framing table names exactly the labs", () => {
  assert.deepEqual(
    Object.keys(ARTWORK_FRAMING).sort(),
    LABS.map((lab) => lab.slug).sort(),
  );
});
