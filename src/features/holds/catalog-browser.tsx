"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  X,
  Bookmark,
  MoveUpRight,
  Plus,
} from "lucide-react";
import { useLibrary } from "@/components/library-provider";
import { filterHolds, activeFilterCount } from "./catalog";
import {
  DEFAULT_FILTERS,
  HOLD_TYPES,
  HOLD_SIZES,
  MOUNT_TYPES,
  MATERIALS,
  SPECIAL_PROCESSES,
  type HoldFilters,
} from "./types";
import {
  GRADE_BOARD_ANGLE,
  PROBLEM_GRADES,
  formatProblemGrade,
} from "./grades";
import { HoldCard } from "./hold-card";

export function CatalogBrowser({ savedOnly = false }: { savedOnly?: boolean }) {
  const { holds, reviews, savedIds, ready, storageError } = useLibrary();
  const [filters, setFilters] = useState<HoldFilters>({ ...DEFAULT_FILTERS });
  const [mobileFilters, setMobileFilters] = useState(false);
  const candidates = useMemo(
    () =>
      savedOnly ? holds.filter((hold) => savedIds.includes(hold.id)) : holds,
    [holds, savedIds, savedOnly],
  );
  const filtered = useMemo(
    () => filterHolds(candidates, filters),
    [candidates, filters],
  );
  const count = activeFilterCount(filters);
  function toggle<
    K extends "types" | "sizes" | "mounts" | "materials" | "specialProcesses",
  >(key: K, value: HoldFilters[K][number]) {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value as never)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
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
              <>
                Printable holds.
                <br />
                <span>For your home wall.</span>
              </>
            )}
          </h1>
          <p className="hero-description">
            {savedOnly
              ? "Keep the designs you want to come back to. Your saved library lives in this browser."
              : "Discover 3D printable climbing holds, share your designs, and find the right grip for your home wall or training board."}
          </p>
          <a href="#library" className="hero-text-link">
            {savedOnly ? "Browse your saved designs" : "Explore the library"}
            <ArrowDown size={15} />
          </a>
        </div>
        {!savedOnly && (
          <div className="hero-note">
            <div className="angle-drawing">
              <span className="angle-board" />
              <span className="angle-floor" />
              <span className="angle-arc" />
              <span className="angle-number">40°</span>
              <i />
              <i />
              <i />
            </div>
            <div>
              <p className="eyebrow">YOUR ANGLE. YOUR STYLE.</p>
              <p>
                From the first warm-up
                <br />
                to the project grip.
              </p>
              <span>Find the right fit for your board.</span>
            </div>
          </div>
        )}
        {savedOnly && (
          <div className="saved-hero-icon">
            <Bookmark size={66} strokeWidth={1} />
          </div>
        )}
      </section>
      {storageError && (
        <p className="error-box" role="alert">
          {storageError}
        </p>
      )}
      <section
        id="library"
        className="library-section"
        aria-label="Hold library"
      >
        <div className="library-title-row">
          <div>
            <h2>
              {savedOnly ? "Saved designs" : "The hold library"}
              <span className="result-count">{filtered.length}</span>
            </h2>
            <p>
              {savedOnly
                ? "A good idea deserves a second look."
                : "Open designs. Endless combinations."}
            </p>
          </div>
          <span className="sample-note">
            {savedOnly
              ? "Stored on this device"
              : "8 sample designs · add yours to get started"}
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
                    setFilters((current) => ({
                      ...DEFAULT_FILTERS,
                      query: current.query,
                      sort: current.sort,
                    }))
                  }
                >
                  Reset
                </button>
              )}
            </div>
            {groups.map((group) => (
              <fieldset className="filter-group" key={group.key}>
                <legend>{group.label}</legend>
                {group.values.map((value) => (
                  <label className="checkbox-row" key={value}>
                    <input
                      type="checkbox"
                      checked={filters[group.key].includes(value as never)}
                      onChange={() => toggle(group.key, value)}
                    />
                    <span>{value}</span>
                    {group.key === "types" && (
                      <span className="facet-count">
                        {
                          candidates.filter((hold) => hold.type === value)
                            .length
                        }
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
                value={filters.targetGrade ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    targetGrade:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
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
          <div className="catalog-results">
            <div className="catalog-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search designs"
                  placeholder="Search holds, creators, materials…"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                />
                {filters.query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() =>
                      setFilters((current) => ({ ...current, query: "" }))
                    }
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
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      sort: event.target.value as HoldFilters["sort"],
                    }))
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
                  filters[group.key].map((value) => (
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
                {filters.targetGrade !== null && (
                  <button
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        targetGrade: null,
                      }))
                    }
                  >
                    {formatProblemGrade(filters.targetGrade)} at{" "}
                    {GRADE_BOARD_ANGLE}°
                    <X size={12} />
                    <span className="sr-only">Remove grade filter</span>
                  </button>
                )}
              </div>
            )}
            {savedOnly && !ready ? (
              <p className="empty-state">Loading your saved library…</p>
            ) : filtered.length ? (
              <div className="hold-grid">
                {filtered.map((hold) => (
                  <HoldCard hold={hold} reviews={reviews} key={hold.id} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Bookmark size={32} strokeWidth={1.3} />
                <h3>
                  {savedOnly && !candidates.length
                    ? "Your collection starts here."
                    : "No holds found."}
                </h3>
                <p>
                  {savedOnly && !candidates.length
                    ? "Save a design with the bookmark button and it will appear here."
                    : "Try a different search or give your filters a little more room."}
                </p>
                {savedOnly && !candidates.length ? (
                  <Link href="/" className="button button-dark">
                    Explore designs <ArrowUpRight size={15} />
                  </Link>
                ) : (
                  <button
                    className="button button-outline"
                    onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
            <div className="catalog-end">
              <span>
                {filtered.length
                  ? "You’ve reached the end of this collection."
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
