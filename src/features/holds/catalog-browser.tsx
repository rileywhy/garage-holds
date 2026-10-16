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
import { LabCarousel } from "../labs/lab-carousel";

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
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filtersId = savedOnly ? "saved-catalog-filters" : "catalog-filters";
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
    <main className={`main-container ${savedOnly ? "" : "equipment-home"}`}>
      {savedOnly ? (
        <section className="catalog-hero saved-hero">
          <div className="hero-copy">
            <h1>Saved holds for your next print.</h1>
            <p className="hero-description">
              Keep the designs you want to come back to. Saved designs follow
              your account to any device.
            </p>
            <a href="#library" className="hero-text-link">
              Browse your saved designs <ArrowDown size={15} />
            </a>
          </div>
          <div className="saved-hero-icon">
            <Bookmark size={66} strokeWidth={1} />
          </div>
        </section>
      ) : (
        <section className="equipment-hero" aria-labelledby="home-title">
          <div className="equipment-copy">
            <h1 id="home-title">
              Climbing holds. <span>Made to print.</span>
            </h1>
            <p className="equipment-description">
              Model files and print recipes for your home wall. Find your next
              hold in the pile, or shape it yourself in Hold Labs.
            </p>
            <a href="#library" className="equipment-browse button button-dark">
              Browse the pile <ArrowDown size={16} />
            </a>
          </div>
          <LabCarousel />
        </section>
      )}
      {beforeLibrary}
      <section
        id="library"
        className="library-section"
        aria-label="Hold library"
      >
        <div className="library-title-row">
          <div>
            <h2>
              {savedOnly ? "Saved designs" : "The Pile"}
              <span className="result-count">{page.total}</span>
            </h2>
            {savedOnly && <p>Designs you have bookmarked.</p>}
          </div>
          <span className="sample-note">
            {savedOnly
              ? "Saved to your account"
              : "Community designs / Model files + print recipes"}
          </span>
        </div>
        <div
          className={`catalog-layout ${filtersOpen ? "" : "catalog-filters-collapsed"}`}
        >
          <aside className="filters" aria-label="Filter holds">
            <div className="filter-heading">
              <h3>
                <button
                  type="button"
                  className="filter-sidebar-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls={filtersId}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <SlidersHorizontal size={15} aria-hidden="true" /> Filters
                  {count > 0 && <span className="filter-count">{count}</span>}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </h3>
              {filtersOpen && count > 0 && (
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
            <div
              id={filtersId}
              className="filter-sidebar-content"
              hidden={!filtersOpen}
            >
              <fieldset className="filter-group design-method-filter">
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
                <details
                  className="filter-section"
                  key={group.key}
                  open={group.key === "types" || query[group.key].length > 0}
                >
                  <summary>
                    <ChevronRight size={14} aria-hidden="true" /> {group.label}
                    {query[group.key].length > 0 && (
                      <span className="filter-count">
                        {query[group.key].length}
                      </span>
                    )}
                  </summary>
                  <fieldset className="filter-group">
                    <legend className="sr-only">{group.label}</legend>
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
                </details>
              ))}
              <details
                className="filter-section"
                open={query.targetGrade !== null}
              >
                <summary>
                  <ChevronRight size={14} aria-hidden="true" /> Suggested grade
                  {query.targetGrade !== null && (
                    <span className="filter-count">1</span>
                  )}
                </summary>
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
              </details>
              <div className="sidebar-note">
                <Link href="/upload">
                  Share your design <ArrowUpRight size={13} />
                </Link>
                <p>Add your model files and print settings.</p>
              </div>
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
                    : "Try another search or remove a filter."}
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
