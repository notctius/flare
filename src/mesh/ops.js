import { add3, mul3, norm3, sub3, len3, cross3, dot3 } from "./BMesh.js";

/** Region extrude: duplicate selected-face verts, remap faces, bridge boundary. */
export function extrudeFaces(mesh, faceIds) {
  const selected = new Set(faceIds);
  if (selected.size === 0) return { newVertIds: [], vertMap: new Map(), faceIds: [] };

  const edgeUse = new Map();
  const directed = [];
  for (const fid of selected) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const n = f.verts.length;
    for (let i = 0; i < n; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % n];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
    }
  }
  for (const fid of selected) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const n = f.verts.length;
    for (let i = 0; i < n; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % n];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (edgeUse.get(key) === 1) directed.push({ a, b });
    }
  }

  const used = new Set();
  for (const fid of selected) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    for (const v of f.verts) used.add(v);
  }

  const vertMap = new Map();
  for (const vid of used) {
    const v = mesh.verts.get(vid);
    vertMap.set(vid, mesh.addVertex(v.x, v.y, v.z));
  }

  for (const fid of selected) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    f.verts = f.verts.map((v) => vertMap.get(v));
    f.edges = [];
    for (let i = 0; i < f.verts.length; i++) {
      f.edges.push(mesh.ensureEdge(f.verts[i], f.verts[(i + 1) % f.verts.length]));
    }
  }

  for (const { a, b } of directed) {
    mesh.addFace([a, vertMap.get(a), vertMap.get(b), b]);
  }

  return { newVertIds: [...vertMap.values()], vertMap, faceIds: [...selected] };
}

export function averageFaceNormal(mesh, faceIds) {
  let x = 0;
  let y = 0;
  let z = 0;
  let c = 0;
  for (const fid of faceIds) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const n = mesh.faceNormal(f);
    x += n.x;
    y += n.y;
    z += n.z;
    c++;
  }
  if (!c) return { x: 0, y: 0, z: 1 };
  return norm3({ x, y, z });
}

export function vertexNormalsFromFaces(mesh, faceIds) {
  const acc = new Map();
  for (const fid of faceIds) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const n = mesh.faceNormal(f);
    for (const vid of f.verts) {
      if (!acc.has(vid)) acc.set(vid, { x: 0, y: 0, z: 0 });
      const a = acc.get(vid);
      a.x += n.x;
      a.y += n.y;
      a.z += n.z;
    }
  }
  const out = new Map();
  for (const [id, a] of acc) out.set(id, norm3(a));
  return out;
}

export function moveVertices(mesh, vertIds, delta) {
  for (const id of vertIds) {
    const v = mesh.verts.get(id);
    if (!v) continue;
    v.x += delta.x;
    v.y += delta.y;
    v.z += delta.z;
  }
}

export function moveVerticesAlongNormals(mesh, normals, distance) {
  for (const [id, n] of normals) {
    const v = mesh.verts.get(id);
    if (!v) continue;
    v.x += n.x * distance;
    v.y += n.y * distance;
    v.z += n.z * distance;
  }
}

/**
 * Individual inset. thickness is a 0–1 factor toward the face center
 * (or an absolute distance if absolute=true).
 */
export function insetFaces(mesh, faceIds, thickness = 0.25, depth = 0, absolute = false) {
  const newVertIds = [];
  const kept = [];
  for (const fid of faceIds) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const oldVerts = [...f.verts];
    const center = mesh.faceCenter(f);
    const normal = mesh.faceNormal(f);
    const inner = [];
    for (const vid of oldVerts) {
      const v = mesh.verts.get(vid);
      const toC = sub3(center, v);
      const dist = len3(toC) || 1;
      const dir = { x: toC.x / dist, y: toC.y / dist, z: toC.z / dist };
      const t = absolute ? Math.min(thickness, dist * 0.95) : dist * Math.min(Math.max(thickness, 0), 0.95);
      const nid = mesh.addVertex(
        v.x + dir.x * t + normal.x * depth,
        v.y + dir.y * t + normal.y * depth,
        v.z + dir.z * t + normal.z * depth
      );
      inner.push(nid);
      newVertIds.push(nid);
    }
    f.verts = inner;
    f.edges = [];
    for (let i = 0; i < inner.length; i++) {
      f.edges.push(mesh.ensureEdge(inner[i], inner[(i + 1) % inner.length]));
    }
    const n = oldVerts.length;
    for (let i = 0; i < n; i++) {
      const a = oldVerts[i];
      const b = oldVerts[(i + 1) % n];
      const ap = inner[i];
      const bp = inner[(i + 1) % n];
      mesh.addFace([a, ap, bp, b]);
    }
    kept.push(fid);
  }
  return { newVertIds, faceIds: kept };
}

/** Simple face subdivide: midpoints + optional center for n-gons. */
export function subdivideFaces(mesh, faceIds) {
  const midCache = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (midCache.has(key)) return midCache.get(key);
    const va = mesh.verts.get(a);
    const vb = mesh.verts.get(b);
    const id = mesh.addVertex((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    midCache.set(key, id);
    return id;
  };

  const created = [];
  for (const fid of [...faceIds]) {
    const f = mesh.faces.get(fid);
    if (!f) continue;
    const vs = [...f.verts];
    const n = vs.length;
    const mids = [];
    for (let i = 0; i < n; i++) mids.push(midpoint(vs[i], vs[(i + 1) % n]));
    mesh.removeFace(fid);
    if (n === 3) {
      created.push(mesh.addFace([vs[0], mids[0], mids[2]]));
      created.push(mesh.addFace([vs[1], mids[1], mids[0]]));
      created.push(mesh.addFace([vs[2], mids[2], mids[1]]));
      created.push(mesh.addFace([mids[0], mids[1], mids[2]]));
    } else {
      const c = mesh.faceCenter({ verts: vs });
      const cid = mesh.addVertex(c.x, c.y, c.z);
      for (let i = 0; i < n; i++) {
        created.push(mesh.addFace([vs[i], mids[i], cid, mids[(i - 1 + n) % n]]));
      }
    }
  }
  return created.filter(Boolean);
}

export function uniqueVertsFromSelection(mesh, sel) {
  const set = new Set();
  if (sel.mode === "vertex") {
    for (const id of sel.verts) set.add(id);
  } else if (sel.mode === "edge") {
    for (const id of sel.edges) {
      const e = mesh.edges.get(id);
      if (e) {
        set.add(e.a);
        set.add(e.b);
      }
    }
  } else {
    for (const id of sel.faces) {
      const f = mesh.faces.get(id);
      if (f) for (const v of f.verts) set.add(v);
    }
  }
  return set;
}

export function selectionMedian(mesh, vertIds) {
  let x = 0;
  let y = 0;
  let z = 0;
  let c = 0;
  for (const id of vertIds) {
    const v = mesh.verts.get(id);
    if (!v) continue;
    x += v.x;
    y += v.y;
    z += v.z;
    c++;
  }
  if (!c) return { x: 0, y: 0, z: 0 };
  return { x: x / c, y: y / c, z: z / c };
}

export function rotateVertices(mesh, vertIds, origin, axis, angle) {
  const ax = norm3(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const { x: ux, y: uy, z: uz } = ax;
  const r00 = t * ux * ux + c;
  const r01 = t * ux * uy - s * uz;
  const r02 = t * ux * uz + s * uy;
  const r10 = t * uy * ux + s * uz;
  const r11 = t * uy * uy + c;
  const r12 = t * uy * uz - s * ux;
  const r20 = t * uz * ux - s * uy;
  const r21 = t * uz * uy + s * ux;
  const r22 = t * uz * uz + c;
  for (const id of vertIds) {
    const v = mesh.verts.get(id);
    if (!v) continue;
    const px = v.x - origin.x;
    const py = v.y - origin.y;
    const pz = v.z - origin.z;
    v.x = origin.x + r00 * px + r01 * py + r02 * pz;
    v.y = origin.y + r10 * px + r11 * py + r12 * pz;
    v.z = origin.z + r20 * px + r21 * py + r22 * pz;
  }
}

export function scaleVertices(mesh, vertIds, origin, factors) {
  for (const id of vertIds) {
    const v = mesh.verts.get(id);
    if (!v) continue;
    v.x = origin.x + (v.x - origin.x) * factors.x;
    v.y = origin.y + (v.y - origin.y) * factors.y;
    v.z = origin.z + (v.z - origin.z) * factors.z;
  }
}

export function duplicateSelection(mesh, sel) {
  const verts = uniqueVertsFromSelection(mesh, sel);
  const map = new Map();
  for (const id of verts) {
    const v = mesh.verts.get(id);
    map.set(id, mesh.addVertex(v.x, v.y, v.z));
  }
  const newFaces = [];
  const newEdges = [];
  if (sel.mode === "face") {
    for (const fid of sel.faces) {
      const f = mesh.faces.get(fid);
      if (!f) continue;
      newFaces.push(mesh.addFace(f.verts.map((v) => map.get(v))));
    }
  } else if (sel.mode === "edge") {
    for (const eid of sel.edges) {
      const e = mesh.edges.get(eid);
      if (!e) continue;
      newEdges.push(mesh.ensureEdge(map.get(e.a), map.get(e.b)));
    }
  }
  return { vertMap: map, newFaces, newEdges, newVerts: [...map.values()] };
}

export function deleteSelection(mesh, sel) {
  if (sel.mode === "vertex") {
    for (const id of [...sel.verts]) mesh.removeVertex(id);
    sel.verts.clear();
  } else if (sel.mode === "edge") {
    for (const id of [...sel.edges]) mesh.removeEdge(id);
    sel.edges.clear();
  } else {
    for (const id of [...sel.faces]) mesh.removeFace(id);
    sel.faces.clear();
  }
  mesh.removeOrphanVerts();
}

export { add3, mul3, norm3, sub3, len3, cross3, dot3 };
