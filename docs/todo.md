# To do

## Lab board preview: fixed Bambu A1 bed size

In the hold labs (`/make/jug`, `/make/crimp`, `/make/sloper`, `/make/foot`, `/make/custom-shape`) the board behind the hold is sized from the hold's bounding box (`BoardPanel.fitToHold` in `src/features/model-viewer/board-preview.ts`). Changing the hold's size therefore rescales the board too, so the preview gives no sense of real scale.

Change the board to a fixed panel the size of a Bambu Lab A1 print bed, 256 × 256 mm, centred on the hold's mount point. The board must not change dimensions when the hold's size controls change; only the hold should grow or shrink against it. Keep the camera framing stable across size changes as well, so the hold visibly changes size rather than the camera re-fitting.

Decide whether a hold larger than the bed should overhang the panel (showing it will not print on an A1) rather than growing the panel.
