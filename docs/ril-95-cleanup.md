# RIL-95: Garage Holds workshop identity

Implemented on the existing `ui-design` branch. RIL-95 remains open for the
owner's review. This work is uncommitted, unpushed and undeployed.

## Direction and implementation

The owner's expanded brief replaces the previous visual world with an
industrial workshop / climbing gym / CAD system. `PRODUCT.md` records the
confirmed purpose and constraints; `DESIGN.md` is the concise visual specification.

- Self-hosted Barlow Condensed Bold headings and wordmark; existing Arial for
  reading and controls; tabular monospace for technical values. The font and
  SIL Open Font License are in `public/fonts`; no runtime dependency or CDN.
- Cool off-white, charcoal-violet and lavender, following the owner's latest palette direction.
  Shared tokens and presentation rules live in `src/app/workshop.css`, loaded
  after the existing structural stylesheet. Secondary headings use the same
  display face throughout the existing global styles.
- A charcoal-violet masthead and restrained lavender action; the original RIL-59 logo
  remains byte-identical (SHA-256 starts `69d32aba7761c0ad`). No retracing or
  artwork modifications.
- Homepage composition pairs its actual Crimp Lab render with a direct statement
  of the product, existing library navigation and existing lab destinations.
  The hub uses ruled image/description rows instead of repeated enclosed cards.
- Compact, square-edged lab controls, technical numeric fields, tab states and
  strong viewport boundaries. Custom Shape shares the same controls, panel and
  typography conventions. Existing mobile preview pinning and scrolling strips
  stay in place. The original purple-toned 3D viewer lighting, background and grid are retained.
  No camera, control, geometry, mesh processing or export logic changed.
- Supporting forms, guide pages, empty/error states and footer inherit the same
  system. Sign-in/account retain a narrow reading/form measure.
- Brand-image generation now uses the workshop palette and bold sans titles;
  favicon, Apple icon and all seven Open Graph images were regenerated with
  their existing filenames. The SVG source is unchanged.

## Copy and UNSLOP

UNSLOP remains installed at `.agents/skills/unslop`, pinned by `skills-lock.json`.
Its cleanup/core/rewrite guidance was read and used; no application dependency
was added. The earlier inventory covered 95 source files and 13 rendered routes.
This redesign reused it rather than repeating an exhaustive audit.

Examples retained from the cleanup:

| Before                                            | After                                    |
| ------------------------------------------------- | ---------------------------------------- |
| A collection / with potential.                    | Saved holds for your next print.         |
| Find the right fit                                | Hold details                             |
| A new grip starts here.                           | Upload a hold design                     |
| Your next design could be someone's next project. | Add your model files and print settings. |

New home copy explicitly explains files, print recipes, home walls, labs and STL
export. Technical labels, units, safety information, legal copy and lab control
names stay intact. Scanned the six representative redesigned routes with phrase,
structure and silhouette scanners: no phrase violations. The hub's soft repeated
opener warning comes from repeated `Open lab` links and parallel descriptions;
those remain useful and were deliberately protected rather than varied for a score.
The earlier preservation checks and reviewed false positives are retained in
adjacent QA records. The guide preserved all 29 extracted constraints.

## Focused review and validation

Used the installed Impeccable context, audit/polish guidance and detector; no
skill reinstallation. Its missing engine was repaired through the installed
launcher's verified user-cache download (engine 0.1.5).

A batched desktop/mobile review covered catalog, hub, Custom Shape, Crimp Lab,
guide and sign-in at 1440 x 1000 and 390 x 844, including light/dark key surfaces.
The focused visual review confirmed a replacement type/palette/composition system,
not a recoloring of the serif/card interface. It identified caption contrast and
sign-in width issues; both were corrected. A subsequent dark-mode check identified
the existing screw-hole legend contrast; only its label color was corrected.

- No document-level horizontal overflow in the 12 representative route/device
  combinations. Lab strips intentionally retain horizontal scrolling.
- Axe WCAG A/AA checks passed on the representative surfaces after repairs;
  final targeted home/Custom Shape checks passed in all eight combinations of
  desktop/mobile and light/dark. This is automated checking, not certification.
- Mobile filters still open/close. Search receives keyboard focus with a visible
  2px outline. Empty, disabled, ready and unconfigured-account states reviewed.
- Impeccable's final detector warns about two thick top borders on rounded
  elements. Both actual control-panel selectors explicitly have `border-radius: 0`;
  these are reviewed detector false positives, not unaddressed rounded-card accents.
- Lint, typecheck, 144 tests, formatting and production build passed.
- AST checks confirm existing event handlers, form attributes, parameter bindings
  and navigation attributes remain intact. New home links point to existing routes.
  API/geometry/storage/data/package manifests have no changes.

## Review limits and handoff

Accounts are unconfigured locally, so authenticated upload/edit/account screens
were reviewed in source rather than exercised against a backend. All labs inherit
shared presentation rules; focused live review used Crimp and Custom Shape as the
two distinct tool shells. No full backend or exhaustive device certification is
claimed. No remaining implementation blocker was found in the representative pass.

Browser captures, axe output, scope checks and UNSLOP reports are outside the
repository in the adjacent `ril-95-qa` folder. Axe was installed there solely for
QA. No generated tests, screenshots or QA tooling were added to the application.
The existing local preview remains running for the owner's visual review.

Latest direction: retain the cooler purple scheme. Shared colors, masthead,
hero presentation, viewer and generated social/icon assets are coordinated in
the lavender/violet palette; the new typography, layouts and lab density remain.
