// Builds the sample projects' 3D models (the architect's model of the finished building) as GLB files.
//   node scripts/demo-models.mjs
// Output: apps/web/public/demo/models/{adenta,legon}.glb. Plain boxes and a hip roof, metres, Y up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'apps/web/public/demo/models');
mkdirSync(OUT, { recursive: true });

// GLTFExporter reads its buffers with FileReader, which Node does not have
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onload?.(); this.onloadend?.(); }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onload?.(); this.onloadend?.();
  }
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
const M = {
  render: mat(0xf1e9dc), plinth: mat(0x8d8a84), concrete: mat(0xc3c6c9), slab: mat(0xd9dadb), roof: mat(0xa5472f),
  glass: mat(0x37566a, { roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 }), frame: mat(0x4a4f55),
  door: mat(0x6b4226), ground: mat(0xd8d2c2), grass: mat(0x8fa66b), paving: mat(0xb9b4aa),
};

// A box from its minimum corner and size
function box(group, m, x, y, z, w, h, d, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

// A hip roof over the rectangle (x, z, w, d) at height y, rising by rise, with an overhang
function hipRoof(group, m, x, y, z, w, d, rise, over = 0.6) {
  const x0 = x - over; const x1 = x + w + over; const z0 = z - over; const z1 = z + d + over;
  const inset = Math.min(x1 - x0, z1 - z0) / 2;
  const long = x1 - x0 >= z1 - z0;
  const [ra, rb] = long
    ? [[x0 + inset, y + rise, (z0 + z1) / 2], [x1 - inset, y + rise, (z0 + z1) / 2]]
    : [[(x0 + x1) / 2, y + rise, z0 + inset], [(x0 + x1) / 2, y + rise, z1 - inset]];
  const c = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  const tris = long
    ? [[c[0], ra, rb], [c[0], rb, c[1]], [c[1], rb, c[2]], [c[2], rb, ra], [c[2], ra, c[3]], [c[3], ra, c[0]]]
    : [[c[0], ra, c[1]], [c[1], ra, rb], [c[1], rb, c[2]], [c[2], rb, c[3]], [c[3], rb, ra], [c[3], ra, c[0]]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.8, side: THREE.DoubleSide }));
  mesh.name = 'Roof';
  group.add(mesh);
}

// Windows along one face: a dark pane and a sill, set just proud of the wall
function windows(group, { face, at, from, to, y, h, w, every }) {
  for (let p = from; p + w <= to + 1e-6; p += every) {
    if (face === 'z') { box(group, M.glass, p, y, at - 0.03, w, h, 0.06); box(group, M.frame, p - 0.05, y - 0.08, at - 0.08, w + 0.1, 0.08, 0.16); }
    else { box(group, M.glass, at - 0.03, y, p, 0.06, h, w); box(group, M.frame, at - 0.08, y - 0.08, p - 0.05, 0.16, 0.08, w + 0.1); }
  }
}

// Adenta 4-bedroom residence: two storeys, an L of a main block and a wing, porch, hip roofs
function adenta() {
  const g = new THREE.Group(); g.name = 'Adenta 4-bedroom residence';
  box(g, M.grass, -6, -0.05, -6, 30, 0.05, 24, 'Plot');
  box(g, M.paving, 2, 0, -6, 4, 0.02, 6, 'Driveway');
  box(g, M.plinth, -0.2, 0, -0.2, 16.4, 0.45, 10.4, 'Plinth');
  box(g, M.plinth, 10.8, 0, 9.8, 5.4, 0.45, 5.4, 'Plinth (wing)');
  const fl = 3.1;
  for (const lvl of [0, 1]) {
    const y = 0.45 + lvl * fl;
    box(g, M.render, 0, y, 0, 16, fl - 0.2, 10, `Walls, ${lvl ? 'first' : 'ground'} floor`);
    box(g, M.render, 11, y, 10, 5, fl - 0.2, 5, `Wing walls, ${lvl ? 'first' : 'ground'} floor`);
    box(g, M.slab, -0.15, y + fl - 0.2, -0.15, 16.3, 0.2, 10.3, `Slab, ${lvl ? 'roof' : 'first floor'}`);
    box(g, M.slab, 10.85, y + fl - 0.2, 9.85, 5.3, 0.2, 5.3);
    windows(g, { face: 'z', at: 0, from: lvl ? 1 : 7, to: 15, y: y + 0.9, h: 1.4, w: 1.5, every: 2.6 });
    windows(g, { face: 'z', at: 10, from: 1, to: 9.5, y: y + 0.9, h: 1.4, w: 1.5, every: 2.6 });
    windows(g, { face: 'x', at: 0, from: 1.5, to: 9, y: y + 0.9, h: 1.4, w: 1.5, every: 3.2 });
    windows(g, { face: 'x', at: 16, from: 1.5, to: 14, y: y + 0.9, h: 1.4, w: 1.5, every: 3.2 });
  }
  // Porch: columns, a flat roof and the front door
  box(g, M.plinth, 1, 0, -2.6, 5, 0.3, 2.6, 'Porch');
  for (const x of [1.1, 5.6]) box(g, M.render, x, 0.3, -2.5, 0.3, 2.8, 0.3, 'Porch column');
  box(g, M.slab, 0.8, 3.1, -2.8, 5.4, 0.2, 2.8, 'Porch roof');
  box(g, M.door, 3, 0.45, -0.05, 1.2, 2.3, 0.08, 'Front door');
  box(g, M.glass, 1.6, 0.9, -0.05, 1.0, 1.6, 0.06);
  box(g, M.glass, 4.6, 0.9, -0.05, 1.0, 1.6, 0.06);
  hipRoof(g, M.roof, 0, 0.45 + 2 * fl, 0, 16, 10, 2.6);
  hipRoof(g, M.roof, 11, 0.45 + 2 * fl, 10, 5, 5, 1.8, 0.5);
  return g;
}

// East Legon office complex: five floors on a column grid, glass between the slabs, a concrete stair core
function legon() {
  const g = new THREE.Group(); g.name = 'East Legon office complex';
  box(g, M.ground, -10, -0.05, -12, 52, 0.05, 44, 'Site');
  box(g, M.paving, -4, 0, -10, 40, 0.03, 8, 'Forecourt');
  const W = 30; const D = 18; const fl = 3.6; const floors = 5;
  for (let i = 0; i <= floors; i++) {
    const y = i * fl;
    box(g, M.slab, -0.4, y, -0.4, W + 0.8, i ? 0.3 : 0.5, D + 0.8, i ? `Slab, level ${i}` : 'Ground slab');
  }
  for (let i = 0; i < floors; i++) {
    const y = i * fl + 0.3;
    box(g, M.glass, 0.25, y, 0.25, W - 0.5, fl - 0.3, D - 0.5, `Curtain wall, level ${i}`);
    for (let x = 0; x <= W; x += 6) for (const z of [0, D]) box(g, M.frame, x - 0.04, y, z - 0.06, 0.08, fl - 0.3, 0.12);
    for (let z = 0; z <= D; z += 6) for (const x of [0, W]) box(g, M.frame, x - 0.06, y, z - 0.04, 0.12, fl - 0.3, 0.08);
  }
  for (let x = 0; x <= W; x += 6) for (let z = 0; z <= D; z += 6) box(g, M.concrete, x - 0.25, 0, z - 0.25, 0.5, floors * fl, 0.5, 'Column');
  box(g, M.concrete, W - 7, 0, D - 6, 6, floors * fl + 3, 6, 'Stair core');
  box(g, M.concrete, -0.4, floors * fl + 0.3, -0.4, W + 0.8, 1.1, 0.25, 'Parapet');
  box(g, M.concrete, -0.4, floors * fl + 0.3, D + 0.15, W + 0.8, 1.1, 0.25);
  box(g, M.concrete, -0.4, floors * fl + 0.3, -0.4, 0.25, 1.1, D + 0.8);
  box(g, M.concrete, W + 0.15, floors * fl + 0.3, -0.4, 0.25, 1.1, D + 0.8);
  // Entrance canopy
  box(g, M.slab, 10, 3.6, -4, 10, 0.3, 4, 'Entrance canopy');
  for (const x of [10.2, 19.4]) box(g, M.frame, x, 0, -3.8, 0.3, 3.6, 0.3);
  return g;
}

const exporter = new GLTFExporter();
for (const [name, build] of [['adenta', adenta], ['legon', legon]]) {
  const scene = new THREE.Scene();
  const model = build();
  model.rotation.y = Math.PI; // the front (porch, entrance) faces the viewer's starting camera
  scene.add(model);
  const glb = await exporter.parseAsync(scene, { binary: true });
  writeFileSync(resolve(OUT, `${name}.glb`), Buffer.from(glb));
  console.log(`${name}.glb`, `${(glb.byteLength / 1024).toFixed(0)} KB`);
}
