import * as THREE from "three";
import { BMesh } from "./mesh/BMesh.js";
import { createPrimitive, PRIM_DEFAULTS, PRIM_LABELS } from "./mesh/primitives.js";
import {
  extrudeFaces,
  insetFaces,
  subdivideFaces,
  uniqueVertsFromSelection,
  selectionMedian,
  rotateVertices,
  scaleVertices,
  duplicateSelection,
  deleteSelection,
  averageFaceNormal,
  vertexNormalsFromFaces,
  moveVertices,
} from "./mesh/ops.js";
import { Viewport } from "./Viewport.js";
import {
  bindChrome,
  updateChrome,
  showAddMenu,
  showContext,
  hideFloat,
  showKeymap,
  closeMenus,
} from "./ui.js";
import { objectsToOBJ, downloadText, exportGLTF } from "./export.js";

let _oid = 1;
const uid = () => `o${_oid++}`;

export class App {
  constructor() {
    this.objects = [];
    this.activeId = null;
    this.selectedIds = new Set();
    this.mode = "object";
    this.selMode = "vertex";
    this.tool = "select";
    this.orientation = "global";
    this.pivot = "median";
    this.shading = "solid";
    this.xray = false;
    this.overlays = true;
    this.cursor = { x: 0, y: 0, z: 0 };
    this.editSel = { verts: new Set(), edges: new Set(), faces: new Set() };
    this.hover = null;
    this.modal = null;
    this.lastOp = null;
    this.history = [];
    this.histIndex = -1;
    this.propTab = "object";
    this.snapInc = 0.1;
    this.insetDefault = 0.25;
    this.statusMsg = "";
    this.box = null;
    this.drag = null;
    this.gizmoSnap = null;
    this._raf = 0;

    const canvas = document.getElementById("c");
    this.viewport = new Viewport(canvas, this);
    bindChrome(this);
    this.bindViewport(canvas);
    this.bindKeys();

    this.newScene(false);
    this.commit();
    this.sync();
    this.loop();
  }

  loop = () => {
    this.viewport.render();
    this._raf = requestAnimationFrame(this.loop);
  };

  get(id) {
    return this.objects.find((o) => o.id === id) || null;
  }
  activeObject() {
    return this.get(this.activeId);
  }

  uniqueName(base) {
    const names = new Set(this.objects.map((o) => o.name));
    if (!names.has(base)) return base;
    let i = 1;
    while (names.has(`${base}.${String(i).padStart(3, "0")}`)) i++;
    return `${base}.${String(i).padStart(3, "0")}`;
  }

  createObject(name, bmesh, extras = {}) {
    const o = {
      id: uid(),
      name: this.uniqueName(name),
      bmesh,
      loc: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: 0xb8b8b8,
      smooth: false,
      visible: true,
      edited: false,
      lastPrim: null,
      ...extras,
    };
    this.objects.push(o);
    return o;
  }

  newScene(push = true) {
    this.objects = [];
    this.selectedIds.clear();
    this.editSel = { verts: new Set(), edges: new Set(), faces: new Set() };
    this.mode = "object";
    this.cursor = { x: 0, y: 0, z: 0 };
    this.lastOp = null;
    this.modal = null;
    const cube = this.createObject("Cube", createPrimitive("cube"), {
      lastPrim: { type: "cube", params: { ...PRIM_DEFAULTS.cube } },
    });
    this.selectOnly(cube.id);
    this.lastOp = { kind: "add", type: "cube", params: { ...PRIM_DEFAULTS.cube }, objectId: cube.id };
    this.viewport.az = Math.PI * 0.28;
    this.viewport.el = Math.PI * 0.22;
    this.viewport.distance = 14;
    this.viewport.target.set(0, 0, 0);
    this.viewport.useOrtho = false;
    this.viewport.applyCamera();
    if (push) {
      this.history = [];
      this.histIndex = -1;
      this.commit();
      this.sync();
    }
  }

  serialize() {
    return {
      objects: this.objects.map((o) => ({
        id: o.id,
        name: o.name,
        bmesh: o.bmesh.toJSON(),
        loc: { ...o.loc },
        rot: { ...o.rot },
        scale: { ...o.scale },
        color: o.color,
        smooth: o.smooth,
        visible: o.visible,
        edited: o.edited,
        lastPrim: o.lastPrim ? { type: o.lastPrim.type, params: { ...o.lastPrim.params } } : null,
      })),
      activeId: this.activeId,
      selectedIds: [...this.selectedIds],
      cursor: { ...this.cursor },
      mode: this.mode,
      selMode: this.selMode,
      oid: _oid,
      editSel: {
        verts: [...this.editSel.verts],
        edges: [...this.editSel.edges],
        faces: [...this.editSel.faces],
      },
    };
  }

  restore(s) {
    _oid = s.oid || _oid;
    this.objects = s.objects.map((o) => ({
      ...o,
      bmesh: BMesh.fromJSON(o.bmesh),
      loc: { ...o.loc },
      rot: { ...o.rot },
      scale: { ...o.scale },
    }));
    this.activeId = s.activeId;
    this.selectedIds = new Set(s.selectedIds);
    this.cursor = { ...s.cursor };
    this.mode = s.mode;
    this.selMode = s.selMode;
    this.editSel = {
      verts: new Set(s.editSel?.verts || []),
      edges: new Set(s.editSel?.edges || []),
      faces: new Set(s.editSel?.faces || []),
    };
    this.modal = null;
    this.lastOp = null;
    this.hover = null;
  }

  beginOp() {
    this._preOp = this.serialize();
  }

  commit() {
    const snap = this.serialize();
    this.history = this.history.slice(0, this.histIndex + 1);
    this.history.push(snap);
    if (this.history.length > 80) {
      this.history.shift();
    }
    this.histIndex = this.history.length - 1;
    this._preOp = null;
  }

  pushHistory() {
    this.commit();
  }

  undo() {
    if (this.modal) this.cancelModal();
    if (this.histIndex <= 0) return;
    this.histIndex--;
    this.restore(this.history[this.histIndex]);
    this.sync();
  }

  redo() {
    if (this.modal) this.cancelModal();
    if (this.histIndex >= this.history.length - 1) return;
    this.histIndex++;
    this.restore(this.history[this.histIndex]);
    this.sync();
  }

  sync() {
    this.viewport.syncAll(this);
    updateChrome(this);
  }

  selectOnly(id) {
    this.selectedIds = new Set(id ? [id] : []);
    this.activeId = id;
  }

  selectObject(id, additive) {
    if (this.mode === "edit") this.setMode("object");
    if (additive) {
      if (this.selectedIds.has(id)) this.selectedIds.delete(id);
      else this.selectedIds.add(id);
      this.activeId = id;
    } else this.selectOnly(id);
    this.sync();
  }

  deleteObject(id) {
    this.objects = this.objects.filter((o) => o.id !== id);
    this.selectedIds.delete(id);
    if (this.activeId === id) this.activeId = this.objects[0]?.id || null;
    if (this.activeId) this.selectedIds.add(this.activeId);
    this.commit();
    this.sync();
  }

  setMode(mode) {
    if (this.modal) this.confirmModal();
    if (mode === "edit" && !this.activeObject()) return;
    this.mode = mode;
    this.editSel = { verts: new Set(), edges: new Set(), faces: new Set() };
    this.hover = null;
    this.sync();
  }

  setSelMode(m) {
    this.selMode = m;
    this.sync();
  }

  setTool(t) {
    if (t === "extrude") {
      this.beginExtrude();
      return;
    }
    if (t === "inset") {
      this.beginInset();
      return;
    }
    this.tool = t;
    this.sync();
  }

  setShading(s) {
    this.shading = s;
    this.sync();
  }

  toggleXray() {
    this.xray = !this.xray;
    this.sync();
  }

  toggleOverlays() {
    this.overlays = !this.overlays;
    this.viewport.setOverlays(this.overlays);
    this.sync();
  }

  addPrimitive(type, params) {
    const p = { ...PRIM_DEFAULTS[type], ...params };
    if (this.mode === "edit") {
      const o = this.activeObject();
      if (!o) return;
      const prim = createPrimitive(type, p);
      const local = this.viewport.worldToLocal(o, this.cursor);
      prim.translate(local.x, local.y, local.z);
      const map = new Map();
      for (const v of prim.verts.values()) map.set(v.id, o.bmesh.addVertex(v.x, v.y, v.z));
      for (const e of prim.edges.values()) o.bmesh.ensureEdge(map.get(e.a), map.get(e.b));
      const newFaces = [];
      const newVerts = [...map.values()];
      for (const f of prim.faces.values()) newFaces.push(o.bmesh.addFace(f.verts.map((id) => map.get(id))));
      o.edited = true;
      this.editSel = { verts: new Set(newVerts), edges: new Set(), faces: new Set(newFaces.filter(Boolean)) };
      this.lastOp = null;
    } else {
      const o = this.createObject(PRIM_LABELS[type] || type, createPrimitive(type, p), {
        lastPrim: { type, params: p },
        loc: { ...this.cursor },
      });
      this.selectOnly(o.id);
      this.lastOp = { kind: "add", type, params: { ...p }, objectId: o.id };
    }
    this.commit();
    this.sync();
  }

  rebuildLastOp() {
    const op = this.lastOp;
    if (!op || op.kind !== "add") return;
    const o = this.get(op.objectId);
    if (!o || o.edited) return;
    o.bmesh = createPrimitive(op.type, op.params);
    o.lastPrim = { type: op.type, params: { ...op.params } };
    this.viewport.syncObject(o, this);
    let v = 0;
    let e = 0;
    let f = 0;
    for (const obj of this.objects) {
      v += obj.bmesh.verts.size;
      e += obj.bmesh.edges.size;
      f += obj.bmesh.faces.size;
    }
    const stats = document.getElementById("top-stats");
    if (stats) stats.textContent = `Verts: ${v}   Edges: ${e}   Faces: ${f}`;
    if (this.histIndex >= 0) this.history[this.histIndex] = this.serialize();
  }

  selectionCenter() {
    if (this.mode === "object") {
      if (this.pivot === "cursor") return { ...this.cursor };
      const pts = [];
      for (const id of this.selectedIds) {
        const o = this.get(id);
        if (o) pts.push(o.loc);
      }
      return averagePoints(pts);
    }
    const o = this.activeObject();
    if (!o) return { ...this.cursor };
    if (this.pivot === "cursor") return { ...this.cursor };
    const ids = uniqueVertsFromSelection(o.bmesh, { mode: this.selMode, ...this.editSel });
    const local = selectionMedian(o.bmesh, ids);
    return this.viewport.localToWorld(o, local);
  }

  selectedVertIds() {
    const o = this.activeObject();
    if (!o) return new Set();
    return uniqueVertsFromSelection(o.bmesh, { mode: this.selMode, ...this.editSel });
  }

  hasEditSelection() {
    const s = this.editSel;
    if (this.selMode === "vertex") return s.verts.size > 0;
    if (this.selMode === "edge") return s.edges.size > 0;
    return s.faces.size > 0;
  }

  /* ── commands ── */
  run(cmd, ev) {
    const map = {
      "file.new": () => this.newScene(true),
      "file.exportObj": () =>
        downloadText("flare-scene.obj", objectsToOBJ(this.objects, (o) => this.viewport.objectMatrix(o))),
      "file.exportGltf": () => exportGLTF(this.viewport, this.objects),
      "edit.undo": () => this.undo(),
      "edit.redo": () => this.redo(),
      "edit.selectAll": () => this.selectAll(),
      "edit.deselect": () => this.deselectAll(),
      "edit.invert": () => this.invertSelect(),
      "edit.delete": () => this.deleteSel(),
      "edit.duplicate": () => this.duplicate(),
      "add.plane": () => this.addPrimitive("plane"),
      "add.cube": () => this.addPrimitive("cube"),
      "add.circle": () => this.addPrimitive("circle"),
      "add.uvsphere": () => this.addPrimitive("uvsphere"),
      "add.icosphere": () => this.addPrimitive("icosphere"),
      "add.cylinder": () => this.addPrimitive("cylinder"),
      "add.cone": () => this.addPrimitive("cone"),
      "add.torus": () => this.addPrimitive("torus"),
      "add.menu": () => {
        const r = document.getElementById("viewport").getBoundingClientRect();
        showAddMenu(this, ev?.clientX || r.left + 40, ev?.clientY || r.top + 40);
      },
      "mesh.extrude": () => this.beginExtrude(),
      "mesh.inset": () => this.beginInset(),
      "mesh.subdivide": () => this.subdivide(),
      "mesh.merge": () => this.mergeByDistance(),
      "mesh.normals": () => this.sync(),
      "mesh.smooth": () => this.setSmooth(true),
      "mesh.flat": () => this.setSmooth(false),
      "view.front": () => this.viewport.setView("front"),
      "view.right": () => this.viewport.setView("right"),
      "view.top": () => this.viewport.setView("top"),
      "view.camera": () => this.viewport.setView("camera"),
      "view.persp": () => {
        this.viewport.toggleOrtho();
        this.sync();
      },
      "view.frameSel": () => this.frameSelected(),
      "view.frameAll": () => this.frameAll(),
      "view.xray": () => this.toggleXray(),
      "help.keys": () => showKeymap(),
    };
    map[cmd]?.();
  }

  selectAll() {
    if (this.mode === "object") {
      this.selectedIds = new Set(this.objects.map((o) => o.id));
      if (!this.activeId) this.activeId = this.objects[0]?.id || null;
    } else {
      const o = this.activeObject();
      if (!o) return;
      if (this.selMode === "vertex") this.editSel.verts = new Set(o.bmesh.verts.keys());
      else if (this.selMode === "edge") this.editSel.edges = new Set(o.bmesh.edges.keys());
      else this.editSel.faces = new Set(o.bmesh.faces.keys());
    }
    this.sync();
  }

  deselectAll() {
    if (this.mode === "object") {
      this.selectedIds.clear();
    } else {
      this.editSel.verts.clear();
      this.editSel.edges.clear();
      this.editSel.faces.clear();
    }
    this.sync();
  }

  invertSelect() {
    if (this.mode === "object") {
      const next = new Set();
      for (const o of this.objects) if (!this.selectedIds.has(o.id)) next.add(o.id);
      this.selectedIds = next;
    } else {
      const o = this.activeObject();
      if (!o) return;
      const src = this.selMode === "vertex" ? o.bmesh.verts : this.selMode === "edge" ? o.bmesh.edges : o.bmesh.faces;
      const cur = this.selMode === "vertex" ? this.editSel.verts : this.selMode === "edge" ? this.editSel.edges : this.editSel.faces;
      const next = new Set();
      for (const id of src.keys()) if (!cur.has(id)) next.add(id);
      if (this.selMode === "vertex") this.editSel.verts = next;
      else if (this.selMode === "edge") this.editSel.edges = next;
      else this.editSel.faces = next;
    }
    this.sync();
  }

  deleteSel() {
    if (this.mode === "object") {
      this.objects = this.objects.filter((o) => !this.selectedIds.has(o.id));
      this.selectedIds.clear();
      this.activeId = this.objects[0]?.id || null;
      if (this.activeId) this.selectedIds.add(this.activeId);
    } else {
      const o = this.activeObject();
      if (!o) return;
      deleteSelection(o.bmesh, { mode: this.selMode, ...this.editSel });
      o.edited = true;
      this.lastOp = null;
    }
    this.commit();
    this.sync();
  }

  duplicate() {
    if (this.mode === "object") {
      const created = [];
      for (const id of [...this.selectedIds]) {
        const o = this.get(id);
        if (!o) continue;
        const n = this.createObject(o.name.replace(/\.\d+$/, ""), o.bmesh.clone(), {
          loc: { x: o.loc.x, y: o.loc.y, z: o.loc.z },
          rot: { ...o.rot },
          scale: { ...o.scale },
          color: o.color,
          smooth: o.smooth,
        });
        n.edited = true;
        created.push(n.id);
      }
      this.selectedIds = new Set(created);
      this.activeId = created[0] || this.activeId;
      this.commit();
      this.sync();
      this.beginModal("grab");
    } else {
      const o = this.activeObject();
      if (!o || !this.hasEditSelection()) return;
      const res = duplicateSelection(o.bmesh, { mode: this.selMode, ...this.editSel });
      o.edited = true;
      if (this.selMode === "vertex") this.editSel.verts = new Set(res.newVerts);
      else if (this.selMode === "edge") this.editSel.edges = new Set(res.newEdges);
      else this.editSel.faces = new Set(res.newFaces.filter(Boolean));
      this.commit();
      this.sync();
      this.beginModal("grab");
    }
  }

  subdivide() {
    const o = this.activeObject();
    if (!o) return;
    let faces = [...this.editSel.faces];
    if (this.mode !== "edit" || faces.length === 0) faces = [...o.bmesh.faces.keys()];
    const created = subdivideFaces(o.bmesh, faces);
    o.edited = true;
    if (this.mode === "edit") this.editSel.faces = new Set(created);
    this.lastOp = null;
    this.commit();
    this.sync();
  }

  mergeByDistance() {
    const o = this.activeObject();
    if (!o) return;
    o.bmesh.mergeByDistance(0.0001);
    o.edited = true;
    this.editSel = { verts: new Set(), edges: new Set(), faces: new Set() };
    this.commit();
    this.sync();
  }

  flipNormals() {
    const o = this.activeObject();
    if (!o) return;
    o.bmesh.flipNormals();
    o.edited = true;
    this.commit();
    this.sync();
  }

  setSmooth(v) {
    for (const id of this.selectedIds) {
      const o = this.get(id);
      if (o) o.smooth = v;
    }
    this.commit();
    this.sync();
  }

  applyRotation(o) {
    const e = new THREE.Euler(o.rot.x, o.rot.y, o.rot.z, "XYZ");
    const q = new THREE.Quaternion().setFromEuler(e);
    const v = new THREE.Vector3();
    for (const vert of o.bmesh.verts.values()) {
      v.set(vert.x, vert.y, vert.z).applyQuaternion(q);
      vert.x = v.x;
      vert.y = v.y;
      vert.z = v.z;
    }
    o.rot = { x: 0, y: 0, z: 0 };
    o.edited = true;
    this.commit();
    this.sync();
  }

  frameSelected() {
    const boxes = [];
    if (this.mode === "edit") {
      const o = this.activeObject();
      if (!o) return this.frameAll();
      const ids = this.selectedVertIds();
      const src = ids.size ? ids : o.bmesh.verts.keys();
      for (const id of src) {
        const v = o.bmesh.verts.get(id);
        if (v) boxes.push(this.viewport.localToWorld(o, v));
      }
    } else {
      const ids = this.selectedIds.size ? this.selectedIds : this.objects.map((o) => o.id);
      for (const id of ids) {
        const o = this.get(id);
        if (!o) continue;
        const b = o.bmesh.bbox();
        for (const p of corners(b.min, b.max)) boxes.push(this.viewport.localToWorld(o, p));
      }
    }
    if (!boxes.length) return;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of boxes) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
    this.viewport.frameBox(min, max);
  }

  frameAll() {
    const prev = [...this.selectedIds];
    this.selectedIds = new Set(this.objects.map((o) => o.id));
    this.frameSelected();
    this.selectedIds = new Set(prev);
  }

  /* ── modeling ops ── */
  beginExtrude() {
    if (this.mode !== "edit") {
      this.setMode("edit");
      this.setSelMode("face");
    }
    const o = this.activeObject();
    if (!o) return;
    if (this.selMode === "face" && this.editSel.faces.size === 0) {
      this.statusMsg = "Select faces to extrude";
      this.sync();
      return;
    }
    if (this.selMode === "edge" && this.editSel.edges.size === 0) return;
    if (this.selMode === "vertex" && this.editSel.verts.size === 0) return;

    const snapshot = o.bmesh.toJSON();
    const faceIds = [...this.editSel.faces];
    const edgeIds = [...this.editSel.edges];
    const vertSrc = [...this.editSel.verts];
    o.edited = true;
    this.lastOp = null;
    this.beginModal("extrude", { snapshot, faceIds, edgeIds, vertSrc, objectId: o.id });
  }

  beginInset() {
    if (this.mode !== "edit") {
      this.setMode("edit");
      this.setSelMode("face");
    }
    const o = this.activeObject();
    if (!o || this.editSel.faces.size === 0) {
      this.statusMsg = "Select faces to inset";
      this.sync();
      return;
    }
    const snapshot = o.bmesh.toJSON();
    const faceIds = [...this.editSel.faces];
    o.edited = true;
    this.lastOp = null;
    this.beginModal("inset", { snapshot, faceIds, objectId: o.id });
  }

  /* ── modal transform ── */
  beginModal(type, extra = {}) {
    if (this.modal) this.confirmModal();
    if (type !== "extrude" && type !== "inset") {
      if (this.mode === "object" && this.selectedIds.size === 0) return;
      if (this.mode === "edit" && !this.hasEditSelection()) return;
    }
    this.beginOp();
    const center = this.selectionCenter();
    const o = this.activeObject();
    const pointer = this._lastPtr || { x: innerWidth / 2, y: innerHeight / 2 };
    this.modal = {
      type,
      axis: null,
      num: "",
      startX: pointer.x,
      startY: pointer.y,
      center,
      objectSnap: this.objects.filter((ob) => this.selectedIds.has(ob.id)).map((ob) => ({
        id: ob.id,
        loc: { ...ob.loc },
        rot: { ...ob.rot },
        scale: { ...ob.scale },
      })),
      meshSnap: this.mode === "edit" && o ? o.bmesh.toJSON() : extra.snapshot || null,
      vertIds: this.mode === "edit" ? [...this.selectedVertIds()] : [],
      ...extra,
      banner: "",
    };
    if (type === "extrude" && extra.snapshot) this.modal.meshSnap = extra.snapshot;
    this.viewport.tcontrols.enabled = false;
    this.viewport.tcontrols.visible = false;
    this.applyModal(pointer.x, pointer.y, { shift: false, ctrl: false });
    this.sync();
  }

  applyModal(cx, cy, mods) {
    const m = this.modal;
    if (!m) return;
    const precision = mods.shift ? 0.1 : 1;
    const snap = mods.ctrl;
    const typed = m.num !== "" && !Number.isNaN(parseFloat(m.num));
    const typedN = typed ? parseFloat(m.num) : null;

    if (m.type === "inset") {
      const o = this.get(m.objectId);
      if (!o) return;
      o.bmesh = BMesh.fromJSON(m.snapshot);
      let t;
      if (typed) t = THREE.MathUtils.clamp(typedN, 0, 0.95);
      else {
        const dx = (cx - m.startX) * precision;
        t = THREE.MathUtils.clamp(this.insetDefault + dx * 0.004, 0, 0.95);
      }
      const res = insetFaces(o.bmesh, m.faceIds, t, 0, false);
      this.editSel.faces = new Set(res.faceIds);
      m.banner = `Inset Faces: <em>${t.toFixed(3)}</em>  ·  LMB confirm  ·  Esc/RMB cancel`;
      return;
    }

    if (m.type === "extrude") {
      return this.applyExtrudeFromSnap(m, cx, cy, precision, snap, typedN);
    }

    const axisVec = this.axisVector(m.axis);
    const center = m.center;
    const worldCenter = new THREE.Vector3(center.x, center.y, center.z);

    if (m.type === "grab") {
      let delta;
      if (typed) {
        const dir = axisVec || this.viewRight();
        delta = dir.clone().multiplyScalar(typedN);
      } else {
        delta = this.viewport.worldDeltaFromPoints(m.startX, m.startY, cx, cy, worldCenter);
        delta.multiplyScalar(precision);
        if (axisVec) {
          const s = delta.dot(axisVec);
          delta.copy(axisVec).multiplyScalar(s);
        }
      }
      if (snap) {
        const g = this.snapInc;
        delta.set(Math.round(delta.x / g) * g, Math.round(delta.y / g) * g, Math.round(delta.z / g) * g);
      }
      this.applyGrab(delta);
      m.banner = `Move: <em>${fmtv(delta)}</em>${m.axis ? `  [${m.axis.toUpperCase()}]` : ""}  ·  type a number`;
    } else if (m.type === "rotate") {
      let angle;
      if (typed) angle = (typedN * Math.PI) / 180;
      else {
        const pr = this.viewport.projectWorld(worldCenter);
        const a0 = Math.atan2(m.startY - pr.y, m.startX - pr.x);
        const a1 = Math.atan2(cy - pr.y, cx - pr.x);
        angle = (a1 - a0) * precision;
      }
      if (snap) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      const axis = axisVec || this.viewForward().multiplyScalar(-1);
      this.applyRotate(axis, angle);
      m.banner = `Rotate: <em>${((angle * 180) / Math.PI).toFixed(2)}°</em>${m.axis ? `  [${m.axis.toUpperCase()}]` : ""}`;
    } else if (m.type === "scale") {
      let f;
      if (typed) f = typedN;
      else {
        const pr = this.viewport.projectWorld(worldCenter);
        const d0 = Math.hypot(m.startX - pr.x, m.startY - pr.y) || 1;
        const d1 = Math.hypot(cx - pr.x, cy - pr.y);
        f = (d1 / d0 - 1) * precision + 1;
      }
      if (snap) f = Math.round(f / 0.1) * 0.1;
      const factors = { x: f, y: f, z: f };
      if (m.axis === "x") {
        factors.y = factors.z = 1;
      }
      if (m.axis === "y") {
        factors.x = factors.z = 1;
      }
      if (m.axis === "z") {
        factors.x = factors.y = 1;
      }
      this.applyScale(factors);
      m.banner = `Scale: <em>${f.toFixed(3)}</em>${m.axis ? `  [${m.axis.toUpperCase()}]` : ""}`;
    }
  }

  applyExtrudeFromSnap(m, cx, cy, precision, snap, typedN) {
    const o = this.get(m.objectId);
    if (!o) return;
    o.bmesh = BMesh.fromJSON(m.snapshot);

    let newVerts = [];
    let normals = new Map();
    if (this.selMode === "face") {
      const faces = m.faceIds || [...this.editSel.faces];
      const res = extrudeFaces(o.bmesh, faces);
      newVerts = res.newVertIds;
      normals = vertexNormalsFromFaces(o.bmesh, res.faceIds);
      this.editSel.faces = new Set(res.faceIds);
    } else if (this.selMode === "edge") {
      const used = new Set();
      const edges = [];
      for (const id of m.edgeIds || this.editSel.edges) {
        const e = o.bmesh.edges.get(id);
        if (!e) continue;
        edges.push(e);
        used.add(e.a);
        used.add(e.b);
      }
      const map = new Map();
      for (const vid of used) {
        const v = o.bmesh.verts.get(vid);
        map.set(vid, o.bmesh.addVertex(v.x, v.y, v.z));
      }
      const newEdges = [];
      for (const e of edges) {
        o.bmesh.addFace([e.a, e.b, map.get(e.b), map.get(e.a)]);
        newEdges.push(o.bmesh.ensureEdge(map.get(e.a), map.get(e.b)));
      }
      newVerts = [...map.values()];
      this.editSel.edges = new Set(newEdges);
      const n = { x: 0, y: 0, z: 1 };
      for (const id of newVerts) normals.set(id, n);
    } else {
      const src = m.vertSrc || [...this.editSel.verts];
      const map = new Map();
      for (const vid of src) {
        const v = o.bmesh.verts.get(vid);
        if (!v) continue;
        const nid = o.bmesh.addVertex(v.x, v.y, v.z);
        map.set(vid, nid);
        o.bmesh.ensureEdge(vid, nid);
      }
      newVerts = [...map.values()];
      this.editSel.verts = new Set(newVerts);
      for (const id of newVerts) normals.set(id, { x: 0, y: 0, z: 1 });
    }

    const avg = averageNormalMap(normals);
    let dist;
    if (typedN != null) dist = typedN;
    else {
      const c = new THREE.Vector3(m.center.x, m.center.y, m.center.z);
      const nWorld = this.localDirToWorld(o, avg);
      const tip = c.clone().add(nWorld);
      const pc = this.viewport.projectWorld(c);
      const pt = this.viewport.projectWorld(tip);
      const sx = pt.x - pc.x;
      const sy = pt.y - pc.y;
      const sl = Math.hypot(sx, sy) || 1;
      const mx = cx - m.startX;
      const my = cy - m.startY;
      const along = (mx * sx + my * sy) / sl;
      dist = along * this.viewport.pixelsToWorld(c) * precision;
    }
    if (snap) dist = Math.round(dist / this.snapInc) * this.snapInc;
    for (const id of newVerts) {
      const n = normals.get(id) || avg;
      const v = o.bmesh.verts.get(id);
      v.x += n.x * dist;
      v.y += n.y * dist;
      v.z += n.z * dist;
    }
    m.banner = `Extrude: <em>${dist.toFixed(4)}</em>  ·  X/Y/Z  ·  LMB confirm`;
  }

  localDirToWorld(o, n) {
    const e = new THREE.Euler(o.rot.x, o.rot.y, o.rot.z, "XYZ");
    const v = new THREE.Vector3(n.x, n.y, n.z).applyEuler(e).normalize();
    return v;
  }

  applyGrab(delta) {
    if (this.mode === "object") {
      for (const s of this.modal.objectSnap) {
        const o = this.get(s.id);
        if (!o) continue;
        o.loc.x = s.loc.x + delta.x;
        o.loc.y = s.loc.y + delta.y;
        o.loc.z = s.loc.z + delta.z;
      }
    } else {
      const o = this.activeObject();
      if (!o) return;
      o.bmesh = BMesh.fromJSON(this.modal.meshSnap);
      const ids = this.modal.vertIds;
      if (this.pivot === "individual" && this.selMode === "face") {
        for (const fid of this.editSel.faces) {
          const f = o.bmesh.faces.get(fid);
          if (f) moveVertices(o.bmesh, f.verts, this.worldDeltaToLocal(o, delta));
        }
      } else {
        moveVertices(o.bmesh, ids, this.worldDeltaToLocal(o, delta));
      }
    }
  }

  applyRotate(axis, angle) {
    const pivot = this.modal.center;
    if (this.mode === "object") {
      const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
      for (const s of this.modal.objectSnap) {
        const o = this.get(s.id);
        if (!o) continue;
        const p = new THREE.Vector3(s.loc.x - pivot.x, s.loc.y - pivot.y, s.loc.z - pivot.z);
        p.applyQuaternion(q);
        o.loc.x = pivot.x + p.x;
        o.loc.y = pivot.y + p.y;
        o.loc.z = pivot.z + p.z;
        const e0 = new THREE.Euler(s.rot.x, s.rot.y, s.rot.z, "XYZ");
        const q0 = new THREE.Quaternion().setFromEuler(e0);
        const q1 = q.clone().multiply(q0);
        const e1 = new THREE.Euler().setFromQuaternion(q1, "XYZ");
        o.rot.x = e1.x;
        o.rot.y = e1.y;
        o.rot.z = e1.z;
      }
    } else {
      const o = this.activeObject();
      if (!o) return;
      o.bmesh = BMesh.fromJSON(this.modal.meshSnap);
      const localAxis = this.worldDirToLocal(o, axis);
      if (this.pivot === "individual" && this.selMode === "face") {
        for (const fid of this.editSel.faces) {
          const f = o.bmesh.faces.get(fid);
          if (!f) continue;
          rotateVertices(o.bmesh, f.verts, o.bmesh.faceCenter(f), localAxis, angle);
        }
      } else {
        const localPivot = this.viewport.worldToLocal(o, pivot);
        rotateVertices(o.bmesh, this.modal.vertIds, localPivot, localAxis, angle);
      }
    }
  }

  applyScale(factors) {
    const pivot = this.modal.center;
    if (this.mode === "object") {
      for (const s of this.modal.objectSnap) {
        const o = this.get(s.id);
        if (!o) continue;
        o.loc.x = pivot.x + (s.loc.x - pivot.x) * factors.x;
        o.loc.y = pivot.y + (s.loc.y - pivot.y) * factors.y;
        o.loc.z = pivot.z + (s.loc.z - pivot.z) * factors.z;
        o.scale.x = s.scale.x * factors.x;
        o.scale.y = s.scale.y * factors.y;
        o.scale.z = s.scale.z * factors.z;
      }
    } else {
      const o = this.activeObject();
      if (!o) return;
      o.bmesh = BMesh.fromJSON(this.modal.meshSnap);
      if (this.pivot === "individual" && this.selMode === "face") {
        for (const fid of this.editSel.faces) {
          const f = o.bmesh.faces.get(fid);
          if (f) scaleVertices(o.bmesh, f.verts, o.bmesh.faceCenter(f), factors);
        }
      } else {
        const localPivot = this.viewport.worldToLocal(o, pivot);
        scaleVertices(o.bmesh, this.modal.vertIds, localPivot, factors);
      }
    }
  }

  worldDeltaToLocal(o, delta) {
    const a = this.viewport.worldToLocal(o, { x: 0, y: 0, z: 0 });
    const b = this.viewport.worldToLocal(o, { x: delta.x, y: delta.y, z: delta.z });
    // Incorrect: translation of origin vs a point. Use vector transform:
    const m = this.viewport.objectMatrix(o).invert();
    const v = new THREE.Vector3(delta.x, delta.y, delta.z).transformDirection(m);
    // transformDirection ignores scale... need full 3x3
    const e = new THREE.Matrix3().setFromMatrix4(this.viewport.objectMatrix(o));
    e.invert();
    const t = new THREE.Vector3(delta.x, delta.y, delta.z).applyMatrix3(e);
    void a;
    void b;
    void v;
    return { x: t.x, y: t.y, z: t.z };
  }

  worldDirToLocal(o, dir) {
    const e = new THREE.Euler(o.rot.x, o.rot.y, o.rot.z, "XYZ");
    const q = new THREE.Quaternion().setFromEuler(e).invert();
    const v = dir.clone().normalize().applyQuaternion(q);
    return { x: v.x, y: v.y, z: v.z };
  }

  axisVector(axis) {
    if (!axis) return null;
    if (this.orientation === "view") {
      if (axis === "x") return this.viewRight();
      if (axis === "y") return this.viewUp();
      if (axis === "z") return this.viewForward();
    }
    if (this.orientation === "local" && this.mode === "object") {
      const o = this.activeObject();
      if (o) {
        const e = new THREE.Euler(o.rot.x, o.rot.y, o.rot.z, "XYZ");
        const v = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
        return v.applyEuler(e).normalize();
      }
    }
    if (this.orientation === "normal" && this.mode === "edit") {
      const o = this.activeObject();
      if (o && this.editSel.faces.size) {
        const n = averageFaceNormal(o.bmesh, [...this.editSel.faces]);
        const w = this.localDirToWorld(o, n);
        if (axis === "z") return w;
        const tmp = Math.abs(w.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const x = new THREE.Vector3().crossVectors(tmp, w).normalize();
        const y = new THREE.Vector3().crossVectors(w, x).normalize();
        if (axis === "x") return x;
        if (axis === "y") return y;
      }
    }
    return new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  }

  viewForward() {
    const c = this.viewport.camera;
    const v = new THREE.Vector3();
    c.getWorldDirection(v);
    return v;
  }
  viewRight() {
    const v = this.viewForward();
    return new THREE.Vector3().crossVectors(v, new THREE.Vector3(0, 0, 1)).normalize();
  }
  viewUp() {
    return new THREE.Vector3().crossVectors(this.viewRight(), this.viewForward()).normalize();
  }

  confirmModal() {
    if (!this.modal) return;
    const o = this.activeObject();
    if (o && this.mode === "edit") o.edited = true;
    this.modal = null;
    this.statusMsg = "";
    this.commit();
    this.sync();
  }

  cancelModal() {
    if (!this.modal) return;
    if (this._preOp) this.restore(this._preOp);
    else if (this.histIndex >= 0) this.restore(this.history[this.histIndex]);
    this.modal = null;
    this._preOp = null;
    this.statusMsg = "";
    this.sync();
  }

  /* ── gizmos ── */
  onGizmoStart() {
    this.pushHistory();
    const d = this.viewport.dummy;
    this.gizmoSnap = {
      dummy: {
        p: d.position.clone(),
        r: d.rotation.clone(),
        s: d.scale.clone(),
      },
      objects: this.objects
        .filter((o) => this.selectedIds.has(o.id))
        .map((o) => ({ id: o.id, loc: { ...o.loc }, rot: { ...o.rot }, scale: { ...o.scale } })),
      mesh: this.mode === "edit" && this.activeObject() ? this.activeObject().bmesh.toJSON() : null,
      verts: this.mode === "edit" ? [...this.selectedVertIds()] : [],
      center: this.selectionCenter(),
    };
  }

  onGizmoChange() {
    if (!this.gizmoSnap) return;
    const d = this.viewport.dummy;
    const s = this.gizmoSnap;
    if (this.tool === "move") {
      const delta = new THREE.Vector3().subVectors(d.position, s.dummy.p);
      if (this.mode === "object") {
        for (const rec of s.objects) {
          const o = this.get(rec.id);
          if (!o) continue;
          o.loc.x = rec.loc.x + delta.x;
          o.loc.y = rec.loc.y + delta.y;
          o.loc.z = rec.loc.z + delta.z;
        }
      } else {
        const o = this.activeObject();
        if (!o) return;
        o.bmesh = BMesh.fromJSON(s.mesh);
        moveVertices(o.bmesh, s.verts, this.worldDeltaToLocal(o, delta));
      }
    } else if (this.tool === "rotate") {
      const q0 = new THREE.Quaternion().setFromEuler(s.dummy.r);
      const q1 = new THREE.Quaternion().setFromEuler(d.rotation);
      const dq = q1.clone().multiply(q0.clone().invert());
      const axis = new THREE.Vector3(0, 0, 1);
      let angle = 0;
      angle = 2 * Math.acos(THREE.MathUtils.clamp(dq.w, -1, 1));
      if (Math.sin(angle / 2) > 1e-6) {
        axis.set(dq.x, dq.y, dq.z).normalize();
      }
      this.modal = {
        type: "rotate",
        objectSnap: s.objects,
        meshSnap: s.mesh,
        vertIds: s.verts,
        center: s.center,
      };
      this.applyRotate(axis, angle);
      this.modal = null;
    } else if (this.tool === "scale") {
      const factors = {
        x: d.scale.x / (s.dummy.s.x || 1),
        y: d.scale.y / (s.dummy.s.y || 1),
        z: d.scale.z / (s.dummy.s.z || 1),
      };
      this.modal = {
        type: "scale",
        objectSnap: s.objects,
        meshSnap: s.mesh,
        vertIds: s.verts,
        center: s.center,
      };
      this.applyScale(factors);
      this.modal = null;
    }
    this.viewport.syncAll(this);
    updateChrome(this);
  }

  onGizmoEnd() {
    this.gizmoSnap = null;
    const o = this.activeObject();
    if (o && this.mode === "edit") o.edited = true;
    this.commit();
    this.sync();
  }

  /* ── input ── */
  bindViewport(canvas) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("auxclick", (e) => e.preventDefault());
    canvas.tabIndex = 0;

    canvas.addEventListener("pointerdown", (e) => {
      canvas.focus();
      this._lastPtr = { x: e.clientX, y: e.clientY };
      hideFloat();
      closeMenus();

      const gizmoView = this.viewport.pickGizmo(e.clientX, e.clientY);
      if (gizmoView && e.button === 0) {
        this.viewport.setView(gizmoView);
        return;
      }

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        const mode = e.shiftKey ? "pan" : e.ctrlKey ? "zoom" : "orbit";
        this.viewport.beginCam(e, mode);
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (this.modal) {
        if (e.button === 0) this.confirmModal();
        if (e.button === 2) this.cancelModal();
        return;
      }

      if (e.button === 2 && e.shiftKey) {
        this.placeCursor(e);
        return;
      }

      if (e.button === 2) {
        this.drag = { kind: "rmb", x: e.clientX, y: e.clientY, moved: false };
        return;
      }

      if (e.button !== 0) return;

      if (this.viewport.tcontrols.enabled && this.viewport.tcontrols.axis) {
        return;
      }

      if (this.tool === "cursor") {
        this.placeCursor(e);
        return;
      }

      const hit = this.pick(e);
      this.drag = {
        kind: "lmb",
        x: e.clientX,
        y: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        hit,
        moved: false,
        additive: e.shiftKey,
      };
    });

    canvas.addEventListener("pointermove", (e) => {
      this._lastPtr = { x: e.clientX, y: e.clientY };
      if (this.viewport.camDrag) {
        this.viewport.moveCam(e);
        return;
      }
      if (this.viewport.gizmoDragging) return;
      if (this.modal) {
        this.applyModal(e.clientX, e.clientY, { shift: e.shiftKey, ctrl: e.ctrlKey });
        this.viewport.syncAll(this);
        updateChrome(this);
        return;
      }
      if (this.drag) {
        const dist = Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y);
        if (!this.drag.moved && dist > 5) {
          this.drag.moved = true;
          if (this.drag.kind === "lmb" && (this.tool === "select" || !this.drag.hit)) {
            this.startBox(this.drag.sx, this.drag.sy);
          } else if (this.drag.kind === "lmb" && this.drag.hit && (this.tool === "move" || this.tool === "rotate" || this.tool === "scale")) {
            if (this.mode === "object" || this.hasEditSelection() || this.drag.hit) {
              if (this.mode === "object" && this.drag.hit) this.selectOnly(this.drag.hit.objId);
              if (this.mode === "edit" && this.drag.hit?.id != null) this.applyClickSelect(this.drag.hit, this.drag.additive);
              this.beginModal(this.tool === "move" ? "grab" : this.tool);
            }
          }
        }
        if (this.box) this.updateBox(e.clientX, e.clientY);
        return;
      }
      this.updateHover(e);
    });

    canvas.addEventListener("pointerup", (e) => {
      if (this.viewport.camDrag) {
        this.viewport.endCam();
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (this.box) {
        this.finishBox(e.shiftKey);
        this.drag = null;
        return;
      }
      if (this.drag && this.drag.kind === "rmb" && !this.drag.moved) {
        showContext(this, e.clientX, e.clientY);
        this.drag = null;
        return;
      }
      if (this.drag && this.drag.kind === "lmb" && !this.drag.moved) {
        this.applyClickSelect(this.drag.hit, this.drag.additive);
      }
      this.drag = null;
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.viewport.wheelZoom(e);
    }, { passive: false });

    canvas.addEventListener("dblclick", () => this.frameSelected());
  }

  startBox(x, y) {
    const r = this.viewport.canvas.getBoundingClientRect();
    this.box = { x0: x - r.left, y0: y - r.top, x1: x - r.left, y1: y - r.top };
    const el = document.getElementById("box-select");
    el.classList.remove("hidden");
    this.layoutBox();
  }

  updateBox(cx, cy) {
    const r = this.viewport.canvas.getBoundingClientRect();
    this.box.x1 = cx - r.left;
    this.box.y1 = cy - r.top;
    this.layoutBox();
  }

  layoutBox() {
    const b = this.box;
    const el = document.getElementById("box-select");
    const x = Math.min(b.x0, b.x1);
    const y = Math.min(b.y0, b.y1);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${Math.abs(b.x1 - b.x0)}px`;
    el.style.height = `${Math.abs(b.y1 - b.y0)}px`;
  }

  finishBox(additive) {
    const b = this.box;
    const rect = {
      x0: Math.min(b.x0, b.x1),
      y0: Math.min(b.y0, b.y1),
      x1: Math.max(b.x0, b.x1),
      y1: Math.max(b.y0, b.y1),
    };
    document.getElementById("box-select").classList.add("hidden");
    this.box = null;
    if (this.mode === "object") {
      if (!additive) this.selectedIds.clear();
      for (const o of this.objects) {
        if (!o.visible) continue;
        const c = this.viewport.projectWorld(new THREE.Vector3(o.loc.x, o.loc.y, o.loc.z));
        if (c.x >= rect.x0 && c.x <= rect.x1 && c.y >= rect.y0 && c.y <= rect.y1) {
          this.selectedIds.add(o.id);
          this.activeId = o.id;
        }
      }
    } else {
      const o = this.activeObject();
      if (!o) return;
      const ids = this.viewport.collectInRect(o, rect, this.selMode, this.xray);
      const set =
        this.selMode === "vertex" ? this.editSel.verts : this.selMode === "edge" ? this.editSel.edges : this.editSel.faces;
      if (!additive) set.clear();
      for (const id of ids) set.add(id);
    }
    this.sync();
  }

  pick(e) {
    if (this.mode === "object") {
      const hit = this.viewport.pickObjects(this.objects);
      return hit;
    }
    const o = this.activeObject();
    if (!o) return null;
    return this.viewport.pickEdit(o, e.clientX, e.clientY, this.selMode, this.xray);
  }

  applyClickSelect(hit, additive) {
    if (this.mode === "object") {
      if (!hit) {
        if (!additive) this.selectedIds.clear();
      } else if (additive) {
        if (this.selectedIds.has(hit.objId)) this.selectedIds.delete(hit.objId);
        else this.selectedIds.add(hit.objId);
        this.activeId = hit.objId;
      } else this.selectOnly(hit.objId);
    } else {
      const set =
        this.selMode === "vertex" ? this.editSel.verts : this.selMode === "edge" ? this.editSel.edges : this.editSel.faces;
      if (!hit || hit.id == null) {
        if (!additive) set.clear();
      } else if (additive) {
        if (set.has(hit.id)) set.delete(hit.id);
        else set.add(hit.id);
      } else {
        set.clear();
        set.add(hit.id);
      }
    }
    this.sync();
  }

  updateHover(e) {
    if (this.mode !== "edit") {
      if (this.hover) {
        this.hover = null;
        this.sync();
      }
      return;
    }
    const hit = this.pick(e);
    const next = hit && hit.id != null ? { type: hit.type || this.selMode, id: hit.id } : null;
    const same = (!next && !this.hover) || (next && this.hover && next.type === this.hover.type && next.id === this.hover.id);
    if (!same) {
      this.hover = next;
      this.viewport.syncAll(this);
    }
  }

  placeCursor(e) {
    const hit = this.viewport.pickObjects(this.objects);
    if (hit) {
      this.cursor = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    } else {
      const p = this.viewport.groundHit(e.clientX, e.clientY);
      this.cursor = { x: p.x, y: p.y, z: p.z };
    }
    this.sync();
  }

  bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      const k = e.key;
      const low = k.toLowerCase();

      if (this.modal) {
        if (k === "Escape") {
          e.preventDefault();
          this.cancelModal();
          return;
        }
        if (k === "Enter") {
          e.preventDefault();
          this.confirmModal();
          return;
        }
        if (low === "x" || low === "y" || low === "z") {
          this.modal.axis = this.modal.axis === low ? null : low;
          this.applyModal(this._lastPtr.x, this._lastPtr.y, { shift: e.shiftKey, ctrl: e.ctrlKey });
          this.viewport.syncAll(this);
          updateChrome(this);
          return;
        }
        if ((k >= "0" && k <= "9") || k === "." || k === "-" || k === "+") {
          if (k === "+" ) return;
          if (k === "-" && this.modal.num.includes("-")) return;
          this.modal.num += k === "+" ? "" : k;
          this.applyModal(this._lastPtr.x, this._lastPtr.y, { shift: e.shiftKey, ctrl: e.ctrlKey });
          this.viewport.syncAll(this);
          updateChrome(this);
          return;
        }
        if (k === "Backspace") {
          this.modal.num = this.modal.num.slice(0, -1);
          this.applyModal(this._lastPtr.x, this._lastPtr.y, { shift: e.shiftKey, ctrl: e.ctrlKey });
          this.viewport.syncAll(this);
          updateChrome(this);
          return;
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && low === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && low === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && low === "n") {
        e.preventDefault();
        this.newScene(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && low === "i") {
        e.preventDefault();
        this.invertSelect();
        return;
      }

      if (k === "Tab") {
        e.preventDefault();
        this.setMode(this.mode === "object" ? "edit" : "object");
        return;
      }
      if (k === "?" || (e.shiftKey && k === "/")) {
        showKeymap();
        return;
      }
      if (k === "Escape") {
        hideFloat();
        closeMenus();
        hideKeymapSafe();
        return;
      }

      if (e.shiftKey && low === "a") {
        e.preventDefault();
        const p = this._lastPtr || { x: 200, y: 160 };
        showAddMenu(this, p.x, p.y);
        return;
      }
      if (e.shiftKey && low === "d") {
        e.preventDefault();
        this.duplicate();
        return;
      }

      if (low === "a" && e.altKey) {
        e.preventDefault();
        this.deselectAll();
        return;
      }
      if (low === "a") {
        this.selectAll();
        return;
      }
      if (low === "g") {
        this.beginModal("grab");
        return;
      }
      if (low === "r" && !e.ctrlKey) {
        this.beginModal("rotate");
        return;
      }
      if (low === "s" && !e.ctrlKey) {
        this.beginModal("scale");
        return;
      }
      if (low === "e") {
        this.beginExtrude();
        return;
      }
      if (low === "i" && this.mode === "edit") {
        this.beginInset();
        return;
      }
      if (low === "x" || k === "Delete" || k === "Backspace") {
        e.preventDefault();
        this.deleteSel();
        return;
      }
      if (low === "w") {
        this.setTool("select");
        return;
      }
      if (low === "b") {
        const p = this._lastPtr || { x: 0, y: 0 };
        this.startBox(p.x, p.y);
        this.drag = { kind: "lmb", x: p.x, y: p.y, sx: p.x, sy: p.y, hit: null, moved: true, additive: e.shiftKey };
        return;
      }
      if (low === "f" || k === ".") {
        this.frameSelected();
        return;
      }
      if (k === "Home") {
        this.frameAll();
        return;
      }
      if (e.altKey && low === "z") {
        e.preventDefault();
        this.toggleXray();
        return;
      }

      if (this.mode === "edit" && !e.ctrlKey && !e.altKey) {
        if (k === "1") {
          this.setSelMode("vertex");
          return;
        }
        if (k === "2") {
          this.setSelMode("edge");
          return;
        }
        if (k === "3") {
          this.setSelMode("face");
          return;
        }
      } else {
        if (k === "1") this.viewport.setView("front");
        if (k === "3") this.viewport.setView("right");
        if (k === "7") this.viewport.setView("top");
        if (k === "0") this.viewport.setView("camera");
        if (k === "5") {
          this.viewport.toggleOrtho();
          this.sync();
        }
        if (k === "9") {
          this.viewport.az += Math.PI;
          this.viewport.el = -this.viewport.el;
          this.viewport.applyCamera();
        }
      }
      if (k === "7" && this.mode === "edit") this.viewport.setView("top");
      if (k === "5" && this.mode === "edit") {
        this.viewport.toggleOrtho();
        this.sync();
      }

      if (e.code === "Numpad1") this.viewport.setView(e.ctrlKey ? "back" : "front");
      if (e.code === "Numpad3") this.viewport.setView(e.ctrlKey ? "left" : "right");
      if (e.code === "Numpad7") this.viewport.setView(e.ctrlKey ? "bottom" : "top");
      if (e.code === "Numpad5") {
        this.viewport.toggleOrtho();
        this.sync();
      }
      if (e.code === "Numpad0") this.viewport.setView("camera");
      if (e.code === "NumpadDecimal") this.frameSelected();
    });
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function hideKeymapSafe() {
  document.getElementById("keymap-modal")?.classList.add("hidden");
}

function averagePoints(pts) {
  if (!pts.length) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = pts.length;
  return { x: x / n, y: y / n, z: z / n };
}

function averageNormalMap(map) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const n of map.values()) {
    x += n.x;
    y += n.y;
    z += n.z;
  }
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function corners(min, max) {
  return [
    { x: min.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: min.z },
    { x: min.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z },
    { x: max.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: max.z },
    { x: max.x, y: max.y, z: max.z },
  ];
}

function fmtv(v) {
  return `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
}

