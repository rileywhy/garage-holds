import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LabCarousel } from "../src/features/labs/lab-carousel";
import { LABS } from "../src/features/labs/labs";

// The home page's carousel as the server renders it: one slide per lab,
// each artwork framed with its lab’s settings. Missing artwork framing once took the whole home page down with a 500, and the
// build could not catch it because the home page renders per request.
test("the carousel frames a slide for every lab", () => {
  const html = renderToStaticMarkup(createElement(LabCarousel));
  for (const lab of LABS) {
    const { width, left, top } = lab.artwork;
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
