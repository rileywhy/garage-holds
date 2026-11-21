import assert from "node:assert/strict";
import test from "node:test";
import { fingerRest, placeFinger } from "../src/features/hold-lab/fingers";

// Outlines are [y, z]: y up the wall, z out from it.
type Outline = [number, number][];
const block: Outline = [
  [-20, 0],
  [20, 0],
  [20, 30],
  [-20, 30],
];
// A closed pocket: a 30 mm tall mouth in a 60 mm deep body, cut 40 mm in.
const closed: Outline = [
  [-50, 0],
  [50, 0],
  [50, 60],
  [15, 60],
  [15, 20],
  [-15, 20],
  [-15, 60],
  [-50, 60],
];

test("a finger rests on top of a hold with its tip at the wall", () => {
  const rest = fingerRest("crimp", [block], {});
  assert.equal(rest, 20);
  assert.deepEqual(placeFinger([block], rest, 16), { rest: 20, tip: 0 });
});

test("in a pocket the finger rests on the lower lip of the opening", () => {
  assert.equal(fingerRest("pocket", [closed], { opening_height: 30 }), -15);
  // Without the opening's height, the top of the hold is the fallback.
  assert.equal(fingerRest("pocket", [closed], {}), 50);
});

test("a closed pocket stops the fingertip at its back wall", () => {
  assert.equal(placeFinger([closed], -15, 13).tip, 20);
});

test("an open pocket lets the fingertip reach the wall", () => {
  const upper: Outline = [
    [15, 0],
    [50, 0],
    [50, 60],
    [15, 60],
  ];
  const lower: Outline = [
    [-50, 0],
    [-15, 0],
    [-15, 60],
    [-50, 60],
  ];
  assert.equal(placeFinger([upper, lower], -15, 16).tip, 0);
});

test("a finger too thick for the opening stops at the face", () => {
  assert.equal(placeFinger([closed], -15, 40).tip, 60);
});
