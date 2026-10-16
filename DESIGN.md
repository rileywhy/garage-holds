# Garage Holds workshop system

RIL-95 replaces the prior serif/purple/card treatment. The RIL-59 logo geometry
stays unchanged. This specification follows the owner's workshop / gym / CAD
brief and applies across the catalog, guides, accounts and labs.

- Palette (owner's latest direction): cool off-white `#f4f3f8`, charcoal-violet
  `#282633`, deep violet `#65508f`. Dark surfaces `#202027` / `#282830`, pale
  ink `#efedf5`, lavender accent `#a18bc9`. The masthead and hold presentation
  use the same violet/lavender family. Success/error colors keep their semantic
  distinction. Never use color alone to communicate state.
- Type: Arial/Helvetica for page titles, section headings, product titles and
  controls. Sentence case, measured weights (500?600), and clear size steps:
  home title 40px desktop / 30px mobile; page titles 32px / 30px; section
  headings 20?32px; product names 18?20px. Use IBM Plex Mono at medium weight (500) for the Garage Holds header and footer
  wordmarks (owner-selected), preserving title case. Consolas/system
  monospace remains for measurements, counts and technical values.
- Spacing: 4px scale; 8px control gaps, 16–20px panel padding, 24–32px section
  gaps, 40–56px outer desktop gutters. Mobile 16px gutters. Compact labs.
- Surfaces: flat fields with 1px rules and 3–6px corners. No floating shadows,
  glass, gradients, decorative metrics or generic pill cards. Empty states
  remain useful and unembellished.
- Shell: charcoal masthead, pale wordmark, clear navigation and lavender action.
  Catalog composition pairs the actual crimp render with the library's purpose
  and existing browse/make destinations. Lab hub uses a ruled image/text list.
- Labs: clear header rails, measured number fields and restrained active tabs.
  Preserve existing column layout, sticky mobile preview, scroll strips, every
  control, shortcut and all camera/edit/export behavior. Custom Shape shares
  surface/control tokens; canvas colors retain their semantic meaning.
- Controls: square-edged, 40px general actions, compact 32–36px desktop lab
  controls and 44px principal mobile actions. Persistent visible keyboard focus.
  Respect reduced motion and keep loading/disabled/error states legible.
- Responsive: collapse the home composition at 760px; hub rows stack at 640px.
  No page-level horizontal overflow. Intentionally scrolling view strips stay
  scrollable. Guides keep a readable measure; the brand scales with text.

Modes: catalog/hub introduce and help choose; labs operate; guide/help read.
Avoid technical decoration that competes with real geometry or parameter data.
Wordmark font: self-hosted IBM Plex Mono, licensed under the SIL OFL in
`public/fonts/IBMPlexMono-OFL.txt`.

Homepage refinement: the independent equipment-catalog composition is scoped to
the public homepage. Its full-width condensed heading, crimp product plate,
browse/lab rail and ruled catalog entries are documented in
`docs/homepage-surface-brief.md`. This surface does not replace the shared palette,
masthead, lab system, account surfaces or Saved page. Preserve the cool purple
tokens above; do not propagate homepage-only type sizes or grid rules globally.
