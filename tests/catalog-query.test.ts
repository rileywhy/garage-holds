import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_PAGE_SIZE,
  catalogHref,
  DEFAULT_CATALOG_QUERY,
  pageCount,
  parseCatalogQuery,
  searchTsQuery,
} from "../src/features/holds/catalog-query";
import { SPECIAL_PROCESSES } from "../src/features/holds/types";

test("a bare address is the default catalog, and the default catalog is a bare address", () => {
  assert.deepEqual(parseCatalogQuery({}), DEFAULT_CATALOG_QUERY);
  assert.equal(catalogHref(DEFAULT_CATALOG_QUERY), "/");
  assert.equal(catalogHref(DEFAULT_CATALOG_QUERY, "/saved"), "/saved");
});

test("every filter survives the round trip through the address", () => {
  const query = {
    query: "mesa edge",
    designMethod: "generated" as const,
    // Lists come back in the catalog's own order, whatever the link said.
    types: ["Jug" as const, "Crimp" as const],
    sizes: ["Small" as const],
    mounts: ["Screw-on" as const],
    materials: ["PETG-CF"],
    specialProcesses: [SPECIAL_PROCESSES[0]],
    targetGrade: 5,
    sort: "title" as const,
    page: 3,
  };
  const href = catalogHref(query);
  assert.match(href, /^\/\?q=mesa\+edge&/);
  const params = Object.fromEntries(
    [...new URLSearchParams(href.slice(2)).keys()].map((key) => [
      key,
      new URLSearchParams(href.slice(2)).getAll(key),
    ]),
  );
  // Repeated keys carry the lists; a lone value is also accepted as a string.
  assert.deepEqual(parseCatalogQuery(params), query);
  assert.deepEqual(
    parseCatalogQuery({ type: "Crimp", page: "2", grade: "0" }),
    { ...DEFAULT_CATALOG_QUERY, types: ["Crimp"], page: 2, targetGrade: 0 },
  );
});

test("unknown or malformed values fall back instead of failing", () => {
  const query = parseCatalogQuery({
    type: ["Crimp", "Banana"],
    size: "Huge",
    method: "magic",
    sort: "random",
    grade: "99",
    page: ["-4"],
    q: "x".repeat(500),
  });
  assert.deepEqual(query, {
    ...DEFAULT_CATALOG_QUERY,
    types: ["Crimp"],
    query: "x".repeat(200),
  });
  assert.equal(parseCatalogQuery({ page: "1.5" }).page, 1);
  assert.equal(parseCatalogQuery({ page: "0" }).page, 1);
});

test("the search becomes a prefix query over words only", () => {
  assert.equal(searchTsQuery("Cri"), "cri:*".replace("cri", "Cri"));
  assert.equal(searchTsQuery("petg-cf  mesa"), "petg:* & cf:* & mesa:*");
  assert.equal(searchTsQuery("  ' | & ( ) :* "), null);
  assert.equal(searchTsQuery(""), null);
  assert.equal(
    searchTsQuery("a b c d e f g h i j"),
    "a:* & b:* & c:* & d:* & e:* & f:* & g:* & h:*",
    "long searches are cut off",
  );
});

test("pages count the whole catalog, never fewer than one", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(CATALOG_PAGE_SIZE), 1);
  assert.equal(pageCount(CATALOG_PAGE_SIZE + 1), 2);
});
