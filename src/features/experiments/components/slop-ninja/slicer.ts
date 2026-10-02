import * as THREE from "three";

export interface SliceResult {
  front: THREE.BufferGeometry | null;
  back: THREE.BufferGeometry | null;
}

// Per vertex: position xyz, normal xyz, uv.
const STRIDE = 8;
const EDGE_KEY = 2 ** 20;
const MAX_CAP_SPLIT_DEPTH = 6;

function samePosition(data: Float32Array, a: number, b: number) {
  return data[a] === data[b] && data[a + 1] === data[b + 1] && data[a + 2] === data[b + 2];
}

class TriangleBuffer {
  data = new Float32Array(512 * 3 * STRIDE);
  materials = new Int32Array(512);
  count = 0;

  push(src: Float64Array, a: number, b: number, c: number, material: number) {
    if (this.count === this.materials.length) this.grow();
    const data = this.data;
    const start = this.count * 3 * STRIDE;
    let o = start;
    for (let k = 0, s = a * STRIDE; k < STRIDE; k++) data[o++] = src[s + k];
    for (let k = 0, s = b * STRIDE; k < STRIDE; k++) data[o++] = src[s + k];
    for (let k = 0, s = c * STRIDE; k < STRIDE; k++) data[o++] = src[s + k];
    // A cut a hair off a vertex rounds onto it in float32. Two coincident corners make the triangle a
    // zero-area line whose edges cancel each other, so dropping it keeps the half closed.
    if (
      samePosition(data, start, start + STRIDE) ||
      samePosition(data, start + STRIDE, start + 2 * STRIDE) ||
      samePosition(data, start + 2 * STRIDE, start)
    ) {
      return;
    }
    this.materials[this.count++] = material;
  }

  private grow() {
    const size = this.materials.length * 2;
    const data = new Float32Array(size * 3 * STRIDE);
    data.set(this.data);
    this.data = data;
    const materials = new Int32Array(size);
    materials.set(this.materials);
    this.materials = materials;
  }
}

function growF64(array: Float64Array<ArrayBuffer>, size: number) {
  if (array.length >= size) return array;
  const next = new Float64Array(Math.max(size, array.length * 2));
  next.set(array);
  return next;
}

function growU32(array: Uint32Array<ArrayBuffer>, size: number) {
  if (array.length >= size) return array;
  const next = new Uint32Array(Math.max(size, array.length * 2));
  next.set(array);
  return next;
}

function growI32(array: Int32Array<ArrayBuffer>, size: number) {
  if (array.length >= size) return array;
  const next = new Int32Array(Math.max(size, array.length * 2));
  next.set(array);
  return next;
}

// Module-level scratch, reused across calls: slicing runs several times per frame.
const frontBuffer = new TriangleBuffer();
const backBuffer = new TriangleBuffer();
const slots = new Float64Array(5 * STRIDE);
const capSlots = new Float64Array(3 * STRIDE);
let vertexData = new Float64Array(1024 * STRIDE);
let distances = new Float64Array(1024);
let triangleMaterials = new Int32Array(512);

const weldCells = new Map<number, number>();
const weldFloats = new Float32Array(3);
const weldBits = new Uint32Array(weldFloats.buffer);
let weldChain = new Int32Array(256);
let pointBits = new Uint32Array(256 * 3);
let pointU = new Float64Array(256);
let pointV = new Float64Array(256);
let pointXYZ = new Float64Array(256 * 3);
let pointCount = 0;

const boundaryEdges = new Map<number, number>();
let edgeFrom = new Int32Array(256);
let edgeTo = new Int32Array(256);
let edgeNext = new Int32Array(256);
let edgeUsed = new Int32Array(256);
let edgeHead = new Int32Array(256);
let loopIds = new Int32Array(256);

const capEdgeUse = new Map<number, number>();
let capTriangles = new Int32Array(256 * 3);
let capTriangleCount = 0;
const vectorPool: THREE.Vector2[] = [];
let vectorsUsed = 0;

let nx = 0;
let ny = 0;
let nz = 1;
let ox = 0;
let oy = 0;
let oz = 0;
let ux = 1;
let uy = 0;
let uz = 0;
let vx = 0;
let vy = 1;
let vz = 0;
let epsilon = 1e-6;
let tolerance = 1e-7;
let capScale = 1;
let capMaterial = 3;

function cloneWhole(geometry: THREE.BufferGeometry) {
  const clone = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  clone.computeBoundingBox();
  clone.computeBoundingSphere();
  return clone;
}

function copyVertex(vertex: number, slot: number) {
  const s = vertex * STRIDE;
  const o = slot * STRIDE;
  for (let k = 0; k < STRIDE; k++) slots[o + k] = vertexData[s + k];
}

function positionLess(a: number, b: number) {
  const sa = a * STRIDE;
  const sb = b * STRIDE;
  if (vertexData[sa] !== vertexData[sb]) return vertexData[sa] < vertexData[sb];
  if (vertexData[sa + 1] !== vertexData[sb + 1]) return vertexData[sa + 1] < vertexData[sb + 1];
  return vertexData[sa + 2] < vertexData[sb + 2];
}

function intersectEdge(vertexA: number, vertexB: number, slot: number) {
  // Interpolate from the lexicographically smaller endpoint so both triangles sharing this edge
  // produce bit-identical cut points; the cap welds and the halves stay watertight.
  let a = vertexA;
  let b = vertexB;
  if (positionLess(b, a)) {
    a = vertexB;
    b = vertexA;
  }
  const da = distances[a];
  const t = da / (da - distances[b]);
  const sa = a * STRIDE;
  const sb = b * STRIDE;
  const o = slot * STRIDE;
  for (let k = 0; k < STRIDE; k++) {
    slots[o + k] = vertexData[sa + k] + (vertexData[sb + k] - vertexData[sa + k]) * t;
  }
  const length = Math.hypot(slots[o + 3], slots[o + 4], slots[o + 5]);
  if (length > 0) {
    slots[o + 3] /= length;
    slots[o + 4] /= length;
    slots[o + 5] /= length;
  }
}

// Rim points are welded on their exact float32 position, the precision the output is stored at.
// Cut points are already bit-identical across neighbours (see intersectEdge), so a distance tolerance
// would only merge genuinely distinct points that sit close together and tear a sliver out of the cap.
function weld(slot: number) {
  const o = slot * STRIDE;
  // + 0 folds -0 into +0 so both hash alike.
  weldFloats[0] = slots[o] + 0;
  weldFloats[1] = slots[o + 1] + 0;
  weldFloats[2] = slots[o + 2] + 0;
  const bx = weldBits[0];
  const by = weldBits[1];
  const bz = weldBits[2];
  const hash = Math.imul(bx, 73856093) ^ Math.imul(by, 19349663) ^ Math.imul(bz, 83492791);
  const head = weldCells.get(hash) ?? -1;
  for (let id = head; id !== -1; id = weldChain[id]) {
    if (pointBits[id * 3] === bx && pointBits[id * 3 + 1] === by && pointBits[id * 3 + 2] === bz)
      return id;
  }

  const id = pointCount++;
  pointU = growF64(pointU, pointCount);
  pointV = growF64(pointV, pointCount);
  pointXYZ = growF64(pointXYZ, pointCount * 3);
  pointBits = growU32(pointBits, pointCount * 3);
  weldChain = growI32(weldChain, pointCount);
  const x = weldFloats[0];
  const y = weldFloats[1];
  const z = weldFloats[2];
  const px = x - ox;
  const py = y - oy;
  const pz = z - oz;
  pointU[id] = px * ux + py * uy + pz * uz;
  pointV[id] = px * vx + py * vy + pz * vz;
  pointXYZ[id * 3] = x;
  pointXYZ[id * 3 + 1] = y;
  pointXYZ[id * 3 + 2] = z;
  pointBits[id * 3] = bx;
  pointBits[id * 3 + 1] = by;
  pointBits[id * 3 + 2] = bz;
  weldChain[id] = head;
  weldCells.set(hash, id);
  return id;
}

// Directed on-plane edges of the front half. Pairs cancel (a->b with b->a), so what is left is the
// open rim of the front half, which the cap must close. Coplanar faces and on-plane vertices fall out
// of this without special cases.
function addRimEdge(slotA: number, slotB: number) {
  addBoundaryEdge(weld(slotA), weld(slotB));
}

function addBoundaryEdge(a: number, b: number) {
  if (a === b) return;
  const reverse = b * EDGE_KEY + a;
  const reverseCount = boundaryEdges.get(reverse);
  if (reverseCount !== undefined) {
    if (reverseCount === 1) boundaryEdges.delete(reverse);
    else boundaryEdges.set(reverse, reverseCount - 1);
    return;
  }
  const key = a * EDGE_KEY + b;
  boundaryEdges.set(key, (boundaryEdges.get(key) ?? 0) + 1);
}

function vector(u: number, v: number) {
  let vec = vectorPool[vectorsUsed];
  if (!vec) {
    vec = new THREE.Vector2();
    vectorPool.push(vec);
  }
  vectorsUsed++;
  return vec.set(u, v);
}

function loopArea(start: number, length: number) {
  let area = 0;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const a = loopIds[start + j];
    const b = loopIds[start + i];
    area += pointU[a] * pointV[b] - pointU[b] * pointV[a];
  }
  return area * 0.5;
}

function loopContains(start: number, length: number, u: number, v: number) {
  let inside = false;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const a = loopIds[start + i];
    const b = loopIds[start + j];
    const va = pointV[a];
    const vb = pointV[b];
    if (va > v !== vb > v && u < ((pointU[b] - pointU[a]) * (v - va)) / (vb - va) + pointU[a]) {
      inside = !inside;
    }
  }
  return inside;
}

let capIds: number[] = [];
const splitStops: { t: number; id: number }[] = [];

function writeCapSlot(slot: number, id: number, sign: number) {
  const o = slot * STRIDE;
  capSlots[o] = pointXYZ[id * 3];
  capSlots[o + 1] = pointXYZ[id * 3 + 1];
  capSlots[o + 2] = pointXYZ[id * 3 + 2];
  capSlots[o + 3] = nx * sign;
  capSlots[o + 4] = ny * sign;
  capSlots[o + 5] = nz * sign;
  capSlots[o + 6] = pointU[id] * capScale + 0.5;
  capSlots[o + 7] = pointV[id] * capScale + 0.5;
}

function pushCap(a: number, b: number, c: number) {
  // A rim that touches itself (the plane grazing a hole) gives earcut the same point twice.
  if (a === b || b === c || c === a) return;
  capTriangles = growI32(capTriangles, capTriangleCount * 3 + 3);
  capTriangles[capTriangleCount * 3] = a;
  capTriangles[capTriangleCount * 3 + 1] = b;
  capTriangles[capTriangleCount * 3 + 2] = c;
  capTriangleCount++;
  writeCapSlot(0, a, -1);
  writeCapSlot(1, b, -1);
  writeCapSlot(2, c, -1);
  frontBuffer.push(capSlots, 0, 1, 2, capMaterial);
  writeCapSlot(0, a, 1);
  writeCapSlot(1, b, 1);
  writeCapSlot(2, c, 1);
  backBuffer.push(capSlots, 0, 2, 1, capMaterial);
}

function edgeKey(a: number, b: number) {
  return a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a;
}

// Earcut filters out exactly collinear points (face-parallel cuts leave one per side wall, and a hole
// bridge can line up with a hole edge), so a cap edge may run straight past rim points and leave a
// T-junction. Fan the triangle out to every rim point lying on such an edge.
function splitCapEdge(x: number, y: number, apex: number, depth: number) {
  if (boundaryEdges.has(y * EDGE_KEY + x) || capEdgeUse.get(edgeKey(x, y)) !== 1) return false;
  const ax = pointU[x];
  const ay = pointV[x];
  const dx = pointU[y] - ax;
  const dy = pointV[y] - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return false;
  const reach = tolerance * Math.sqrt(lengthSq);
  splitStops.length = 0;
  for (const id of capIds) {
    if (id === x || id === y) continue;
    const px = pointU[id] - ax;
    const py = pointV[id] - ay;
    const t = (px * dx + py * dy) / lengthSq;
    if (t <= 0 || t >= 1 || Math.abs(px * dy - py * dx) > reach) continue;
    // The apex on the edge means a zero-area sliver; fanning it would only stack more slivers.
    if (id === apex) return false;
    splitStops.push({ t, id });
  }
  if (splitStops.length === 0) return false;
  splitStops.sort((a, b) => a.t - b.t);
  const stops = splitStops.map((stop) => stop.id);
  let previous = x;
  for (const stop of stops) {
    if (stop === previous) continue;
    emitCap(previous, stop, apex, depth + 1);
    previous = stop;
  }
  emitCap(previous, y, apex, depth + 1);
  return true;
}

function emitCap(a: number, b: number, c: number, depth: number) {
  if (depth < MAX_CAP_SPLIT_DEPTH) {
    if (splitCapEdge(a, b, c, depth)) return;
    if (splitCapEdge(b, c, a, depth)) return;
    if (splitCapEdge(c, a, b, depth)) return;
  }
  pushCap(a, b, c);
}

function ringVectors(start: number, length: number) {
  const ring: THREE.Vector2[] = [];
  for (let i = 0; i < length; i++) {
    const id = loopIds[start + i];
    ring.push(vector(pointU[id], pointV[id]));
  }
  return ring;
}

function triangulateCap(
  outer: number,
  holes: number[],
  loopStarts: number[],
  loopLengths: number[],
) {
  const contour = ringVectors(loopStarts[outer], loopLengths[outer]);
  const holeRings = holes.map((hole) => ringVectors(loopStarts[hole], loopLengths[hole]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeRings);

  // triangulateShape may drop a duplicated closing point, so index from the rings as it left them.
  capIds = [];
  const appendRing = (start: number, length: number) => {
    for (let i = 0; i < length; i++) capIds.push(loopIds[start + i]);
  };
  appendRing(loopStarts[outer], contour.length);
  holes.forEach((hole, i) => appendRing(loopStarts[hole], holeRings[i].length));

  let area = 0;
  capEdgeUse.clear();
  for (const face of faces) {
    const a = capIds[face[0]];
    const b = capIds[face[1]];
    const c = capIds[face[2]];
    area +=
      (pointU[b] - pointU[a]) * (pointV[c] - pointV[a]) -
      (pointU[c] - pointU[a]) * (pointV[b] - pointV[a]);
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      capEdgeUse.set(key, (capEdgeUse.get(key) ?? 0) + 1);
    }
  }
  // The front cap faces -normal, i.e. clockwise in the plane's (u, v) frame.
  const flip = area > 0;
  for (const face of faces) {
    const a = capIds[face[0]];
    const b = capIds[face[1]];
    const c = capIds[face[2]];
    if (flip) emitCap(a, c, b, 0);
    else emitCap(a, b, c, 0);
  }
}

// Walks the directed edges left in boundaryEdges into closed loops of point ids in loopIds.
function traceLoops(loopStarts: number[], loopLengths: number[]) {
  let edgeCount = 0;
  boundaryEdges.forEach((count) => {
    edgeCount += count;
  });
  if (edgeCount < 3) return;

  edgeFrom = growI32(edgeFrom, edgeCount);
  edgeTo = growI32(edgeTo, edgeCount);
  edgeNext = growI32(edgeNext, edgeCount);
  edgeUsed = growI32(edgeUsed, edgeCount);
  edgeHead = growI32(edgeHead, pointCount);
  loopIds = growI32(loopIds, edgeCount + 1);
  edgeHead.fill(-1, 0, pointCount);

  let e = 0;
  boundaryEdges.forEach((count, key) => {
    const from = Math.floor(key / EDGE_KEY);
    const to = key - from * EDGE_KEY;
    for (let i = 0; i < count; i++, e++) {
      edgeFrom[e] = from;
      edgeTo[e] = to;
      edgeUsed[e] = 0;
      edgeNext[e] = edgeHead[from];
      edgeHead[from] = e;
    }
  });

  let written = 0;
  for (let first = 0; first < edgeCount; first++) {
    if (edgeUsed[first]) continue;
    edgeUsed[first] = 1;
    const start = edgeFrom[first];
    const loopStart = written;
    loopIds[written++] = start;
    let current = edgeTo[first];
    let closed = false;
    while (written - loopStart <= edgeCount) {
      if (current === start) {
        closed = true;
        break;
      }
      loopIds[written++] = current;
      let edge = edgeHead[current];
      while (edge !== -1 && edgeUsed[edge]) edge = edgeNext[edge];
      if (edge === -1) break;
      edgeUsed[edge] = 1;
      current = edgeTo[edge];
    }
    if (closed && written - loopStart >= 3) {
      loopStarts.push(loopStart);
      loopLengths.push(written - loopStart);
    } else {
      written = loopStart;
    }
  }
}

// Earcut still trips over rims that fold wider than epsilon or touch themselves (a piece sliced again
// almost along its earlier cap) and leaves a gap or an overshoot. The rim and cap edges left unpaired
// form closed loops around each one, and fanning a loop cancels it, so the halves stay watertight.
function closeCapGaps() {
  for (let t = 0; t < capTriangleCount; t++) {
    const a = capTriangles[t * 3];
    const b = capTriangles[t * 3 + 1];
    const c = capTriangles[t * 3 + 2];
    addBoundaryEdge(a, b);
    addBoundaryEdge(b, c);
    addBoundaryEdge(c, a);
  }
  if (boundaryEdges.size === 0) return;
  const loopStarts: number[] = [];
  const loopLengths: number[] = [];
  traceLoops(loopStarts, loopLengths);
  for (let l = 0; l < loopStarts.length; l++) {
    const start = loopStarts[l];
    const first = loopIds[start];
    for (let j = 1; j < loopLengths[l] - 1; j++) {
      pushCap(first, loopIds[start + j + 1], loopIds[start + j]);
    }
  }
}

// A rim that runs out along a line and straight back is a fold of zero width. Slicing a piece again
// through the slivers of its earlier cap leaves those, and earcut overshoots them, so zip each fold shut
// with a zero-area triangle before triangulating.
function pruneFolds(start: number, length: number) {
  let n = length;
  let i = 0;
  let unchanged = 0;
  while (n > 3 && unchanged < n) {
    const a = loopIds[start + ((i + n - 1) % n)];
    const b = loopIds[start + i];
    const c = loopIds[start + ((i + 1) % n)];
    const du1 = pointU[b] - pointU[a];
    const dv1 = pointV[b] - pointV[a];
    const du2 = pointU[c] - pointU[b];
    const dv2 = pointV[c] - pointV[b];
    const cross = du1 * dv2 - dv1 * du2;
    const longerSq = Math.max(du1 * du1 + dv1 * dv1, du2 * du2 + dv2 * dv2);
    if (du1 * du2 + dv1 * dv2 < 0 && cross * cross <= epsilon * epsilon * longerSq) {
      pushCap(c, b, a);
      loopIds.copyWithin(start + i, start + i + 1, start + n);
      n--;
      i = (i + n - 1) % n;
      unchanged = 0;
    } else {
      i = (i + 1) % n;
      unchanged++;
    }
  }
  return n;
}

function buildCaps() {
  const loopStarts: number[] = [];
  const loopLengths: number[] = [];
  traceLoops(loopStarts, loopLengths);
  for (let i = 0; i < loopStarts.length; i++) {
    loopLengths[i] = pruneFolds(loopStarts[i], loopLengths[i]);
  }

  // Rim loops run opposite to the front cap: counter-clockwise outlines, clockwise holes.
  const minArea = tolerance * tolerance;
  const outers: number[] = [];
  const outerAreas: number[] = [];
  const holes: number[] = [];
  for (let i = 0; i < loopStarts.length; i++) {
    const area = loopArea(loopStarts[i], loopLengths[i]);
    if (area > minArea) {
      outers.push(i);
      outerAreas.push(area);
    } else if (area < -minArea) {
      holes.push(i);
    }
  }

  const holesOf: number[][] = outers.map(() => []);
  for (const hole of holes) {
    let best = -1;
    for (let k = 0; k < loopLengths[hole] && best === -1; k++) {
      const id = loopIds[loopStarts[hole] + k];
      for (let o = 0; o < outers.length; o++) {
        const outer = outers[o];
        if (best !== -1 && outerAreas[o] >= outerAreas[best]) continue;
        if (loopContains(loopStarts[outer], loopLengths[outer], pointU[id], pointV[id])) best = o;
      }
    }
    if (best !== -1) holesOf[best].push(hole);
  }

  for (let o = 0; o < outers.length; o++) {
    triangulateCap(outers[o], holesOf[o], loopStarts, loopLengths);
  }
  closeCapGaps();
}

function buildGeometry(
  buffer: TriangleBuffer,
  maxMaterial: number,
  hasNormal: boolean,
  hasUv: boolean,
) {
  const count = buffer.count;
  if (count === 0) return null;

  const counts = new Int32Array(maxMaterial + 1);
  for (let t = 0; t < count; t++) counts[buffer.materials[t]]++;
  const cursor = new Int32Array(maxMaterial + 1);
  for (let m = 1; m <= maxMaterial; m++) cursor[m] = cursor[m - 1] + counts[m - 1];
  const starts = cursor.slice();

  const positions = new Float32Array(count * 9);
  const normals = hasNormal ? new Float32Array(count * 9) : null;
  const uvs = hasUv ? new Float32Array(count * 6) : null;
  const data = buffer.data;
  for (let t = 0; t < count; t++) {
    const target = cursor[buffer.materials[t]]++;
    for (let corner = 0; corner < 3; corner++) {
      const s = (t * 3 + corner) * STRIDE;
      const v = target * 3 + corner;
      positions[v * 3] = data[s];
      positions[v * 3 + 1] = data[s + 1];
      positions[v * 3 + 2] = data[s + 2];
      if (normals) {
        normals[v * 3] = data[s + 3];
        normals[v * 3 + 1] = data[s + 4];
        normals[v * 3 + 2] = data[s + 5];
      }
      if (uvs) {
        uvs[v * 2] = data[s + 6];
        uvs[v * 2 + 1] = data[s + 7];
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (normals) geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (uvs) geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  for (let m = 0; m <= maxMaterial; m++) {
    if (counts[m] > 0) geometry.addGroup(starts[m] * 3, counts[m] * 3, m);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function sliceGeometry(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  capMaterialIndex: number,
  capUvScale?: number,
): SliceResult {
  const position = geometry.getAttribute("position");
  const normal = geometry.hasAttribute("normal") ? geometry.getAttribute("normal") : null;
  const uv = geometry.hasAttribute("uv") ? geometry.getAttribute("uv") : null;
  const index = geometry.index;
  const vertexCount = position.count;
  const cornerCount = index ? index.count : vertexCount;
  const triangleCount = Math.floor(cornerCount / 3);
  if (triangleCount === 0) return { front: null, back: null };

  const normalLength = plane.normal.length() || 1;
  nx = plane.normal.x / normalLength;
  ny = plane.normal.y / normalLength;
  nz = plane.normal.z / normalLength;
  const constant = plane.constant / normalLength;

  vertexData = growF64(vertexData, vertexCount * STRIDE);
  distances = growF64(distances, vertexCount);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let v = 0; v < vertexCount; v++) {
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    const o = v * STRIDE;
    vertexData[o] = x;
    vertexData[o + 1] = y;
    vertexData[o + 2] = z;
    vertexData[o + 3] = normal ? normal.getX(v) : 0;
    vertexData[o + 4] = normal ? normal.getY(v) : 0;
    vertexData[o + 5] = normal ? normal.getZ(v) : 0;
    vertexData[o + 6] = uv ? uv.getX(v) : 0;
    vertexData[o + 7] = uv ? uv.getY(v) : 0;
    distances[v] = nx * x + ny * y + nz * z + constant;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const farthest = Math.max(-minX, -minY, -minZ, maxX, maxY, maxZ);
  const scale = Math.max(extent, farthest) || 1;
  epsilon = scale * 1e-6;
  tolerance = scale * 2e-7;
  capScale = capUvScale ?? (extent > 0 ? 1 / extent : 1);
  capMaterial = capMaterialIndex;

  let anyFront = false;
  let anyBack = false;
  for (let i = 0; i < triangleCount * 3; i++) {
    const d = distances[index ? index.getX(i) : i];
    if (d > epsilon) anyFront = true;
    else if (d < -epsilon) anyBack = true;
  }
  if (!anyBack) return { front: cloneWhole(geometry), back: null };
  if (!anyFront) return { front: null, back: cloneWhole(geometry) };

  triangleMaterials = growI32(triangleMaterials, triangleCount);
  triangleMaterials.fill(0, 0, triangleCount);
  let maxMaterial = Math.max(0, capMaterialIndex);
  for (const group of geometry.groups) {
    const material = group.materialIndex ?? 0;
    const end = Math.min(triangleCount, Math.floor((group.start + group.count) / 3));
    for (let t = Math.floor(group.start / 3); t < end; t++) triangleMaterials[t] = material;
    if (material > maxMaterial) maxMaterial = material;
  }

  const axisX = Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz);
  const axisY = !axisX && Math.abs(ny) <= Math.abs(nz);
  const ax = axisX ? 1 : 0;
  const ay = axisY ? 1 : 0;
  const az = axisX || axisY ? 0 : 1;
  const along = ax * nx + ay * ny + az * nz;
  ux = ax - nx * along;
  uy = ay - ny * along;
  uz = az - nz * along;
  const uLength = Math.hypot(ux, uy, uz);
  ux /= uLength;
  uy /= uLength;
  uz /= uLength;
  vx = ny * uz - nz * uy;
  vy = nz * ux - nx * uz;
  vz = nx * uy - ny * ux;
  ox = -nx * constant;
  oy = -ny * constant;
  oz = -nz * constant;

  frontBuffer.count = 0;
  backBuffer.count = 0;
  weldCells.clear();
  boundaryEdges.clear();
  pointCount = 0;
  capTriangleCount = 0;
  vectorsUsed = 0;

  const corners = [0, 0, 0];
  const sides = [0, 0, 0];
  for (let t = 0; t < triangleCount; t++) {
    let positive = 0;
    let negative = 0;
    for (let k = 0; k < 3; k++) {
      const vertex = index ? index.getX(t * 3 + k) : t * 3 + k;
      const d = distances[vertex];
      const side = d > epsilon ? 1 : d < -epsilon ? -1 : 0;
      corners[k] = vertex;
      sides[k] = side;
      if (side > 0) positive++;
      else if (side < 0) negative++;
      copyVertex(vertex, k);
    }
    const material = triangleMaterials[t];

    if (negative === 0 && positive === 0) {
      const e1x = slots[STRIDE] - slots[0];
      const e1y = slots[STRIDE + 1] - slots[1];
      const e1z = slots[STRIDE + 2] - slots[2];
      const e2x = slots[2 * STRIDE] - slots[0];
      const e2y = slots[2 * STRIDE + 1] - slots[1];
      const e2z = slots[2 * STRIDE + 2] - slots[2];
      const facing =
        (e1y * e2z - e1z * e2y) * nx + (e1z * e2x - e1x * e2z) * ny + (e1x * e2y - e1y * e2x) * nz;
      // A face lying in the plane with its outside towards +normal bounds the back half, and vice versa.
      if (facing >= 0) {
        backBuffer.push(slots, 0, 1, 2, material);
        continue;
      }
    }

    if (negative === 0) {
      frontBuffer.push(slots, 0, 1, 2, material);
      for (let k = 0; k < 3; k++) {
        const next = (k + 1) % 3;
        if (sides[k] === 0 && sides[next] === 0) addRimEdge(k, next);
      }
      continue;
    }
    if (positive === 0) {
      backBuffer.push(slots, 0, 1, 2, material);
      continue;
    }

    if (positive + negative === 2) {
      const z = sides[0] === 0 ? 0 : sides[1] === 0 ? 1 : 2;
      const a = (z + 1) % 3;
      const b = (z + 2) % 3;
      intersectEdge(corners[a], corners[b], 3);
      if (sides[a] > 0) {
        frontBuffer.push(slots, z, a, 3, material);
        backBuffer.push(slots, z, 3, b, material);
        addRimEdge(3, z);
      } else {
        frontBuffer.push(slots, z, 3, b, material);
        backBuffer.push(slots, z, a, 3, material);
        addRimEdge(z, 3);
      }
      continue;
    }

    const loneSide = positive === 1 ? 1 : -1;
    const lone = sides[0] === loneSide ? 0 : sides[1] === loneSide ? 1 : 2;
    const a = (lone + 1) % 3;
    const b = (lone + 2) % 3;
    intersectEdge(corners[lone], corners[a], 3);
    intersectEdge(corners[lone], corners[b], 4);
    const loneBuffer = loneSide > 0 ? frontBuffer : backBuffer;
    const pairBuffer = loneSide > 0 ? backBuffer : frontBuffer;
    loneBuffer.push(slots, lone, 3, 4, material);
    pairBuffer.push(slots, 3, a, b, material);
    pairBuffer.push(slots, 3, b, 4, material);
    if (loneSide > 0) addRimEdge(3, 4);
    else addRimEdge(4, 3);
  }

  buildCaps();

  const hasNormal = normal !== null;
  const hasUv = uv !== null;
  return {
    front: buildGeometry(frontBuffer, maxMaterial, hasNormal, hasUv),
    back: buildGeometry(backBuffer, maxMaterial, hasNormal, hasUv),
  };
}
