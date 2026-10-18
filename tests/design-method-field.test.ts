import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignFields } from "../src/features/uploads/design-fields";
import { SAMPLE_HOLDS } from "./fixtures/sample-holds";

// The design-method radios as the upload and edit forms render them. Edit
// passes the design as defaults and must keep its stored method selected, or
// every save has to pick it again (RIL-114).
function checkedMethods(html: string) {
  return [...html.matchAll(/<input[^>]*name="designMethod"[^>]*>/g)]
    .filter(([input]) => /\schecked=""/.test(input))
    .map(([input]) => input.match(/value="([^"]+)"/)?.[1]);
}

test("upload starts with neither design method chosen", () => {
  const html = renderToStaticMarkup(
    createElement(DesignFields, { creator: "Riley" }),
  );
  assert.deepEqual(checkedMethods(html), []);
});

test("edit starts from the design's stored method", () => {
  for (const designMethod of ["human-shaped", "generated"] as const) {
    const html = renderToStaticMarkup(
      createElement(DesignFields, {
        creator: "Riley",
        defaults: { ...SAMPLE_HOLDS[0], designMethod },
      }),
    );
    assert.deepEqual(checkedMethods(html), [designMethod]);
  }
});
