import assert from "node:assert/strict";
import test from "node:test";
import { parseDesignFile } from "../src/features/sloper-lab/api";

test("Sloper Lab settings preserve incut and restore old domes without lift", () => {
  const document = {
    generator: "garage-holds-sloper",
    version: 1,
    units: "mm",
    parameters: { width: 110, incut: 35 },
  };
  assert.deepEqual(
    parseDesignFile(JSON.stringify(document)),
    document.parameters,
  );
  assert.deepEqual(
    parseDesignFile(JSON.stringify({ ...document, parameters: { width: 90 } })),
    { width: 90, incut: 0 },
  );
});

test("Sloper Lab refuses other generators and malformed settings", () => {
  for (const document of [
    null,
    {},
    {
      generator: "garage-holds-crimp",
      version: 1,
      units: "mm",
      parameters: {},
    },
    {
      generator: "garage-holds-sloper",
      version: 1,
      units: "mm",
      parameters: [],
    },
  ]) {
    assert.throws(
      () => parseDesignFile(JSON.stringify(document)),
      /Sloper Lab settings file/,
    );
  }
});
