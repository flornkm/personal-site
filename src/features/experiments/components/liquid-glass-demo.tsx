import { useEffect, useRef, useState } from "react";

/* A liquid-glass button, sitting on three lines of type, that you can drag across them.

   WebGL cannot read the pixels behind its own canvas, so a shader can never refract the
   real page. The honest way round it is to own the backdrop: this canvas draws the type
   itself, in the page's own colour, and the button is a rounded-rect signed distance field
   shaded on top of it. Everything the glass does to the text is real sampling, not a
   painted highlight.

   What the canvas outputs is premultiplied — what it adds, plus what it blocks — rather
   than a finished opaque image, so the surface underneath is the real one and the demo has
   no rectangle of its own on the page. The one colour it does need is that surface, passed
   in as a uniform: the glass has to know what it is frosting.

   The edge is where all of it happens. The distance field gives a bevel profile, the bevel
   gives a normal, and the normal gives three things at once: a refracted sample of the
   type underneath, taken once per wavelength so the rim fringes the way thick glass does;
   a Fresnel weight; and a reflection of a procedural environment that the Fresnel drives
   to 1 at grazing angles. That grazing reflection *is* the bright edge — there is no rim
   term anywhere in the shader.

   Liquid is the other half. The button trails the pointer on a spring, stretches along the
   axis it is travelling and thins across it, and its boundary keeps wobbling for a moment
   after you let go. Press it and it squashes, and the glass thickens under your finger. */

// Stage geometry. Every measurement below is in these units; the canvas scales them by
// `u_px`, so the same numbers hold on a narrower sheet and at any device ratio.
const STAGE_W = 440;
const STAGE_H = 275;

const BUTTON_W = 136;
const BUTTON_H = 48;
const RADIUS = BUTTON_H / 2;
const REST = { x: STAGE_W / 2, y: 138 };
// Kept a good way inside the canvas: the contact shadow reaches past the button, and the
// refraction near the rim samples further out still. Let either run into the edge of the
// drawing buffer and the button drags a hard cut-off line around with it.
const BOUND = { x: BUTTON_W / 2 + 26, y: BUTTON_H / 2 + 26 };

// The glass itself: BEVEL is the width of the curved edge, DEPTH how far the refracted ray
// travels before it meets the type. Everything the button does to the page follows from
// these two, so they are the numbers worth moving.
const BEVEL = 8;
const DEPTH = 36;

// Dragging is the whole interaction, so this one is not worth capping lower.
const FPS = 60;

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;      // drawing buffer size, device px
uniform float u_px;      // device px per stage unit
uniform sampler2D u_bg;
uniform vec2 u_centre;   // button centre, device px, y down
uniform vec2 u_half;     // half size in the button's own (stretched) frame
uniform float u_radius;
uniform vec2 u_stretch;  // along x / along y, area preserving
uniform float u_wobble;  // amplitude of the gel wobble, device px
uniform float u_phase;
uniform float u_bevel;
uniform float u_depth;
uniform float u_ambient;  // 0 = dark surroundings, 1 = light ones
uniform vec2 u_light;
uniform vec3 u_surface;  // the page colour behind the canvas
uniform vec3 u_ink;      // and the colour the type on it is set in
out vec4 outColor;

// Each wavelength lands somewhere slightly different, so a hard edge in the type comes back
// as a spectrum rather than three coloured copies. Sharp letterforms need this many.
const int SPECTRAL_TAPS = 24;
// Real glass disperses far too little to see at this size. The spread is the one
// deliberately unphysical number here; everything else follows from it.
const float IOR_VIOLET = 1.72;
const float IOR_RED = 1.40;
// Squircle exponent. A circular corner meets the straight edge with a visible break in
// curvature, which is the tell that separates this shape from the one Apple ships.
const float CORNER_N = 2.6;
// How far the bevel is allowed to tilt the normal. Past ~0.7 the rim turns to a mirror.
const float EDGE_STEEP = 0.68;
// How much of the mip chain the rim may reach for as it compresses, and the flat frost on
// top of it. Both stay low: every step of blur here is a step of colour thrown away.
const float FROST = 0.50;
const float BASE_LOD = 0.35;
// How hard the rim splits the reflection. The wall of the glass is a prism seen edge-on, so
// each wavelength leaves it aimed somewhere slightly different — and since the environment
// is far from uniform, they come back at different brightnesses, which is a colour. This is
// where the spectrum on a plain white page comes from: refracting white type through white
// glass can only ever return white.
const float DISPERSE_REFL = 0.60;
// How close to edge-on the bevel is allowed to get. This is what decides whether the outer
// rim is a bright reflection or a grey band: too high a floor and the edge never reaches a
// grazing angle, Fresnel stays low, and what shows there is the dark type the lens dragged
// in rather than the environment.
const float GRAZE = 0.05;
const float SHADOW_DROP = 5.0;

// The colour the eye assigns a single wavelength, violet (0) to red (1). Stands in for the
// CIE curves, which this does not need.
vec3 wavelength(float u) {
  vec3 c = mix(vec3(0.86, 0.24, 0.90), vec3(0.30, 0.34, 1.00), smoothstep(0.00, 0.24, u));
  c = mix(c, vec3(0.18, 0.86, 1.00), smoothstep(0.20, 0.42, u));
  c = mix(c, vec3(0.42, 1.00, 0.36), smoothstep(0.34, 0.54, u));
  c = mix(c, vec3(1.00, 0.94, 0.20), smoothstep(0.50, 0.70, u));
  c = mix(c, vec3(1.00, 0.48, 0.10), smoothstep(0.66, 0.86, u));
  c = mix(c, vec3(0.96, 0.13, 0.09), smoothstep(0.82, 1.00, u));
  return c;
}

// What the glass reflects: one soft key, a vertical gradient and a bounce from below. Tied
// to the page's scheme, because a dark studio reflected onto a button sitting on a white
// page draws a hard black outline round it — at grazing angles that edge shows nothing else.
vec3 env(vec3 d, vec2 light, float ambient) {
  d = normalize(d);
  vec3 key = normalize(vec3(light.x * 0.5, light.y * 0.4 + 0.62, 0.60));
  float up = smoothstep(-0.85, 0.95, d.y);
  // The dark studio still needs a sky: with nothing above it the grazing edge reflects
  // black onto a black page and the button loses its outline entirely.
  // The light room is bright all the way down. Anything darker under the horizon comes
  // straight back as a grey band along the bottom of the button, because that is the only
  // thing the lower rim can see.
  vec3 c = mix(mix(vec3(0.020, 0.023, 0.032), vec3(0.30, 0.32, 0.38), up),
               mix(vec3(0.84, 0.86, 0.90), vec3(0.99, 0.99, 1.00), up),
               ambient);
  float k = max(dot(d, key), 0.0);
  c += vec3(1.00, 0.98, 0.95) * pow(k, 9.0) * 3.40;
  c += vec3(0.60, 0.68, 0.90) * pow(k, 2.6) * 0.20;
  // A second, tighter source off to the side. One smooth lobe reflects as one smooth ramp
  // and the wavelengths land on it too evenly to separate; it takes a highlight with a hard
  // shoulder for the split to read as colour rather than as a slightly warm edge.
  vec3 win = normalize(vec3(-0.62, 0.44, 0.65));
  c += vec3(0.96, 0.99, 1.00) * pow(max(dot(d, win), 0.0), 30.0) * 4.20;
  float fill = max(dot(d, normalize(vec3(-0.40, -0.72, 0.52))), 0.0);
  c += vec3(0.30, 0.44, 0.82) * pow(fill, 6.0) * 0.26;
  return c;
}

// The type, over the surface it is printed on. Only the raster's alpha is read and the two
// colours arrive as uniforms, which keeps this independent of whether the upload path
// premultiplied the texture: alpha is the one channel that means the same thing either way,
// and its mip chain is a straight coverage average. Reading rgb instead renders correctly on
// one machine and blows the body out to white on the next.
vec3 page(vec2 uv, float lod) {
  return mix(u_surface, u_ink, textureLod(u_bg, uv, lod).a);
}

// Into the button's own frame. The stretch is a scale, never a rotation: a pill that tips
// over as you drag it diagonally stops reading as a button.
vec2 toLocal(vec2 frag) {
  return (frag - u_centre) / u_stretch;
}

float sdShape(vec2 q) {
  vec2 a = abs(q) - (u_half - u_radius);
  vec2 m = max(a, 0.0);
  float corner = pow(pow(m.x, CORNER_N) + pow(m.y, CORNER_N), 1.0 / CORNER_N);
  float d = min(max(a.x, a.y), 0.0) + corner - u_radius;
  // The gel wobble: the boundary breathes in and out around the perimeter. The angle is
  // aspect-corrected so the lobes travel evenly round a pill instead of bunching at its ends.
  float ang = atan(q.y * (u_half.x / u_half.y), q.x);
  return d - u_wobble * sin(ang * 3.0 + u_phase);
}

void main() {
  // y-down device pixels throughout, so the type raster and every uniform share the
  // orientation of the 2D canvas it was rastered on.
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = frag / u_res;
  float cov = texture(u_bg, uv).a;

  vec2 q = toLocal(frag);
  float d = sdShape(q);

  // Contact shadow: the same shape dropped a few pixels, so the button reads as resting
  // above the type rather than punched into it. It carries no colour of its own — it is
  // pure coverage, which is what lets it darken a page this canvas cannot see.
  float ds = sdShape(toLocal(frag - vec2(0.0, SHADOW_DROP * u_px)));
  float shade = exp(-max(ds, 0.0) / (10.0 * u_px)) * mix(0.20, 0.16, u_ambient);
  vec4 under = vec4(u_ink * cov * (1.0 - shade), 1.0 - (1.0 - shade) * (1.0 - cov));

  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) {
    outColor = under;
    return;
  }

  // Gradient of the distance field. Central differences rather than the analytic form,
  // because the wobble term above has no tidy derivative.
  float h = 0.7 * u_px;
  vec2 g = normalize(vec2(sdShape(q + vec2(h, 0.0)) - sdShape(q - vec2(h, 0.0)),
                          sdShape(q + vec2(0.0, h)) - sdShape(q - vec2(0.0, h))) + 1e-5);

  // Bevel profile: a quarter circle rolling from the rim up onto the flat top of the
  // button. e is 0 at the boundary and 1 once the glass has levelled off.
  float e = clamp(-d / u_bevel, 0.0, 1.0);
  float z = sqrt(max(1e-4, 1.0 - (1.0 - e) * (1.0 - e)));
  float tilt = (1.0 - e) / max(z, GRAZE);
  vec3 N = normalize(vec3(g * tilt * EDGE_STEEP, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);

  // Blur scaled by how hard this pixel displaces: where the lens squeezes type from far
  // outside into a couple of pixels, that is the sampling rate the compression asks for.
  vec3 Rmid = refract(-V, N, 1.0 / (0.5 * (IOR_VIOLET + IOR_RED)));
  vec2 disp = Rmid.xy / max(-Rmid.z, 0.25) * u_depth;
  float lod = FROST * log2(1.0 + length(disp) / (1.6 * u_px)) + BASE_LOD;

  // Everything below happens once per wavelength: the page seen through the glass, and the
  // environment seen in it, each at its own index. Both sides matter — the refraction
  // fringes the letterforms, and the split reflection is what puts a spectrum on the rim
  // even where the page underneath is plain white.
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  // y-up for anything to do with the environment; the refraction stays in the y-down pixel
  // frame it samples with.
  vec3 Nup = vec3(N.x, -N.y, N.z);
  vec2 wedge = vec2(g.x, -g.y) * DISPERSE_REFL * (1.0 - e);
  vec3 sum = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < SPECTRAL_TAPS; i++) {
    float u = (float(i) + 0.5) / float(SPECTRAL_TAPS);
    vec3 w = wavelength(u);
    vec3 R = refract(-V, N, 1.0 / mix(IOR_VIOLET, IOR_RED, u));
    vec2 s = frag + R.xy / max(-R.z, 0.25) * u_depth;
    vec3 through = page(clamp(s / u_res, 0.002, 0.998), lod);
    vec3 back = env(reflect(-V, normalize(Nup + vec3(wedge * (u - 0.5), 0.0))), u_light, u_ambient);
    // Roll the highlights off instead of letting them clip. A lobe that saturates every
    // wavelength to 1 is white by definition, and the split across it — which is the whole
    // spectrum — is thrown away in the framebuffer.
    back = back / (1.0 + back * 0.80);
    sum += w * mix(through, back, fres * 0.92);
    wsum += w;
  }
  // Dividing by the summed response keeps flat colour exactly itself instead of letting it
  // take on the average tint of the sampling curve.
  vec3 glass = sum / wsum;

  // The one part that is not optics: a faint scrim in the body, so the shape reads as a
  // solid object rather than as a distortion of the page. With nothing to keep legible it
  // stays low — this is where the glass gets to be clear. Dark glass sits *above* a black
  // page rather than under it, so on that side the scrim lifts the body instead of
  // darkening it, or the button vanishes into the background entirely.
  glass = mix(glass, mix(vec3(0.16, 0.17, 0.20), vec3(1.0), u_ambient), 0.10);

  // The body is opaque: it has already been composed over the surface it sits on, so only
  // its silhouette needs to blend, and the page keeps showing between the letterforms.
  outColor = mix(under, vec4(glass, 1.0), mask);
}`;

const SANS = '"Haas Recast", "Pretendard Variable", "Inter", sans-serif';
// The rasters are built at this multiple of stage units, so type stays crisp at 2x and the
// shader's mip chain has something to minify from.
const RASTER = 3;

// Three lines is enough to drag across and short enough to stay out of the way.
const LINES = [
  "Glass adds nothing to a page.",
  "It bends what is already there",
  "and gathers light at its edge.",
];
const LINE_H = 32;
const FIRST_BASELINE = 106;

function raster(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * RASTER);
  canvas.height = Math.round(h * RASTER);
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.setTransform(RASTER, 0, 0, RASTER, 0, 0);
  return ctx;
}

// The page the button sits on: the type, and nothing else. Letterforms are the clearest
// read there is on what a lens does to what it covers, and leaving the surface out of the
// raster is what keeps the canvas transparent between them.
function drawBackdrop(canvas: HTMLCanvasElement, ink: string) {
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  ctx.fillStyle = ink;
  ctx.font = `450 23px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // Left aligned, but the block as a whole is centred on the stage, so it sits under the
  // button without the ragged right edge a centred paragraph would have.
  const widest = Math.max(...LINES.map((line) => ctx.measureText(line).width));
  const x = (STAGE_W - widest) / 2;
  LINES.forEach((line, i) => ctx.fillText(line, x, FIRST_BASELINE + i * LINE_H));
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader alloc failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("program alloc failed");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
  }
  return program;
}

interface Handle {
  dispose: () => void;
}

interface Backdrop {
  page: HTMLCanvasElement;
  /** The page colour behind the canvas and the type's own, as [r, g, b] in 0..1. */
  surface: () => [number, number, number];
  ink: () => [number, number, number];
  /** Set by the WebGL side so a scheme flip re-uploads what was just re-rastered. */
  afterRedraw?: () => void;
  dispose: () => void;
}

// Mounted before a context is ever requested, and deliberately independent of one: the page
// is what the CSS-glass fallback sits on, so on a machine that refuses WebGL this layer is
// the whole demo. Booting the shader first would leave those users an empty stage.
function mountBackdrop(host: HTMLElement): Backdrop {
  // The type is drawn in the page's own token colour, read off a probe in the host so it
  // stays right when the scheme flips.
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
  const page = raster(STAGE_W, STAGE_H);
  page.className = "absolute inset-0 size-full";
  host.replaceChildren(probe, page);

  const lightScheme = window.matchMedia("(prefers-color-scheme: light)");
  const token = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color || "#888";
  };

  const backdrop: Backdrop = {
    page,
    surface: () => surfaceColor(host) ?? channels(token("--bg-primary")) ?? [1, 1, 1],
    ink: () => channels(token("--text-primary")) ?? [0, 0, 0],
    dispose: () => {
      lightScheme.removeEventListener("change", redraw);
      host.replaceChildren();
    },
  };

  function redraw() {
    drawBackdrop(page, token("--text-primary"));
    backdrop.afterRedraw?.();
  }

  redraw();
  lightScheme.addEventListener("change", redraw);
  return backdrop;
}

// getComputedStyle hands back rgb()/rgba(); anything without one is treated as absent.
function channels(color: string): [number, number, number] | null {
  const rgb = color?.match(/[\d.]+/g);
  if (!rgb || rgb.length < 3 || (rgb.length > 3 && Number(rgb[3]) === 0)) return null;
  return [Number(rgb[0]) / 255, Number(rgb[1]) / 255, Number(rgb[2]) / 255];
}

// The glass frosts and refracts the page it sits on, and the shader cannot see it, so the
// nearest painted ancestor is measured and handed over as a uniform instead. Null when
// nothing up the chain paints at all — the caller falls back to the page token rather than
// to white, because a transparent chain still means "whatever colour this scheme's page is",
// and guessing white there frosts a dark page with a light body.
function surfaceColor(el: HTMLElement): [number, number, number] | null {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = channels(getComputedStyle(node).backgroundColor);
    if (bg) return bg;
  }
  return null;
}

function boot(
  canvas: HTMLCanvasElement,
  backdrop: Backdrop,
  onLost: () => void,
): Handle | undefined {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return undefined;

  const program = linkProgram(gl);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u("u_res");
  const uPx = u("u_px");
  const uCentre = u("u_centre");
  const uHalf = u("u_half");
  const uRadius = u("u_radius");
  const uStretch = u("u_stretch");
  const uWobble = u("u_wobble");
  const uPhase = u("u_phase");
  const uBevel = u("u_bevel");
  const uDepth = u("u_depth");
  const uAmbient = u("u_ambient");
  const uLight = u("u_light");
  const uSurface = u("u_surface");
  const uInk = u("u_ink");
  gl.uniform1i(u("u_bg"), 0);

  const bgTex = gl.createTexture();

  const upload = (tex: WebGLTexture | null, source: HTMLCanvasElement, mips: boolean) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (!mips) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const lightScheme = window.matchMedia("(prefers-color-scheme: light)");

  // The page canvas is both the DOM layer under this one and the texture sampled here, so a
  // scheme flip is one re-raster followed by one re-upload.
  const uploadPage = () => upload(bgTex, backdrop.page, true);

  uploadPage();
  backdrop.afterRedraw = () => {
    uploadPage();
    if (!raf) draw();
  };

  // One texture tap per wavelength over a button-sized area is cheap; capping the ratio
  // below the display's own would only soften a very clean edge.
  const dpr = () => Math.min(3, window.devicePixelRatio || 1);
  let scale = 1;
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr()));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr()));
    scale = w / STAGE_W;
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };

  const pos = { x: REST.x, y: REST.y };
  const target = { x: REST.x, y: REST.y };
  const vel = { x: 0, y: 0 };
  const light = { x: 0, y: 0 };
  let press = 0;
  let pressed = false;
  let wobble = 0;
  let phase = 0;
  let dragId: number | null = null;
  let grab = { x: 0, y: 0 };
  let time = 0;

  const inside = (x: number, y: number) => {
    const dx = Math.abs(x - pos.x) - (BUTTON_W / 2 - RADIUS);
    const dy = Math.abs(y - pos.y) - (BUTTON_H / 2 - RADIUS);
    return (
      Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - RADIUS < 0
    );
  };

  const draw = () => {
    resize();
    // Pressing squashes the button and thickens the glass, so the type under it bends
    // harder at the same moment the shape gives way.
    const shrink = 1 - press * 0.05;
    // Stretch along the axis of travel, thinning across it. Area preserving, and never a
    // rotation: the pill stays level however you drag it.
    const s = Math.min(0.16, Math.hypot(vel.x, vel.y) / 1600);
    const bias = (vel.x * vel.x - vel.y * vel.y) / Math.max(1, vel.x * vel.x + vel.y * vel.y);

    gl.useProgram(program);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uPx, scale);
    gl.uniform2f(uCentre, pos.x * scale, pos.y * scale);
    gl.uniform2f(uHalf, (BUTTON_W / 2) * shrink * scale, (BUTTON_H / 2) * shrink * scale);
    gl.uniform1f(uRadius, RADIUS * shrink * scale);
    gl.uniform2f(uStretch, 1 + s * bias, 1 - s * bias);
    gl.uniform1f(uWobble, wobble * scale);
    gl.uniform1f(uPhase, phase);
    gl.uniform1f(uBevel, BEVEL * scale);
    gl.uniform1f(uDepth, DEPTH * (1 + press * 0.35) * scale);
    gl.uniform1f(uAmbient, lightScheme.matches ? 1 : 0);
    gl.uniform2f(uLight, light.x, light.y);
    gl.uniform3fv(uSurface, backdrop.surface());
    gl.uniform3fv(uInk, backdrop.ink());

    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  let disposed = false;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;

  const frame = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (now - lastDraw < 1000 / FPS - 1) return;
    lastDraw = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    // The button trails its target rather than sticking to the pointer. That lag is what
    // makes it read as a body of liquid being pulled along.
    const before = { x: pos.x, y: pos.y };
    const follow = Math.min(1, dt * 13);
    pos.x += (target.x - pos.x) * follow;
    pos.y += (target.y - pos.y) * follow;
    const ease = Math.min(1, dt * 10);
    vel.x += ((pos.x - before.x) / Math.max(dt, 1e-3) - vel.x) * ease;
    vel.y += ((pos.y - before.y) / Math.max(dt, 1e-3) - vel.y) * ease;

    press += ((pressed ? 1 : 0) - press) * Math.min(1, dt * 18);
    phase += dt * 13;
    wobble *= Math.exp(-dt * 4.5);

    if (dragId === null) {
      light.x = Math.cos(time * 0.23) * 0.55;
      light.y = Math.sin(time * 0.19) * 0.35;
    }

    draw();
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const sync = () => {
    if (disposed) return;
    if (reduced.matches || document.visibilityState !== "visible") {
      stop();
      draw();
      return;
    }
    if (raf) return;
    last = performance.now();
    lastDraw = 0;
    raf = requestAnimationFrame(frame);
  };

  const at = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * STAGE_W,
      y: ((e.clientY - b.top) / b.height) * STAGE_H,
    };
  };
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(STAGE_W - BOUND.x, Math.max(BOUND.x, p.x)),
    y: Math.min(STAGE_H - BOUND.y, Math.max(BOUND.y, p.y)),
  });

  const down = (e: PointerEvent) => {
    const p = at(e);
    if (!inside(p.x, p.y)) return;
    dragId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    grab = { x: pos.x - p.x, y: pos.y - p.y };
    pressed = true;
    canvas.style.cursor = "grabbing";
    if (!raf) draw();
  };

  const move = (e: PointerEvent) => {
    const p = at(e);
    if (dragId === e.pointerId) {
      const next = clamp({ x: p.x + grab.x, y: p.y + grab.y });
      target.x = next.x;
      target.y = next.y;
      light.x = ((p.x / STAGE_W) * 2 - 1) * 0.9;
      light.y = (1 - (p.y / STAGE_H) * 2) * 0.6;
    } else {
      canvas.style.cursor = inside(p.x, p.y) ? "grab" : "default";
    }
    if (!raf) draw();
  };

  const up = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    pressed = false;
    canvas.style.cursor = "grab";
    // The release sends a wobble through the shape, stronger the harder it was dragged.
    wobble = Math.min(2.4, 1.3 + Math.hypot(vel.x, vel.y) / 1000);
    phase = 0;
    if (!raf) draw();
  };

  const lost = (e: Event) => {
    e.preventDefault();
    disposed = true;
    stop();
    onLost();
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);

  const observer = new ResizeObserver(() => {
    if (!raf) draw();
  });
  observer.observe(canvas);

  draw();
  sync();

  return {
    dispose: () => {
      disposed = true;
      stop();
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      gl.deleteTexture(bgTex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      backdrop.afterRedraw = undefined;
    },
  };
}

export const LiquidGlass = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Handle | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let backdrop: Backdrop | null = null;
    // The rasters measure real type, so they have to wait for the site's face to load or the
    // page is laid out in a fallback font and never rebuilt.
    const start = () => {
      if (cancelled || !canvasRef.current || !hostRef.current) return;
      backdrop = mountBackdrop(hostRef.current);
      handleRef.current = boot(canvasRef.current, backdrop, () => setLive(false)) ?? null;
      if (handleRef.current) setLive(true);
    };
    const fonts = document.fonts?.ready;
    if (fonts) fonts.then(start);
    else start();
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
      backdrop?.dispose();
    };
  }, []);

  return (
    <div className="flex w-full justify-center">
      <div
        className="relative w-full max-w-[620px]"
        style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
      >
        {/* Holds the rastered type. The shader draws its own copy of it, so this layer is
            only ever visible on a machine that refused the context — where it is the page
            the CSS pill below sits on. */}
        <div
          ref={hostRef}
          aria-hidden
          className="absolute inset-0"
          style={{ opacity: live ? 0 : 1 }}
        />

        {!live && (
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white/12 smooth-shadow-ring-sm"
            style={{
              top: `${((REST.y - BUTTON_H / 2) / STAGE_H) * 100}%`,
              width: `${(BUTTON_W / STAGE_W) * 100}%`,
              height: `${(BUTTON_H / STAGE_H) * 100}%`,
              backdropFilter: "blur(5px) saturate(1.5)",
              WebkitBackdropFilter: "blur(5px) saturate(1.5)",
            }}
          />
        )}

        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 size-full touch-none transition-opacity duration-500"
          style={{ opacity: live ? 1 : 0 }}
        />
      </div>
    </div>
  );
};
