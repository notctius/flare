import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const ORANGE = 0xff8a1a;
const WIRE = 0x1a1a1a;
const WIRE_SEL = 0xff9a2e;
const FACE_SEL = 0xff7a12;
const VERT = 0xd0d0d0;
const VERT_SEL = 0xff9a20;
const HOVER = 0x7ec8ff;

function circleTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#111";
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Viewport {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3e3e3e);

    this.persp = new THREE.PerspectiveCamera(50, 1, 0.02, 800);
    this.ortho = new THREE.OrthographicCamera(-4, 4, 4, -4, -800, 800);
    this.useOrtho = false;
    this.az = Math.PI * 0.28;
    this.el = Math.PI * 0.22;
    this.distance = 14;
    this.target = new THREE.Vector3(0, 0, 0);
    this.viewName = "User Persp";

    this.pivot = new THREE.Object3D();
    this.scene.add(this.pivot);

    this.lights = new THREE.Group();
    const hemi = new THREE.HemisphereLight(0xdde6ff, 0x2a241c, 1.15);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(6, -8, 12);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.45);
    fill.position.set(-8, 4, 4);
    const rim = new THREE.DirectionalLight(0xfff0d0, 0.35);
    rim.position.set(2, 10, -6);
    this.lights.add(hemi, key, fill, rim);
    this.scene.add(this.lights);

    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);

    this.grid = new THREE.GridHelper(20, 20, 0x5a5a5a, 0x454545);
    this.grid.rotation.x = Math.PI / 2;
    this.overlay.add(this.grid);

    const axisMat = (c) => new THREE.LineBasicMaterial({ color: c, toneMapped: false });
    const mkAxis = (to, c) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), to]);
      return new THREE.Line(g, axisMat(c));
    };
    this.overlay.add(mkAxis(new THREE.Vector3(100, 0, 0), 0xb04a4a));
    this.overlay.add(mkAxis(new THREE.Vector3(0, 100, 0), 0x4aa04a));

    this.cursorGroup = makeCursor();
    this.overlay.add(this.cursorGroup);

    this.dotTex = circleTexture();
    this.views = new Map();

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this._size = { w: 1, h: 1 };

    this.camDrag = null;
    this.gizmoScene = makeGizmoScene();
    this.gizmoCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    this.gizmoCam.up.set(0, 0, 1);

    this.dummy = new THREE.Object3D();
    this.scene.add(this.dummy);
    this.tcontrols = new TransformControls(this.camera, canvas);
    this.tcontrols.setSize(0.85);
    this.tcontrols.addEventListener("dragging-changed", (e) => {
      this.gizmoDragging = e.value;
      if (e.value) this.app?.onGizmoStart?.();
      else this.app?.onGizmoEnd?.();
    });
    this.tcontrols.addEventListener("objectChange", () => this.app?.onGizmoChange?.());
    this.tcontrols.visible = false;
    this.tcontrols.enabled = false;
    this.scene.add(this.tcontrols.getHelper());
    this.gizmoDragging = false;

    this.applyCamera();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas.parentElement);
  }

  get camera() {
    return this.useOrtho ? this.ortho : this.persp;
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this._size.w = w;
    this._size.h = h;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
  }

  updateOrtho() {
    const aspect = this._size.w / this._size.h;
    const h = this.distance * 0.35;
    const w = h * aspect;
    this.ortho.left = -w;
    this.ortho.right = w;
    this.ortho.top = h;
    this.ortho.bottom = -h;
    this.ortho.updateProjectionMatrix();
  }

  applyCamera() {
    const el = THREE.MathUtils.clamp(this.el, -Math.PI / 2 + 0.0008, Math.PI / 2 - 0.0008);
    const x = this.distance * Math.cos(el) * Math.cos(this.az);
    const y = this.distance * Math.cos(el) * Math.sin(this.az);
    const z = this.distance * Math.sin(el);
    const pos = new THREE.Vector3(this.target.x + x, this.target.y + y, this.target.z + z);
    this.persp.up.set(0, 0, 1);
    this.ortho.up.set(0, 0, 1);
    this.persp.position.copy(pos);
    this.ortho.position.copy(pos);
    this.persp.lookAt(this.target);
    this.ortho.lookAt(this.target);
    this.updateOrtho();
    this.tcontrols.camera = this.camera;
    this.updateViewName();
  }

  updateViewName() {
    const snap = this.snapName();
    const proj = this.useOrtho ? "Ortho" : "Persp";
    this.viewName = snap ? `${snap} ${proj}` : `User ${proj}`;
    const el = document.getElementById("view-name");
    if (el) el.textContent = this.viewName;
  }

  snapName() {
    const el = this.el;
    const az = ((this.az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const near = (a, b) => Math.abs(a - b) < 0.08;
    if (near(el, Math.PI / 2)) return "Top";
    if (near(el, -Math.PI / 2)) return "Bottom";
    if (Math.abs(el) < 0.08) {
      if (near(az, 0) || near(az, Math.PI * 2)) return "Right";
      if (near(az, Math.PI)) return "Left";
      if (near(az, Math.PI / 2)) return "Front";
      if (near(az, Math.PI * 1.5)) return "Back";
    }
    return null;
  }

  setView(name) {
    const map = {
      front: { az: Math.PI / 2, el: 0 },
      back: { az: -Math.PI / 2, el: 0 },
      right: { az: 0, el: 0 },
      left: { az: Math.PI, el: 0 },
      top: { az: Math.PI / 2, el: Math.PI / 2 - 0.0005 },
      bottom: { az: Math.PI / 2, el: -Math.PI / 2 + 0.0005 },
      camera: { az: Math.PI * 0.28, el: Math.PI * 0.22 },
    };
    const v = map[name];
    if (!v) return;
    this.az = v.az;
    this.el = v.el;
    this.applyCamera();
  }

  toggleOrtho() {
    this.useOrtho = !this.useOrtho;
    this.applyCamera();
  }

  frameBox(min, max, pad = 2.2) {
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const sx = Math.max(0.2, max.x - min.x);
    const sy = Math.max(0.2, max.y - min.y);
    const sz = Math.max(0.2, max.z - min.z);
    const dim = Math.max(sx, sy, sz);
    this.target.set(cx, cy, cz);
    this.distance = Math.max(2, dim * pad);
    this.applyCamera();
  }

  setCursor(p) {
    this.cursorGroup.position.set(p.x, p.y, p.z);
  }

  setOverlays(on) {
    this.grid.visible = on;
  }

  beginCam(e, mode) {
    this.camDrag = { mode, x: e.clientX, y: e.clientY };
  }

  moveCam(e) {
    if (!this.camDrag) return;
    const dx = e.clientX - this.camDrag.x;
    const dy = e.clientY - this.camDrag.y;
    this.camDrag.x = e.clientX;
    this.camDrag.y = e.clientY;
    if (this.camDrag.mode === "orbit") {
      this.az -= dx * 0.007;
      this.el += dy * 0.007;
      this.el = THREE.MathUtils.clamp(this.el, -Math.PI / 2 + 0.0008, Math.PI / 2 - 0.0008);
    } else if (this.camDrag.mode === "pan") {
      const pan = this.screenToWorldDelta(dx, dy, this.target);
      this.target.sub(pan);
    } else if (this.camDrag.mode === "zoom") {
      this.distance = Math.max(0.2, this.distance * (1 + dy * 0.01));
    }
    this.applyCamera();
  }

  endCam() {
    this.camDrag = null;
  }

  wheelZoom(e) {
    const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    this.distance = Math.max(0.2, this.distance * f);
    this.applyCamera();
  }

  screenToWorldDelta(dx, dy, worldPoint) {
    const cam = this.camera;
    const p = worldPoint.clone().project(cam);
    const a = new THREE.Vector3(p.x, p.y, p.z);
    const b = new THREE.Vector3(p.x + (dx / this._size.w) * 2, p.y - (dy / this._size.h) * 2, p.z);
    a.unproject(cam);
    b.unproject(cam);
    return b.sub(a);
  }

  worldDeltaFromPoints(x0, y0, x1, y1, worldPoint) {
    const r = this.canvas.getBoundingClientRect();
    return this.screenToWorldDelta(x1 - x0, y1 - y0, worldPoint);
  }

  pixelsToWorld(worldPoint) {
    const cam = this.camera;
    if (this.useOrtho) {
      return (this.ortho.top - this.ortho.bottom) / this._size.h;
    }
    const dist = cam.position.distanceTo(worldPoint);
    const vFov = (cam.fov * Math.PI) / 180;
    return (2 * Math.tan(vFov / 2) * dist) / this._size.h;
  }

  projectWorld(v) {
    const p = v.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this._size.w,
      y: (-p.y * 0.5 + 0.5) * this._size.h,
      z: p.z,
      ndc: p,
    };
  }

  setPointer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return { x: clientX - r.left, y: clientY - r.top, rect: r };
  }

  pickObjects(objects) {
    const meshes = [];
    for (const o of objects) {
      const v = this.views.get(o.id);
      if (v && o.visible) meshes.push(v.mesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const id = hit.object.userData.objId;
    const faceIndex = hit.faceIndex;
    const view = this.views.get(id);
    const faceId = view?.triFace?.[faceIndex] ?? null;
    return { objId: id, point: hit.point.clone(), faceId, distance: hit.distance };
  }

  pickGizmo(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const gx = r.right - 12 - 84;
    const gy = r.top + 10;
    if (clientX < gx || clientX > gx + 84 || clientY < gy || clientY > gy + 84) return null;
    const ndc = new THREE.Vector2(((clientX - gx) / 84) * 2 - 1, -((clientY - gy) / 84) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.gizmoCam);
    const hits = rc.intersectObjects(this.gizmoScene.children, true);
    return hits[0]?.object?.userData?.view || null;
  }

  syncAll(app) {
    const seen = new Set();
    for (const o of app.objects) {
      seen.add(o.id);
      this.syncObject(o, app);
    }
    for (const id of [...this.views.keys()]) {
      if (!seen.has(id)) this.disposeView(id);
    }
    this.setCursor(app.cursor);
    this.overlay.visible = app.overlays;
    this.updateGizmo(app);
  }

  updateGizmo(app) {
    const show =
      !app.modal &&
      (app.tool === "move" || app.tool === "rotate" || app.tool === "scale") &&
      (app.mode === "object" ? app.selectedIds.size > 0 : this.hasEditSel(app));
    if (!show) {
      this.tcontrols.detach();
      this.tcontrols.visible = false;
      this.tcontrols.enabled = false;
      return;
    }
    this.tcontrols.setMode(app.tool === "move" ? "translate" : app.tool === "rotate" ? "rotate" : "scale");
    this.tcontrols.setSpace(app.orientation === "local" ? "local" : "world");
    const c = app.selectionCenter();
    this.dummy.position.set(c.x, c.y, c.z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(1, 1, 1);
    if (app.mode === "object" && app.activeObject()) {
      const o = app.activeObject();
      this.dummy.rotation.set(o.rot.x, o.rot.y, o.rot.z);
    }
    this.tcontrols.attach(this.dummy);
    this.tcontrols.visible = true;
    this.tcontrols.enabled = true;
  }

  hasEditSel(app) {
    const s = app.editSel;
    return s.verts.size + s.edges.size + s.faces.size > 0;
  }

  syncObject(o, app) {
    let v = this.views.get(o.id);
    if (!v) {
      v = this.makeView(o);
      this.views.set(o.id, v);
      this.pivot.add(v.group);
    }
    v.group.position.set(o.loc.x, o.loc.y, o.loc.z);
    v.group.rotation.set(o.rot.x, o.rot.y, o.rot.z, "XYZ");
    v.group.scale.set(o.scale.x, o.scale.y, o.scale.z);
    v.group.visible = o.visible;

    const edit = app.mode === "edit" && app.activeId === o.id;
    const selected = app.selectedIds.has(o.id);
    rebuildGeometry(v, o, { edit, selected, app });
  }

  makeView(o) {
    const group = new THREE.Group();
    group.name = o.name;
    const meshMat = new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: 0.52,
      metalness: 0.04,
      side: THREE.DoubleSide,
      envMapIntensity: 0.8,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), meshMat);
    mesh.userData.objId = o.id;
    const wire = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: WIRE, toneMapped: false })
    );
    const selWire = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: WIRE_SEL, toneMapped: false })
    );
    const selFaces = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: FACE_SEL,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthTest: true,
        toneMapped: false,
      })
    );
    selFaces.renderOrder = 2;
    const pts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        map: this.dotTex,
        size: 8,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.4,
        color: VERT,
        toneMapped: false,
        depthTest: true,
      })
    );
    const selPts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        map: this.dotTex,
        size: 11,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.4,
        color: VERT_SEL,
        toneMapped: false,
        depthTest: false,
      })
    );
    selPts.renderOrder = 3;
    const hoverLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: HOVER, toneMapped: false, depthTest: false })
    );
    hoverLine.renderOrder = 4;
    const outline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: ORANGE, toneMapped: false })
    );
    group.add(mesh, selFaces, wire, selWire, outline, pts, selPts, hoverLine);
    return {
      group,
      mesh,
      meshMat,
      wire,
      selWire,
      selFaces,
      pts,
      selPts,
      hoverLine,
      outline,
      triFace: [],
    };
  }

  disposeView(id) {
    const v = this.views.get(id);
    if (!v) return;
    v.group.removeFromParent();
    v.group.traverse((ch) => {
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material && ch.material !== v.meshMat) {
        /* points share texture */
      }
    });
    this.views.delete(id);
  }

  objectMatrix(o) {
    const e = new THREE.Euler(o.rot.x, o.rot.y, o.rot.z, "XYZ");
    const q = new THREE.Quaternion().setFromEuler(e);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(o.loc.x, o.loc.y, o.loc.z),
      q,
      new THREE.Vector3(o.scale.x, o.scale.y, o.scale.z)
    );
  }

  localToWorld(o, p) {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    v.applyMatrix4(this.objectMatrix(o));
    return { x: v.x, y: v.y, z: v.z };
  }

  worldToLocal(o, p) {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    const inv = this.objectMatrix(o).invert();
    v.applyMatrix4(inv);
    return { x: v.x, y: v.y, z: v.z };
  }

  pickEdit(o, clientX, clientY, mode, xray) {
    const local = this.setPointer(clientX, clientY);
    const mx = local.x;
    const my = local.y;
    const mat = this.objectMatrix(o);
    const cam = this.camera;

    if (mode === "face") {
      const view = this.views.get(o.id);
      if (!view) return null;
      const hits = this.raycaster.intersectObject(view.mesh, false);
      if (!hits.length) return null;
      const faceId = view.triFace[hits[0].faceIndex];
      return faceId != null ? { type: "face", id: faceId, point: hits[0].point } : null;
    }

    const occMeshes = [this.views.get(o.id)?.mesh].filter(Boolean);

    if (mode === "vertex") {
      let best = null;
      let bestD = 14;
      for (const v of o.bmesh.verts.values()) {
        const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(mat);
        const pr = this.projectWorld(w);
        if (pr.z < -1 || pr.z > 1) continue;
        const d = Math.hypot(pr.x - mx, pr.y - my);
        if (d < bestD) {
          if (!xray && isOccluded(w, cam, this.raycaster, occMeshes, 0.02)) continue;
          bestD = d;
          best = { type: "vertex", id: v.id, point: w };
        }
      }
      return best;
    }

    let best = null;
    let bestD = 10;
    for (const e of o.bmesh.edges.values()) {
      const a = o.bmesh.verts.get(e.a);
      const b = o.bmesh.verts.get(e.b);
      const wa = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(mat);
      const wb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix4(mat);
      const pa = this.projectWorld(wa);
      const pb = this.projectWorld(wb);
      const d = distToSeg(mx, my, pa.x, pa.y, pb.x, pb.y);
      if (d < bestD) {
        const mid = wa.clone().add(wb).multiplyScalar(0.5);
        if (!xray && isOccluded(mid, cam, this.raycaster, occMeshes, 0.02)) continue;
        bestD = d;
        best = { type: "edge", id: e.id, point: mid };
      }
    }
    return best;
  }

  collectInRect(o, rect, mode, xray) {
    const mat = this.objectMatrix(o);
    const ids = [];
    const cam = this.camera;
    const occ = [this.views.get(o.id)?.mesh].filter(Boolean);
    if (mode === "vertex") {
      for (const v of o.bmesh.verts.values()) {
        const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(mat);
        const p = this.projectWorld(w);
        if (p.x >= rect.x0 && p.x <= rect.x1 && p.y >= rect.y0 && p.y <= rect.y1) {
          if (!xray && isOccluded(w, cam, this.raycaster, occ, 0.02)) continue;
          ids.push(v.id);
        }
      }
    } else if (mode === "edge") {
      for (const e of o.bmesh.edges.values()) {
        const a = o.bmesh.verts.get(e.a);
        const b = o.bmesh.verts.get(e.b);
        const wa = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(mat);
        const wb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix4(mat);
        const pa = this.projectWorld(wa);
        const pb = this.projectWorld(wb);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        if (mx >= rect.x0 && mx <= rect.x1 && my >= rect.y0 && my <= rect.y1) ids.push(e.id);
      }
    } else {
      for (const f of o.bmesh.faces.values()) {
        const c = o.bmesh.faceCenter(f);
        const w = new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(mat);
        const p = this.projectWorld(w);
        if (p.x >= rect.x0 && p.x <= rect.x1 && p.y >= rect.y0 && p.y <= rect.y1) ids.push(f.id);
      }
    }
    return ids;
  }

  groundHit(clientX, clientY) {
    this.setPointer(clientX, clientY);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, p)) return p;
    return this.raycaster.ray.at(this.distance, p);
  }

  render() {
    const r = this.renderer;
    r.setClearColor(0x3e3e3e, 1);
    r.clear();
    r.setViewport(0, 0, this._size.w, this._size.h);
    r.render(this.scene, this.camera);

    this.gizmoCam.position.copy(this.camera.position).sub(this.target).normalize().multiplyScalar(3.2);
    this.gizmoCam.up.set(0, 0, 1);
    this.gizmoCam.lookAt(0, 0, 0);
    const vx = this._size.w - 84 - 12;
    const vy = this._size.h - 84 - 10;
    r.clearDepth();
    r.setScissorTest(true);
    r.setViewport(vx, vy, 84, 84);
    r.setScissor(vx, vy, 84, 84);
    r.render(this.gizmoScene, this.gizmoCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, this._size.w, this._size.h);
    r.setScissor(0, 0, this._size.w, this._size.h);
  }
}

function isOccluded(worldPos, camera, raycaster, meshes, slop) {
  if (!meshes.length) return false;
  const dir = worldPos.clone().sub(camera.position);
  const dist = dir.length();
  if (dist < 1e-6) return false;
  dir.multiplyScalar(1 / dist);
  raycaster.set(camera.position, dir);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return false;
  return hits[0].distance < dist - slop;
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const l2 = vx * vx + vy * vy || 1;
  let t = ((px - x1) * vx + (py - y1) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function rebuildGeometry(view, o, { edit, selected, app }) {
  const mesh = o.bmesh;
  const pos = [];
  const nrm = [];
  const triFace = [];
  for (const f of mesh.faces.values()) {
    const fn = mesh.faceNormal(f);
    for (const tri of mesh.triangulate(f)) {
      for (const id of tri) {
        const v = mesh.verts.get(id);
        pos.push(v.x, v.y, v.z);
        nrm.push(fn.x, fn.y, fn.z);
      }
      triFace.push(f.id);
    }
  }
  view.triFace = triFace;
  setPositions(view.mesh.geometry, pos, nrm);
  if (o.smooth && pos.length) view.mesh.geometry.computeVertexNormals();

  const col = new THREE.Color(o.color);
  view.meshMat.color.copy(col);
  view.meshMat.wireframe = app.shading === "wire";
  view.meshMat.transparent = app.xray && edit;
  view.meshMat.opacity = app.xray && edit ? 0.22 : 1;
  view.meshMat.depthWrite = !(app.xray && edit);
  view.meshMat.emissive.setHex(selected && !edit ? 0x3a1800 : 0x000000);
  view.meshMat.metalness = app.shading === "material" ? 0.35 : 0.04;
  view.meshMat.roughness = app.shading === "material" ? 0.28 : 0.52;
  view.mesh.visible = app.shading !== "wire" || edit;
  if (app.shading === "wire") {
    view.meshMat.wireframe = true;
    view.mesh.visible = true;
    view.meshMat.transparent = false;
    view.meshMat.opacity = 1;
  }

  const wpos = [];
  for (const e of mesh.edges.values()) {
    const a = mesh.verts.get(e.a);
    const b = mesh.verts.get(e.b);
    wpos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  setPositions(view.wire.geometry, wpos);
  view.wire.visible = edit || app.shading === "wire" || (app.overlays && selected);
  view.wire.material.color.setHex(edit ? 0x111111 : selected ? ORANGE : 0x2a2a2a);

  const outlinePos = selected && !edit ? wpos : [];
  setPositions(view.outline.geometry, outlinePos);
  view.outline.visible = selected && !edit;

  const sFaces = [];
  const sN = [];
  const sEdges = [];
  const sVerts = [];
  const allVerts = [];
  if (edit) {
    for (const v of mesh.verts.values()) allVerts.push(v.x, v.y, v.z);
    if (app.selMode === "face" || app.editSel.faces.size) {
      for (const fid of app.editSel.faces) {
        const f = mesh.faces.get(fid);
        if (!f) continue;
        const fn = mesh.faceNormal(f);
        for (const tri of mesh.triangulate(f)) {
          for (const id of tri) {
            const v = mesh.verts.get(id);
            sFaces.push(v.x, v.y, v.z);
            sN.push(fn.x, fn.y, fn.z);
          }
        }
      }
    }
    const edgeSet = new Set(app.editSel.edges);
    if (app.selMode === "face") {
      for (const fid of app.editSel.faces) {
        const f = mesh.faces.get(fid);
        if (f) for (const e of f.edges) edgeSet.add(e);
      }
    }
    for (const eid of edgeSet) {
      const e = mesh.edges.get(eid);
      if (!e) continue;
      const a = mesh.verts.get(e.a);
      const b = mesh.verts.get(e.b);
      sEdges.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const vset = new Set(app.editSel.verts);
    if (app.selMode === "edge") {
      for (const eid of app.editSel.edges) {
        const e = mesh.edges.get(eid);
        if (e) {
          vset.add(e.a);
          vset.add(e.b);
        }
      }
    }
    if (app.selMode === "face") {
      for (const fid of app.editSel.faces) {
        const f = mesh.faces.get(fid);
        if (f) for (const id of f.verts) vset.add(id);
      }
    }
    for (const id of vset) {
      const v = mesh.verts.get(id);
      if (v) sVerts.push(v.x, v.y, v.z);
    }

    if (app.hover && app.activeId === o.id) {
      const hp = [];
      if (app.hover.type === "edge") {
        const e = mesh.edges.get(app.hover.id);
        if (e) {
          const a = mesh.verts.get(e.a);
          const b = mesh.verts.get(e.b);
          hp.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      } else if (app.hover.type === "face") {
        const f = mesh.faces.get(app.hover.id);
        if (f) {
          for (let i = 0; i < f.verts.length; i++) {
            const a = mesh.verts.get(f.verts[i]);
            const b = mesh.verts.get(f.verts[(i + 1) % f.verts.length]);
            hp.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        }
      } else if (app.hover.type === "vertex") {
        const v = mesh.verts.get(app.hover.id);
        if (v) {
          const s = 0.04;
          hp.push(v.x - s, v.y, v.z, v.x + s, v.y, v.z, v.x, v.y - s, v.z, v.x, v.y + s, v.z);
        }
      }
      setPositions(view.hoverLine.geometry, hp);
      view.hoverLine.visible = hp.length > 0;
    } else {
      setPositions(view.hoverLine.geometry, []);
      view.hoverLine.visible = false;
    }
  } else {
    setPositions(view.hoverLine.geometry, []);
    view.hoverLine.visible = false;
  }

  setPositions(view.selFaces.geometry, sFaces, sN);
  view.selFaces.visible = sFaces.length > 0;
  setPositions(view.selWire.geometry, sEdges);
  view.selWire.visible = sEdges.length > 0;
  setPositions(view.pts.geometry, allVerts);
  view.pts.visible = edit;
  view.pts.material.depthTest = !app.xray;
  setPositions(view.selPts.geometry, sVerts);
  view.selPts.visible = edit && sVerts.length > 0;
}

function setPositions(geo, pos, nrm = null) {
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (nrm) geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  else geo.deleteAttribute("normal");
  geo.computeBoundingSphere();
}

function makeCursor() {
  const g = new THREE.Group();
  const ring = (r, c) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: c, toneMapped: false, depthTest: false })
    );
  };
  const r1 = ring(0.18, 0xe8e8e8);
  const r2 = ring(0.18, 0xd04030);
  r2.rotation.y = Math.PI / 2;
  const r3 = ring(0.18, 0xd04030);
  r3.rotation.x = Math.PI / 2;
  g.add(r1, r2, r3);
  const cross = (a, b, c) =>
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: c, toneMapped: false, depthTest: false })
    );
  g.add(cross(new THREE.Vector3(-0.28, 0, 0), new THREE.Vector3(0.28, 0, 0), 0xd04030));
  g.add(cross(new THREE.Vector3(0, -0.28, 0), new THREE.Vector3(0, 0.28, 0), 0x40a040));
  g.add(cross(new THREE.Vector3(0, 0, -0.28), new THREE.Vector3(0, 0, 0.28), 0x4070d0));
  g.renderOrder = 10;
  return g;
}

function makeGizmoScene() {
  const s = new THREE.Scene();
  const addAxis = (dir, color, view) => {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 10), mat);
    shaft.position.copy(dir.clone().multiplyScalar(0.36));
    alignY(shaft, dir);
    shaft.userData.view = view;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 12), mat);
    head.position.copy(dir.clone().multiplyScalar(0.82));
    alignY(head, dir);
    head.userData.view = view;
    s.add(shaft, head);
  };
  addAxis(new THREE.Vector3(1, 0, 0), 0xe05050, "right");
  addAxis(new THREE.Vector3(0, 1, 0), 0x50c050, "front");
  addAxis(new THREE.Vector3(0, 0, 1), 0x5080e0, "top");
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xcccccc, toneMapped: false })
  );
  ball.userData.view = "camera";
  s.add(ball);
  s.add(new THREE.AmbientLight(0xffffff, 1));
  return s;
}

function alignY(obj, dir) {
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}
