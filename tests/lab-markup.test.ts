import "./support/stub-server-only";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Kind } from "../src/features/hold-lab/api";

// The lab as the server first sends it, before its generator answers: the
// skeleton every kind shares, with each kind's own labels, tabs and views.
const { HoldLab } = await import("../src/features/hold-lab/hold-lab");
const render = (kind: Kind, account = false) =>
  renderToStaticMarkup(createElement(HoldLab, { kind, account }));

test("every lab renders its first markup with its own labels, tabs and views", () => {
  for (const kind of [
    "crimp",
    "sloper",
    "jug",
    "foot",
    "pocket",
    "pinch",
    "crack",
  ] as const) {
    const html = render(kind);
    const label = kind[0].toUpperCase() + kind.slice(1);
    assert.match(html, new RegExp(`aria-label="${label} controls"`));
    assert.match(
      html,
      new RegExp(
        `id="${kind}-tab-Grip" aria-selected="true" aria-controls="${kind}-panel-Grip"`,
      ),
    );
    assert.match(html, new RegExp(`Interactive 3D ${kind} preview`));
    assert.match(html, /Starting the generator…/);
    assert.match(html, /Waiting for the first preview…/);
    assert.match(html, /<dt>Mesh<\/dt><dd>Preparing…<\/dd>/);
    assert.match(html, /aria-label="Zoom in"/);
    // The sloper leaves out the angled side; every other view is there.
    assert.equal(
      (html.match(/aria-pressed=/g) ?? []).length,
      kind === "sloper" ? 5 : 6,
      kind,
    );
    assert.equal(html.includes("Angled side"), kind !== "sloper", kind);
    // Nothing to save or export until the generator has answered.
    assert.match(html, /disabled="">Save settings/);
    assert.match(html, /class="button button-dark" type="button" disabled=""/);
    // The board's angle only shows with the board view.
    assert.doesNotMatch(html, /Board angle/);
  }
});

test("the preset button says where a preset will be kept", () => {
  assert.match(render("jug"), /in the starting-point menu, in this browser/);
  assert.match(render("jug", true), /starting-point menu and under Saved/);
});
