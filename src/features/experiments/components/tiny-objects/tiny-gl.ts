/* Tiny sphere-traced objects: a real solid
   with depth and filleted edges, turned slowly in front of a perspective camera, lit by a
   procedural studio, one ray per cell of a fine grid. Each shape is an exact distance function
   written out in GLSL, so there is nothing to load or build. The material decides how the
   studio shows up on it: a mirror for chrome and gold, a diffuse body under a clear coat for
   enamel, and refraction plus reflection for glass. */

export type TinyShape = "key" | "clip" | "drop" | "bolt" | "lock" | "pin" | "star" | "cup";

const MATERIAL = { chrome: 0, gold: 1, enamel: 2, glass: 3 } as const;

const SHAPES: Record<
  TinyShape,
  {
    material: keyof typeof MATERIAL;
    sweep: [number, number, number];
    body?: [number, number, number];
    map: string;
  }
> = {
  // A key turned to the diagonal: a ring bow, a round shaft, two square teeth.
  key: {
    material: "gold",
    sweep: [1.0, 0.92, 0.78],
    map: `
float keyShape(vec3 q) {
  q.xy = rot(0.62) * q.xy;
  float bow = sdTorusZ(q - vec3(-0.4, 0.0, 0.0), 0.2, 0.075);
  float shaft = sdCapsule(q, vec3(-0.2, 0.0, 0.0), vec3(0.64, 0.0, 0.0), 0.068);
  float t1 = sdRoundBox(q - vec3(0.54, -0.13, 0.0), vec3(0.055, 0.085, 0.04), 0.018);
  float t2 = sdRoundBox(q - vec3(0.37, -0.11, 0.0), vec3(0.04, 0.065, 0.04), 0.018);
  return smin(smin(bow, shaft, 0.05), min(t1, t2), 0.03);
}
float map(vec3 q) { return keyShape(q / 1.22) * 1.22; }`,
  },
  // A paperclip: one wire bent through three straights and three half turns.
  clip: {
    material: "chrome",
    sweep: [0.08, 0.85, 0.72],
    map: `
float halfArc(vec2 p, vec2 c, float r, float side) {
  vec2 v = p - c;
  if (v.y * side >= 0.0) return abs(length(v) - r);
  return min(length(v - vec2(r, 0.0)), length(v + vec2(r, 0.0)));
}
float wire(vec2 p) {
  float d = sdSegment2(p, vec2(-0.24, 0.5), vec2(-0.24, -0.4));
  d = min(d, halfArc(p, vec2(0.0, -0.4), 0.24, -1.0));
  d = min(d, sdSegment2(p, vec2(0.24, -0.4), vec2(0.24, 0.52)));
  d = min(d, halfArc(p, vec2(0.06, 0.52), 0.18, 1.0));
  d = min(d, sdSegment2(p, vec2(-0.12, 0.52), vec2(-0.12, -0.26)));
  d = min(d, halfArc(p, vec2(0.0, -0.26), 0.12, -1.0));
  return min(d, sdSegment2(p, vec2(0.12, -0.26), vec2(0.12, 0.34)));
}
float map(vec3 q) {
  q.xy = rot(-0.38) * q.xy;
  return length(vec2(wire(q.xy), q.z)) - 0.062;
}`,
  },
  // A raindrop: a sphere drawn up into a point.
  drop: {
    material: "glass",
    sweep: [0.85, 0.95, 1.0],
    map: `
float map(vec3 q) {
  return sdRoundCone(q + vec3(0.0, 0.3, 0.0), 0.37, 0.025, 0.74);
}`,
  },
  // A lightning bolt in yellow enamel: a six-point outline, extruded and rounded.
  bolt: {
    material: "enamel",
    sweep: [1.0, 1.0, 1.0],
    map: `
float boltOutline(vec2 p) {
  vec2 v[6] = vec2[](vec2(0.15, 0.68), vec2(-0.35, -0.04), vec2(-0.03, -0.04),
                     vec2(-0.16, -0.68), vec2(0.35, 0.06), vec2(0.03, 0.06));
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0, j = 5; i < 6; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}
float map(vec3 q) {
  const float ROUND = 0.06;
  vec2 w = vec2(boltOutline(q.xy) + ROUND, abs(q.z) - (0.14 - ROUND));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - ROUND;
}`,
  },
  // A padlock: a round shackle over a pillowy body with a keyhole pressed into its face.
  lock: {
    material: "chrome",
    sweep: [0.08, 0.85, 0.72],
    map: `
float map(vec3 q) {
  vec3 s = q - vec3(0.0, 0.16, 0.0);
  float shackle = s.y > 0.0
    ? sdTorusZ(s, 0.26, 0.068)
    : max(length(vec2(abs(s.x) - 0.26, s.z)) - 0.068, -(s.y + 0.32));
  float body = sdRoundBox(q - vec3(0.0, -0.3, 0.0), vec3(0.42, 0.32, 0.15), 0.09);
  vec3 k = q - vec3(0.0, -0.24, 0.15);
  float hole = min(length(k.xy) - 0.065, sdRoundBox(k - vec3(0.0, -0.1, 0.0), vec3(0.028, 0.09, 1.0), 0.01));
  float keyhole = max(hole, abs(k.z) - 0.035);
  return max(min(shackle, body), -keyhole);
}`,
  },
  // A map pin in coral enamel, with the hole punched through its head.
  pin: {
    material: "enamel",
    sweep: [1.0, 1.0, 1.0],
    body: [0.88, 0.2, 0.14],
    map: `
float map(vec3 q) {
  vec3 p = vec3(q.x, -q.y, q.z);
  float drop = sdRoundCone(p + vec3(0.0, 0.32, 0.0), 0.4, 0.035, 0.82);
  // Flatten it front to back a little, the way a pin is a lozenge and not a cone.
  drop = max(drop, abs(q.z) - 0.22);
  float hole = length(q.xy - vec2(0.0, 0.3)) - 0.14;
  return max(drop, -hole);
}`,
  },
  // A puffy five-point star in gold.
  star: {
    material: "gold",
    sweep: [1.0, 0.92, 0.78],
    map: `
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float map(vec3 q) {
  float d2 = sdStar5(q.xy + vec2(0.0, 0.04), 0.74, 0.5);
  // Thicker in the middle than at the points: a pillow, not a cookie cutter.
  float half_ = 0.05 + 0.12 * clamp(-d2 * 3.0, 0.0, 1.0);
  vec2 w = vec2(d2 + 0.05, abs(q.z) - half_);
  return (min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.05) * 0.8;
}`,
  },
  // A ceramic cup of coffee: a revolved rounded wall, a half-torus handle, coffee inside.
  cup: {
    material: "enamel",
    sweep: [1.0, 1.0, 1.0],
    body: [1.0, 0.99, 0.97],
    map: `
// Tipped toward the camera so the coffee shows.
vec3 cupSpace(vec3 q) {
  q.yz = rot(-0.5) * q.yz;
  q.y += 0.04;
  return q;
}
float sdRoundCyl(vec3 p, float r, float h, float round_) {
  vec2 d = vec2(length(p.xz) - r + round_, abs(p.y) - h + round_);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - round_;
}
float map(vec3 q) {
  q = cupSpace(q);
  float outer = sdRoundCyl(q, 0.4, 0.34, 0.1);
  float inner = sdRoundCyl(q - vec3(0.0, 0.12, 0.0), 0.34, 0.34, 0.08);
  float cup = max(outer, -inner);
  // The coffee: a disc a little below the rim.
  float coffee = max(sdRoundCyl(q - vec3(0.0, 0.08, 0.0), 0.345, 0.12, 0.02), q.y - 0.2);
  float handle = max(sdTorusZ(q - vec3(0.4, 0.02, 0.0), 0.15, 0.048), -(q.x - 0.4));
  return min(min(cup, coffee), handle);
}`,
  },
};

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRELUDE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform mat3 u_toObject;
uniform mat3 u_toWorld;
uniform vec3 u_key;
uniform float u_sweep;
uniform vec3 u_sweepColor;
uniform float u_cells;
uniform vec3 u_body;
uniform float u_dark;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float sdSegment2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
float sdTorusZ(vec3 p, float R, float r) { return length(vec2(length(p.xy) - R, p.z)) - r; }
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdRoundCone(vec3 p, float r1, float r2, float h) {
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  vec2 q = vec2(length(p.xz), p.y);
  float k = dot(q, vec2(-b, a));
  if (k < 0.0) return length(q) - r1;
  if (k > a * h) return length(q - vec2(0.0, h)) - r2;
  return dot(q, vec2(a, b)) - r1;
}
`;

const MAIN = `
const float CAM_Z = 2.2;
const float FOV = 0.46;
const float BOUND = 1.05;
const int STEPS = 72;

vec3 normalAt(vec3 q) {
  vec2 e = vec2(1.0, -1.0) * 0.004;
  return normalize(e.xyy * map(q + e.xyy) + e.yyx * map(q + e.yyx) + e.yxy * map(q + e.yxy) + e.xxx * map(q + e.xxx));
}

float occlusion(vec3 q, vec3 n) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 0; i < 3; i++) {
    float h = 0.02 + 0.06 * float(i);
    occ += (h - map(q + n * h)) * scale;
    scale *= 0.7;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

// The studio, tuned for a white page: a mid-grey floor and wall for the metal to be dark
// against, hard-edged strips so reflections read as streaks, and one strip that travels.
vec3 room(vec3 d) {
  vec3 floorCol = mix(vec3(0.08, 0.085, 0.095), vec3(0.015, 0.016, 0.02), u_dark);
  vec3 wallCol = mix(vec3(0.3, 0.31, 0.33), vec3(0.1, 0.105, 0.115), u_dark);
  vec3 c = mix(floorCol, wallCol, smoothstep(-0.45, 0.05, d.y));
  c = mix(c, vec3(1.25, 1.25, 1.28), smoothstep(0.12, 0.7, d.y));
  c *= 1.0 - 0.25 * exp(-pow((d.y + 0.02) * 9.0, 2.0));
  float pitchAngle = atan(d.y, d.z);
  float yawAngle = atan(d.x, d.z);
  c += vec3(1.0) * smoothstep(0.1, 0.03, abs(pitchAngle - 0.9)) * 3.2;
  c += vec3(0.85, 0.9, 1.0) * smoothstep(0.08, 0.02, abs(pitchAngle + 1.0)) * 1.8;
  c += vec3(1.0) * smoothstep(0.06, 0.015, abs(yawAngle + 1.1)) * 1.6;
  c += u_sweepColor * smoothstep(0.32, 0.08, abs(yawAngle - u_sweep)) * 1.5;
  c += vec3(1.0) * pow(max(dot(d, normalize(vec3(0.25, 0.3, 0.92))), 0.0), 10.0) * 1.8;
  c += vec3(1.0) * pow(max(dot(d, u_key), 0.0), 24.0) * 3.0;
  c += vec3(0.7, 0.75, 0.85) * pow(max(dot(d, normalize(vec3(-0.7, 0.3, -0.65))), 0.0), 6.0) * 0.5;
  return c;
}

// Pin-sharp highlights from the two main lamps: the glints that make a surface read as polished.
float glints(vec3 R) {
  return pow(max(dot(R, u_key), 0.0), 140.0) * 7.0
       + pow(max(dot(R, normalize(vec3(-0.35, 0.55, 0.76))), 0.0), 70.0) * 2.5;
}

vec3 tonemap(vec3 x) {
  x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return pow(clamp(x, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 cell = (floor(v_uv * u_cells) + 0.5) / u_cells;
  vec2 uv = cell * 2.0 - 1.0;
  vec3 rdWorld = normalize(vec3(uv * FOV, -1.0));
  vec3 ro = u_toObject * vec3(0.0, 0.0, CAM_Z);
  vec3 rd = u_toObject * rdWorld;

  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - BOUND * BOUND);
  if (disc <= 0.0) { outColor = vec4(0.0); return; }
  float root = sqrt(disc);
  float t = max(-b - root, 0.0);
  float tMax = -b + root;
  bool hit = false;
  vec3 q = ro;
  for (int i = 0; i < STEPS; i++) {
    q = ro + rd * t;
    float h = map(q);
    if (h < 0.001) { hit = true; break; }
    t += h * 0.9;
    if (t > tMax) break;
  }
  if (!hit) { outColor = vec4(0.0); return; }

  vec3 nObj = normalAt(q);
  float ao = occlusion(q, nObj);
  vec3 N = u_toWorld * nObj;
  vec3 V = -rdWorld;
  vec3 R = reflect(-V, N);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 5.0);
  vec3 color;
  float alpha = 1.0;

#if MATERIAL == 0
  vec3 F0 = vec3(0.92, 0.93, 0.95);
  color = (room(R) + glints(R)) * (F0 + (1.0 - F0) * fresnel) * mix(0.4, 1.0, ao);
#elif MATERIAL == 1
  vec3 F0 = vec3(1.0, 0.68, 0.22);
  vec3 env = room(R);
  // Gold tints what it mirrors; push the tint into the brights too so it never greys out.
  env = mix(env, env * vec3(1.0, 0.82, 0.45), 0.5);
  color = (env + glints(R) * vec3(1.0, 0.9, 0.7)) * (F0 + (1.0 - F0) * fresnel) * mix(0.4, 1.0, ao);
#elif MATERIAL == 2
  // Enamel: a coloured body lit by the key, under a thin clear coat that mirrors the studio.
  vec3 body = u_body;
#ifdef CUP
  // Inside the rim and below it: coffee, not glaze.
  vec3 c = cupSpace(q);
  if (length(c.xz) < 0.338 && c.y < 0.215) body = vec3(0.1, 0.05, 0.025);
#endif
  float lambert = max(dot(N, u_key), 0.0);
  vec3 diffuse = body * (0.28 + 0.85 * lambert) * mix(0.55, 1.0, ao);
  float coat = 0.04 + 0.96 * fresnel;
  color = diffuse * (1.0 - coat) + room(R) * mix(0.1, 1.0, coat) * 0.5 + glints(R) * 0.9;
#else
  // Glass: what the studio looks like through the drop, plus what it mirrors, weighted by
  // Fresnel; the body is see-through, so it is only partly opaque except at the rim.
  float F = 0.04 + 0.96 * fresnel;
  // Lifted and tinted so the drop reads as clear water on a dark page as well as a light one.
  vec3 tint = vec3(0.55, 0.8, 1.0);
  vec3 through = room(refract(-V, N, 0.75)) * tint + tint * mix(0.08, 0.28, u_dark);
  float glint = glints(R) * 1.2 + pow(max(dot(R, normalize(vec3(0.3, 0.45, 0.85))), 0.0), 40.0) * 2.0;
  color = through * (1.0 - F) * 0.9 + room(R) * F * 1.4 + vec3(glint);
  alpha = clamp(mix(0.42, 0.62, u_dark) + F * 1.6 + glint, 0.0, 1.0);
#endif

  outColor = vec4(tonemap(max(color, vec3(0.0)) * 1.12) * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "compile");
  }
  return shader;
}

function orientation(yaw: number, pitch: number, roll: number): Float32Array {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return new Float32Array([
    cy * cr + sy * sp * sr,
    cp * sr,
    -sy * cr + cy * sp * sr,
    -cy * sr + sy * sp * cr,
    cp * cr,
    sy * sr + cy * sp * cr,
    sy * cp,
    -sp,
    cy * cp,
  ]);
}

export type TinyRenderer = { draw: (time: number, dark: boolean) => void; dispose: () => void };

export function createTinyRenderer(
  canvas: HTMLCanvasElement,
  shape: TinyShape,
  // Rays across the canvas. About 1.5 per CSS pixel keeps the faint pixel stepping.
  cells: number,
): TinyRenderer | null {
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;

  const spec = SHAPES[shape];
  const frag = `${PRELUDE}#define MATERIAL ${MATERIAL[spec.material]}\n${shape === "cup" ? "#define CUP\n" : ""}${spec.map}\n${MAIN}`;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "link");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    toObject: at("u_toObject"),
    toWorld: at("u_toWorld"),
    key: at("u_key"),
    sweep: at("u_sweep"),
    sweepColor: at("u_sweepColor"),
    body: at("u_body"),
    dark: at("u_dark"),
    cells: at("u_cells"),
  };
  gl.uniform3f(u.sweepColor, ...spec.sweep);
  gl.uniform3f(u.body, ...(spec.body ?? [1.0, 0.6, 0.03]));
  gl.uniform1f(u.cells, cells);
  // Each object gets its own phase so a page of them never sways in step.
  const phase = {
    key: 0.4,
    clip: 1.7,
    drop: 2.9,
    bolt: 4.1,
    lock: 5.3,
    pin: 6.6,
    star: 7.9,
    cup: 9.2,
  }[shape];

  return {
    draw(time, dark) {
      gl.uniform1f(u.dark, dark ? 1 : 0);
      const t = time + phase;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const toWorld = orientation(
        Math.sin(t * 0.7) * 0.6,
        Math.sin(t * 0.5 + 1.1) * 0.22,
        Math.sin(t * 0.33) * 0.06,
      );
      gl.uniformMatrix3fv(u.toWorld, false, toWorld);
      gl.uniformMatrix3fv(
        u.toObject,
        false,
        new Float32Array([
          toWorld[0],
          toWorld[3],
          toWorld[6],
          toWorld[1],
          toWorld[4],
          toWorld[7],
          toWorld[2],
          toWorld[5],
          toWorld[8],
        ]),
      );
      const kx = Math.cos(t * 0.4) * 0.35;
      const ky = 0.6 + Math.sin(t * 0.3) * 0.15;
      const kl = Math.hypot(kx, ky, 0.7);
      gl.uniform3f(u.key, kx / kl, ky / kl, 0.7 / kl);
      gl.uniform1f(u.sweep, ((t % 3.5) / 3.5) * 4.4 - 2.2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
