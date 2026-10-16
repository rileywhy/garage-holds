import { isProblemGrade } from "./grades";
import {
  DEFAULT_FILTERS,
  DESIGN_METHODS,
  HOLD_SIZES,
  HOLD_TYPES,
  MATERIALS,
  MOUNT_TYPES,
  SPECIAL_PROCESSES,
  type HoldFilters,
} from "./types";

// The catalog's address is its state: every filter, the search, the sort
// and the page live in the query string, so a filtered view can be shared,
// the back button works, and the server reads the same thing the browser
// shows. The database does the filtering (see repository.ts); this module
// only translates between the URL and a query, with no I/O.

export const CATALOG_PAGE_SIZE = 24;

export interface CatalogQuery extends HoldFilters {
  // 1-based.
  page: number;
}

export const DEFAULT_CATALOG_QUERY: CatalogQuery = {
  ...DEFAULT_FILTERS,
  page: 1,
};

export type SearchParams = Record<string, string | string[] | undefined>;

// Unknown values are dropped rather than refused, so a stale link still
// shows the catalog instead of an error.
export function parseCatalogQuery(params: SearchParams): CatalogQuery {
  const list = (key: string) => {
    const value = params[key];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const one = (key: string) => list(key)[0] ?? "";
  const known = <T extends string>(values: string[], allowed: readonly T[]) =>
    allowed.filter((item) => values.includes(item));
  const grade = Number(one("grade"));
  const page = Number(one("page"));
  const sort = one("sort");
  const method = one("method");
  return {
    query: one("q").slice(0, 200),
    designMethod: DESIGN_METHODS.includes(method as never)
      ? (method as HoldFilters["designMethod"])
      : "",
    types: known(list("type"), HOLD_TYPES),
    sizes: known(list("size"), HOLD_SIZES),
    mounts: known(list("mount"), MOUNT_TYPES),
    materials: known(list("material"), MATERIALS),
    specialProcesses: known(list("process"), SPECIAL_PROCESSES),
    targetGrade:
      one("grade") !== "" && isProblemGrade(grade) && grade !== null
        ? grade
        : null,
    sort: sort === "newest" || sort === "title" ? sort : DEFAULT_FILTERS.sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

// The address for a query, with defaults left out so the plain catalog
// stays at the bare path.
export function catalogHref(query: CatalogQuery, pathname = "/") {
  const params = new URLSearchParams();
  if (query.query.trim()) params.set("q", query.query.trim());
  if (query.designMethod) params.set("method", query.designMethod);
  for (const type of query.types) params.append("type", type);
  for (const size of query.sizes) params.append("size", size);
  for (const mount of query.mounts) params.append("mount", mount);
  for (const material of query.materials) params.append("material", material);
  for (const process of query.specialProcesses)
    params.append("process", process);
  if (query.targetGrade !== null)
    params.set("grade", String(query.targetGrade));
  if (query.sort !== DEFAULT_FILTERS.sort) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

// The tsquery for a search box: every word must match the start of a word
// in the design's text ("cri" finds "Crimp", "petg-cf" finds "PETG-CF").
// Only letters and digits reach the database, so no input can break the
// query syntax. Null when there is nothing to search for.
export function searchTsQuery(text: string): string | null {
  const words = text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return words.length ? words.map((word) => `${word}:*`).join(" & ") : null;
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
}

// The filters as PostgREST conditions, on any client: the pages use the
// signed-in user's, the integration tests a plain one. The search vector is kept by the
// database (see the catalog_search migration); every other filter is a
// column match. Ties break on id so pages never repeat or skip a design.
export function applyCatalogQuery<
  B extends {
    eq(column: string, value: unknown): B;
    in(column: string, values: readonly unknown[]): B;
    textSearch(column: string, query: string, options: { config: string }): B;
    order(
      column: string,
      options?: { ascending?: boolean; nullsFirst?: boolean },
    ): B;
  },
>(builder: B, query: CatalogQuery, withinIds?: string[]): B {
  let q = builder.eq("status", "published");
  if (withinIds) q = q.in("id", withinIds);
  const search = searchTsQuery(query.query);
  if (search) q = q.textSearch("search", search, { config: "simple" });
  if (query.designMethod) q = q.eq("design_method", query.designMethod);
  if (query.types.length) q = q.in("hold_type", query.types);
  if (query.sizes.length) q = q.in("size", query.sizes);
  if (query.mounts.length) q = q.in("mounting", query.mounts);
  if (query.materials.length) q = q.in("material", query.materials);
  if (query.specialProcesses.length)
    q = q.in("special_process", query.specialProcesses);
  if (query.targetGrade !== null) q = q.eq("problem_grade", query.targetGrade);
  if (query.sort === "title") q = q.order("title");
  else if (query.sort === "newest")
    q = q.order("created_at", { ascending: false });
  else q = q.order("published_at", { ascending: false, nullsFirst: false });
  return q.order("id");
}
