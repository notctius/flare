/** Lightweight face/edge/vert topology used for modeling ops. */

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul3(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len3(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm3(a) {
  const l = len3(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function lerp3(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function clone3(a) {
  return { x: a.x, y: a.y, z: a.z };
}

export function eq3(a, b, eps = 1e-8) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
}

export function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export class BMesh {
  constructor() {
    this.vid = 1;
    this.eid = 1;
    this.fid = 1;
    this.verts = new Map();
    this.edges = new Map();
    this.edgeByKey = new Map();
    this.faces = new Map();
  }

  addVertex(x, y, z) {
    const id = this.vid++;
    this.verts.set(id, { id, x, y, z });
    return id;
  }

  ensureEdge(a, b) {
    const key = edgeKey(a, b);
    const existing = this.edgeByKey.get(key);
    if (existing) return existing.id;
    const id = this.eid++;
    const e = { id, a, b, key };
    this.edges.set(id, e);
    this.edgeByKey.set(key, e);
    return id;
  }

  addFace(vertIds) {
    if (vertIds.length < 3) return null;
    const verts = [...vertIds];
    const edges = [];
    for (let i = 0; i < verts.length; i++) {
      edges.push(this.ensureEdge(verts[i], verts[(i + 1) % verts.length]));
    }
    const id = this.fid++;
    this.faces.set(id, { id, verts, edges });
    return id;
  }

  addLoop(vertIds, closed = true) {
    const ids = [];
    for (let i = 0; i < vertIds.length - (closed ? 0 : 1); i++) {
      const a = vertIds[i];
      const b = vertIds[(i + 1) % vertIds.length];
      ids.push(this.ensureEdge(a, b));
    }
    return ids;
  }

  removeFace(id) {
    this.faces.delete(id);
  }

  removeEdge(id) {
    const e = this.edges.get(id);
    if (!e) return;
    const toKill = [];
    for (const f of this.faces.values()) {
      if (f.edges.includes(id)) toKill.push(f.id);
    }
    for (const fid of toKill) this.faces.delete(fid);
    this.edges.delete(id);
    this.edgeByKey.delete(e.key);
  }

  removeVertex(id) {
    const edgeIds = [];
    for (const e of this.edges.values()) {
      if (e.a === id || e.b === id) edgeIds.push(e.id);
    }
    for (const eid of edgeIds) this.removeEdge(eid);
    this.verts.delete(id);
  }

  facesUsingVertex(vid) {
    const out = [];
    for (const f of this.faces.values()) {
      if (f.verts.includes(vid)) out.push(f.id);
    }
    return out;
  }

  facesUsingEdge(eid) {
    const out = [];
    for (const f of this.faces.values()) {
      if (f.edges.includes(eid)) out.push(f.id);
    }
    return out;
  }

  edgesUsingVertex(vid) {
    const out = [];
    for (const e of this.edges.values()) {
      if (e.a === vid || e.b === vid) out.push(e.id);
    }
    return out;
  }

  faceNormal(face) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    const vs = face.verts;
    for (let i = 0; i < vs.length; i++) {
      const c = this.verts.get(vs[i]);
      const n = this.verts.get(vs[(i + 1) % vs.length]);
      nx += c.y * n.z - n.y * c.z;
      ny += c.z * n.x - n.z * c.x;
      nz += c.x * n.y - n.x * c.y;
    }
    return norm3({ x: nx, y: ny, z: nz });
  }

  faceCenter(face) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const id of face.verts) {
      const v = this.verts.get(id);
      x += v.x;
      y += v.y;
      z += v.z;
    }
    const n = face.verts.length || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  triangulate(face) {
    const ids = face.verts;
    if (ids.length < 3) return [];
    const tris = [];
    for (let i = 1; i < ids.length - 1; i++) {
      tris.push([ids[0], ids[i], ids[i + 1]]);
    }
    return tris;
  }

  bbox() {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    if (this.verts.size === 0) {
      return { min: v3(-1, -1, -1), max: v3(1, 1, 1) };
    }
    for (const v of this.verts.values()) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
    return { min: v3(minX, minY, minZ), max: v3(maxX, maxY, maxZ) };
  }

  center() {
    const b = this.bbox();
    return mul3(add3(b.min, b.max), 0.5);
  }

  translate(dx, dy, dz) {
    for (const v of this.verts.values()) {
      v.x += dx;
      v.y += dy;
      v.z += dz;
    }
  }

  cleanupLooseEdges() {
    const used = new Set();
    for (const f of this.faces.values()) {
      for (const e of f.edges) used.add(e);
    }
    // keep unused edges — they are intentional wire edges
  }

  removeOrphanVerts() {
    const used = new Set();
    for (const e of this.edges.values()) {
      used.add(e.a);
      used.add(e.b);
    }
    for (const id of [...this.verts.keys()]) {
      if (!used.has(id)) this.verts.delete(id);
    }
  }

  mergeByDistance(dist = 0.0001) {
    const list = [...this.verts.values()];
    const map = new Map();
    const taken = [];
    for (const v of list) {
      let found = null;
      for (const t of taken) {
        if (Math.hypot(t.x - v.x, t.y - v.y, t.z - v.z) <= dist) {
          found = t.id;
          break;
        }
      }
      if (found == null) {
        taken.push(v);
        map.set(v.id, v.id);
      } else {
        map.set(v.id, found);
      }
    }

    const newFaces = [];
    for (const f of this.faces.values()) {
      const verts = [];
      for (const id of f.verts) {
        const nid = map.get(id);
        if (verts[verts.length - 1] !== nid) verts.push(nid);
      }
      if (verts.length > 1 && verts[0] === verts[verts.length - 1]) verts.pop();
      if (verts.length >= 3) newFaces.push(verts);
    }
    const newLoops = [];
    for (const e of this.edges.values()) {
      const a = map.get(e.a);
      const b = map.get(e.b);
      if (a !== b) newLoops.push([a, b]);
    }

    const keep = new Set([...map.values()]);
    for (const id of [...this.verts.keys()]) {
      if (!keep.has(id)) this.verts.delete(id);
    }
    this.edges.clear();
    this.edgeByKey.clear();
    this.faces.clear();
    for (const [a, b] of newLoops) this.ensureEdge(a, b);
    for (const verts of newFaces) this.addFace(verts);
  }

  flipNormals() {
    for (const f of this.faces.values()) {
      f.verts.reverse();
      f.edges = [];
      for (let i = 0; i < f.verts.length; i++) {
        f.edges.push(this.ensureEdge(f.verts[i], f.verts[(i + 1) % f.verts.length]));
      }
    }
  }

  clone() {
    return BMesh.fromJSON(this.toJSON());
  }

  toJSON() {
    return {
      vid: this.vid,
      eid: this.eid,
      fid: this.fid,
      verts: [...this.verts.values()].map((v) => ({ id: v.id, x: v.x, y: v.y, z: v.z })),
      edges: [...this.edges.values()].map((e) => ({ id: e.id, a: e.a, b: e.b })),
      faces: [...this.faces.values()].map((f) => ({ id: f.id, verts: [...f.verts] })),
    };
  }

  static fromJSON(data) {
    const m = new BMesh();
    m.vid = data.vid;
    m.eid = data.eid;
    m.fid = data.fid;
    for (const v of data.verts) m.verts.set(v.id, { id: v.id, x: v.x, y: v.y, z: v.z });
    for (const e of data.edges) {
      const key = edgeKey(e.a, e.b);
      const edge = { id: e.id, a: e.a, b: e.b, key };
      m.edges.set(e.id, edge);
      m.edgeByKey.set(key, edge);
    }
    for (const f of data.faces) {
      const edges = [];
      for (let i = 0; i < f.verts.length; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % f.verts.length];
        const existing = m.edgeByKey.get(edgeKey(a, b));
        if (existing) edges.push(existing.id);
        else edges.push(m.ensureEdge(a, b));
      }
      m.faces.set(f.id, { id: f.id, verts: [...f.verts], edges });
    }
    return m;
  }
}
