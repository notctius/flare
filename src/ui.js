import { PRIM_DEFAULTS, PRIM_LABELS } from "./mesh/primitives.js";

const KEYMAP = [
  ["Tab", "Object / Edit mode"],
  ["1 / 2 / 3", "Vertex / Edge / Face (Edit)"],
  ["A / Alt A", "Select all / Deselect"],
  ["Ctrl I", "Invert selection"],
  ["B", "Box select"],
  ["G / R / S", "Move / Rotate / Scale"],
  ["X Y Z", "Axis constraint (during transform)"],
  ["Shift", "Precision (during transform)"],
  ["Ctrl", "Snap (during transform)"],
  ["E", "Extrude"],
  ["I", "Inset faces"],
  ["Shift D", "Duplicate"],
  ["X / Delete", "Delete"],
  ["Shift A", "Add primitive"],
  ["Shift RMB", "Place 3D cursor"],
  ["MMB / Alt LMB", "Orbit"],
  ["Shift MMB", "Pan"],
  ["Ctrl MMB / Wheel", "Zoom"],
  ["Numpad 1 3 7 / 0", "Front / Right / Top / Camera"],
  ["Numpad 5", "Perspective / Orthographic"],
  [". / F", "Frame selected"],
  ["Home", "Frame all"],
  ["Alt Z", "Toggle X-Ray"],
  ["Ctrl Z / Ctrl Shift Z", "Undo / Redo"],
  ["Ctrl N", "New scene"],
  ["Esc / RMB", "Cancel operator"],
  ["LMB / Enter", "Confirm operator"],
  ["W", "Select tool"],
  ["?", "This window"],
];

export function bindChrome(app) {
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.parentElement;
      const open = menu.classList.contains("open");
      closeMenus();
      if (!open) menu.classList.add("open");
    });
  });
  document.addEventListener("click", () => closeMenus());

  document.querySelectorAll("[data-cmd]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenus();
      app.run(el.dataset.cmd, e);
    });
  });

  document.querySelectorAll("#mode-switch [data-mode]").forEach((b) => {
    b.addEventListener("click", () => app.setMode(b.dataset.mode));
  });
  document.querySelectorAll("#sel-modes [data-sel]").forEach((b) => {
    b.addEventListener("click", () => app.setSelMode(b.dataset.sel));
  });
  document.querySelectorAll("#toolbar [data-tool]").forEach((b) => {
    b.addEventListener("click", () => app.setTool(b.dataset.tool));
  });
  document.querySelectorAll("#shading [data-shade]").forEach((b) => {
    b.addEventListener("click", () => app.setShading(b.dataset.shade));
  });
  document.getElementById("orientation").addEventListener("change", (e) => {
    app.orientation = e.target.value;
    app.sync();
  });
  document.getElementById("pivot").addEventListener("change", (e) => {
    app.pivot = e.target.value;
  });
  document.getElementById("btn-xray").addEventListener("click", () => app.toggleXray());
  document.getElementById("btn-overlays").addEventListener("click", () => app.toggleOverlays());

  document.querySelectorAll("#prop-tabs [data-ptab]").forEach((b) => {
    b.addEventListener("click", () => {
      app.propTab = b.dataset.ptab;
      document.querySelectorAll("#prop-tabs [data-ptab]").forEach((x) => x.classList.toggle("active", x === b));
      updateProps(app);
    });
  });

  document.getElementById("keymap-close").addEventListener("click", () => hideKeymap());
  document.getElementById("keymap-modal").addEventListener("click", (e) => {
    if (e.target.id === "keymap-modal") hideKeymap();
  });
  const grid = document.getElementById("keymap-grid");
  for (const [k, v] of KEYMAP) {
    const row = document.createElement("div");
    row.className = "km-row";
    row.innerHTML = `<strong>${esc(k)}</strong><span>${esc(v)}</span>`;
    grid.appendChild(row);
  }

  document.getElementById("overlay").addEventListener("click", () => {
    hideFloat();
    document.getElementById("overlay").classList.add("hidden");
  });
}

export function closeMenus() {
  document.querySelectorAll(".menu").forEach((m) => m.classList.remove("open"));
}

export function updateChrome(app) {
  document.querySelectorAll("#mode-switch [data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === app.mode);
  });
  const sm = document.getElementById("sel-modes");
  sm.classList.toggle("hidden", app.mode !== "edit");
  document.querySelectorAll("#sel-modes [data-sel]").forEach((b) => {
    b.classList.toggle("active", b.dataset.sel === app.selMode);
  });
  document.querySelectorAll("#toolbar [data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === app.tool);
  });
  document.querySelectorAll("#shading [data-shade]").forEach((b) => {
    b.classList.toggle("active", b.dataset.shade === app.shading);
  });
  document.getElementById("btn-xray").classList.toggle("active", app.xray);
  document.getElementById("btn-overlays").classList.toggle("active", app.overlays);
  document.getElementById("orientation").value = app.orientation;
  document.getElementById("pivot").value = app.pivot;

  let v = 0;
  let e = 0;
  let f = 0;
  for (const o of app.objects) {
    v += o.bmesh.verts.size;
    e += o.bmesh.edges.size;
    f += o.bmesh.faces.size;
  }
  document.getElementById("top-stats").textContent = `Verts: ${v}   Edges: ${e}   Faces: ${f}`;

  const sbMode = document.getElementById("sb-mode");
  sbMode.textContent = app.mode === "edit" ? `Edit Mode · ${cap(app.selMode)}` : "Object Mode";
  document.getElementById("sb-sel").textContent = statusSelection(app);
  document.getElementById("sb-info").textContent = app.statusMsg || "Flare 1.0 — browser modeler";

  const hint = document.getElementById("hint-bar");
  if (hint) {
    hint.textContent =
      app.mode === "edit"
        ? "1/2/3 Vert Edge Face   ·   G/R/S Transform   ·   E Extrude   ·   I Inset   ·   A Select all   ·   Shift+A Add"
        : "Tab Edit mode   ·   Shift+A Add mesh   ·   G/R/S Transform   ·   Alt+LMB Orbit   ·   Shift+MMB Pan   ·   Wheel Zoom";
  }

  const banner = document.getElementById("modal-banner");
  if (app.modal) {
    banner.classList.remove("hidden");
    banner.innerHTML = app.modal.banner || "Transform";
  } else banner.classList.add("hidden");

  updateOutliner(app);
  updateProps(app);
  updateLastOp(app);
}

export function updateOutliner(app) {
  const root = document.getElementById("outliner");
  const html = [];
  html.push(`<div class="ol-item" style="color:#9a9a9a;font-size:11px"><span class="nm">Scene Collection</span></div>`);
  for (const o of app.objects) {
    const sel = app.selectedIds.has(o.id) ? "selected" : "";
    const act = app.activeId === o.id ? "active" : "";
    html.push(`<div class="ol-item ${sel} ${act}" data-oid="${o.id}">
      <span class="dot"></span>
      <span class="nm">${esc(o.name)}</span>
      <button class="eye" data-eye="${o.id}" title="Hide">${o.visible ? "◉" : "○"}</button>
      <button class="trash" data-del="${o.id}" title="Delete">✕</button>
    </div>`);
  }
  root.innerHTML = html.join("");
  root.querySelectorAll(".ol-item[data-oid]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      app.selectObject(el.dataset.oid, e.shiftKey);
    });
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      startRename(app, el);
    });
  });
  root.querySelectorAll("[data-eye]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const o = app.get(b.dataset.eye);
      if (o) {
        o.visible = !o.visible;
        app.sync();
      }
    });
  });
  root.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      app.deleteObject(b.dataset.del);
    });
  });
}

function startRename(app, el) {
  const id = el.dataset.oid;
  const o = app.get(id);
  if (!o) return;
  const nm = el.querySelector(".nm");
  const input = document.createElement("input");
  input.className = "rename";
  input.value = o.name;
  nm.replaceWith(input);
  input.focus();
  input.select();
  const done = () => {
    const name = input.value.trim();
    if (name) o.name = name;
    app.sync();
  };
  input.addEventListener("blur", done);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = o.name;
      input.blur();
    }
    e.stopPropagation();
  });
}

export function updateProps(app) {
  const el = document.getElementById("props");
  const o = app.activeObject();
  const tab = app.propTab;
  if (!o) {
    el.innerHTML = `<p class="empty-note">Nothing selected. Add a mesh with <kbd>Shift A</kbd> or the Add menu.</p>`;
    return;
  }
  if (tab === "object") {
    el.innerHTML = `
      <h3>Object</h3>
      ${fieldText("Name", "name", o.name)}
      <h3>Transform</h3>
      ${vec3("Location", "loc", o.loc, 1)}
      ${vec3("Rotation", "rot", deg3(o.rot), 1)}
      ${vec3("Scale", "scale", o.scale, 3)}
      <label class="check"><input type="checkbox" data-prop="visible" ${o.visible ? "checked" : ""}/> Visible</label>
      <div class="btn-row">
        <button data-act="reset-loc">Clear Location</button>
        <button data-act="reset-rot">Clear Rotation</button>
      </div>
      <div class="btn-row"><button data-act="reset-scl">Clear Scale</button><button data-act="apply-rot">Apply Rotation</button></div>
    `;
  } else if (tab === "data") {
    el.innerHTML = `
      <h3>Mesh</h3>
      <div class="field"><span>Vertices</span><input type="text" value="${o.bmesh.verts.size}" disabled/></div>
      <div class="field"><span>Edges</span><input type="text" value="${o.bmesh.edges.size}" disabled/></div>
      <div class="field"><span>Faces</span><input type="text" value="${o.bmesh.faces.size}" disabled/></div>
      <h3>Operators</h3>
      <button class="action" data-act="subdivide">Subdivide</button>
      <button class="action" data-act="merge">Merge by Distance</button>
      <button class="action" data-act="normals">Recalculate Normals</button>
      <button class="action" data-act="flip">Flip Normals</button>
    `;
  } else if (tab === "material") {
    el.innerHTML = `
      <h3>Viewport Display</h3>
      <div class="field"><span>Color</span><input type="color" data-prop="color" value="${hex(o.color)}"/></div>
      <label class="check"><input type="checkbox" data-prop="smooth" ${o.smooth ? "checked" : ""}/> Shade Smooth</label>
      <p class="empty-note">Color is a viewport override — exported materials use the same tint.</p>
    `;
  } else {
    el.innerHTML = `
      <h3>Active Tool</h3>
      <p class="empty-note">${toolHelp(app.tool)}</p>
      <h3>Snap</h3>
      <div class="field"><span>Increment</span><input type="number" step="0.01" data-prop="snap" value="${app.snapInc}"/></div>
      <h3>Modeling</h3>
      <div class="field"><span>Inset default</span><input type="number" step="0.01" min="0" max="0.95" data-prop="insetDef" value="${app.insetDefault}"/></div>
    `;
  }

  el.querySelectorAll("[data-axis]").forEach((inp) => {
    const commit = () => {
      const key = inp.dataset.vec;
      const axis = inp.dataset.axis;
      let val = parseFloat(inp.value);
      if (Number.isNaN(val)) return;
      if (key === "rot") val = (val * Math.PI) / 180;
      o[key][axis] = val;
      app.commit();
      app.sync();
    };
    inp.addEventListener("change", commit);
    inp.addEventListener("keydown", (e) => e.stopPropagation());
  });
  el.querySelectorAll("[data-prop]").forEach((inp) => {
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    inp.addEventListener("change", () => {
      const p = inp.dataset.prop;
      if (p === "name") {
        o.name = inp.value.trim() || o.name;
      } else if (p === "visible") {
        o.visible = inp.checked;
      } else if (p === "smooth") {
        o.smooth = inp.checked;
      } else if (p === "color") {
        o.color = parseInt(inp.value.slice(1), 16);
      } else if (p === "snap") {
        app.snapInc = parseFloat(inp.value) || 0.1;
      } else if (p === "insetDef") {
        app.insetDefault = parseFloat(inp.value) || 0.25;
      }
      app.sync();
    });
  });
  el.querySelectorAll("[data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "reset-loc") o.loc = { x: 0, y: 0, z: 0 };
      if (a === "reset-rot") o.rot = { x: 0, y: 0, z: 0 };
      if (a === "reset-scl") o.scale = { x: 1, y: 1, z: 1 };
      if (a === "reset-loc" || a === "reset-rot" || a === "reset-scl") app.commit();
      if (a === "apply-rot") app.applyRotation(o);
      if (a === "subdivide") app.run("mesh.subdivide");
      if (a === "merge") app.run("mesh.merge");
      if (a === "normals") app.run("mesh.normals");
      if (a === "flip") app.flipNormals();
      app.sync();
    });
  });
}

function updateLastOp(app) {
  const el = document.getElementById("last-op");
  const op = app.lastOp;
  if (!op || op.kind !== "add") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const o = app.get(op.objectId);
  if (!o || o.edited) {
    el.classList.add("hidden");
    return;
  }
  const fields = lastOpFields(op.type, op.params);
  el.classList.remove("hidden");
  el.innerHTML = `<h4>Add ${PRIM_LABELS[op.type] || op.type}</h4>${fields}`;
  el.querySelectorAll("[data-lp]").forEach((inp) => {
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    inp.addEventListener("input", () => {
      const key = inp.dataset.lp;
      const typ = inp.dataset.t;
      if (typ === "bool") op.params[key] = inp.checked;
      else if (typ === "str") op.params[key] = inp.value;
      else op.params[key] = parseFloat(inp.value);
      app.rebuildLastOp();
    });
  });
}

function lastOpFields(type, p) {
  const num = (label, key, step = 0.1) =>
    `<div class="row"><label>${label}</label><input type="number" step="${step}" data-lp="${key}" data-t="num" value="${p[key]}"/></div>`;
  const sel = (label, key, opts) =>
    `<div class="row"><label>${label}</label><select data-lp="${key}" data-t="str">${opts
      .map((o) => `<option value="${o}" ${p[key] === o ? "selected" : ""}>${o}</option>`)
      .join("")}</select></div>`;
  const chk = (label, key) =>
    `<div class="row"><label>${label}</label><input type="checkbox" data-lp="${key}" data-t="bool" ${p[key] ? "checked" : ""}/></div>`;
  switch (type) {
    case "plane":
      return num("Size", "size") + num("X Subdiv", "sx", 1) + num("Y Subdiv", "sy", 1);
    case "cube":
      return num("Size", "size");
    case "circle":
      return num("Vertices", "vertices", 1) + num("Radius", "radius") + sel("Fill", "fill", ["ngon", "triangle_fan", "nothing"]);
    case "uvsphere":
      return num("Segments", "segments", 1) + num("Rings", "rings", 1) + num("Radius", "radius");
    case "icosphere":
      return num("Subdivisions", "subdivisions", 1) + num("Radius", "radius");
    case "cylinder":
      return num("Vertices", "vertices", 1) + num("Radius", "radius") + num("Depth", "depth") + chk("Caps", "caps");
    case "cone":
      return (
        num("Vertices", "vertices", 1) +
        num("Radius 1", "radius1") +
        num("Radius 2", "radius2") +
        num("Depth", "depth") +
        chk("Caps", "caps")
      );
    case "torus":
      return num("Major", "major") + num("Minor", "minor") + num("Major Seg", "majorSeg", 1) + num("Minor Seg", "minorSeg", 1);
    default:
      return "";
  }
}

export function showAddMenu(app, x, y) {
  const items = Object.keys(PRIM_LABELS);
  const menu = document.getElementById("float-menu");
  menu.classList.remove("hidden");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = `<h5>Add Mesh</h5><input class="search" placeholder="Search…" id="add-search"/>
    ${items.map((k) => `<button data-add="${k}">${PRIM_LABELS[k]}</button>`).join("")}`;
  const filter = () => {
    const q = menu.querySelector("#add-search").value.toLowerCase();
    menu.querySelectorAll("[data-add]").forEach((b) => {
      b.style.display = b.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
  menu.querySelector("#add-search").addEventListener("input", filter);
  menu.querySelector("#add-search").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hideFloat();
    if (e.key === "Enter") {
      const first = [...menu.querySelectorAll("[data-add]")].find((b) => b.style.display !== "none");
      if (first) first.click();
    }
  });
  menu.querySelectorAll("[data-add]").forEach((b) => {
    b.addEventListener("click", () => {
      hideFloat();
      app.addPrimitive(b.dataset.add);
    });
  });
  setTimeout(() => menu.querySelector("#add-search").focus(), 0);
  clampMenu(menu);
}

export function showContext(app, x, y) {
  const menu = document.getElementById("context-menu");
  const items =
    app.mode === "edit"
      ? [
          ["mesh.extrude", "Extrude", "E"],
          ["mesh.inset", "Inset Faces", "I"],
          ["mesh.subdivide", "Subdivide", ""],
          ["sep"],
          ["edit.duplicate", "Duplicate", "⇧ D"],
          ["edit.delete", "Delete", "X"],
          ["sep"],
          ["edit.selectAll", "Select All", "A"],
          ["edit.deselect", "Deselect", "Alt A"],
        ]
      : [
          ["add.menu", "Add…", "⇧ A"],
          ["edit.duplicate", "Duplicate", "⇧ D"],
          ["edit.delete", "Delete", "X"],
          ["sep"],
          ["mesh.smooth", "Shade Smooth", ""],
          ["mesh.flat", "Shade Flat", ""],
          ["sep"],
          ["view.frameSel", "Frame Selected", "."],
        ];
  menu.classList.remove("hidden");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = items
    .map((it) => {
      if (it[0] === "sep") return `<div class="sep" style="height:1px;background:#3a3a3a;margin:4px 8px"></div>`;
      return `<button data-cmd="${it[0]}"><span>${it[1]}</span>${it[2] ? `<kbd>${it[2]}</kbd>` : ""}</button>`;
    })
    .join("");
  menu.querySelectorAll("[data-cmd]").forEach((b) => {
    b.addEventListener("click", () => {
      hideFloat();
      app.run(b.dataset.cmd);
    });
  });
  clampMenu(menu);
}

export function hideFloat() {
  document.getElementById("float-menu").classList.add("hidden");
  document.getElementById("context-menu").classList.add("hidden");
}

export function showKeymap() {
  document.getElementById("keymap-modal").classList.remove("hidden");
}
export function hideKeymap() {
  document.getElementById("keymap-modal").classList.add("hidden");
}

function clampMenu(el) {
  const r = el.getBoundingClientRect();
  if (r.right > innerWidth - 8) el.style.left = `${innerWidth - r.width - 8}px`;
  if (r.bottom > innerHeight - 8) el.style.top = `${innerHeight - r.height - 8}px`;
}

function statusSelection(app) {
  if (app.mode === "object") {
    const n = app.selectedIds.size;
    if (!n) return "Nothing selected";
    if (n === 1) return app.activeObject()?.name || "1 object";
    return `${n} objects`;
  }
  const s = app.editSel;
  if (app.selMode === "vertex") return `${s.verts.size} vertices`;
  if (app.selMode === "edge") return `${s.edges.size} edges`;
  return `${s.faces.size} faces`;
}

function toolHelp(tool) {
  return (
    {
      select: "Click to select, drag for box select. Shift adds to the selection. B also starts box select.",
      cursor: "Click in the viewport to place the 3D cursor. New primitives spawn here.",
      move: "Drag the gizmo or press G. X/Y/Z constrain. Type a number to set the distance.",
      rotate: "Drag the gizmo or press R. Constraint keys and numeric input work the same way.",
      scale: "Drag the gizmo or press S. Scale from the current pivot.",
      extrude: "Press E or click this tool. Faces grow along their normal; edges and verts are also supported.",
      inset: "Press I in Face mode. Move the mouse to set thickness. Type a number for a precise factor.",
    }[tool] || ""
  );
}

function vec3(label, key, v, digits) {
  return `<div class="vec3"><span>${label}</span><div class="xyz">
    ${axis("x", key, v.x, digits)}${axis("y", key, v.y, digits)}${axis("z", key, v.z, digits)}
  </div></div>`;
}
function axis(a, key, val, digits) {
  return `<label class="num"><i class="${a}">${a.toUpperCase()}</i><input type="number" step="0.1" data-vec="${key}" data-axis="${a}" value="${Number(val).toFixed(digits)}"/></label>`;
}
function fieldText(label, key, val) {
  return `<div class="field"><span>${label}</span><input type="text" data-prop="${key}" value="${esc(val)}"/></div>`;
}
function deg3(r) {
  return { x: (r.x * 180) / Math.PI, y: (r.y * 180) / Math.PI, z: (r.z * 180) / Math.PI };
}
function hex(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { PRIM_DEFAULTS };
