import { VERTEX_STRIDE } from "./engine/geometry";
import { mat4 } from "./engine/math";
import type { Model } from "./models";

// A pocket version of the game's renderer (engine/renderer.ts + shaders.ts) for one model on a
// turntable: the same toon light into a low-resolution colour + normal target, then the same
// keylines, crease highlights and film grade, blown up to the canvas by whole device pixels.
// Dropped from the game: shadow maps, fog, point lights, water, wind and everything the world
// needs; a dithered contact shadow under the feet stands in for the sun's shadow.

// Late-afternoon look from core/game.ts DEFAULT_LOOK (linear light), the sun mirrored onto this
// camera so it still comes from over the viewer's left shoulder.
const LOOK = {
  sunDir: normalize([-0.62, 0.52, 0.36]),
  sunColor: [0.95, 0.74, 0.46, 0.06],
  sky: [0.3, 0.36, 0.5, 0.32],
  ground: [0.22, 0.21, 0.2, 1],
  shadeFill: [0.008, 0.014, 0.04, 0.85],
  // unused, lambert, gloss, facet
  params: [0, 0.35, 0.8, 0.15],
};

const COLOR_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vLocal;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out float vGloss;
out float vEmissive;
vec3 srgbToLinear(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vLocal = aPosition;
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = srgbToLinear(aColor.rgb);
  vGloss = aColor.a > 0.905 ? 0.0 : aColor.a;
  vEmissive = clamp((aColor.a - 0.9) * 10.0, 0.0, 1.0);
  gl_Position = uViewProj * world;
}
`;

const COLOR_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 uView;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec4 uSunColor;
uniform vec4 uSkyColor;
uniform vec4 uGroundColor;
uniform vec4 uShadeFill;
uniform vec4 uParams;
uniform vec4 uShadow;
in vec3 vLocal;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in float vGloss;
in float vEmissive;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return max(1.055 * pow(c, vec3(0.416666667)) - 0.055, 0.0);
}
float bayer4() {
  ivec2 q = ivec2(gl_FragCoord.xy) & 3;
  int i = q.y * 4 + q.x;
  float b[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (b[i] + 0.5) / 16.0;
}
float dithered(float v, float amount) { return mix(v, step(bayer4(), v), amount); }

void main() {
  vec3 flatN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 smoothN = normalize(gl_FrontFacing ? vNormal : -vNormal);
  if (dot(flatN, smoothN) < 0.0) flatN = -flatN;
  vec3 n = normalize(mix(smoothN, flatN, uParams.w));
  vec3 toCam = uCamPos - vWorld;
  vec3 v = normalize(toCam);
  float ndl = dot(n, uSunDir);
  float soft = uSunColor.w;
  float band = dithered(smoothstep(-soft, soft, ndl), uShadeFill.w);
  // Contact shadow: an ellipse on the plinth top under the model.
  vec2 q = (vLocal.xz - uShadow.xy) / uShadow.zw;
  float onTop = step(vLocal.y, 0.004) * step(-0.004, vLocal.y);
  float shadow = 1.0 - onTop * dithered(1.0 - smoothstep(0.55, 1.0, length(q)), uShadeFill.w);
  float sun = band * shadow * mix(1.0, max(ndl, 0.0), uParams.y);
  vec3 ambient = mix(uGroundColor.rgb, uSkyColor.rgb, n.y * 0.5 + 0.5);
  vec3 col = vColor * (ambient + uSunColor.rgb * sun);
  col += uShadeFill.rgb * (1.0 - sun) * smoothstep(0.0, 0.1, dot(vColor, vec3(0.2126, 0.7152, 0.0722)));
  float f = 1.0 - max(dot(n, v), 0.0);
  float rim = f * f * f * uSkyColor.w * (1.0 - 0.6 * sun) * (1.0 - n.y * n.y);
  col += mix(vColor, vec3(1.0), 0.35) * uSkyColor.rgb * rim;
  float nh = dot(smoothN, normalize(uSunDir + v));
  float fw = fwidth(nh);
  float th = mix(0.962, 0.994, smoothstep(0.1, 0.6, vGloss));
  float spec = smoothstep(th - fw, th + fw, nh) * min(1.0, vGloss * 2.0) * sun;
  col += (uSunColor.rgb + uSkyColor.rgb) * spec * uParams.z;
  col = mix(col, vColor, vEmissive);
  oColor = vec4(linearToSrgb(col), 1.0);
  oNormal = vec4(normalize(mat3(uView) * smoothN) * 0.5 + 0.5, 1.0);
}
`;

const POST_VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// The game's post pass (sky, keylines, creases, grade, ordered dither) and present pass (whole
// device pixels per game pixel) in one: every device pixel looks up the game pixel it belongs to.
const POST_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform sampler2D uDepth;
uniform int uScale;
uniform vec2 uNearFar;
out vec4 oColor;

ivec2 size;
float depthAt(ivec2 q) { return texelFetch(uDepth, clamp(q, ivec2(0), size - 1), 0).r; }
float invDepth(float raw) {
  float n = uNearFar.x, f = uNearFar.y;
  return (f + n - (raw * 2.0 - 1.0) * (f - n)) / (2.0 * n * f);
}

const vec3 SKY_TOP = vec3(0.22, 0.38, 0.66);
const vec3 SKY_HORIZON = vec3(0.64, 0.7, 0.82);
const float DARKEN = 0.5, COLORIZE = 0.6, HIGHLIGHT = 0.12, DEPTH_EDGE = 0.012, NORMAL_EDGE = 0.3;

vec3 keylines(vec3 col, vec3 n, float raw, ivec2 p) {
  float inv = invDepth(raw);
  float il = invDepth(depthAt(p + ivec2(-1, 0)));
  float ir = invDepth(depthAt(p + ivec2(1, 0)));
  float ib = invDepth(depthAt(p + ivec2(0, -1)));
  float it = invDepth(depthAt(p + ivec2(0, 1)));
  float e = max(2.0 * inv - il - ir, 2.0 * inv - ib - it) / inv;
  float edge = smoothstep(DEPTH_EDGE, DEPTH_EDGE * 2.5, e);
  if (edge > 0.0) return mix(col, col * mix(vec3(1.0), col, COLORIZE) * (1.0 - DARKEN), edge);
  float crease = 0.0;
  ivec2 offs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  float invs[4] = float[4](ir, il, it, ib);
  for (int i = 0; i < 4; i++) {
    ivec2 q = clamp(p + offs[i], ivec2(0), size - 1);
    vec3 nn = texelFetch(uNormal, q, 0).rgb * 2.0 - 1.0;
    float side = smoothstep(-0.01, 0.01, dot(n - nn, vec3(-1.0, 1.0, 0.6)));
    crease += (1.0 - dot(n, nn)) * side * step(invs[i], inv * 1.004);
  }
  return col + (1.0 - col) * step(NORMAL_EDGE, crease) * HIGHLIGHT;
}

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

void main() {
  size = textureSize(uDepth, 0);
  ivec2 p = min(ivec2(gl_FragCoord.xy) / uScale, size - 1);
  vec2 uv = (vec2(p) + 0.5) / vec2(size);
  float raw = texelFetch(uDepth, p, 0).r;
  vec3 col;
  if (raw >= 1.0) {
    col = mix(SKY_HORIZON, SKY_TOP, pow(smoothstep(0.15, 1.0, uv.y), 0.75));
  } else {
    col = texelFetch(uColor, p, 0).rgb;
    col = keylines(col, texelFetch(uNormal, p, 0).rgb * 2.0 - 1.0, raw, p);
  }
  col = max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.9), 0.0);
  col = clamp(col * 0.95, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.0), mix(vec3(0.86, 0.92, 1.08), vec3(1.06, 1.0, 0.9), smoothstep(0.05, 0.85, lum)), 0.6);
  col += vec3(0.16, 0.18, 0.3) * 0.04 * (1.0 - col);
  float bayer = (BAYER[(p.y & 3) * 4 + (p.x & 3)] + 0.5) / 16.0;
  col = floor(col * 32.0 + bayer) / 32.0;
  oColor = vec4(col, 1.0);
}
`;

export interface Turntable {
  // Draws the model turned by `yaw` radians.
  render(yaw: number): void;
  dispose(): void;
}

const FOV = 0.5;
const PITCH = 0.2;
// CSS pixels per game pixel, as in the game (core/pixel-scale.ts).
const PIXEL_CSS = 1.5;

export function createTurntable(canvas: HTMLCanvasElement, model: Model): Turntable | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const colorProgram = program(gl, COLOR_VERT, COLOR_FRAG);
  const postProgram = program(gl, POST_VERT, POST_FRAG);
  const u = uniforms(gl, colorProgram, [
    "uViewProj",
    "uModel",
    "uView",
    "uCamPos",
    "uSunDir",
    "uSunColor",
    "uSkyColor",
    "uGroundColor",
    "uShadeFill",
    "uParams",
    "uShadow",
  ]);
  const pu = uniforms(gl, postProgram, ["uColor", "uNormal", "uDepth", "uScale", "uNearFar"]);

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, model.geometry.data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VERTEX_STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.BYTE, true, VERTEX_STRIDE, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VERTEX_STRIDE, 16);
  gl.bindVertexArray(null);

  // Frame the model's turning cylinder (radius round the Y axis, full height) so nothing clips at
  // any angle, looking a little down onto it.
  const { min, max } = model.geometry.bounds;
  let reach = 0;
  const f32 = new Float32Array(model.geometry.data);
  for (let i = 0; i < model.geometry.vertexCount; i++) {
    reach = Math.max(reach, Math.hypot(f32[i * 6], f32[i * 6 + 2]));
  }
  // Seen from above, the near rim of the plinth drops below its bottom; aim lower to keep it in.
  const drop = reach * Math.sin(PITCH);
  const target = [0, (min[1] + max[1]) / 2 - drop * 0.5, 0];
  const half = Math.max((max[1] - min[1]) / 2 + drop * 0.6, reach * 0.62) * 1.06;
  const dist = half / Math.tan(FOV / 2) + reach;
  const eye = [0, target[1] + Math.sin(PITCH) * dist, Math.cos(PITCH) * dist];
  const near = Math.max(0.05, dist - reach * 1.5);
  const far = dist + reach * 1.5;
  const view = mat4.lookAt(mat4.create(), eye, target, [0, 1, 0]);
  const proj = mat4.create();
  const viewProj = mat4.create();
  const modelMatrix = mat4.create();

  let width = 0;
  let height = 0;
  let scale = 1;
  let fbo: WebGLFramebuffer | null = null;
  let textures: WebGLTexture[] = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const k = Math.max(1, Math.floor(dpr * PIXEL_CSS + 0.25));
    if (w === canvas.width && h === canvas.height && k === scale && fbo) return;
    canvas.width = w;
    canvas.height = h;
    scale = k;
    width = Math.ceil(w / k);
    height = Math.ceil(h / k);
    for (const t of textures) gl!.deleteTexture(t);
    if (fbo) gl!.deleteFramebuffer(fbo);
    textures = [
      texture(gl!, gl!.RGBA8, width, height),
      texture(gl!, gl!.RGBA8, width, height),
      texture(gl!, gl!.DEPTH_COMPONENT24, width, height),
    ];
    fbo = gl!.createFramebuffer();
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      textures[0],
      0,
    );
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT1,
      gl!.TEXTURE_2D,
      textures[1],
      0,
    );
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.DEPTH_ATTACHMENT, gl!.TEXTURE_2D, textures[2], 0);
    gl!.drawBuffers([gl!.COLOR_ATTACHMENT0, gl!.COLOR_ATTACHMENT1]);
    mat4.perspective(proj, FOV, width / height, near, far);
    mat4.multiply(viewProj, proj, view);
  }

  function render(yaw: number) {
    resize();
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    modelMatrix.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.viewport(0, 0, width, height);
    gl!.enable(gl!.DEPTH_TEST);
    gl!.enable(gl!.CULL_FACE);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.useProgram(colorProgram);
    gl!.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl!.uniformMatrix4fv(u.uModel, false, modelMatrix);
    gl!.uniformMatrix4fv(u.uView, false, view);
    gl!.uniform3fv(u.uCamPos, eye);
    gl!.uniform3fv(u.uSunDir, LOOK.sunDir);
    gl!.uniform4fv(u.uSunColor, LOOK.sunColor);
    gl!.uniform4fv(u.uSkyColor, LOOK.sky);
    gl!.uniform4fv(u.uGroundColor, LOOK.ground);
    gl!.uniform4fv(u.uShadeFill, LOOK.shadeFill);
    gl!.uniform4fv(u.uParams, LOOK.params);
    gl!.uniform4fv(u.uShadow, model.shadow);
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLES, 0, model.geometry.vertexCount);
    gl!.bindVertexArray(null);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.useProgram(postProgram);
    textures.forEach((t, i) => {
      gl!.activeTexture(gl!.TEXTURE0 + i);
      gl!.bindTexture(gl!.TEXTURE_2D, t);
    });
    gl!.uniform1i(pu.uColor, 0);
    gl!.uniform1i(pu.uNormal, 1);
    gl!.uniform1i(pu.uDepth, 2);
    gl!.uniform1i(pu.uScale, scale);
    gl!.uniform2f(pu.uNearFar, near, far);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  return {
    render,
    dispose() {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      for (const t of textures) gl.deleteTexture(t);
      if (fbo) gl.deleteFramebuffer(fbo);
      gl.deleteProgram(colorProgram);
      gl.deleteProgram(postProgram);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function normalize(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / l);
}

function texture(gl: WebGL2RenderingContext, format: number, w: number, h: number) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function program(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vert],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

function uniforms<K extends string>(gl: WebGL2RenderingContext, p: WebGLProgram, names: K[]) {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<
    K,
    WebGLUniformLocation | null
  >;
}
