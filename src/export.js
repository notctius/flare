import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

export function objectsToOBJ(objects, objectMatrix) {
  let out = "# Flare OBJ — Z-up\n";
  let voff = 1;
  for (const o of objects) {
    if (!o.visible) continue;
    out += `o ${o.name.replace(/\s+/g, "_")}\n`;
    const mat = objectMatrix(o);
    const remap = new Map();
    let n = 0;
    for (const v of o.bmesh.verts.values()) {
      const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(mat);
      out += `v ${fmt(w.x)} ${fmt(w.y)} ${fmt(w.z)}\n`;
      remap.set(v.id, voff + n);
      n++;
    }
    for (const f of o.bmesh.faces.values()) {
      out += `f ${f.verts.map((id) => remap.get(id)).join(" ")}\n`;
    }
    voff += n;
  }
  return out;
}

function fmt(n) {
  return Number(n.toFixed(6)).toString();
}

export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function exportGLTF(viewport, objects) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  for (const o of objects) {
    if (!o.visible) continue;
    const view = viewport.views.get(o.id);
    if (!view) continue;
    const mesh = view.mesh.clone();
    mesh.geometry = view.mesh.geometry.clone();
    mesh.material = new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: 0.5,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    mesh.position.copy(view.group.position);
    mesh.rotation.copy(view.group.rotation);
    mesh.scale.copy(view.group.scale);
    mesh.name = o.name;
    root.add(mesh);
  }
  const exporter = new GLTFExporter();
  exporter.parse(
    root,
    (buf) => {
      const blob = new Blob([buf], { type: "model/gltf-binary" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "flare-scene.glb";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    },
    (err) => console.error(err),
    { binary: true }
  );
}
