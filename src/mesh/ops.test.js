import { createPrimitive } from "./primitives.js";
import { extrudeFaces, insetFaces, subdivideFaces } from "./ops.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cube = createPrimitive("cube");
assert(cube.verts.size === 8, "cube verts");
assert(cube.faces.size === 6, "cube faces");
assert(cube.edges.size === 12, "cube edges");

const top = [...cube.faces.values()].find((f) => Math.abs(cube.faceCenter(f).z - 1) < 1e-6);
assert(top, "top face");
const n = cube.faceNormal(top);
assert(n.z > 0.9, `top normal ${n.z}`);

const ex = extrudeFaces(cube, [top.id]);
assert(cube.verts.size === 12, `extrude verts ${cube.verts.size}`);
assert(cube.faces.size === 10, `extrude faces ${cube.faces.size}`);
for (const id of ex.newVertIds) {
  const v = cube.verts.get(id);
  v.z += 0.5;
}
const newTop = cube.faces.get(top.id);
const c = cube.faceCenter(newTop);
assert(Math.abs(c.z - 1.5) < 1e-6, `extruded center z ${c.z}`);

const cube2 = createPrimitive("cube");
const face = [...cube2.faces.values()][1];
insetFaces(cube2, [face.id], 0.3, 0, false);
assert(cube2.verts.size === 12, `inset verts ${cube2.verts.size}`);
assert(cube2.faces.size === 10, `inset faces ${cube2.faces.size}`);

const plane = createPrimitive("plane", { size: 2, sx: 1, sy: 1 });
assert(plane.faces.size === 1, "plane face");
subdivideFaces(plane, [...plane.faces.keys()]);
assert(plane.faces.size === 4, `subdiv faces ${plane.faces.size}`);

const sph = createPrimitive("uvsphere", { segments: 8, rings: 6, radius: 1 });
assert(sph.faces.size > 10, "sphere faces");
const cyl = createPrimitive("cylinder", { vertices: 8, radius: 1, depth: 2 });
assert(cyl.faces.size > 8, "cyl faces");
const cir = createPrimitive("circle", { vertices: 12, fill: "ngon" });
assert(cir.faces.size === 1 && cir.verts.size === 12, "circle");

console.log("ops tests passed");
