"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
  Bookmark,
  MoveUpRight,
  Plus,
} from "lucide-react";
import { activeFilterCount } from "./catalog";
import {
  catalogHref,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
} from "./catalog-query";
import type { CatalogPage } from "./repository";
import {
  HOLD_TYPES,
  HOLD_SIZES,
  MOUNT_TYPES,
  MATERIALS,
  SPECIAL_PROCESSES,
  type HoldFilters,
  type HoldType,
} from "./types";
import {
  GRADE_BOARD_ANGLE,
  PROBLEM_GRADES,
  formatProblemGrade,
} from "./grades";
import { HoldCard } from "./hold-card";

// Typing pauses this long before the address changes and the server is
// asked for the matching page.
const SEARCH_DELAY_MS = 350;

// The catalog's controls write to the address and the server renders the
// page the address asks for (see catalog-query.ts), so this component holds
// no list of designs beyond the page it was given.
export function CatalogBrowser({
  page,
  query,
  typeCounts,
  savedIds,
  signedIn,
  savedOnly = false,
  beforeLibrary,
}: {
  page: CatalogPage;
  query: CatalogQuery;
  // Published designs per type, for the filter sidebar; absent on pages
  // where the numbers would not mean much.
  typeCounts?: Partial<Record<HoldType, number>>;
  savedIds: string[];
  signedIn: boolean;
  savedOnly?: boolean;
  // The Saved page's lab presets, shown between the hero and the designs.
  beforeLibrary?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = savedOnly ? "/saved" : "/";
  const [pending, startTransition] = useTransition();
  const [mobileFilters, setMobileFilters] = useState(false);
  const navigate = (next: Partial<CatalogQuery>) =>
    startTransition(() => {
      router.replace(catalogHref({ ...query, page: 1, ...next }, pathname), {
        scroll: false,
      });
    });
  const [draft, setDraft] = useSearchDraft(query.query, (text) =>
    navigate({ query: text }),
  );
  const count = activeFilterCount(query);
  function toggle<
    K extends "types" | "sizes" | "mounts" | "materials" | "specialProcesses",
  >(key: K, value: HoldFilters[K][number]) {
    navigate({
      [key]: query[key].includes(value as never)
        ? query[key].filter((item) => item !== value)
        : [...query[key], value],
    });
  }
  const groups = [
    { label: "Hold type", key: "types" as const, values: HOLD_TYPES },
    { label: "Size", key: "sizes" as const, values: HOLD_SIZES },
    { label: "Mounting", key: "mounts" as const, values: MOUNT_TYPES },
    { label: "Material", key: "materials" as const, values: MATERIALS },
    {
      label: "Special process",
      key: "specialProcesses" as const,
      values: SPECIAL_PROCESSES,
    },
  ];
  const pageHref = (number: number) =>
    catalogHref({ ...query, page: number }, pathname);
  return (
    <main className="main-container">
      <section className={`catalog-hero ${savedOnly ? "saved-hero" : ""}`}>
        <div>
          <p className="eyebrow">
            <span className="status-dot" />
            {savedOnly ? "YOUR NEXT PROJECTS" : "MADE FOR YOUR BOARD"}
          </p>
          <h1>
            {savedOnly ? (
              <>
                A collection
                <br />
                with potential.
              </>
            ) : (
              <>3d grips for your home wall</>
            )}
          </h1>
          {savedOnly && (
            <p className="hero-description">
              Keep the designs you want to come back to. Saved designs follow
              your account to any device.
            </p>
          )}
          <a href="#library" className="hero-text-link">
            {savedOnly ? "Browse your saved designs" : "explore the pile"}
            <ArrowDown size={15} />
          </a>
        </div>
        {savedOnly && (
          <div className="saved-hero-icon">
            <Bookmark size={66} strokeWidth={1} />
          </div>
        )}
      </section>
      {beforeLibrary}
      <section
        id="library"
        className="library-section"
        aria-label="Hold library"
      >
        <div className="library-title-row">
          <div>
            <h2>
              {savedOnly ? "Saved designs" : "the pile"}
              <span className="result-count">{page.total}</span>
            </h2>
            {savedOnly && <p>A good idea deserves a second look.</p>}
          </div>
          <span className="sample-note">
            {savedOnly
              ? "Saved to your account"
              : `${page.total} ${page.total === 1 ? "design" : "designs"} · add yours to get started`}
          </span>
        </div>
        <div className="catalog-layout">
          <aside
            className={`filters ${mobileFilters ? "filters-open" : ""}`}
            aria-label="Filter holds"
          >
            <div className="filter-heading">
              <h3>
                <SlidersHorizontal size={15} /> Filters{" "}
                {count > 0 && <span className="filter-count">{count}</span>}
              </h3>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      ...DEFAULT_CATALOG_QUERY,
                      query: query.query,
                      sort: query.sort,
                    })
                  }
                >
                  Reset
                </button>
              )}
            </div>
            <fieldset className="filter-group">
              <legend>Design method</legend>
              <select
                aria-label="Design method"
                value={query.designMethod}
                onChange={(event) =>
                  navigate({
                    designMethod: event.target
                      .value as HoldFilters["designMethod"],
                  })
                }
              >
                <option value="">All designs</option>
                <option value="human-shaped">Human-shaped (HS)</option>
                <option value="generated">Generated</option>
              </select>
            </fieldset>
            {groups.map((group) => (
              <fieldset className="filter-group" key={group.key}>
                <legend>{group.label}</legend>
                {group.values.map((value) => (
                  <label className="checkbox-row" key={value}>
                    <input
                      type="checkbox"
                      checked={query[group.key].includes(value as never)}
                      onChange={() => toggle(group.key, value)}
                    />
                    <span>{value}</span>
                    {group.key === "types" && typeCounts && (
                      <span className="facet-count">
                        {typeCounts[value as HoldType] ?? 0}
                      </span>
                    )}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="filter-group angle-filter">
              <label htmlFor="target-grade">
                Suggested grade at {GRADE_BOARD_ANGLE}°
              </label>
              <select
                id="target-grade"
                value={query.targetGrade ?? ""}
                onChange={(event) =>
                  navigate({
                    targetGrade:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              >
                <option value="">Any grade</option>
                {PROBLEM_GRADES.map((grade) => (
                  <option value={grade} key={grade}>
                    {formatProblemGrade(grade)}
                  </option>
                ))}
              </select>
              <p>Creator suggestions for problems on a 40° board.</p>
            </div>
            <div className="sidebar-note">
              <MoveUpRight size={19} />
              <strong>Made a hold you love?</strong>
              <p>Your next design could be someone’s next project.</p>
              <Link href="/upload">
                Share your design <ArrowUpRight size={13} />
              </Link>
            </div>
          </aside>
          <div className="catalog-results" aria-busy={pending}>
            <div className="catalog-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search designs"
                  placeholder="Search holds, creators, materials…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                {draft && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setDraft("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <button
                className="mobile-filter-button button button-outline"
                aria-expanded={mobileFilters}
                onClick={() => setMobileFilters((current) => !current)}
              >
                <SlidersHorizontal size={15} /> Filters
                {count > 0 && ` (${count})`}
              </button>
              <label className="sort-control">
                <span>Sort:</span>
                <select
                  aria-label="Sort designs"
                  value={query.sort}
                  onChange={(event) =>
                    navigate({
                      sort: event.target.value as HoldFilters["sort"],
                    })
                  }
                >
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="title">Name A–Z</option>
                </select>
              </label>
            </div>
            {count > 0 && (
              <div className="active-filters">
                {groups.flatMap((group) =>
                  query[group.key].map((value) => (
                    <button
                      key={`${group.key}-${value}`}
                      onClick={() => toggle(group.key, value)}
                    >
                      {value}
                      <X size={12} />
                      <span className="sr-only">Remove filter</span>
                    </button>
                  )),
                )}
                {query.targetGrade !== null && (
                  <button onClick={() => navigate({ targetGrade: null })}>
                    {formatProblemGrade(query.targetGrade)} at{" "}
                    {GRADE_BOARD_ANGLE}°
                    <X size={12} />
                    <span className="sr-only">Remove grade filter</span>
                  </button>
                )}
              </div>
            )}
            {page.holds.length ? (
              <div className="hold-grid">
                {page.holds.map((hold) => (
                  <HoldCard
                    hold={hold}
                    saved={savedIds.includes(hold.id)}
                    signedIn={signedIn}
                    key={hold.id}
                  />
                ))}
              </div>
            ) : page.total > 0 ? (
              <div className="empty-state">
                <Bookmark size={32} strokeWidth={1.3} />
                <h3>Nothing on this page.</h3>
                <p>
                  This collection has {page.pageCount}{" "}
                  {page.pageCount === 1 ? "page" : "pages"}.
                </p>
                <Link
                  href={pageHref(page.pageCount)}
                  className="button button-dark"
                >
                  Go to the last page
                </Link>
              </div>
            ) : (
              <div className="empty-state">
                <Bookmark size={32} strokeWidth={1.3} />
                <h3>
                  {savedOnly && !count && !query.query
                    ? "Your collection starts here."
                    : "No holds found."}
                </h3>
                <p>
                  {savedOnly && !count && !query.query
                    ? "Save a design with the bookmark button and it will appear here."
                    : "Try a different search or give your filters a little more room."}
                </p>
                {savedOnly && !count && !query.query ? (
                  <Link href="/" className="button button-dark">
                    explore the pile <ArrowUpRight size={15} />
                  </Link>
                ) : (
                  <button
                    className="button button-outline"
                    onClick={() => {
                      setDraft("");
                      navigate(DEFAULT_CATALOG_QUERY);
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
            {page.pageCount > 1 && (
              <nav className="pagination" aria-label="Pages of designs">
                {page.page > 1 ? (
                  <Link href={pageHref(page.page - 1)} rel="prev">
                    <ChevronLeft size={15} /> Previous
                  </Link>
                ) : (
                  <span aria-disabled="true">
                    <ChevronLeft size={15} /> Previous
                  </span>
                )}
                <span>
                  Page {page.page} of {page.pageCount}
                </span>
                {page.page < page.pageCount ? (
                  <Link href={pageHref(page.page + 1)} rel="next">
                    Next <ChevronRight size={15} />
                  </Link>
                ) : (
                  <span aria-disabled="true">
                    Next <ChevronRight size={15} />
                  </span>
                )}
              </nav>
            )}
            <div className="catalog-end">
              <span>
                {page.holds.length
                  ? page.page < page.pageCount
                    ? "More designs on the next page."
                    : "You’ve reached the end of this collection."
                  : "Have a design in mind?"}
              </span>
              <Link href="/upload">
                <Plus size={14} /> Add your own
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// The search box's text, sent to the address once typing pauses. The box
// keeps what was typed while the server answers; only an address change
// from elsewhere (the back button, a link) resets it.
function useSearchDraft(
  committed: string,
  commit: (text: string) => void,
): [string, (text: string) => void] {
  const [draft, setDraft] = useState(committed);
  const sent = useRef(committed);
  useEffect(() => {
    if (committed === sent.current) return;
    sent.current = committed;
    setDraft(committed);
  }, [committed]);
  useEffect(() => {
    if (draft.trim() === sent.current.trim()) return;
    const timer = setTimeout(() => {
      sent.current = draft;
      commit(draft);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // `commit` closes over the current query; the latest one is wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return [draft, setDraft];
}
