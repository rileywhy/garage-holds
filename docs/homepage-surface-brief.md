# Homepage: independent climbing equipment catalog

## Intent and boundary

Give the public homepage the direct, physical character of an independent
climbing equipment catalog. Keep the existing cool purple visual system in
`DESIGN.md`, the immutable RIL-59 logo and the shared shell. This is a homepage
composition change; all labs, guides, accounts and the Saved page retain their
existing layouts and behavior.

## Composition

The full-width Barlow Condensed heading leads into a broad product plate with
the existing `/images/hold-labs/crimp.webp` asset as its centerpiece. The concise
caption links to Crimp Lab and uses existing mounting/export facts. A ruled
intro rail connects the library anchor and Hold Labs. Copy stays practical;
do not add manufacturing, safety, performance or commercial claims.

The populated library follows immediately: clear title and result count,
existing sample-data disclosure, search and sorting, filters and active-filter
feedback, then square product images and ruled entries. Product titles use
condensed uppercase type; creator, tags and factual metadata stay subordinate.
Keep bookmarks, pagination, links, loading and empty states functional.

## Responsive behavior

The heading spans the desktop width and stacks at 760px. The product plate
scales without obscuring its caption. Below 1100px the introduction occupies
its own rail row and the catalog uses two columns; below 420px the catalog
uses one column. Preserve the mobile filter drawer and avoid page overflow.
Keyboard focus, readable contrast and existing reduced-motion support remain
part of the shared control system.

## Implementation boundary

Homepage markup is in `src/features/holds/catalog-browser.tsx`, behind the
public-homepage branch. Its composition and catalog overrides live at the end
of `src/app/workshop.css`, scoped through the equipment homepage/hero surface.
Do not change global color tokens or reuse these overrides as lab styling.
Preserve existing catalog query, data, authentication and download behavior.
Save text as UTF-8 and keep punctuation readable.

## Lab carousel and preview finish

The product plate cycles through the five entries in the shared LABS list.
Previous/next arrows and named lab buttons select slides; each slide links to
its lab. Automatic rotation pauses on hover, stops after focus or manual
selection, and is disabled for reduced motion. A play/pause control remains
available. Only the selected slide participates in keyboard navigation.

Crimp, sloper and jug thumbnails were re-rendered from their default generator
meshes using the shared preview material and lighting. Corner-angle-weighted
normals smooth uneven boolean triangles; a 30-degree crease threshold keeps
screw-seat rims distinct. Model coordinates, generator settings and exports
are unchanged. The existing Foot Lab image remains the visual reference.

All lab artwork now uses Foot Lab's upright three-quarter presentation.
Custom Shape artwork is rendered from its default document's exported mesh,
with smooth normals and transparent antialiased edges, replacing the old image.
Shared preview lighting joins smooth surface fans across duplicate boolean
vertices without changing positions; hard creases remain separate. Custom
Shape retains its 60-degree body smoothing; the other labs use 30 degrees.

Carousel framing now accounts for each asset's transparent padding. Visible
silhouettes share the Crimp reference's top alignment, with larger holds scaled
down and a common responsive artwork frame. Browser measurements confirmed
matching top clearance for all five slides on desktop and mobile.

The carousel's named selector strip is replaced with small in-window dots.
Each dot keeps an accessible lab name and pressed state. Arrows and a compact
pause/play control remain available; captions sit above the indicator row.
