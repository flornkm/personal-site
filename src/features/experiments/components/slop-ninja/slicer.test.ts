import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { bevelBox, bevelCylinder, lathe, loft, mergeShells, placed, transformed } from "./geometry";
import { CAP, propGeometry } from "./items";
import { sliceGeometry } from "./slicer";

type Point = [number, number];

function ringArea(ring: Point[]) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

const toVectors = (ring: Point[]) => ring.map(([x, y]) => new THREE.Vector2(x, y));

// A flat slab is a two-ring loft: front cap 0 at +depth/2, back cap 1 (u mirrored), side band 2
// with v 0 at the front. A 1° crease keeps every edge hard, so stored normals match the faces.
function extrude(outline: Point[], depth: number) {
  const ring = toVectors(outline);
  return loft(
    [
      { outline: ring, z: depth / 2 },
      { outline: ring, z: -depth / 2 },
    ],
    [{ group: 2, uv: "wrap" }],
    { group: 0, uv: "outer" },
    { group: 1, uv: "outer" },
    1,
  );
}

// The production builders don't cut holes, so only the holed test slabs (rings, frames, the notched
// triangle) are extruded here, laid out like `extrude`: front 0, back 1, side 2, flat normals.
function holedSlab(outline: Point[], holes: Point[][], depth: number) {
  const orient = (ring: Point[], ccw: boolean) =>
    ringArea(ring) > 0 === ccw ? ring : [...ring].reverse();
  const loops = [orient(outline, true), ...holes.map((hole) => orient(hole, false))];
  const flat = loops.flat();
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const u = (x: number) => (x - minX) / (maxX - minX);
  const v = (y: number) => (y - minY) / (maxY - minY);
  const parts = [0, 1, 2].map(() => ({
    position: [] as number[],
    normal: [] as number[],
    uv: [] as number[],
  }));
  const corner = (group: number, [x, y]: Point, z: number, normal: number[], uv: Point) => {
    parts[group].position.push(x, y, z);
    parts[group].normal.push(...normal);
    parts[group].uv.push(...uv);
  };
  const top = depth / 2;

  const faces = THREE.ShapeUtils.triangulateShape(
    toVectors(loops[0]),
    loops.slice(1).map(toVectors),
  );
  let area = 0;
  for (const [a, b, c] of faces) area += ringArea([flat[a], flat[b], flat[c]]);
  for (const face of faces) {
    const [a, b, c] = area > 0 ? face : [face[0], face[2], face[1]];
    for (const i of [a, b, c]) corner(0, flat[i], top, [0, 0, 1], [u(flat[i][0]), v(flat[i][1])]);
    for (const i of [a, c, b])
      corner(1, flat[i], -top, [0, 0, -1], [1 - u(flat[i][0]), v(flat[i][1])]);
  }

  for (const loop of loops) {
    const next = (i: number) => loop[(i + 1) % loop.length];
    const edge = (p: Point, i: number) => Math.hypot(next(i)[0] - p[0], next(i)[1] - p[1]);
    const perimeter = loop.reduce((sum, p, i) => sum + edge(p, i), 0);
    let run = 0;
    loop.forEach((p, i) => {
      const q = next(i);
      const length = edge(p, i);
      const normal = [(q[1] - p[1]) / length, (p[0] - q[0]) / length, 0];
      const [u0, u1] = [run / perimeter, (run + length) / perimeter];
      run += length;
      corner(2, p, top, normal, [u0, 0]);
      corner(2, p, -top, normal, [u0, 1]);
      corner(2, q, -top, normal, [u1, 1]);
      corner(2, p, top, normal, [u0, 0]);
      corner(2, q, -top, normal, [u1, 1]);
      corner(2, q, top, normal, [u1, 0]);
    });
  }

  const geometry = new THREE.BufferGeometry();
  let start = 0;
  parts.forEach((part, group) => {
    geometry.addGroup(start, part.position.length / 3, group);
    start += part.position.length / 3;
  });
  for (const [name, size] of [
    ["position", 3],
    ["normal", 3],
    ["uv", 2],
  ] as const) {
    const values = parts.flatMap((part) => part[name]);
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function slabBounds(geometry: THREE.BufferGeometry) {
  const { min, max } = geometry.boundingBox!;
  return {
    minX: min.x,
    maxX: max.x,
    minY: min.y,
    maxY: max.y,
    minZ: min.z,
    maxZ: max.z,
    depth: max.z - min.z,
  };
}

function circle(radius: number, segments: number, cx = 0, cy = 0): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
  });
}

function roundedRect(width: number, height: number, radius: number, segments: number): Point[] {
  const points: Point[] = [];
  const corners: Point[] = [
    [width / 2 - radius, height / 2 - radius],
    [-width / 2 + radius, height / 2 - radius],
    [-width / 2 + radius, -height / 2 + radius],
    [width / 2 - radius, -height / 2 + radius],
  ];
  corners.forEach(([cx, cy], corner) => {
    for (let i = 0; i <= segments; i++) {
      const a = ((corner + i / segments) * Math.PI) / 2;
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
  });
  return points;
}

function star(points: number, outer: number, inner: number): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

const box = () =>
  extrude(
    [
      [-1, -0.6],
      [1, -0.6],
      [1, 0.6],
      [-1, 0.6],
    ],
    0.3,
  );
// Extra outline points on x = 0 so axis-aligned cuts pass exactly through vertices.
const splitBox = () =>
  extrude(
    [
      [-1, -0.6],
      [0, -0.6],
      [1, -0.6],
      [1, 0.6],
      [0, 0.6],
      [-1, 0.6],
    ],
    0.3,
  );
// Dyadic coordinates make the face-parallel cut points (wall ends + diagonal midpoints) exactly
// collinear. This rim makes earcut give up on ears and filter collinear points out of the cap.
const notchedTriangle = () =>
  holedSlab(
    [
      [1.5, 0],
      [-0.5, 1],
      [-1, -1.5],
    ],
    [
      [
        [-0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
        [0.25, -0.25],
      ],
    ],
    0.25,
  );
const frame = () =>
  holedSlab(
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    [
      [
        [-0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
        [0.4, -0.4],
      ],
    ],
    0.2,
  );
const rounded = () => extrude(roundedRect(1.6, 1, 0.2, 12), 0.12);
const fourStar = () => extrude(star(4, 1, 0.32), 0.2);
const vinyl = () => holedSlab(circle(1, 24), [circle(0.16, 12)], 0.05);

const shapes: [string, () => THREE.BufferGeometry][] = [
  ["box", box],
  ["rounded rect", rounded],
  ["4-point star", fourStar],
  ["vinyl ring", vinyl],
];

function positionsOf(geometry: THREE.BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  return flat.getAttribute("position").array as Float32Array;
}

function signedVolume(geometry: THREE.BufferGeometry, origin = new THREE.Vector3()) {
  const p = positionsOf(geometry);
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(p.subarray(i, i + 9)).map(
      (value, k) => value - origin.getComponent(k % 3),
    );
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

// A closed surface has the same signed volume from any origin. Measured from a point on the plane the
// cap spans zero volume, so a cap with gaps, overlaps or flipped triangles shows up as a difference.
// Keep `distance` near the mesh size: from far away the triangle terms dwarf a tiny mesh's volume.
function capCoverageError(half: THREE.BufferGeometry, plane: THREE.Plane, distance = 3) {
  const onPlane = plane.coplanarPoint(new THREE.Vector3());
  const offPlane = onPlane.clone().addScaledVector(plane.normal, distance);
  return Math.abs(signedVolume(half, offPlane) - signedVolume(half, onPlane));
}

function triangleNormal(p: ArrayLike<number>, i: number) {
  const e1 = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
  const e2 = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
  return [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
}

function groupOf(geometry: THREE.BufferGeometry, vertex: number) {
  const group = geometry.groups.find((g) => vertex >= g.start && vertex < g.start + g.count);
  return group?.materialIndex ?? -1;
}

function areaByMaterial(geometry: THREE.BufferGeometry | null) {
  const areas = new Map<number, number>();
  if (!geometry) return areas;
  const p = positionsOf(geometry);
  for (let i = 0; i < p.length; i += 9) {
    const material = groupOf(geometry, i / 3);
    areas.set(material, (areas.get(material) ?? 0) + Math.hypot(...triangleNormal(p, i)) / 2);
  }
  return areas;
}

// Every directed edge must be matched by exactly one opposite edge: closed and consistently wound.
function watertightIssues(geometry: THREE.BufferGeometry) {
  const p = positionsOf(geometry);
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const key = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let value = ids.get(key);
    if (value === undefined) {
      value = ids.size;
      ids.set(key, value);
    }
    return value;
  };
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let i = 0; i < p.length; i += 9) {
    const tri = [id(i), id(i + 3), id(i + 6)];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[2] === tri[0]) {
      degenerate++;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const key = `${tri[k]}>${tri[(k + 1) % 3]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let unmatched = 0;
  let duplicated = 0;
  for (const [key, count] of edges) {
    if (count > 1) duplicated++;
    const [a, b] = key.split(">");
    if (edges.get(`${b}>${a}`) !== count) unmatched++;
  }
  return { degenerate, unmatched, duplicated };
}

function hasNaN(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return false;
  return ["position", "normal", "uv"].some((name) =>
    Array.from(geometry.getAttribute(name).array).some((value) => !Number.isFinite(value)),
  );
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlanes(geometry: THREE.BufferGeometry, count: number, seed: number) {
  const random = mulberry32(seed);
  const { minX, maxX, minY, maxY, minZ, maxZ } = slabBounds(geometry);
  return Array.from({ length: count }, (_, i) => {
    const normal = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    // A share of near-face-parallel cuts: in game the slab tumbles, so the blade can skim along it.
    if (i % 10 === 0) normal.set(random() * 0.1, random() * 0.1, 1);
    normal.normalize();
    const point = new THREE.Vector3(
      THREE.MathUtils.lerp(minX, maxX, 0.1 + random() * 0.8),
      THREE.MathUtils.lerp(minY, maxY, 0.1 + random() * 0.8),
      THREE.MathUtils.lerp(minZ, maxZ, 0.1 + random() * 0.8),
    );
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  });
}

function eachRandomSlice(
  run: (args: {
    name: string;
    geometry: THREE.BufferGeometry;
    plane: THREE.Plane;
    front: THREE.BufferGeometry | null;
    back: THREE.BufferGeometry | null;
  }) => void,
) {
  shapes.forEach(([name, make], s) => {
    const geometry = make();
    for (const plane of randomPlanes(geometry, 250, 1234 + s)) {
      const { front, back } = sliceGeometry(geometry, plane, CAP);
      run({ name, geometry, plane, front, back });
    }
  });
}

function expectSound(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  front: THREE.BufferGeometry | null,
  back: THREE.BufferGeometry | null,
) {
  const original = signedVolume(geometry);
  const halves = (front ? signedVolume(front) : 0) + (back ? signedVolume(back) : 0);
  expect(Math.abs(halves - original) / original).toBeLessThan(1e-5);
  for (const half of [front, back]) {
    if (!half) continue;
    expect(signedVolume(half)).toBeGreaterThan(0);
    expect(capCoverageError(half, plane) / original).toBeLessThan(1e-5);
    expect(hasNaN(half)).toBe(false);
    expect(watertightIssues(half)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
  }
}

describe("sliceGeometry", () => {
  test("test slabs are closed and positive before slicing", () => {
    const more: [string, () => THREE.BufferGeometry][] = [
      ["split box", splitBox],
      ["notched triangle", notchedTriangle],
      ["square frame", frame],
    ];
    for (const [name, make] of [...shapes, ...more]) {
      const geometry = make();
      labelled(name, () => {
        expect(signedVolume(geometry)).toBeGreaterThan(0);
        expect(watertightIssues(geometry)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
      });
    }
  });

  test("front + back volume equals the original at random planes", () => {
    let cuts = 0;
    eachRandomSlice(({ geometry, plane, front, back }) => {
      const original = signedVolume(geometry);
      const frontVolume = front ? signedVolume(front) : 0;
      const backVolume = back ? signedVolume(back) : 0;
      expect(frontVolume).toBeGreaterThanOrEqual(0);
      expect(backVolume).toBeGreaterThanOrEqual(0);
      expect(Math.abs(frontVolume + backVolume - original) / original).toBeLessThan(1e-5);
      for (const half of [front, back]) {
        if (half) expect(capCoverageError(half, plane) / original).toBeLessThan(1e-5);
      }
      if (front && back) cuts++;
    });
    expect(cuts).toBeGreaterThan(900);
  });

  test("matches the analytic split of a box", () => {
    const geometry = box();
    const { front, back } = sliceGeometry(
      geometry,
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.3),
      CAP,
    );
    expect(signedVolume(front!)).toBeCloseTo(0.7 * 1.2 * 0.3, 6);
    expect(signedVolume(back!)).toBeCloseTo(1.3 * 1.2 * 0.3, 6);
    expect(areaByMaterial(front).get(CAP)).toBeCloseTo(1.2 * 0.3, 6);
  });

  test("each half is watertight with consistent winding", () => {
    eachRandomSlice(({ front, back }) => {
      for (const half of [front, back]) {
        if (half)
          expect(watertightIssues(half)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
      }
    });
  });

  test("cap normals face out of each half and winding agrees with stored normals", () => {
    eachRandomSlice(({ plane, front, back }) => {
      for (const [half, sign] of [
        [front, -1],
        [back, 1],
      ] as const) {
        if (!half) continue;
        const p = positionsOf(half);
        const n = half.getAttribute("normal").array;
        for (let i = 0; i < p.length; i += 9) {
          const geometric = triangleNormal(p, i);
          const length = Math.hypot(...geometric);
          // Earcut keeps float-collinear rim triplets as zero-area ears; their normals are noise.
          if (length < 1e-5) continue;
          const stored = [n[i], n[i + 1], n[i + 2]];
          const agreement =
            (geometric[0] * stored[0] + geometric[1] * stored[1] + geometric[2] * stored[2]) /
            length;
          expect(agreement).toBeGreaterThan(0.99);
          if (groupOf(half, i / 3) !== CAP) continue;
          for (let k = 0; k < 3; k++) {
            expect(
              n[i + k * 3] * plane.normal.x +
                n[i + k * 3 + 1] * plane.normal.y +
                n[i + k * 3 + 2] * plane.normal.z,
            ).toBeCloseTo(sign, 6);
            const corner = new THREE.Vector3(p[i + k * 3], p[i + k * 3 + 1], p[i + k * 3 + 2]);
            expect(Math.abs(plane.distanceToPoint(corner))).toBeLessThan(1e-5);
          }
        }
        // The half sits on the side opposite its cap normal.
        let side = 0;
        for (let i = 0; i < p.length; i += 3) {
          side += plane.distanceToPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
        }
        expect(Math.sign(side)).toBe(-sign);
      }
    });
  });

  test("material groups are preserved, contiguous and the cap is appended", () => {
    eachRandomSlice(({ geometry, front, back }) => {
      for (const half of [front, back]) {
        if (!half) continue;
        let cursor = 0;
        let previous = -1;
        for (const group of half.groups) {
          expect(group.start).toBe(cursor);
          expect(group.count % 3).toBe(0);
          expect(group.materialIndex!).toBeGreaterThan(previous);
          expect([0, 1, 2, CAP]).toContain(group.materialIndex!);
          previous = group.materialIndex!;
          cursor += group.count;
        }
        expect(cursor).toBe(half.getAttribute("position").count);
      }
      const original = areaByMaterial(geometry);
      const frontAreas = areaByMaterial(front);
      const backAreas = areaByMaterial(back);
      for (const material of [0, 1, 2]) {
        const sum = (frontAreas.get(material) ?? 0) + (backAreas.get(material) ?? 0);
        expect(Math.abs(sum - original.get(material)!) / original.get(material)!).toBeLessThan(
          1e-5,
        );
      }
      if (front && back) {
        const frontCap = frontAreas.get(CAP)!;
        expect(frontCap).toBeGreaterThan(0);
        expect(frontCap).toBeCloseTo(backAreas.get(CAP)!, 6);
      }
    });
  });

  test("interpolates uv along cuts and maps caps around the centre", () => {
    eachRandomSlice(({ geometry, front, back }) => {
      const { minX, maxX, minY, maxY, depth } = slabBounds(geometry);
      for (const half of [front, back]) {
        if (!half) continue;
        const p = positionsOf(half);
        const uv = half.getAttribute("uv").array;
        for (let v = 0; v < p.length / 3; v++) {
          const [x, y, z] = [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
          const [u, w] = [uv[v * 2], uv[v * 2 + 1]];
          const material = groupOf(half, v);
          if (material === 0) {
            expect(u).toBeCloseTo((x - minX) / (maxX - minX), 4);
            expect(w).toBeCloseTo((y - minY) / (maxY - minY), 4);
          } else if (material === 1) {
            expect(u).toBeCloseTo((maxX - x) / (maxX - minX), 4);
          } else if (material === 2) {
            expect(w).toBeCloseTo(0.5 - z / depth, 4);
          } else {
            expect(u).toBeGreaterThan(-0.5);
            expect(u).toBeLessThan(1.5);
            expect(w).toBeGreaterThan(-0.5);
            expect(w).toBeLessThan(1.5);
          }
        }
      }
    });
  });

  test("a plane missing the mesh returns a clone and null", () => {
    const geometry = rounded();
    const count = geometry.getAttribute("position").count;
    const above = sliceGeometry(geometry, new THREE.Plane(new THREE.Vector3(0, 0, 1), -10), CAP);
    expect(above.front).toBeNull();
    expect(above.back).not.toBe(geometry);
    expect(above.back!.getAttribute("position").count).toBe(count);
    expect(above.back!.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2]);
    expect(above.back!.boundingSphere).not.toBeNull();

    const below = sliceGeometry(geometry, new THREE.Plane(new THREE.Vector3(0, 0, 1), 10), CAP);
    expect(below.back).toBeNull();
    expect(below.front!.getAttribute("position").count).toBe(count);

    const touchingFace = sliceGeometry(
      geometry,
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.06),
      CAP,
    );
    expect(touchingFace.front).toBeNull();
    expect(touchingFace.back!.getAttribute("position").count).toBe(count);
  });

  test("planes through vertices and along faces stay finite and closed", () => {
    const cases: [string, THREE.BufferGeometry, THREE.Plane][] = [
      ["through split-box vertices", splitBox(), new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
      [
        "box diagonal through vertical edges",
        box(),
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3(-1.2, 2, 0).normalize(),
          new THREE.Vector3(),
        ),
      ],
      ["box mid-plane parallel to faces", box(), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)],
      [
        "vinyl mid-plane (cap with a hole)",
        vinyl(),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      ],
      ["vinyl through its centre", vinyl(), new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
      ["star through two tips", fourStar(), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)],
      [
        "star along an edge of the box diagonal",
        fourStar(),
        new THREE.Plane(new THREE.Vector3(1, -1, 0).normalize(), 0),
      ],
      ["rounded rect mid-plane", rounded(), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)],
      [
        "square frame mid-plane (collinear rim + hole)",
        frame(),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      ],
      [
        "holed triangle mid-plane (earcut drops rim points)",
        notchedTriangle(),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      ],
      [
        "square frame through hole edges",
        frame(),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.4),
      ],
      ["box face plane", box(), new THREE.Plane(new THREE.Vector3(1, 0, 0), -1)],
      [
        "box bottom-edge plane",
        box(),
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 1).normalize(),
          new THREE.Vector3(0, -0.6, -0.15),
        ),
      ],
    ];
    // A star side wall extended cuts the opposite arms: the plane contains a whole face.
    const starPoints = star(4, 1, 0.32);
    const [tx, ty] = starPoints[0];
    const [ix, iy] = starPoints[1];
    cases.push([
      "star plane containing a side wall",
      fourStar(),
      new THREE.Plane().setFromCoplanarPoints(
        new THREE.Vector3(tx, ty, 0),
        new THREE.Vector3(ix, iy, 0),
        new THREE.Vector3(tx, ty, 1),
      ),
    ]);

    for (const [name, geometry, plane] of cases) {
      const { front, back } = sliceGeometry(geometry, plane, CAP);
      try {
        expect(front !== null || back !== null).toBe(true);
        expect(hasNaN(front) || hasNaN(back)).toBe(false);
        expectSound(geometry, plane, front, back);
      } catch (error) {
        throw new Error(`${name}: ${String(error)}`);
      }
    }

    const ring = sliceGeometry(vinyl(), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), CAP);
    const ringArea = ringAreaOf(circle(1, 24)) - ringAreaOf(circle(0.16, 12));
    expect(areaByMaterial(ring.front).get(CAP)).toBeCloseTo(ringArea, 6);

    const faceParallel = sliceGeometry(box(), new THREE.Plane(new THREE.Vector3(1, 0, 0), -1), CAP);
    expect(faceParallel.front).toBeNull();
  });

  test("planes through, along or a hair off mesh vertices stay closed", () => {
    shapes.forEach(([name, make], s) => {
      const geometry = make();
      const p = positionsOf(geometry);
      const vertexAt = (i: number) => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const random = mulberry32(77 + s);
      const pick = () => vertexAt(Math.floor(random() * (p.length / 3)));
      for (let i = 0; i < 300; i++) {
        const normal = new THREE.Vector3(
          random() - 0.5,
          random() - 0.5,
          random() - 0.5,
        ).normalize();
        const through = pick();
        let plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through);
        if (i % 3 === 1) {
          const other = pick();
          const tilt = through.clone().add(normal);
          if (other.distanceTo(through) > 1e-3) {
            plane = new THREE.Plane().setFromCoplanarPoints(through, other, tilt);
          }
        } else if (i % 3 === 2) {
          const offset = 10 ** (-4 - random() * 4) * (random() < 0.5 ? -1 : 1);
          plane.constant -= offset;
        }
        if (!Number.isFinite(plane.constant) || plane.normal.lengthSq() < 0.5) continue;
        const { front, back } = sliceGeometry(geometry, plane, CAP);
        const original = signedVolume(geometry);
        const halves = (front ? signedVolume(front) : 0) + (back ? signedVolume(back) : 0);
        try {
          expect(Math.abs(halves - original) / original).toBeLessThan(1e-5);
          for (const half of [front, back]) {
            if (!half) continue;
            expect(hasNaN(half)).toBe(false);
            expect(capCoverageError(half, plane) / original).toBeLessThan(1e-5);
            // Grazing a hole pinches a half to zero thickness along an edge (a legit non-manifold
            // edge), and a cut a hair off a vertex can round to a zero-area sliver in float32.
            expect(watertightIssues(half).unmatched).toBe(0);
          }
        } catch (error) {
          throw new Error(`${name} #${i}: ${String(error)}`);
        }
      }
    });
  });

  test("handles indexed input and re-slicing a half", () => {
    const indexed = new THREE.BoxGeometry(1, 0.7, 0.4, 2, 2, 1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0.3, 1, 0.2).normalize(),
      new THREE.Vector3(0.1, 0, 0),
    );
    const { front, back } = sliceGeometry(indexed, plane, 6);
    expect(front!.index).toBeNull();
    expectSound(indexed, plane, front, back);
    expect(front!.groups.at(-1)!.materialIndex).toBe(6);

    const slab = vinyl();
    const first = sliceGeometry(
      slab,
      new THREE.Plane(new THREE.Vector3(1, 0.2, 0.1).normalize(), 0.05),
      CAP,
    );
    const secondPlane = new THREE.Plane(new THREE.Vector3(0.1, 1, -0.2).normalize(), -0.1);
    const second = sliceGeometry(first.back!, secondPlane, CAP);
    expectSound(first.back!, secondPlane, second.front, second.back);
    for (const half of [second.front!, second.back!]) {
      expect(half.groups.filter((g) => g.materialIndex === CAP)).toHaveLength(1);
    }
  });

  test("slices a ~200 triangle slab fast enough for several cuts per frame", () => {
    const geometry = rounded();
    const triangles = geometry.getAttribute("position").count / 3;
    expect(triangles).toBeGreaterThanOrEqual(190);
    const planes = randomPlanes(geometry, 400, 99);
    for (const plane of planes.slice(0, 50)) sliceGeometry(geometry, plane, CAP);
    // Best batch, so other work on the machine and GC pauses don't make this flaky.
    const batches = Array.from({ length: 8 }, (_, b) => {
      const batch = planes.slice(b * 50, b * 50 + 50);
      const start = performance.now();
      for (const plane of batch) sliceGeometry(geometry, plane, CAP);
      return (performance.now() - start) / batch.length;
    }).sort((a, b) => a - b);
    const best = batches[0];
    const median = batches[4];
    console.log(
      `slice ${triangles} tris: ${(best * 1000).toFixed(1)} µs best, ${(median * 1000).toFixed(1)} µs median`,
    );
    expect(best).toBeLessThan(0.5);
  });
});

function ringAreaOf(ring: Point[]) {
  return Math.abs(ringArea(ring));
}

type Shape = (scale?: number) => THREE.BufferGeometry;

const scaled = (points: Point[], scale: number) =>
  points.map(([x, y]): Point => [x * scale, y * scale]);

const paperSlab: Shape = (s = 1) => extrude(scaled(roundedRect(1, 1.3, 0.03, 3), s), 0.04 * s);
const paperSheet: Shape = (s = 1) =>
  extrude(
    scaled(
      [
        [-0.5, -0.65],
        [0.5, -0.65],
        [0.5, 0.65],
        [-0.5, 0.65],
      ],
      s,
    ),
    0.04 * s,
  );
const holedDisc: Shape = (s = 1) =>
  holedSlab(scaled(circle(1, 24), s), [scaled(circle(0.2, 8), s)], 0.06 * s);
const ring: Shape = (s = 1) =>
  holedSlab(scaled(circle(1, 24), s), [scaled(circle(0.16, 12), s)], 0.05 * s);
const eightStar: Shape = (s = 1) => extrude(scaled(star(8, 1, 0.45), s), 0.15 * s);
const roundedCard: Shape = (s = 1) => extrude(scaled(roundedRect(1.6, 1, 0.2, 12), s), 0.12 * s);

const adversarialShapes: [string, Shape][] = [
  ["paper slab", paperSlab],
  ["paper sheet", paperSheet],
  ["24/8 holed disc", holedDisc],
  ["24/12 ring", ring],
  ["8-point star", eightStar],
  ["rounded card", roundedCard],
];

function randomUnit(random: () => number) {
  return new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
}

function labelled(label: string, run: () => void) {
  try {
    run();
  } catch (error) {
    throw new Error(`${label}: ${String(error)}`);
  }
}

interface ClosedOptions {
  cap?: number;
  scale?: number;
  // A plane through a vertex can pinch a half to zero thickness along an edge, and cutting the
  // zero-area slivers of an earlier cap can leave sliver edges shared by four triangles. Both are
  // non-manifold but still closed.
  allowPinch?: boolean;
  checkWinding?: boolean;
}

function expectClosed(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  front: THREE.BufferGeometry | null,
  back: THREE.BufferGeometry | null,
  { cap = CAP, scale = 1, allowPinch = false, checkWinding = true }: ClosedOptions = {},
) {
  expect(front !== null || back !== null).toBe(true);
  const original = signedVolume(geometry);
  const halves = (front ? signedVolume(front) : 0) + (back ? signedVolume(back) : 0);
  expect(Math.abs(halves - original) / original).toBeLessThan(1e-5);
  for (const [half, sign] of [
    [front, -1],
    [back, 1],
  ] as const) {
    if (!half) continue;
    expect(signedVolume(half)).toBeGreaterThan(0);
    expect(hasNaN(half)).toBe(false);
    expect(capCoverageError(half, plane, 3 * scale) / original).toBeLessThan(1e-5);
    const issues = watertightIssues(half);
    expect(issues.unmatched).toBe(0);
    expect(issues.degenerate).toBe(0);
    if (!allowPinch) expect(issues.duplicated).toBe(0);
    const p = positionsOf(half);
    const n = half.getAttribute("normal").array;
    for (let i = 0; i < p.length; i += 9) {
      if (groupOf(half, i / 3) === cap) {
        for (let j = i; j < i + 9; j += 3) {
          const facing =
            n[j] * plane.normal.x + n[j + 1] * plane.normal.y + n[j + 2] * plane.normal.z;
          expect(facing).toBeCloseTo(sign, 6);
          const corner = new THREE.Vector3(p[j], p[j + 1], p[j + 2]);
          expect(Math.abs(plane.distanceToPoint(corner))).toBeLessThan(1e-5 * scale);
        }
      }
      if (!checkWinding) continue;
      const geometric = triangleNormal(p, i);
      const length = Math.hypot(...geometric);
      if (length < 1e-5 * scale * scale) continue;
      const agreement =
        (geometric[0] * n[i] + geometric[1] * n[i + 1] + geometric[2] * n[i + 2]) / length;
      expect(agreement).toBeGreaterThan(0.99);
    }
  }
}

// Distance from the centre to a regular polygon's outline (first vertex on +x) along `angle`.
function polygonReach(radius: number, segments: number, angle: number) {
  const step = (Math.PI * 2) / segments;
  const local = ((angle % step) + step) % step;
  return (radius * Math.cos(step / 2)) / Math.cos(local - step / 2);
}

describe("sliceGeometry under adversarial cuts", () => {
  test("adversarial slabs are closed and positive at every scale", () => {
    for (const scale of [1e-4, 1, 1e4]) {
      for (const [name, make] of adversarialShapes) {
        const geometry = make(scale);
        labelled(`${name} x${scale}`, () => {
          expect(signedVolume(geometry)).toBeGreaterThan(0);
          expect(watertightIssues(geometry)).toEqual({
            degenerate: 0,
            unmatched: 0,
            duplicated: 0,
          });
        });
      }
    }
  });

  test("grazing cuts through a 0.04-thick paper slab stay closed", () => {
    for (const [name, make] of [
      ["paper slab", paperSlab],
      ["paper sheet", paperSheet],
    ] as const) {
      const geometry = make();
      const random = mulberry32(5);
      for (const theta of [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.03, 0.1]) {
        for (let k = 0; k < 21; k++) {
          const phi = random() * Math.PI * 2;
          const normal = new THREE.Vector3(
            Math.sin(theta) * Math.cos(phi),
            Math.sin(theta) * Math.sin(phi),
            Math.cos(theta),
          );
          // On a face, a hair inside one, or anywhere through the thickness.
          const z = [0.02, -0.02, 0.0199999, -0.0199999, 0.019, 0, (random() - 0.5) * 0.04][k % 7];
          const point = new THREE.Vector3((random() - 0.5) * 0.8, (random() - 0.5) * 1.1, z);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
          const { front, back } = sliceGeometry(geometry, plane, CAP);
          labelled(`${name} theta=${theta} z=${z}`, () =>
            expectClosed(geometry, plane, front, back),
          );
        }
      }
    }

    const sheet = paperSheet();
    for (const theta of [0.01, 0.1]) {
      const plane = new THREE.Plane(new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta)), 0);
      const { front, back } = sliceGeometry(sheet, plane, CAP);
      // A shallow tilt stays inside the slab and runs out through the side walls; a steeper one
      // leaves through both faces and caps a strip.
      const expected =
        Math.tan(theta) * 0.5 < 0.02 ? 1.3 / Math.cos(theta) : (1.3 * 0.04) / Math.sin(theta);
      expect(areaByMaterial(front).get(CAP)).toBeCloseTo(expected, 5);
      const [frontVolume, backVolume] = [signedVolume(front!), signedVolume(back!)];
      expect(Math.abs(frontVolume - backVolume) / (frontVolume + backVolume)).toBeLessThan(1e-6);
    }
  });

  test("planes through the exact centre of a ring hole halve it", () => {
    for (const [name, make, holeRadius, holeSegments] of [
      ["24/12 ring", ring, 0.16, 12],
      ["24/8 holed disc", holedDisc, 0.2, 8],
    ] as const) {
      const geometry = make();
      const volume = signedVolume(geometry);
      for (let k = 0; k < 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        for (const tilt of [0, 1e-6, 0.3, 1.2, Math.PI / 2 - 1e-6]) {
          const normal = new THREE.Vector3(
            Math.cos(a) * Math.cos(tilt),
            Math.sin(a) * Math.cos(tilt),
            Math.sin(tilt),
          );
          const plane = new THREE.Plane(normal, 0);
          const { front, back } = sliceGeometry(geometry, plane, CAP);
          labelled(`${name} angle ${k}/96 tilt ${tilt}`, () => {
            expectClosed(geometry, plane, front, back);
            // Both outlines are point-symmetric, so any plane through the centre halves the volume.
            expect(Math.abs(signedVolume(front!) - signedVolume(back!)) / volume).toBeLessThan(
              1e-5,
            );
            if (tilt !== 0) return;
            const along = a + Math.PI / 2;
            const chord =
              2 * (polygonReach(1, 24, along) - polygonReach(holeRadius, holeSegments, along));
            expect(areaByMaterial(front).get(CAP)).toBeCloseTo(
              chord * slabBounds(geometry).depth,
              5,
            );
          });
        }
      }
    }
  });

  test("planes containing a side wall, a face, or the float32 corners of one stay closed", () => {
    let planes = 0;
    for (const [name, make] of adversarialShapes) {
      const geometry = make();
      const p = positionsOf(geometry);
      const n = geometry.getAttribute("normal").array;
      const seen = new Set<string>();
      for (let i = 0; i < p.length; i += 9) {
        const corners = [0, 3, 6].map(
          (k) => new THREE.Vector3(p[i + k], p[i + k + 1], p[i + k + 2]),
        );
        const wall = new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3(n[i], n[i + 1], n[i + 2]),
          corners[0],
        );
        const key = [...wall.normal.toArray(), wall.constant].map((v) => v.toFixed(5)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        const variants = [
          wall,
          wall.clone().negate(),
          new THREE.Plane().setFromCoplanarPoints(corners[0], corners[1], corners[2]),
        ];
        for (const plane of variants) {
          const { front, back } = sliceGeometry(geometry, plane, CAP);
          labelled(`${name} triangle ${i / 9}`, () => expectClosed(geometry, plane, front, back));
          planes++;
        }
      }
    }
    expect(planes).toBeGreaterThan(500);
  });

  test("planes a hair off mesh vertices leave no rounding slivers and stay closed", () => {
    const offsets = [0, 1e-7, -1e-7, 5e-7, -5e-7, 1e-6, -1e-6, 1.5e-6, -1.5e-6, 3e-6, -3e-6, 1e-5];
    adversarialShapes.forEach(([name, make], s) => {
      const geometry = make();
      const p = positionsOf(geometry);
      const random = mulberry32(11 + s);
      for (let i = 0; i < 60; i++) {
        const v = Math.floor(random() * (p.length / 3));
        const vertex = new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        const normal = randomUnit(random);
        if (i % 4 === 0) normal.setZ(0).normalize();
        for (const offset of offsets) {
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, vertex);
          plane.constant -= offset;
          const { front, back } = sliceGeometry(geometry, plane, CAP);
          labelled(`${name} vertex ${v} offset ${offset}`, () =>
            expectClosed(geometry, plane, front, back, { allowPinch: true }),
          );
        }
      }
    });
  });

  test("re-slicing pieces again and again stays closed", () => {
    adversarialShapes.forEach(([name, make], s) => {
      const random = mulberry32(21 + s);
      for (let trial = 0; trial < 8; trial++) {
        let pieces: THREE.BufferGeometry[] = [make()];
        for (let depth = 0; depth < 4; depth++) {
          const next: THREE.BufferGeometry[] = [];
          for (const piece of pieces) {
            const bounds =
              piece.boundingBox ??
              new THREE.Box3().setFromBufferAttribute(
                piece.getAttribute("position") as THREE.BufferAttribute,
              );
            const size = bounds.getSize(new THREE.Vector3());
            const point = bounds
              .getCenter(new THREE.Vector3())
              .add(
                new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
                  .multiply(size)
                  .multiplyScalar(0.6),
              );
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              randomUnit(random),
              point,
            );
            // A fresh cap index per level, so each check only sees the newest cap.
            const cap = CAP + depth;
            const { front, back } = sliceGeometry(piece, plane, cap);
            labelled(`${name} trial ${trial} depth ${depth}`, () =>
              expectClosed(piece, plane, front, back, { cap, allowPinch: true }),
            );
            if (front) next.push(front);
            if (back) next.push(back);
          }
          pieces = next;
        }
      }
    });
  });

  test("re-slicing along, a hair off, or across an earlier cap stays closed", () => {
    adversarialShapes.forEach(([name, make], s) => {
      const random = mulberry32(31 + s);
      for (let trial = 0; trial < 12; trial++) {
        const geometry = make();
        const normal = randomUnit(random);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          new THREE.Vector3((random() - 0.5) * 0.4, (random() - 0.5) * 0.4, 0),
        );
        const anchor = plane.coplanarPoint(new THREE.Vector3());
        const first = sliceGeometry(geometry, plane, CAP);
        for (const half of [first.front, first.back]) {
          if (!half) continue;
          const variants: THREE.Plane[] = [];
          for (const [tilt, shift] of [
            [0, 0],
            [0, 1e-7],
            [0, -1e-7],
            [0, 1e-5],
            [0, -1e-5],
            [1e-4, 0],
            [1e-3, 1e-4],
            [0.01, 0],
          ]) {
            const tilted = normal.clone().addScaledVector(randomUnit(random), tilt).normalize();
            const variant = new THREE.Plane().setFromNormalAndCoplanarPoint(tilted, anchor);
            variant.constant += shift;
            variants.push(variant);
          }
          const across = randomUnit(random).cross(normal).normalize();
          variants.push(new THREE.Plane().setFromNormalAndCoplanarPoint(across, anchor));
          variants.forEach((variant, v) => {
            const { front, back } = sliceGeometry(half, variant, CAP + 1);
            // Within ~1e-4 rad of the earlier cap, the old cap's vertices sit inside the on-plane
            // epsilon over a wide band, and the rim can fold wider than epsilon. The cap still closes,
            // but it may overlap itself there, so winding is not checked.
            labelled(`${name} trial ${trial} variant ${v}`, () =>
              expectClosed(half, variant, front, back, {
                cap: CAP + 1,
                allowPinch: true,
                checkWinding: false,
              }),
            );
          });
        }
      }
    });
  });

  test("slices a 24/8 holed disc, an 8-point star and a paper slab at random planes", () => {
    for (const [name, make] of [
      ["24/8 holed disc", holedDisc],
      ["8-point star", eightStar],
      ["paper slab", paperSlab],
    ] as const) {
      const geometry = make();
      const original = areaByMaterial(geometry);
      randomPlanes(geometry, 250, 4321).forEach((plane, i) => {
        const { front, back } = sliceGeometry(geometry, plane, CAP);
        labelled(`${name} plane ${i}`, () => {
          expectClosed(geometry, plane, front, back);
          const frontAreas = areaByMaterial(front);
          const backAreas = areaByMaterial(back);
          for (const material of [0, 1, 2]) {
            const sum = (frontAreas.get(material) ?? 0) + (backAreas.get(material) ?? 0);
            expect(Math.abs(sum - original.get(material)!) / original.get(material)!).toBeLessThan(
              1e-5,
            );
          }
        });
      });
    }
  });

  test("very small and very large slabs slice the same way", () => {
    for (const scale of [1e-4, 1e-3, 1e-2, 1e2, 1e3, 1e4]) {
      for (const [name, make] of adversarialShapes) {
        const geometry = make(scale);
        const p = positionsOf(geometry);
        const random = mulberry32(41);
        for (let i = 0; i < 40; i++) {
          const normal = randomUnit(random);
          if (i % 10 === 0) normal.set(random() * 0.05, random() * 0.05, 1).normalize();
          const point = new THREE.Vector3(
            (random() - 0.5) * 0.8 * scale,
            (random() - 0.5) * 0.8 * scale,
            (random() - 0.5) * 0.03 * scale,
          );
          if (i % 5 === 0) {
            const v = Math.floor(random() * (p.length / 3));
            point.set(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
          }
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
          const { front, back } = sliceGeometry(geometry, plane, CAP);
          labelled(`${name} x${scale} plane ${i}`, () => {
            expectClosed(geometry, plane, front, back, { scale });
            for (const half of [front, back]) {
              if (!half) continue;
              const cap = half.groups.find((g) => g.materialIndex === CAP);
              if (!cap) continue;
              const uv = half.getAttribute("uv").array;
              for (let k = cap.start * 2; k < (cap.start + cap.count) * 2; k++) {
                expect(Math.abs(uv[k] - 0.5)).toBeLessThan(1);
              }
            }
          });
        }
      }
    }
  });

  test("overflowing every scratch buffer on a dense mesh, then slicing a small one", () => {
    const dense = holedSlab(circle(1, 400), [circle(0.5, 300)], 0.1);
    expect(dense.getAttribute("position").count / 3).toBeGreaterThan(2500);
    expect(watertightIssues(dense)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
    const small = eightStar();
    const random = mulberry32(3);
    for (let i = 0; i < 12; i++) {
      for (const geometry of [dense, small]) {
        const normal = randomUnit(random);
        if (i % 3 === 0) normal.set(random() * 0.02, random() * 0.02, 1).normalize();
        const point = new THREE.Vector3(
          (random() - 0.5) * 0.5,
          (random() - 0.5) * 0.5,
          (random() - 0.5) * 0.05,
        );
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
        const { front, back } = sliceGeometry(geometry, plane, CAP);
        labelled(`${geometry === dense ? "dense" : "small"} ${i}`, () =>
          expectClosed(geometry, plane, front, back),
        );
      }
    }

    const unit = new THREE.Plane(new THREE.Vector3(0.3, 0.8, 0.2).normalize(), 0.1);
    const stretched = new THREE.Plane(unit.normal.clone().multiplyScalar(7), unit.constant * 7);
    const a = sliceGeometry(small, unit, CAP).front!.getAttribute("position").array;
    const b = sliceGeometry(small, stretched, CAP).front!.getAttribute("position").array;
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 6);
  });

  test("slices a 24-segment ring 1000 times", () => {
    const geometry = ring();
    const random = mulberry32(7);
    const planes = Array.from({ length: 1000 }, () =>
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        randomUnit(random),
        new THREE.Vector3((random() - 0.5) * 1.2, (random() - 0.5) * 1.2, (random() - 0.5) * 0.04),
      ),
    );
    for (const plane of planes.slice(0, 200)) sliceGeometry(geometry, plane, CAP);
    const runs = Array.from({ length: 3 }, () => {
      const start = performance.now();
      for (const plane of planes) sliceGeometry(geometry, plane, CAP);
      return (performance.now() - start) / planes.length;
    }).sort((a, b) => a - b);
    console.log(
      `slice 24-seg ring (${geometry.getAttribute("position").count / 3} tris) x1000: ${runs[0].toFixed(4)} ms/op best, ${runs[1].toFixed(4)} ms/op median`,
    );
    expect(runs[0]).toBeLessThan(0.5);
  });
});

// The real props from items.ts, at the face aspects the game builds them with.
// The optional third entry counts through-holes (the record's spindle hole) for the Euler check.
const props: [string, () => THREE.BufferGeometry, number?][] = [
  ["tv", () => propGeometry.tv()],
  ["phone", () => propGeometry.phone()],
  ["laptop", () => propGeometry.laptop()],
  ["frame 1:1", () => propGeometry.frame(1)],
  ["frame 224:272", () => propGeometry.frame(224 / 272)],
  ["pillow 1.6", () => propGeometry.pillow(1.6)],
  ["gem", () => propGeometry.gem()],
  ["record", () => propGeometry.record(), 1],
  ["curled sheet", () => propGeometry.curledSheet(1 / 1.3)],
  ["folded sheet", () => propGeometry.foldedSheet(1 / 1.3)],
];

const PROP_MATERIALS = [0, 1, 2, 3, 4, 5];

// V - E + F over exactly welded float32 positions: 2 for each closed genus-0 part. Two distinct
// vertices rounding onto one float32 position, or two parts touching, would show up here.
function eulerCharacteristic(geometry: THREE.BufferGeometry) {
  const p = positionsOf(geometry);
  const vertices = new Set<string>();
  const edges = new Set<string>();
  const key = (i: number) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
  for (let i = 0; i < p.length; i += 9) {
    const corners = [key(i), key(i + 3), key(i + 6)];
    for (let k = 0; k < 3; k++) {
      vertices.add(corners[k]);
      edges.add([corners[k], corners[(k + 1) % 3]].sort().join("|"));
    }
  }
  return vertices.size - edges.size + p.length / 9;
}

// Crease smoothing leans vertex normals off their face, but each one only sums faces within the
// crease of it, so the corners' average stays on the side the winding faces.
function windingDisagreements(geometry: THREE.BufferGeometry, minLength = 0) {
  const p = positionsOf(geometry);
  const n = geometry.getAttribute("normal").array;
  let disagreements = 0;
  for (let i = 0; i < p.length; i += 9) {
    const g = triangleNormal(p, i);
    if (Math.hypot(...g) < minLength) continue;
    let dot = 0;
    for (let k = 0; k < 3; k++) dot += g[k] * (n[i + k] + n[i + 3 + k] + n[i + 6 + k]);
    if (!(dot > 0)) disagreements++;
  }
  return disagreements;
}

function crossesTriangle(p: ArrayLike<number>, a: number, b: number, t: number) {
  const d = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
  const e1 = [p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]];
  const e2 = [p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]];
  const s = [p[a] - p[t], p[a + 1] - p[t + 1], p[a + 2] - p[t + 2]];
  const cross = (x: number[], y: number[]) => [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const dot = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const q = cross(s, e1);
  const u = dot(s, h) / det;
  const v = dot(d, q) / det;
  const along = dot(e2, q) / det;
  const eps = 1e-9;
  return u > eps && v > eps && u + v < 1 - eps && along > eps && along < 1 - eps;
}

// Each triangle's bounds as [minX, minY, minZ, maxX, maxY, maxZ], and the triangles sorted by minX,
// so pair checks can sweep along x instead of testing every pair.
function triangleBoxes(p: ArrayLike<number>) {
  const triangles = p.length / 9;
  const box = new Float64Array(triangles * 6);
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const lo = Math.min(p[t * 9 + k], p[t * 9 + 3 + k], p[t * 9 + 6 + k]);
      const hi = Math.max(p[t * 9 + k], p[t * 9 + 3 + k], p[t * 9 + 6 + k]);
      box[t * 6 + k] = lo;
      box[t * 6 + 3 + k] = hi;
    }
  }
  const order = Array.from({ length: triangles }, (_, t) => t).sort(
    (a, b) => box[a * 6] - box[b * 6],
  );
  return { box, order };
}

// Calls `visit` for every pair of triangles whose bounds, grown by `margin`, overlap.
function nearPairs(p: ArrayLike<number>, margin: number, visit: (a: number, b: number) => void) {
  const { box, order } = triangleBoxes(p);
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    for (let j = i + 1; j < order.length; j++) {
      const b = order[j];
      if (box[b * 6] > box[a * 6 + 3] + margin) break;
      if (
        box[b * 6 + 1] > box[a * 6 + 4] + margin ||
        box[a * 6 + 1] > box[b * 6 + 4] + margin ||
        box[b * 6 + 2] > box[a * 6 + 5] + margin ||
        box[a * 6 + 2] > box[b * 6 + 5] + margin
      ) {
        continue;
      }
      visit(a, b);
    }
  }
}

// Edges piercing a triangle they don't touch: a fold the closedness checks can't see, and one that
// would hand the slicer a self-crossing rim to cap.
function selfIntersections(geometry: THREE.BufferGeometry) {
  const p = positionsOf(geometry);
  const ids = new Map<string, number>();
  const corner = new Int32Array(p.length / 3);
  for (let v = 0; v < corner.length; v++) {
    const key = `${p[v * 3]},${p[v * 3 + 1]},${p[v * 3 + 2]}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    corner[v] = ids.get(key)!;
  }
  const touches = (t: number, o: number) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) if (corner[t * 3 + i] === corner[o * 3 + j]) return true;
    }
    return false;
  };
  let hits = 0;
  nearPairs(p, 0, (t, o) => {
    if (touches(t, o)) return;
    for (const [edges, face] of [
      [t, o],
      [o, t],
    ]) {
      for (let k = 0; k < 3; k++) {
        const from = (edges * 3 + k) * 3;
        const to = (edges * 3 + ((k + 1) % 3)) * 3;
        if (crossesTriangle(p, from, to, face * 9)) hits++;
      }
    }
  });
  return hits;
}

interface Shells {
  count: number;
  // The shell of each corner of the non-indexed positions.
  of: Int32Array;
}

// The closed parts a mesh is merged from: triangles joined through exactly welded corners.
function shellsOf(geometry: THREE.BufferGeometry): Shells {
  const p = positionsOf(geometry);
  const ids = new Map<string, number>();
  const corner = new Int32Array(p.length / 3);
  for (let v = 0; v < corner.length; v++) {
    const key = `${p[v * 3]},${p[v * 3 + 1]},${p[v * 3 + 2]}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    corner[v] = id;
  }
  const parent = Int32Array.from({ length: ids.size }, (_, i) => i);
  const find = (i: number) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) [parent[i], i] = [root, parent[i]];
    return root;
  };
  for (let v = 0; v < corner.length; v += 3) {
    for (const k of [1, 2]) parent[find(corner[v + k])] = find(corner[v]);
  }
  const labels = new Map<number, number>();
  const of = new Int32Array(corner.length);
  for (let v = 0; v < corner.length; v++) {
    const root = find(corner[v]);
    if (!labels.has(root)) labels.set(root, labels.size);
    of[v] = labels.get(root)!;
  }
  return { count: labels.size, of };
}

function shellVolumes(geometry: THREE.BufferGeometry, shells: Shells) {
  const p = positionsOf(geometry);
  const volumes = new Float64Array(shells.count);
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.subarray(i, i + 9);
    volumes[shells.of[i / 3]] +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volumes;
}

// Parts may sit a hair apart (geometry.ts asks for ~0.004), never closer: the slicer would weld
// their rims together.
const MIN_SHELL_GAP = 0.003;
const RAY_DIRECTION = new THREE.Vector3(0.3127, 0.7331, 0.6039).normalize();

// Corners of one part nearer than MIN_SHELL_GAP to a triangle of another, and parts sitting inside
// another (their first corner inside it, by ray parity).
function shellSeparationIssues(geometry: THREE.BufferGeometry, shells: Shells) {
  if (shells.count < 2) return { close: 0, nested: 0 };
  const p = positionsOf(geometry);
  const vertex = (t: number, k: number, target: THREE.Vector3) =>
    target.set(p[t * 9 + k * 3], p[t * 9 + k * 3 + 1], p[t * 9 + k * 3 + 2]);
  const triangle = new THREE.Triangle();
  const point = new THREE.Vector3();
  const closest = new THREE.Vector3();
  let close = 0;
  nearPairs(p, MIN_SHELL_GAP, (a, b) => {
    if (shells.of[a * 3] === shells.of[b * 3]) return;
    for (const [corners, face] of [
      [a, b],
      [b, a],
    ]) {
      vertex(face, 0, triangle.a);
      vertex(face, 1, triangle.b);
      vertex(face, 2, triangle.c);
      for (let k = 0; k < 3; k++) {
        vertex(corners, k, point);
        if (triangle.closestPointToPoint(point, closest).distanceTo(point) < MIN_SHELL_GAP) close++;
      }
    }
  });

  let nested = 0;
  const ray = new THREE.Ray();
  for (let s = 0; s < shells.count; s++) {
    const first = shells.of.indexOf(s);
    ray.set(new THREE.Vector3(p[first * 3], p[first * 3 + 1], p[first * 3 + 2]), RAY_DIRECTION);
    const crossings = new Int32Array(shells.count);
    for (let t = 0; t < p.length / 9; t++) {
      const other = shells.of[t * 3];
      if (other === s) continue;
      vertex(t, 0, triangle.a);
      vertex(t, 1, triangle.b);
      vertex(t, 2, triangle.c);
      const { a, b, c } = triangle;
      if (ray.intersectTriangle(a, b, c, false, point)) crossings[other]++;
    }
    nested += crossings.filter((count) => count % 2 === 1).length;
  }
  return { close, nested };
}

// Whether the plane runs through some part, rather than only between parts.
function crossesAPart(geometry: THREE.BufferGeometry, shells: Shells, plane: THREE.Plane) {
  const p = positionsOf(geometry);
  const reach = 1e-4 * geometry.boundingSphere!.radius;
  const below = new Uint8Array(shells.count);
  const above = new Uint8Array(shells.count);
  const { normal, constant } = plane;
  for (let v = 0; v < p.length / 3; v++) {
    const d = normal.x * p[v * 3] + normal.y * p[v * 3 + 1] + normal.z * p[v * 3 + 2] + constant;
    if (d < -reach) below[shells.of[v]] = 1;
    else if (d > reach) above[shells.of[v]] = 1;
  }
  return below.some((b, s) => b === 1 && above[s] === 1);
}

function expectContiguousGroups(geometry: THREE.BufferGeometry, materials: number[]) {
  let cursor = 0;
  let previous = -1;
  for (const group of geometry.groups) {
    expect(group.start).toBe(cursor);
    expect(group.count).toBeGreaterThan(0);
    expect(group.count % 3).toBe(0);
    expect(group.materialIndex!).toBeGreaterThan(previous);
    expect(materials).toContain(group.materialIndex!);
    previous = group.materialIndex!;
    cursor += group.count;
  }
  expect(cursor).toBe(geometry.getAttribute("position").count);
}

// Counts instead of per-vertex expects: thousands of prop slices would drown in expect() calls.
function capViolations(half: THREE.BufferGeometry, plane: THREE.Plane, sign: number) {
  const cap = half.groups.find((g) => g.materialIndex === CAP);
  if (!cap) return 0;
  const p = positionsOf(half);
  const n = half.getAttribute("normal").array;
  let violations = 0;
  const corner = new THREE.Vector3();
  for (let v = cap.start; v < cap.start + cap.count; v++) {
    const facing =
      n[v * 3] * plane.normal.x + n[v * 3 + 1] * plane.normal.y + n[v * 3 + 2] * plane.normal.z;
    corner.set(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
    if (Math.abs(facing - sign) > 1e-6 || Math.abs(plane.distanceToPoint(corner)) > 1e-5) {
      violations++;
    }
  }
  return violations;
}

// The checks every prop (and every part helper's output) must pass before it is sliced. Each part
// is genus 0 unless `holes` counts the through-holes (a ring) among them.
function expectSoundProp(geometry: THREE.BufferGeometry, holes = 0) {
  expect(geometry.index).toBeNull();
  expect(hasNaN(geometry)).toBe(false);
  expect(watertightIssues(geometry)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
  const shells = shellsOf(geometry);
  expect(eulerCharacteristic(geometry)).toBe(2 * shells.count - 2 * holes);
  expect(shellSeparationIssues(geometry, shells)).toEqual({ close: 0, nested: 0 });
  // Each part faces out on its own; an inside-out knob would hide in the total.
  for (const volume of shellVolumes(geometry, shells)) expect(volume).toBeGreaterThan(0);
  expect(windingDisagreements(geometry)).toBe(0);
  expect(selfIntersections(geometry)).toBe(0);
  expectContiguousGroups(geometry, PROP_MATERIALS);
  const n = geometry.getAttribute("normal").array;
  let unnormalised = 0;
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) > 1e-5) unnormalised++;
  }
  expect(unnormalised).toBe(0);
  return shells;
}

function expectPropHalves(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  front: THREE.BufferGeometry | null,
  back: THREE.BufferGeometry | null,
  shells?: Shells,
) {
  expect(front !== null || back !== null).toBe(true);
  // A plane running only between the parts of a prop splits it without cutting anything.
  const capped =
    front !== null &&
    back !== null &&
    (!shells || shells.count === 1 || crossesAPart(geometry, shells, plane));
  const original = signedVolume(geometry);
  const halves = (front ? signedVolume(front) : 0) + (back ? signedVolume(back) : 0);
  expect(Math.abs(halves - original) / original).toBeLessThan(1e-5);
  for (const [half, sign] of [
    [front, -1],
    [back, 1],
  ] as const) {
    if (!half) continue;
    expect(signedVolume(half)).toBeGreaterThan(0);
    expect(hasNaN(half)).toBe(false);
    // Unlike the slabs, no prop needs the pinch allowance, even cut through vertices or along faces.
    expect(watertightIssues(half)).toEqual({ degenerate: 0, unmatched: 0, duplicated: 0 });
    expectContiguousGroups(half, [...PROP_MATERIALS, CAP]);
    if (capped) expect(half.groups.some((g) => g.materialIndex === CAP)).toBe(true);
    expect(capCoverageError(half, plane) / original).toBeLessThan(1e-5);
    expect(capViolations(half, plane, sign)).toBe(0);
    // Cut slivers a hair wide have noise for a geometric normal.
    expect(windingDisagreements(half, 1e-5)).toBe(0);
  }
}

function propPlanes(geometry: THREE.BufferGeometry, seed: number) {
  const random = mulberry32(seed);
  const bounds = geometry.boundingBox!;
  const centre = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3()).length();
  const p = positionsOf(geometry);
  const planes: [string, THREE.Plane][] = randomPlanes(geometry, 200, seed).map((plane, i) => [
    `random ${i}`,
    plane,
  ]);
  // Through the centre, as the game's cuts nearly are, and down each axis: on the symmetric props
  // those run exactly through vertices.
  for (let i = 0; i < 60; i++) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(randomUnit(random), centre);
    planes.push([`centre ${i}`, plane]);
  }
  for (const axis of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    planes.push([
      `centre axis ${axis.toArray()}`,
      new THREE.Plane().setFromNormalAndCoplanarPoint(axis, centre),
    ]);
  }
  // Grazing: skimming a sliver off the outermost point along a random direction, or just touching it.
  for (let i = 0; i < 80; i++) {
    const normal = randomUnit(random);
    let reach = -Infinity;
    for (let v = 0; v < p.length; v += 3) {
      reach = Math.max(reach, normal.x * p[v] + normal.y * p[v + 1] + normal.z * p[v + 2]);
    }
    const depth = extent * [0, 1e-6, 1e-4, 1e-2][i % 4];
    planes.push([`grazing ${i} depth ${depth}`, new THREE.Plane(normal, depth - reach)]);
  }
  return planes;
}

// The plane of every distinct face, both ways round, with the index of a triangle lying in it.
function facePlanes(geometry: THREE.BufferGeometry) {
  const p = positionsOf(geometry);
  const seen = new Set<string>();
  const planes: [number, THREE.Plane][] = [];
  for (let i = 0; i < p.length; i += 9) {
    const normal = new THREE.Vector3(...triangleNormal(p, i)).normalize();
    const corner = new THREE.Vector3(p[i], p[i + 1], p[i + 2]);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, corner);
    const key = [...plane.normal.toArray(), plane.constant].map((v) => v.toFixed(5)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    planes.push([i / 9, plane], [i / 9, plane.clone().negate()]);
  }
  return planes;
}

describe("prop geometry", () => {
  test("every prop is closed, separated parts, consistently wound and outward-facing", () => {
    for (const [name, make, holes] of props) {
      const geometry = make();
      labelled(name, () => expectSoundProp(geometry, holes));
    }
  });

  test("slicing every prop at random, centre and grazing planes keeps both halves closed", () => {
    props.forEach(([name, make], s) => {
      const geometry = make();
      const shells = shellsOf(geometry);
      let cuts = 0;
      for (const [label, plane] of propPlanes(geometry, 600 + s)) {
        const { front, back } = sliceGeometry(geometry, plane, CAP);
        if (front && back) cuts++;
        labelled(`${name} ${label}`, () => expectPropHalves(geometry, plane, front, back, shells));
      }
      expect(cuts).toBeGreaterThan(300);
    });
  });

  // Every distinct face plane of every prop, both ways round: thousands of slices, hence the timeout.
  test("planes containing a face of each prop stay closed", () => {
    for (const [name, make] of props) {
      const geometry = make();
      const shells = shellsOf(geometry);
      for (const [i, variant] of facePlanes(geometry)) {
        const { front, back } = sliceGeometry(geometry, variant, CAP);
        labelled(`${name} triangle ${i}`, () =>
          expectPropHalves(geometry, variant, front, back, shells),
        );
      }
    }
  }, 120_000);

  test("slices every prop fast enough for several cuts per frame", () => {
    const report: string[] = [];
    for (const [name, make] of props) {
      const { best, line } = timeSlices(name, make());
      report.push(line);
      expect(best).toBeLessThan(0.5);
    }
    console.log(`slice props:\n  ${report.join("\n  ")}`);
  });
});

// Milliseconds per slice at the kind of planes the game cuts with: the best of 8 batches, so other
// work on the machine and GC pauses don't make it flaky.
function timeSlices(name: string, geometry: THREE.BufferGeometry) {
  const triangles = geometry.getAttribute("position").count / 3;
  const random = mulberry32(17);
  const centre = geometry.boundingSphere!.center;
  const radius = geometry.boundingSphere!.radius;
  // In game the cut lands within 0.28 radius of the centre.
  const planes = Array.from({ length: 400 }, () =>
    new THREE.Plane().setFromNormalAndCoplanarPoint(
      randomUnit(random),
      centre.clone().addScaledVector(randomUnit(random), radius * 0.28 * random()),
    ),
  );
  for (const plane of planes.slice(0, 50)) sliceGeometry(geometry, plane, CAP);
  const batches = Array.from({ length: 8 }, (_, b) => {
    const batch = planes.slice(b * 50, b * 50 + 50);
    const start = performance.now();
    for (const plane of batch) sliceGeometry(geometry, plane, CAP);
    return (performance.now() - start) / batch.length;
  }).sort((a, b) => a - b);
  const line = `${name} (${triangles} tris): ${(batches[0] * 1000).toFixed(1)} µs best, ${(batches[4] * 1000).toFixed(1)} µs median`;
  return { best: batches[0], line };
}

// Multi-part meshes, built with the geometry.ts part helpers the way a prop is: a body plus knobs,
// feet, a pin or a rod, each its own closed shell, GAP off its neighbour or well apart.
const GAP = 0.004;

interface Assembly {
  parts: THREE.BufferGeometry[];
  geometry: THREE.BufferGeometry;
  // Through-holes among the parts, for the Euler check.
  holes?: number;
}

const assemble = (...parts: THREE.BufferGeometry[]): Assembly => ({
  parts,
  geometry: mergeShells(...parts),
});

const KNOB = { radius: 0.14, depth: 0.12 };
const knob = () =>
  bevelCylinder(KNOB.radius, KNOB.depth, { bevel: 0.03, dome: 0.03, front: 3, side: 4 });

// Domed knobs on the front face and a foot under the body, each GAP off it.
function knobbedBox() {
  const body = bevelBox(2, 1.2, 0.5, { bevel: 0.06, radius: 0.08, front: 0, side: 2, back: 1 });
  const z = 0.25 + KNOB.depth / 2 + GAP;
  const knobs = [-0.6, 0.6].map((x) => placed(knob(), { position: [x, 0.25, z] }));
  const foot = bevelBox(0.4, 0.1, 0.3, { bevel: 0.02, front: 5 });
  return assemble(body, ...knobs, placed(foot, { position: [0, -0.6 - 0.05 - GAP, 0] }));
}

// Twelve turned knobs in rows on a pad: a cut along a row caps a string of loops side by side.
function keypad() {
  const body = bevelBox(2.2, 1.6, 0.3, {
    bevel: 0.04,
    radius: 0.1,
    segments: 2,
    front: 0,
    side: 2,
    back: 1,
  });
  const z = 0.15 + KNOB.depth / 2 + GAP;
  const keys: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const position: [number, number, number] = [-0.75 + col * 0.5, -0.45 + row * 0.45, z];
      keys.push(placed(knob(), { position, rotation: [0, 0, Math.PI / 8] }));
    }
  }
  return assemble(body, ...keys);
}

// Two slabs side by side GAP apart, the second mirrored: a cut along their faces caps two loops
// lying next to each other in one plane.
function twinSlabs() {
  const slab = bevelBox(1, 1.2, 0.3, {
    bevel: 0.04,
    radius: 0.1,
    segments: 2,
    front: 0,
    side: 2,
    back: 1,
  });
  return assemble(
    placed(slab, { position: [-0.5 - GAP / 2, 0, 0] }),
    placed(slab, { position: [0.5 + GAP / 2, 0, 0], scale: [-1, 1, 1] }),
  );
}

// A pin through a ring's hole: a cut across both caps a ring around a hole with the pin inside it.
function pinnedRing() {
  const pin = bevelCylinder(0.18, 0.5, { segments: 6, bevel: 0.03, front: 3, side: 4, back: 5 });
  return { ...assemble(holedSlab(circle(1, 24), [circle(0.3, 12)], 0.12), pin), holes: 1 };
}

// A washer inside a washer's hole with a pin through the inner one: each hole must be capped
// against its own ring, the smallest outline around it, not the outer washer.
function nestedRings() {
  const outer = holedSlab(circle(1, 24), [circle(0.55, 16)], 0.1);
  const inner = holedSlab(circle(0.45, 16), [circle(0.2, 8)], 0.16);
  const pin = bevelCylinder(0.1, 0.3, { segments: 6, bevel: 0.02, front: 3, side: 4 });
  return { ...assemble(outer, inner, pin), holes: 2 };
}

const BALL = 0.08;
const ball = () =>
  lathe(
    [
      [0, BALL],
      [BALL * 0.7, BALL * 0.7],
      [BALL, 0],
      [BALL * 0.7, -BALL * 0.7],
      [0, -BALL],
    ],
    6,
    { side: 4 },
  );

// A tapered body, a rod stood upright off its top and a mirrored ball pointing down onto the rod.
function antenna() {
  const body = bevelBox(1.4, 0.9, 0.6, { bevel: 0.05, taper: 0.8, front: 0, side: 2, back: 1 });
  const upright: [number, number, number] = [Math.PI / 2, 0, 0];
  const rod = placed(bevelCylinder(0.03, 1, { segments: 5, side: 3 }), {
    position: [0.3, 0.45 + GAP + 0.5, 0],
    rotation: upright,
  });
  const tip = placed(ball(), {
    position: [0.3, 1.45 + 2 * GAP + BALL, 0],
    rotation: upright,
    scale: [-1, 1, 1],
  });
  return assemble(body, rod, tip);
}

const assemblies: [string, () => Assembly][] = [
  ["knobbed box", knobbedBox],
  ["twin slabs", twinSlabs],
  ["pinned ring", pinnedRing],
  ["nested rings", nestedRings],
  ["antenna", antenna],
  ["keypad", keypad],
];

// Planes through the centres of two parts, for every pairing, so one cut crosses both.
function crossingPlanes(parts: THREE.BufferGeometry[], seed: number) {
  const random = mulberry32(seed);
  const centres = parts.map((part) => part.boundingBox!.getCenter(new THREE.Vector3()));
  const pairs = (centres.length * (centres.length - 1)) / 2;
  const perPair = Math.max(2, Math.ceil(48 / pairs));
  const planes: [string, THREE.Plane][] = [];
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const along = centres[j].clone().sub(centres[i]);
      for (let k = 0; k < perPair; k++) {
        const normal = randomUnit(random).cross(along).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centres[i]);
        planes.push([`crossing ${i}-${j} #${k}`, plane]);
      }
    }
  }
  return planes;
}

// Slicing the merged mesh must cut each part exactly as slicing that part alone does: no loop left
// uncapped, none capped twice or taken for another part's hole. Returns how many parts were cut.
function expectPartsConserved(
  assembly: Assembly,
  plane: THREE.Plane,
  front: THREE.BufferGeometry | null,
  back: THREE.BufferGeometry | null,
) {
  let frontVolume = 0;
  let backVolume = 0;
  let capArea = 0;
  let cut = 0;
  for (const part of assembly.parts) {
    const halves = sliceGeometry(part, plane, CAP);
    if (halves.front) frontVolume += signedVolume(halves.front);
    if (halves.back) backVolume += signedVolume(halves.back);
    if (halves.front && halves.back) cut++;
    capArea += areaByMaterial(halves.front).get(CAP) ?? 0;
  }
  const volume = signedVolume(assembly.geometry);
  const radius = assembly.geometry.boundingSphere!.radius;
  expect(Math.abs((front ? signedVolume(front) : 0) - frontVolume) / volume).toBeLessThan(1e-5);
  expect(Math.abs((back ? signedVolume(back) : 0) - backVolume) / volume).toBeLessThan(1e-5);
  const merged = areaByMaterial(front).get(CAP) ?? 0;
  expect(Math.abs(merged - capArea) / (radius * radius)).toBeLessThan(1e-5);
  return cut;
}

describe("multi-part meshes", () => {
  test("part helpers build single closed parts with the slots asked for", () => {
    const helpers: [string, THREE.BufferGeometry, number[]][] = [
      ["sharp box", bevelBox(1, 0.6, 0.4), [0]],
      [
        "bevelled box",
        bevelBox(1, 0.6, 0.4, { bevel: 0.05, front: 0, side: 2, back: 1 }),
        [0, 1, 2],
      ],
      [
        "rounded box",
        bevelBox(1, 0.6, 0.4, { bevel: 0.05, radius: 0.12, segments: 3, front: 3 }),
        [3],
      ],
      [
        "bevel past the radius",
        bevelBox(1, 0.6, 0.4, { bevel: 0.1, radius: 0.05, segments: 2 }),
        [0],
      ],
      [
        "side bevels, tapered, domed",
        bevelBox(1, 0.6, 0.4, {
          bevel: 0.05,
          radius: 0.08,
          bevels: "side",
          taper: 0.7,
          dome: 0.1,
          front: 0,
          side: 5,
          back: 4,
        }),
        [0, 4, 5],
      ],
      ["prism", bevelCylinder(0.3, 0.2, { segments: 7 }), [0]],
      [
        "bevelled knob",
        bevelCylinder(0.3, 0.2, { segments: 10, bevel: 0.04, front: 1, side: 2 }),
        [1, 2],
      ],
      ["domed knob", knob(), [3, 4]],
      ["ball", ball(), [0, 4]],
      [
        "flat-ended spindle",
        lathe(
          [
            [0.05, 0.3],
            [0.08, 0.25],
            [0.08, -0.25],
            [0.12, -0.3],
          ],
          8,
          { front: 1, side: 2, back: 3 },
        ),
        [1, 2, 3],
      ],
      [
        "crayon",
        lathe(
          [
            [0, 0.5],
            [0.06, 0.38],
            [0.08, 0.36],
            [0.08, -0.4],
          ],
          8,
          { front: 1, side: 2, back: 3 },
        ),
        [1, 2, 3],
      ],
    ];
    for (const [name, geometry, slots] of helpers) {
      labelled(name, () => {
        expect(expectSoundProp(geometry).count).toBe(1);
        expect(geometry.groups.map((g) => g.materialIndex)).toEqual(slots);
      });
    }
    expect(signedVolume(bevelBox(1, 0.6, 0.4))).toBeCloseTo(0.24, 6);
    // A 45° chamfer: the middle slab plus two prismatoids, b/6 (bottom + 4 middle + top).
    const b = 0.05;
    const chamfer = (b / 6) * (1 * 0.6 + 4 * (1 - b) * (0.6 - b) + (1 - 2 * b) * (0.6 - 2 * b));
    expect(signedVolume(bevelBox(1, 0.6, 0.4, { bevel: b }))).toBeCloseTo(
      0.6 * (0.4 - 2 * b) + 2 * chamfer,
      6,
    );
    // A regular n-gon prism: n/2 r² sin(2π/n) times its depth.
    expect(signedVolume(bevelCylinder(0.3, 0.2, { segments: 7 }))).toBeCloseTo(
      3.5 * 0.09 * Math.sin((2 * Math.PI) / 7) * 0.2,
      6,
    );
  });

  test("transformed moves, scales, shears and mirrors a part without opening it", () => {
    const part = bevelBox(1, 0.6, 0.4, {
      bevel: 0.05,
      radius: 0.1,
      segments: 2,
      front: 0,
      side: 2,
      back: 1,
    });
    const volume = signedVolume(part);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -1.1, 2.3));
    const at = (position: number[], scale: number[]) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        turn,
        new THREE.Vector3(...scale),
      );
    const matrices: [string, THREE.Matrix4][] = [
      ["turned and moved", at([0.3, -2, 1.7], [1, 1, 1])],
      ["squashed", at([0, 0, 0], [0.5, 2, 1.3])],
      ["mirrored in x", new THREE.Matrix4().makeScale(-1, 1, 1)],
      ["mirrored twice, a half turn", new THREE.Matrix4().makeScale(-1, -1, 1)],
      [
        "sheared, turned and mirrored",
        new THREE.Matrix4()
          .makeShear(0.2, 0, 0.1, 0, 0, 0.3)
          .premultiply(at([1, 0, 0], [1, -0.7, 1.2])),
      ],
    ];
    for (const [name, matrix] of matrices) {
      const moved = transformed(part, matrix);
      labelled(name, () => {
        expectSoundProp(moved);
        expect(signedVolume(moved) / volume).toBeCloseTo(Math.abs(matrix.determinant()), 5);
        expect(moved.groups).toEqual(part.groups);
      });
    }
    const viaPlaced = placed(part, { position: [0.3, -2, 1.7], rotation: [0.4, -1.1, 2.3] });
    expect(positionsOf(viaPlaced)).toEqual(positionsOf(transformed(part, matrices[0][1])));
  });

  test("mergeShells keeps every part whole and sorts triangles into contiguous groups", () => {
    const corners = (geometry: THREE.BufferGeometry) => geometry.getAttribute("position").count;
    for (const [name, make] of assemblies) {
      const { parts, geometry, holes } = make();
      labelled(name, () => {
        expect(expectSoundProp(geometry, holes).count).toBe(parts.length);
        expect(corners(geometry)).toBe(parts.reduce((sum, part) => sum + corners(part), 0));
        const separate = new Map<number, number>();
        for (const part of parts) {
          for (const [m, area] of areaByMaterial(part)) {
            separate.set(m, (separate.get(m) ?? 0) + area);
          }
        }
        const merged = areaByMaterial(geometry);
        expect([...merged.keys()].sort()).toEqual([...separate.keys()].sort());
        for (const [m, area] of separate) expect(merged.get(m)!).toBeCloseTo(area, 9);
        const volume = parts.reduce((sum, part) => sum + signedVolume(part), 0);
        expect(signedVolume(geometry)).toBeCloseTo(volume, 9);
      });
    }
    const bare = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    expect(() => mergeShells(bevelBox(1, 1, 1), bare)).toThrow("part 1 has no normal");
  });

  test("slicing multi-part meshes caps every crossed part and conserves each one", () => {
    assemblies.forEach(([name, make], s) => {
      const assembly = make();
      const { geometry, parts } = assembly;
      const shells = shellsOf(geometry);
      const planes = [...propPlanes(geometry, 900 + s), ...crossingPlanes(parts, 950 + s)];
      let several = 0;
      for (const [label, plane] of planes) {
        const { front, back } = sliceGeometry(geometry, plane, CAP);
        labelled(`${name} ${label}`, () => {
          expectPropHalves(geometry, plane, front, back, shells);
          if (expectPartsConserved(assembly, plane, front, back) >= 2) several++;
        });
      }
      expect(several).toBeGreaterThan(40);
    });

    // Cut flat through the middle, the nested rings cap three outlines, two holes and a pin.
    const flat = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const rings = nestedRings();
    const { front } = sliceGeometry(rings.geometry, flat, CAP);
    const disc = (r: number, segments: number) => ringAreaOf(circle(r, segments));
    expect(areaByMaterial(front).get(CAP)).toBeCloseTo(
      disc(1, 24) - disc(0.55, 16) + disc(0.45, 16) - disc(0.2, 8) + disc(0.1, 6),
      6,
    );
  });

  test("planes in the gaps between parts, or along their facing sides, split them cleanly", () => {
    const z = new THREE.Vector3(0, 0, 1);
    const y = new THREE.Vector3(0, 1, 0);
    const cases: [string, () => Assembly, THREE.Plane][] = [
      ["between body and knobs", knobbedBox, new THREE.Plane(z, -(0.25 + GAP / 2))],
      ["on the body's front face", knobbedBox, new THREE.Plane(z, -0.25)],
      ["on the knobs' backs", knobbedBox, new THREE.Plane(z, -(0.25 + GAP))],
      ["between body and foot", knobbedBox, new THREE.Plane(y, 0.6 + GAP / 2)],
      ["between the twin slabs", twinSlabs, new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
      ["between rod and ball", antenna, new THREE.Plane(y, -(1.45 + 1.5 * GAP))],
      ["between keys and pad", keypad, new THREE.Plane(z, -(0.15 + GAP / 2))],
    ];
    for (const [name, make, plane] of cases) {
      const assembly = make();
      for (const variant of [plane, plane.clone().negate()]) {
        const { front, back } = sliceGeometry(assembly.geometry, variant, CAP);
        labelled(name, () => {
          expect(front).not.toBeNull();
          expect(back).not.toBeNull();
          expectClosed(assembly.geometry, variant, front, back, { checkWinding: false });
          expect(expectPartsConserved(assembly, variant, front, back)).toBe(0);
          for (const half of [front!, back!]) {
            expect(half.groups.some((g) => g.materialIndex === CAP)).toBe(false);
          }
        });
      }
    }
  });

  test("planes containing a face of each multi-part mesh stay closed", () => {
    for (const [name, make] of assemblies) {
      const assembly = make();
      const shells = shellsOf(assembly.geometry);
      for (const [i, plane] of facePlanes(assembly.geometry)) {
        const { front, back } = sliceGeometry(assembly.geometry, plane, CAP);
        labelled(`${name} triangle ${i}`, () => {
          expectPropHalves(assembly.geometry, plane, front, back, shells);
          expectPartsConserved(assembly, plane, front, back);
        });
      }
    }
  });

  test("re-slicing multi-part pieces again and again stays closed", () => {
    assemblies.forEach(([name, make], s) => {
      const random = mulberry32(70 + s);
      for (let trial = 0; trial < 6; trial++) {
        let pieces = [make().geometry];
        for (let depth = 0; depth < 3; depth++) {
          const next: THREE.BufferGeometry[] = [];
          for (const piece of pieces) {
            const bounds = piece.boundingBox!;
            const size = bounds.getSize(new THREE.Vector3());
            const offset = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5);
            const point = bounds
              .getCenter(new THREE.Vector3())
              .add(offset.multiply(size).multiplyScalar(0.6));
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              randomUnit(random),
              point,
            );
            const cap = CAP + depth;
            const { front, back } = sliceGeometry(piece, plane, cap);
            labelled(`${name} trial ${trial} depth ${depth}`, () => {
              // The parts carry crease-smoothed normals, so winding is checked against the corners'
              // average rather than expectClosed's flat-normal test.
              const options = { cap, allowPinch: true, checkWinding: false };
              expectClosed(piece, plane, front, back, options);
              for (const half of [front, back]) {
                if (half) expect(windingDisagreements(half, 1e-5)).toBe(0);
              }
            });
            if (front) next.push(front);
            if (back) next.push(back);
          }
          pieces = next;
        }
      }
    });
  });

  test("slices multi-part meshes fast enough for several cuts per frame", () => {
    const report: string[] = [];
    for (const [name, make] of assemblies) {
      const { best, line } = timeSlices(name, make().geometry);
      report.push(line);
      expect(best).toBeLessThan(0.5);
    }
    console.log(`slice multi-part meshes:\n  ${report.join("\n  ")}`);
  });
});
