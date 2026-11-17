import { createRoot } from "react-dom/client";
import { StlPreview } from "../../src/features/holds/stl-preview";
import { StlViewer } from "../../src/features/holds/stl-viewer";

// The page tests/browser/stl-previews.test.ts loads: a library card's
// thumbnail and the design page's interactive viewer, each drawing the same
// STL in a colour the test can recognise.
// With ?expired the page starts from a link the server refuses, as a page
// open for over an hour does.
const url = location.search === "?expired" ? "/expired.stl" : "/hold.stl";
const file = { id: "fixture", url, orientation: "x,y,z" };
const frame = { width: 320, height: 300, background: "var(--visual-bg)" };

createRoot(document.getElementById("root")!).render(
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div id="card" style={frame}>
      <StlPreview file={file} title="Fixture" color="#18a038" />
    </div>
    <div id="viewer" style={frame}>
      <StlViewer file={file} title="Fixture" color="#18a038" />
    </div>
  </div>,
);
