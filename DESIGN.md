# Garage Holds workshop system

RIL-95 replaces the prior serif/purple/card treatment. The RIL-59 logo geometry
stays unchanged. This specification follows the owner's workshop / gym / CAD
brief and applies across the catalog, guides, accounts and labs.

- Palette (owner's latest direction): cool off-white `#f4f3f8`, charcoal-violet
  `#282633`, deep violet `#65508f`. Dark surfaces `#202027` / `#282830`, pale
  ink `#efedf5`, lavender accent `#a18bc9`. The masthead and hold presentation
  use the same violet/lavender family. Success/error colors keep their semantic
  distinction. Never use color alone to communicate state.
- Type: self-hosted Barlow Condensed Bold for headings/wordmark, existing Arial
  for reading and controls. Consolas/system monospace only for measurements,
  counts, file formats and technical values. Display 48–88px, page 36–48px,
  section 24–30px, body 14–16px, dense labels 12–13px. Tabular numerals.
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
Font source/license: Google Fonts' Barlow Condensed directory and accompanying
SIL Open Font License in `public/fonts/BarlowCondensed-OFL.txt`.
