// How the 3D viewer's view moves, kept free of three.js so pages can describe
// the viewer before loading it.

// For every viewer's accessible label.
export const VIEWER_CONTROLS =
  "Drag to turn, adding Shift to pan; scroll or pinch to zoom. Arrow keys turn, plus and minus zoom, and 0 fits the view.";

// What to try when the viewer cannot start because the browser has 3D
// graphics (WebGL) turned off. Chrome also turns them off for the rest of a
// session after its graphics process crashes, with the setting still on, and
// only a full restart brings them back.
export const NO_3D_HELP =
  "3D graphics are off in this browser. Check that graphics acceleration is on in its settings; if it already is, close every browser window and open it again.";
