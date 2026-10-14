import { Viewer, drawProfile } from "/viewer.js";

const $ = (selector) => document.querySelector(selector);
const widgets = new Map();
const inches = (mm) => `${(mm / 25.4).toFixed(2)} in`;
const length = (mm) => `${mm} mm · ${inches(mm)}`;
let config, parameters, viewer, currentDesign, timer, controller;
let sequence = 0,
  fitNext = true;

function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
}

function dirty() {
  sequence++;
  currentDesign = null;
  $("#export").disabled = $("#save-settings").disabled = true;
  status("updating preview…");
  controller?.abort();
  clearTimeout(timer);
  timer = setTimeout(preview, 180);
}

function refresh() {
  for (const item of config.controls) {
    const widget = widgets.get(item.key);
    widget.number.value = widget.slider.value = parameters[item.key];
    if (widget.imperial)
      widget.imperial.textContent = inches(parameters[item.key]);
    const disabled =
      item.group === "Mounting" &&
      (!parameters.screws ||
        (item.key === "seat_depth" && parameters.auto_seat));
    widget.number.disabled = widget.slider.disabled = disabled;
    const hidden = item.key.startsWith("bolt_")
      ? !parameters.bolt_mount
      : parameters.bolt_mount &&
        ["screw_count", "screw_spacing"].includes(item.key);
    widget.number.closest(".control").hidden = Boolean(hidden);
  }
  $("#screws").checked = parameters.screws;
  $("#bolt-mount").checked = Boolean(parameters.bolt_mount);
  $("#bolt-mount").disabled = !parameters.screws;
  $("#auto-seat").checked = parameters.auto_seat;
  $("#auto-seat").disabled = !parameters.screws;
  $("#seed").value = parameters.seed;
}

function apply(values) {
  parameters = { ...values };
  refresh();
  fitNext = true;
  dirty();
}

async function post(path, values, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
    signal,
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).error ||
        "the generator could not complete this request.",
    );
  return response;
}

async function preview() {
  const request = sequence;
  controller = new AbortController();
  try {
    const data = await (
      await post("/api/preview", parameters, controller.signal)
    ).json();
    if (request !== sequence) return;
    // Echo the built settings without scheduling another request.
    parameters = { ...data.parameters };
    refresh();
    viewer.update(data, fitNext);
    fitNext = false;
    drawProfile($("#profile"), data);
    const rows = [
      [
        "dimensions",
        `${data.dimensions.join(" × ")} mm · ${data.dimensions.map((mm) => (mm / 25.4).toFixed(2)).join(" × ")} in`,
      ],
      ["estimated material", `≈ ${data.material_grams.join("–")} g`],
      ["mesh", `${data.triangles.toLocaleString()} triangles · closed`],
      ["screw holes", String(data.screws.length)],
      ["bolt holes", String(data.bolts?.length ?? 0)],
      ["seat above wall", length(data.parameters.seat_depth)],
    ];
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
    $("#export").disabled = $("#save-settings").disabled = false;
    const notes = Object.entries(data.adjusted).map(
      ([key, value]) =>
        `${config.controls.find((c) => c.key === key)?.label || key}: ${Number(value.toFixed(2))}`,
    );
    status(
      notes.length
        ? `preview is current. adjusted to fit — ${notes.join("; ")}.`
        : "preview is current. export builds a finer mesh.",
    );
  } catch (error) {
    if (error.name !== "AbortError" && request === sequence)
      status(`${error.message} showing the last valid model.`, true);
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
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

function mountToggle(panel, key, label) {
  const node = document.createElement("label"),
    checkbox = document.createElement("input");
  node.className = "mount-toggle";
  checkbox.type = "checkbox";
  checkbox.id = key.replaceAll("_", "-");
  checkbox.addEventListener("change", () => {
    parameters[key] = checkbox.checked;
    $("#preset").value = "custom";
    refresh();
    dirty();
  });
  node.append(checkbox, label);
  panel.append(node);
}

function variation(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 999999) return;
  parameters.seed = seed;
  parameters.character = Math.max(0.65, parameters.character);
  $("#preset").value = "custom";
  refresh();
  dirty();
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
      mountToggle(panel, "screws", "mounting holes");
      mountToggle(panel, "bolt_mount", "bolt + one screw");
      mountToggle(panel, "auto_seat", "automatic screw seat");
    }
    for (const item of config.controls.filter((c) => c.group === group)) {
      const node =
        $("#control-template").content.firstElementChild.cloneNode(true);
      const number = node.querySelector("input[type=number]"),
        slider = node.querySelector("input[type=range]"),
        label = node.querySelector("label"),
        hint = node.querySelector("p");
      label.textContent = item.label;
      label.htmlFor = item.key;
      number.id = item.key;
      node.querySelector(".number-wrap span").textContent = item.unit;
      hint.textContent = item.help;
      hint.id = `hint-${item.key}`;
      const imperial = item.unit === "mm" ? document.createElement("p") : null;
      if (imperial) {
        imperial.className = hint.className;
        imperial.textContent = inches(parameters[item.key]);
        node.insertBefore(imperial, hint);
      }
      slider.setAttribute("aria-label", `${item.label} slider`);
      for (const input of [number, slider]) {
        Object.assign(input, { min: item.min, max: item.max, step: item.step });
        input.setAttribute("aria-describedby", hint.id);
        input.addEventListener("input", () => {
          const value = input.valueAsNumber;
          if (
            !Number.isFinite(value) ||
            (item.key === "screw_count" && !Number.isInteger(value))
          )
            return;
          parameters[item.key] = value;
          if (imperial) imperial.textContent = inches(value);
          if (input === slider) number.value = value;
          else slider.value = value;
          $("#preset").value = "custom";
          dirty();
        });
      }
      widgets.set(item.key, { number, slider, imperial });
      panel.append(node);
    }
    if (group === "Shape") {
      const node = document.createElement("div");
      node.className = "seed-control";
      const label = document.createElement("label"),
        input = document.createElement("input"),
        button = document.createElement("button"),
        hint = document.createElement("p");
      label.htmlFor = "seed";
      label.textContent = "variation seed";
      input.id = "seed";
      input.type = "number";
      input.min = 0;
      input.max = 999999;
      input.step = 1;
      input.addEventListener("input", () => variation(input.valueAsNumber));
      button.type = "button";
      button.textContent = "new variation";
      button.addEventListener("click", () =>
        variation(
          (parameters.seed +
            1 +
            (crypto.getRandomValues(new Uint32Array(1))[0] % 999999)) %
            1000000,
        ),
      );
      hint.textContent =
        "Different rounded surfaces. Reset returns to the clean default.";
      node.append(label, input, button, hint);
      panel.append(node);
    }
    $("#control-groups").append(panel);
  }
  for (const tab of document.querySelectorAll("[role=tab]")) {
    tab.addEventListener("click", () => selectTab(tab.dataset.group));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
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

function boardAngle(angle) {
  if (!Number.isFinite(angle) || angle < 0 || angle > 70) return;
  $("#board-angle").value = $("#board-slider").value = angle;
  viewer.setBoardAngle(angle);
  $("#view-caption").textContent = `mounted on a ${angle}° board`;
}

async function main() {
  const response = await fetch("/api/schema");
  if (!response.ok) throw new Error("could not load generator settings.");
  config = await response.json();
  parameters = { ...config.defaults };
  viewer = new Viewer($("#viewer"));
  createControls();
  for (const name of [...Object.keys(config.presets), "custom"]) {
    const option = document.createElement("option");
    option.value = option.textContent = name;
    option.disabled = name === "custom";
    $("#preset").append(option);
  }
  $("#preset").addEventListener("change", () =>
    apply(config.presets[$("#preset").value]),
  );
  $("#reset").addEventListener("click", () => {
    $("#preset").value = Object.keys(config.presets)[0];
    boardAngle(40);
    apply(config.defaults);
  });
  $("#fit").addEventListener("click", () => viewer.fit());
  for (const button of document.querySelectorAll("[data-view]"))
    button.addEventListener("click", () => {
      viewer.setView(button.dataset.view);
      $("#board-controls").hidden = button.dataset.view !== "board";
      $("#view-caption").textContent =
        button.dataset.view === "board"
          ? `mounted on a ${viewer.boardAngle}° board`
          : "flat back on the wall plane";
      for (const other of document.querySelectorAll("[data-view]"))
        other.setAttribute("aria-pressed", String(other === button));
    });
  for (const id of ["#board-angle", "#board-slider"])
    $(id).addEventListener("input", (event) =>
      boardAngle(event.target.valueAsNumber),
    );
  $("#standard").addEventListener("click", () => boardAngle(40));
  $("#exact-side").addEventListener("click", () => viewer.exactSide());
  $("#save-settings").addEventListener("click", () => {
    if (currentDesign)
      download(
        new Blob([JSON.stringify(currentDesign, null, 2)], {
          type: "application/json",
        }),
        `jug-${parameters.width}mm.json`,
      );
  });
  $("#load-settings").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 16384)
        throw new Error("settings files must be smaller than 16 KB.");
      const design = JSON.parse(await file.text());
      if (
        design.generator !== "garage-holds-jug" ||
        design.version !== 2 ||
        design.units !== "mm" ||
        !design.parameters ||
        typeof design.parameters !== "object" ||
        Array.isArray(design.parameters)
      )
        throw new Error("this is not a Jug Lab settings file.");
      const checked = await (
        await post("/api/validate", design.parameters)
      ).json();
      $("#preset").value = "custom";
      apply(checked.parameters);
    } catch (error) {
      status(error.message, true);
    } finally {
      event.target.value = "";
    }
  });
  $("#export").addEventListener("click", async () => {
    if (!currentDesign) return;
    const snapshot = { ...currentDesign.parameters },
      request = sequence;
    $("#export").disabled = true;
    status("building a fine STL…");
    try {
      download(
        await (await post("/api/stl", snapshot)).blob(),
        `jug-${snapshot.width}mm.stl`,
      );
      if (request === sequence)
        status("STL downloaded. save settings to keep it editable.");
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
  refresh();
  dirty();
}

main().catch((error) =>
  status(`could not start the preview: ${error.message}`, true),
);
