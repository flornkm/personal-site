/* A chrome "$" as a real solid, sphere-traced like the Claude mark experiment, but with the
   outline written analytically instead of read from a field: the S is two circular arcs (the
   lower one, and the same arc turned half a turn), the bar two short stubs. Distance to an arc
   is exact and cheap, so there is no texture, no build step and no lattice to rib the walls.
   That outline is extruded and filleted on every edge, then turned in front of a perspective
   camera, so the near stroke passes in front of the far one and the walls come into view.

   The pixel look is the ray grid: one ray per cell of a coarse grid, hard in-or-out coverage,
   so the silhouette steps by whole cells. */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform mat3 u_toObject;
uniform mat3 u_toWorld;
uniform vec3 u_key;
uniform float u_sweep;
uniform float u_cells;

const float PI = 3.14159265;
const float CAM_Z = 2.2;
const float FOV = 0.46;
const float BOUND = 1.08;
const int STEPS = 72;

const float R = 0.29;       // radius of each bowl of the S
const float HALF_W = 0.12;  // half the stroke width
const float HALF_D = 0.17;  // half the depth of the extrusion
const float ROUND = 0.065;  // fillet on every edge
const float TAIL = 0.42;    // how far each terminal stops short of a half turn, in radians
const float SQUASH = 0.98;  // the S is a little narrower than two circles

// The lower bowl: centred below the origin, running clockwise from the top (the spine) round
// the right side and the bottom to a terminal on the left.
float arc(vec2 p) {
  vec2 v = p - vec2(0.0, -R);
  float a = atan(v.y, v.x);
  float a0 = -PI + TAIL;
  if (a >= a0 && a <= 0.5 * PI) return abs(length(v) - R);
  vec2 e0 = vec2(0.0, -R) + R * vec2(cos(a0), sin(a0));
  return min(length(p - e0), length(p));
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float glyph(vec2 p) {
  vec2 s = vec2(p.x / SQUASH, p.y);
  // Point symmetry: the upper bowl is the lower one turned half a turn.
  float d = min(arc(s), arc(-s)) * SQUASH;
  float top = 2.0 * R + HALF_W;
  d = min(d, segment(p, vec2(0.0, top - 0.1), vec2(0.0, top + 0.05)));
  d = min(d, segment(p, vec2(0.0, -top + 0.1), vec2(0.0, -top - 0.05)));
  return d - HALF_W;
}

float map(vec3 q) {
  vec2 w = vec2(glyph(q.xy) + ROUND, abs(q.z) - (HALF_D - ROUND));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - ROUND;
}

vec3 normalAt(vec3 q) {
  vec2 e = vec2(1.0, -1.0) * 0.004;
  return normalize(
    e.xyy * map(q + e.xyy) + e.yyx * map(q + e.yyx) +
    e.yxy * map(q + e.yxy) + e.xxx * map(q + e.xxx)
  );
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

// A white studio, since the page is white: a dark floor and a grey wall to give the chrome
// something to be dark against, hard-edged strip lights so reflections read as streaks, and
// one strip that travels — that is the shimmer, a real reflection rather than a painted band.
vec3 room(vec3 d) {
  vec3 c = mix(vec3(0.11, 0.115, 0.125), vec3(0.32, 0.33, 0.35), smoothstep(-0.45, 0.05, d.y));
  c = mix(c, vec3(1.25, 1.25, 1.28), smoothstep(0.12, 0.7, d.y));
  c *= 1.0 - 0.25 * exp(-pow((d.y + 0.02) * 9.0, 2.0));

  float pitchAngle = atan(d.y, d.z);
  float yawAngle = atan(d.x, d.z);
  c += vec3(1.0) * smoothstep(0.12, 0.04, abs(pitchAngle - 0.9)) * 2.4;
  c += vec3(0.7, 0.98, 0.92) * smoothstep(0.1, 0.03, abs(pitchAngle + 1.0)) * 1.4;
  // Turquoise and not too bright, so the tone curve keeps its colour instead of clipping it white.
  c += vec3(0.08, 0.85, 0.72) * smoothstep(0.32, 0.08, abs(yawAngle - u_sweep)) * 1.5;

  c += vec3(1.0) * pow(max(dot(d, normalize(vec3(0.25, 0.3, 0.92))), 0.0), 10.0) * 1.8;
  c += vec3(1.0) * pow(max(dot(d, u_key), 0.0), 24.0) * 3.0;
  c += vec3(0.7, 0.75, 0.85) * pow(max(dot(d, normalize(vec3(-0.7, 0.3, -0.65))), 0.0), 6.0) * 0.5;
  return c;
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
  if (disc <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  float root = sqrt(disc);
  float t = max(-b - root, 0.0);
  float tMax = -b + root;
  bool hit = false;
  vec3 q = ro;
  for (int i = 0; i < STEPS; i++) {
    q = ro + rd * t;
    float h = map(q);
    if (h < 0.001) {
      hit = true;
      break;
    }
    // The squash and the arc endpoints make the field a slight overestimate in places.
    t += h * 0.9;
    if (t > tMax) break;
  }
  if (!hit) {
    outColor = vec4(0.0);
    return;
  }

  vec3 nObj = normalAt(q);
  float ao = occlusion(q, nObj);
  vec3 N = u_toWorld * nObj;
  vec3 V = -rdWorld;
  const vec3 F0 = vec3(0.92, 0.93, 0.95);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  vec3 color = room(reflect(-V, N)) * F * mix(0.4, 1.0, ao);
  outColor = vec4(tonemap(max(color, vec3(0.0))), 1.0);
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

// Object-to-world: yaw, then pitch, then roll. Column major.
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

export type DollarRenderer = { draw: (time: number) => void; dispose: () => void };

export function createDollarRenderer(canvas: HTMLCanvasElement): DollarRenderer | null {
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
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
    cells: at("u_cells"),
  };

  return {
    draw(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const toWorld = orientation(
        Math.sin(time * 0.7) * 0.6,
        Math.sin(time * 0.5 + 1.1) * 0.22,
        Math.sin(time * 0.33) * 0.06,
      );
      // Orthonormal, so the inverse is the transpose.
      const toObject = new Float32Array([
        toWorld[0],
        toWorld[3],
        toWorld[6],
        toWorld[1],
        toWorld[4],
        toWorld[7],
        toWorld[2],
        toWorld[5],
        toWorld[8],
      ]);
      gl.uniformMatrix3fv(u.toWorld, false, toWorld);
      gl.uniformMatrix3fv(u.toObject, false, toObject);

      const kx = Math.cos(time * 0.4) * 0.35;
      const ky = 0.6 + Math.sin(time * 0.3) * 0.15;
      const kl = Math.hypot(kx, ky, 0.7);
      gl.uniform3f(u.key, kx / kl, ky / kl, 0.7 / kl);
      // The travelling strip crosses every ~3.5s, then waits off to the side.
      gl.uniform1f(u.sweep, ((time % 3.5) / 3.5) * 4.4 - 2.2);
      gl.uniform1f(u.cells, 54);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
