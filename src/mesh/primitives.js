import { BMesh } from "./BMesh.js";

export const PRIM_DEFAULTS = {
  plane: { size: 2, sx: 1, sy: 1 },
  cube: { size: 2 },
  circle: { vertices: 32, radius: 1, fill: "ngon" },
  uvsphere: { segments: 32, rings: 16, radius: 1 },
  icosphere: { subdivisions: 2, radius: 1 },
  cylinder: { vertices: 32, radius: 1, depth: 2, caps: true },
  cone: { vertices: 32, radius1: 1, radius2: 0, depth: 2, caps: true },
  torus: { major: 1, minor: 0.25, majorSeg: 48, minorSeg: 12 },
};

export function createPrimitive(type, params = {}) {
  const p = { ...PRIM_DEFAULTS[type], ...params };
  switch (type) {
    case "plane":
      return plane(p);
    case "cube":
      return cube(p);
    case "circle":
      return circle(p);
    case "uvsphere":
      return uvSphere(p);
    case "icosphere":
      return icoSphere(p);
    case "cylinder":
      return cylinder(p);
    case "cone":
      return cone(p);
    case "torus":
      return torus(p);
    default:
      return cube(p);
  }
}

export const PRIM_LABELS = {
  plane: "Plane",
  cube: "Cube",
  circle: "Circle",
  uvsphere: "UV Sphere",
  icosphere: "Ico Sphere",
  cylinder: "Cylinder",
  cone: "Cone",
  torus: "Torus",
};

export function plane({ size = 2, sx = 1, sy = 1 } = {}) {
  const m = new BMesh();
  const hx = size / 2;
  const hy = size / 2;
  const nx = Math.max(1, Math.round(sx));
  const ny = Math.max(1, Math.round(sy));
  const ids = [];
  for (let j = 0; j <= ny; j++) {
    const row = [];
    const y = -hy + (j / ny) * size;
    for (let i = 0; i <= nx; i++) {
      const x = -hx + (i / nx) * size;
      row.push(m.addVertex(x, y, 0));
    }
    ids.push(row);
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      m.addFace([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]]);
    }
  }
  return m;
}

export function cube({ size = 2 } = {}) {
  const m = new BMesh();
  const s = size / 2;
  const v = [
    m.addVertex(-s, -s, -s),
    m.addVertex(s, -s, -s),
    m.addVertex(s, s, -s),
    m.addVertex(-s, s, -s),
    m.addVertex(-s, -s, s),
    m.addVertex(s, -s, s),
    m.addVertex(s, s, s),
    m.addVertex(-s, s, s),
  ];
  m.addFace([v[0], v[3], v[2], v[1]]); // -Z
  m.addFace([v[4], v[5], v[6], v[7]]); // +Z
  m.addFace([v[0], v[1], v[5], v[4]]); // -Y
  m.addFace([v[2], v[3], v[7], v[6]]); // +Y
  m.addFace([v[3], v[0], v[4], v[7]]); // -X
  m.addFace([v[1], v[2], v[6], v[5]]); // +X
  return m;
}

export function circle({ vertices = 32, radius = 1, fill = "ngon" } = {}) {
  const m = new BMesh();
  const n = Math.max(3, Math.round(vertices));
  const ids = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ids.push(m.addVertex(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  if (fill === "ngon") {
    m.addFace(ids);
  } else if (fill === "triangle_fan") {
    const c = m.addVertex(0, 0, 0);
    for (let i = 0; i < n; i++) m.addFace([c, ids[i], ids[(i + 1) % n]]);
  } else {
    m.addLoop(ids, true);
  }
  return m;
}

export function uvSphere({ segments = 32, rings = 16, radius = 1 } = {}) {
  const m = new BMesh();
  const seg = Math.max(3, Math.round(segments));
  const rg = Math.max(2, Math.round(rings));
  const grid = [];
  const north = m.addVertex(0, 0, radius);
  const south = m.addVertex(0, 0, -radius);
  for (let j = 1; j < rg; j++) {
    const v = j / rg;
    const phi = v * Math.PI;
    const z = Math.cos(phi) * radius;
    const r = Math.sin(phi) * radius;
    const row = [];
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      row.push(m.addVertex(Math.cos(th) * r, Math.sin(th) * r, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < seg; i++) {
    m.addFace([north, grid[0][i], grid[0][(i + 1) % seg]]);
  }
  for (let j = 0; j < grid.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = grid[j][i];
      const b = grid[j][(i + 1) % seg];
      const c = grid[j + 1][(i + 1) % seg];
      const d = grid[j + 1][i];
      m.addFace([a, d, c, b]);
    }
  }
  const last = grid[grid.length - 1];
  for (let i = 0; i < seg; i++) {
    m.addFace([south, last[(i + 1) % seg], last[i]]);
  }
  return m;
}

export function icoSphere({ subdivisions = 2, radius = 1 } = {}) {
  const m = new BMesh();
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const cache = new Map();
  const pushV = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    return m.addVertex((x / l) * radius, (y / l) * radius, (z / l) * radius);
  };
  const ids = raw.map((p) => pushV(p[0], p[1], p[2]));
  let faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ].map((f) => f.map((i) => ids[i]));

  const midpoint = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (cache.has(key)) return cache.get(key);
    const va = m.verts.get(a);
    const vb = m.verts.get(b);
    const id = pushV((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    cache.set(key, id);
    return id;
  };

  const levels = Math.max(0, Math.min(4, Math.round(subdivisions)));
  for (let s = 0; s < levels; s++) {
    const next = [];
    cache.clear();
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  for (const f of faces) m.addFace(f);
  return m;
}

export function cylinder({ vertices = 32, radius = 1, depth = 2, caps = true } = {}) {
  return cone({ vertices, radius1: radius, radius2: radius, depth, caps });
}

export function cone({ vertices = 32, radius1 = 1, radius2 = 0, depth = 2, caps = true } = {}) {
  const m = new BMesh();
  const n = Math.max(3, Math.round(vertices));
  const z0 = -depth / 2;
  const z1 = depth / 2;
  const bot = [];
  const top = [];
  const r1 = radius1;
  const r2 = radius2;
  const botCenter = r1 > 1e-8 && caps ? m.addVertex(0, 0, z0) : null;
  const topCenter = r2 > 1e-8 && caps ? m.addVertex(0, 0, z1) : null;
  const singleTop = r2 <= 1e-8 ? m.addVertex(0, 0, z1) : null;
  const singleBot = r1 <= 1e-8 ? m.addVertex(0, 0, z0) : null;

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (singleBot == null) bot.push(m.addVertex(c * r1, s * r1, z0));
    if (singleTop == null) top.push(m.addVertex(c * r2, s * r2, z1));
  }

  if (singleTop != null && singleBot == null) {
    for (let i = 0; i < n; i++) m.addFace([bot[i], bot[(i + 1) % n], singleTop]);
    if (caps && botCenter) {
      for (let i = 0; i < n; i++) m.addFace([botCenter, bot[(i + 1) % n], bot[i]]);
    }
  } else if (singleBot != null && singleTop == null) {
    for (let i = 0; i < n; i++) m.addFace([top[(i + 1) % n], top[i], singleBot]);
    if (caps && topCenter) {
      for (let i = 0; i < n; i++) m.addFace([topCenter, top[i], top[(i + 1) % n]]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      m.addFace([bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]);
    }
    if (caps && botCenter) {
      for (let i = 0; i < n; i++) m.addFace([botCenter, bot[(i + 1) % n], bot[i]]);
    }
    if (caps && topCenter) {
      for (let i = 0; i < n; i++) m.addFace([topCenter, top[i], top[(i + 1) % n]]);
    }
  }
  return m;
}

export function torus({ major = 1, minor = 0.25, majorSeg = 48, minorSeg = 12 } = {}) {
  const m = new BMesh();
  const mu = Math.max(3, Math.round(majorSeg));
  const mv = Math.max(3, Math.round(minorSeg));
  const grid = [];
  for (let i = 0; i < mu; i++) {
    const u = (i / mu) * Math.PI * 2;
    const cx = Math.cos(u) * major;
    const cy = Math.sin(u) * major;
    const row = [];
    for (let j = 0; j < mv; j++) {
      const v = (j / mv) * Math.PI * 2;
      const r = major + Math.cos(v) * minor;
      row.push(m.addVertex(Math.cos(u) * r, Math.sin(u) * r, Math.sin(v) * minor));
    }
    grid.push(row);
  }
  for (let i = 0; i < mu; i++) {
    for (let j = 0; j < mv; j++) {
      const a = grid[i][j];
      const b = grid[(i + 1) % mu][j];
      const c = grid[(i + 1) % mu][(j + 1) % mv];
      const d = grid[i][(j + 1) % mv];
      m.addFace([a, b, c, d]);
    }
  }
  return m;
}
