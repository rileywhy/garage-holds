import { Viewer, drawProfile } from "/viewer.js";

const $ = (selector) => document.querySelector(selector);
let config,
  parameters,
  viewer,
  timer,
  controller,
  sequence = 0,
  fitNext = true;
let currentDesign = null;
let lastPreview = null;
const widgets = new Map();

function status(message, error = false) {
  $("#status").textContent = message;
  $("#status").classList.toggle("error", error);
}

function dirty() {
  currentDesign = null;
  $("#export").disabled = true;
  $("#save-settings").disabled = true;
  status("Updating preview…");
  clearTimeout(timer);
  controller?.abort();
  sequence++;
  timer = setTimeout(preview, 180);
}

function updateControl(key, value) {
  parameters[key] = value;
  const widget = widgets.get(key);
  if (widget) {
    widget.number.value = value;
    widget.slider.value = value;
  }
}

function refreshWidgets() {
  for (const key of widgets.keys()) updateControl(key, parameters[key]);
  $("#screws").checked = parameters.screws;
  $("#bolt-mount").checked = Boolean(parameters.bolt_mount);
  $("#bolt-mount").disabled = !parameters.screws;
  $("#auto-spacing").checked = parameters.auto_spacing;
  $("#auto-spacing").disabled = !parameters.screws || parameters.bolt_mount;
  $("#auto-seat").checked = parameters.auto_seat;
  $("#auto-seat").disabled = !parameters.screws;
  $("#seed").value = parameters.seed;
  for (const control of config.controls.filter(
    (item) => item.group === "Mounting",
  )) {
    const disabled =
      !parameters.screws ||
      (control.key === "screw_spacing" && parameters.auto_spacing) ||
      (control.key === "seat_depth" && parameters.auto_seat);
    widgets.get(control.key).number.disabled = disabled;
    widgets.get(control.key).slider.disabled = disabled;
    const hidden = control.key.startsWith("bolt_")
      ? !parameters.bolt_mount
      : parameters.bolt_mount &&
        ["screw_count", "screw_spacing"].includes(control.key);
    widgets.get(control.key).number.closest(".control").hidden =
      Boolean(hidden);
  }
}

function apply(values) {
  parameters = { ...values };
  refreshWidgets();
  fitNext = true;
  dirty();
}

function activateVariation(seed) {
  parameters.seed = seed;
  if (Number.isInteger(seed) && seed >= 0 && seed <= 999999)
    updateControl("character", Math.max(1.4, parameters.character));
  $("#preset").value = "Custom";
  dirty();
}

async function post(path, values, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
    signal,
  });
  if (!response.ok) {
    const failure = await response.json();
    throw new Error(
      failure.error || "The generator could not complete this request.",
    );
  }
  return response;
}

async function preview() {
  controller = new AbortController();
  const request = sequence;
  const settings = { ...parameters };
  try {
    const response = await post("/api/preview", settings, controller.signal);
    const data = await response.json();
    if (request !== sequence) return;
    viewer.update(data, fitNext);
    lastPreview = data;
    fitNext = false;
    drawProfile($("#profile"), data, settings);
    const rows = [
      ["Dimensions", `${data.dimensions.join(" × ")} mm`],
      ["Estimated material", `≈ ${data.material_grams.join("–")} g`],
      ["Mesh", `${data.triangles.toLocaleString()} triangles · closed`],
      ["Screw holes", `${data.screws.length}`],
    ];
    if (data.screws.length)
      rows.push(["Screw seat", `${data.seat_depth} mm above the wall`]);
    if (data.screw_spacing !== null)
      rows.push(["Centre spacing", `${data.screw_spacing} mm across width`]);
    $("#metrics").replaceChildren(
      ...rows.map(([label, value]) => {
        const row = document.createElement("div"),
          term = document.createElement("dt"),
          definition = document.createElement("dd");
        term.textContent = label;
        definition.textContent = value;
        row.append(term, definition);
        return row;
      }),
    );
    currentDesign = data.design;
    $("#export").disabled = false;
    $("#save-settings").disabled = false;
    // The generator may have changed a setting to make the shape work; the
    // sliders follow, and this preview already shows the result.
    const changed = Object.keys(data.adjusted || {});
    if (changed.length) {
      Object.assign(parameters, data.adjusted);
      $("#preset").value = "Custom";
      refreshWidgets();
    }
    status(
      data.adjusted?.body_height !== undefined
        ? `Preview is current. Body height raised to ${data.adjusted.body_height} mm so the screws fit.`
        : "Preview is current. Export builds a finer version of this shape.",
    );
  } catch (error) {
    if (error.name !== "AbortError" && request === sequence)
      status(`${error.message} Showing the last valid model.`, true);
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectTab(group, focus = false) {
  for (const tab of document.querySelectorAll("[role=tab]")) {
    const selected = tab.dataset.group === group;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll("[role=tabpanel]"))
    panel.hidden = panel.dataset.group !== group;
}

function createControls() {
  for (const group of ["Grip", "Shape", "Mounting"]) {
    const panel = document.createElement("div");
    panel.id = `controls-${group.toLowerCase()}`;
    panel.dataset.group = group;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `tab-${group.toLowerCase()}`);
    panel.hidden = group !== "Grip";
    if (group === "Mounting") {
      const toggle = document.createElement("label"),
        checkbox = document.createElement("input");
      toggle.className = "mount-toggle";
      checkbox.type = "checkbox";
      checkbox.id = "screws";
      checkbox.addEventListener("change", () => {
        parameters.screws = checkbox.checked;
        $("#preset").value = "Custom";
        refreshWidgets();
        dirty();
      });
      toggle.append(checkbox, "Mounting holes");
      panel.append(toggle);
      const boltLabel = document.createElement("label"),
        boltCheckbox = document.createElement("input");
      boltLabel.className = "mount-toggle";
      boltCheckbox.type = "checkbox";
      boltCheckbox.id = "bolt-mount";
      boltCheckbox.addEventListener("change", () => {
        parameters.bolt_mount = boltCheckbox.checked;
        $("#preset").value = "Custom";
        refreshWidgets();
        dirty();
      });
      boltLabel.append(boltCheckbox, "Bolt + one screw");
      panel.append(boltLabel);
      const automatic = document.createElement("label"),
        autoCheckbox = document.createElement("input");
      automatic.className = "mount-toggle";
      autoCheckbox.type = "checkbox";
      autoCheckbox.id = "auto-spacing";
      autoCheckbox.addEventListener("change", () => {
        parameters.auto_spacing = autoCheckbox.checked;
        $("#preset").value = "Custom";
        refreshWidgets();
        dirty();
      });
      automatic.append(autoCheckbox, "Space screws to fit the body");
      panel.append(automatic);
      const seated = document.createElement("label"),
        seatCheckbox = document.createElement("input");
      seated.className = "mount-toggle";
      seatCheckbox.type = "checkbox";
      seatCheckbox.id = "auto-seat";
      seatCheckbox.addEventListener("change", () => {
        parameters.auto_seat = seatCheckbox.checked;
        // Turning it off starts from the seat in use, so the slider does
        // not jump.
        if (!seatCheckbox.checked && lastPreview)
          parameters.seat_depth = lastPreview.seat_depth;
        $("#preset").value = "Custom";
        refreshWidgets();
        dirty();
      });
      seated.append(seatCheckbox, "Seat the screws for the edge depth");
      panel.append(seated);
    }
    for (const control of config.controls.filter(
      (item) => item.group === group,
    )) {
      const node =
        $("#control-template").content.firstElementChild.cloneNode(true);
      const label = node.querySelector("label"),
        number = node.querySelector("input[type=number]"),
        slider = node.querySelector("input[type=range]");
      label.textContent = control.label;
      label.htmlFor = control.key;
      number.id = control.key;
      slider.setAttribute("aria-label", `${control.label} slider`);
      node.querySelector(".number-wrap span").textContent = control.unit;
      const hint = node.querySelector("p");
      hint.id = `hint-${control.key}`;
      hint.textContent = control.help;
      for (const input of [number, slider]) {
        Object.assign(input, {
          min: control.min,
          max: control.max,
          step: control.step,
        });
        input.setAttribute("aria-describedby", hint.id);
        input.addEventListener("input", () => {
          const value = input.valueAsNumber;
          parameters[control.key] = value;
          if (input === slider) number.value = value;
          else if (Number.isFinite(value)) slider.value = value;
          $("#preset").value = "Custom";
          if (control.key === "screw_count") refreshWidgets();
          dirty();
        });
      }
      widgets.set(control.key, { number, slider });
      panel.append(node);
    }
    if (group === "Shape") {
      const seed = document.createElement("div");
      seed.className = "seed-control";
      const label = document.createElement("label"),
        input = document.createElement("input"),
        button = document.createElement("button"),
        hint = document.createElement("p");
      label.htmlFor = "seed";
      label.textContent = "Variation seed";
      input.id = "seed";
      input.type = "number";
      input.min = 0;
      input.max = 999999;
      input.step = 1;
      input.addEventListener("input", () => {
        activateVariation(input.valueAsNumber);
      });
      button.type = "button";
      button.textContent = "New variation";
      button.addEventListener("click", () => {
        const next =
          (parameters.seed +
            1 +
            (crypto.getRandomValues(new Uint32Array(1))[0] % 999999)) %
          1000000;
        activateVariation(next);
        input.value = next;
      });
      hint.textContent =
        "Seeds create different body folds. Changing seed starts with visible character; dial it down for a subtler shape, or use Reset for the clean default.";
      seed.append(label, input, button, hint);
      panel.append(seed);
    }
    $("#control-groups").append(panel);
  }
  for (const tab of document.querySelectorAll("[role=tab]")) {
    tab.addEventListener("click", () => selectTab(tab.dataset.group));
    tab.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const groups = ["Grip", "Shape", "Mounting"],
        index = groups.indexOf(tab.dataset.group);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
      selectTab(groups[next], true);
    });
  }
}

async function main() {
  const response = await fetch("/api/schema");
  if (!response.ok) throw new Error("Could not load generator settings.");
  config = await response.json();
  parameters = { ...config.defaults };
  viewer = new Viewer($("#viewer"));
  createControls();
  for (const name of [...Object.keys(config.presets), "Custom"]) {
    const option = document.createElement("option");
    option.value = option.textContent = name;
    option.disabled = name === "Custom";
    $("#preset").append(option);
  }
  $("#preset").addEventListener("change", () =>
    apply(config.presets[$("#preset").value]),
  );
  $("#reset").addEventListener("click", () => {
    $("#preset").value = "Rounded board crimp";
    apply(config.defaults);
  });
  $("#fit").addEventListener("click", () => viewer.fit());
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      viewer.setView(button.dataset.view);
      for (const other of document.querySelectorAll("[data-view]"))
        other.setAttribute("aria-pressed", String(other === button));
    });
  }
  $("#save-settings").addEventListener("click", () => {
    if (currentDesign)
      download(
        new Blob([JSON.stringify(currentDesign, null, 2)], {
          type: "application/json",
        }),
        `crimp-${parameters.edge_depth}mm.json`,
      );
  });
  $("#load-settings").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    try {
      if (!file) return;
      if (file.size > 16384)
        throw new Error("Settings files must be smaller than 16 KB.");
      const design = JSON.parse(await file.text());
      if (
        design.generator !== "garage-holds-crimp" ||
        design.version !== 1 ||
        design.units !== "mm"
      )
        throw new Error(
          "This file is not a supported Crimp Lab settings file.",
        );
      // Designs saved before the count control had exactly two holes.
      const saved = design.parameters;
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        // Older files: two holes before the count control, and a seat set
        // by hand before the automatic one.
        if (!("screw_count" in saved)) saved.screw_count = 2;
        if (!("auto_seat" in saved)) saved.auto_seat = false;
      }
      const checked = await post("/api/validate", saved);
      const data = await checked.json();
      $("#preset").value = "Custom";
      apply(data.parameters);
    } catch (error) {
      status(error.message, true);
    } finally {
      event.target.value = "";
    }
  });
  $("#export").addEventListener("click", async () => {
    if (!currentDesign) return;
    const snapshot = { ...currentDesign.parameters };
    const request = sequence;
    $("#export").disabled = true;
    status("Building a fine STL…");
    try {
      const exported = await post("/api/stl", snapshot);
      download(
        await exported.blob(),
        `crimp-${snapshot.edge_depth}mm-${snapshot.incut}deg.stl`,
      );
      if (request === sequence)
        status(
          "STL downloaded. Save settings too if you want to revisit this design.",
        );
    } catch (error) {
      if (request === sequence) status(error.message, true);
    } finally {
      if (request === sequence && currentDesign) $("#export").disabled = false;
    }
  });
  window.addEventListener("pagehide", () => {
    controller?.abort();
    viewer.dispose();
  });
  refreshWidgets();
  dirty();
}

main().catch((error) =>
  status(`Could not start the preview: ${error.message}`, true),
);
