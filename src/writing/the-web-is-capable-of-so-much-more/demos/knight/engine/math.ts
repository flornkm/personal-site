// Zero-allocation linear algebra on Float32Arrays, gl-matrix style: every op writes into `out`
// and returns it, so the frame loop never creates garbage. Matrices are column-major.

export type Vec3 = Float32Array;
export type Quat = Float32Array;
export type Mat4 = Float32Array;
export type Mat3 = Float32Array;

const EPS = 1e-6;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach: `rate` is the fraction left after one second.
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
// Interpolates along the shorter way round.
export const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;

export const vec3 = {
  create(x = 0, y = 0, z = 0): Vec3 {
    const out = new Float32Array(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },
  set(out: Vec3, x: number, y: number, z: number) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },
  copy(out: Vec3, a: ArrayLike<number>) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
  },
  add(out: Vec3, a: Vec3, b: Vec3) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },
  sub(out: Vec3, a: Vec3, b: Vec3) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },
  scale(out: Vec3, a: Vec3, s: number) {
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
  },
  scaleAndAdd(out: Vec3, a: Vec3, b: Vec3, s: number) {
    out[0] = a[0] + b[0] * s;
    out[1] = a[1] + b[1] * s;
    out[2] = a[2] + b[2] * s;
    return out;
  },
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross(out: Vec3, a: Vec3, b: Vec3) {
    const ax = a[0],
      ay = a[1],
      az = a[2],
      bx = b[0],
      by = b[1],
      bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  length: (a: Vec3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
  distance(a: Vec3, b: Vec3) {
    const x = a[0] - b[0],
      y = a[1] - b[1],
      z = a[2] - b[2];
    return Math.sqrt(x * x + y * y + z * z);
  },
  normalize(out: Vec3, a: Vec3) {
    const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const k = l > EPS ? 1 / l : 0;
    out[0] = a[0] * k;
    out[1] = a[1] * k;
    out[2] = a[2] * k;
    return out;
  },
  lerp(out: Vec3, a: Vec3, b: Vec3, t: number) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  },
  transformMat4(out: Vec3, a: Vec3, m: Mat4) {
    const x = a[0],
      y = a[1],
      z = a[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
  },
  // Direction only: ignores the matrix translation.
  transformMat4Dir(out: Vec3, a: Vec3, m: Mat4) {
    const x = a[0],
      y = a[1],
      z = a[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z;
    out[1] = m[1] * x + m[5] * y + m[9] * z;
    out[2] = m[2] * x + m[6] * y + m[10] * z;
    return out;
  },
  transformQuat(out: Vec3, a: Vec3, q: Quat) {
    const qx = q[0],
      qy = q[1],
      qz = q[2],
      qw = q[3];
    const x = a[0],
      y = a[1],
      z = a[2];
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    out[0] = x + qw * tx + qy * tz - qz * ty;
    out[1] = y + qw * ty + qz * tx - qx * tz;
    out[2] = z + qw * tz + qx * ty - qy * tx;
    return out;
  },
};

export const quat = {
  create(): Quat {
    const out = new Float32Array(4);
    out[3] = 1;
    return out;
  },
  identity(out: Quat) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  },
  copy(out: Quat, a: Quat) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
  },
  setAxisAngle(out: Quat, axis: ArrayLike<number>, rad: number) {
    const s = Math.sin(rad / 2);
    out[0] = axis[0] * s;
    out[1] = axis[1] * s;
    out[2] = axis[2] * s;
    out[3] = Math.cos(rad / 2);
    return out;
  },
  multiply(out: Quat, a: Quat, b: Quat) {
    const ax = a[0],
      ay = a[1],
      az = a[2],
      aw = a[3];
    const bx = b[0],
      by = b[1],
      bz = b[2],
      bw = b[3];
    out[0] = ax * bw + aw * bx + ay * bz - az * by;
    out[1] = ay * bw + aw * by + az * bx - ax * bz;
    out[2] = az * bw + aw * bz + ax * by - ay * bx;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
  },
  // Intrinsic Y (yaw), then X (pitch), then Z (roll) — the natural order for joints that swing
  // forward/back about X after facing about Y.
  fromEulerYXZ(out: Quat, x: number, y: number, z: number) {
    const cx = Math.cos(x / 2),
      sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2),
      sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2),
      sz = Math.sin(z / 2);
    out[0] = sx * cy * cz + cx * sy * sz;
    out[1] = cx * sy * cz - sx * cy * sz;
    out[2] = cx * cy * sz - sx * sy * cz;
    out[3] = cx * cy * cz + sx * sy * sz;
    return out;
  },
  // Shortest rotation taking unit vector a onto unit vector b.
  rotationTo(out: Quat, a: Vec3, b: Vec3) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.999999) {
      // Opposite: any perpendicular axis.
      let x = 0,
        y = -a[2],
        z = a[1];
      if (Math.hypot(x, y, z) < EPS) {
        x = a[2];
        y = 0;
        z = -a[0];
      }
      const l = Math.hypot(x, y, z);
      out[0] = x / l;
      out[1] = y / l;
      out[2] = z / l;
      out[3] = 0;
      return out;
    }
    out[0] = a[1] * b[2] - a[2] * b[1];
    out[1] = a[2] * b[0] - a[0] * b[2];
    out[2] = a[0] * b[1] - a[1] * b[0];
    out[3] = 1 + d;
    return quat.normalize(out, out);
  },
  normalize(out: Quat, a: Quat) {
    const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1;
    out[0] = a[0] / l;
    out[1] = a[1] / l;
    out[2] = a[2] / l;
    out[3] = a[3] / l;
    return out;
  },
  invert(out: Quat, a: Quat) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = a[3];
    return out;
  },
  slerp(out: Quat, a: Quat, b: Quat, t: number) {
    let bx = b[0],
      by = b[1],
      bz = b[2],
      bw = b[3];
    let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    let k0 = 1 - t,
      k1 = t;
    if (cos < 0.9995) {
      const omega = Math.acos(cos);
      const s = Math.sin(omega);
      k0 = Math.sin((1 - t) * omega) / s;
      k1 = Math.sin(t * omega) / s;
    }
    out[0] = a[0] * k0 + bx * k1;
    out[1] = a[1] * k0 + by * k1;
    out[2] = a[2] * k0 + bz * k1;
    out[3] = a[3] * k0 + bw * k1;
    return quat.normalize(out, out);
  },
};

export const mat4 = {
  create(): Mat4 {
    return mat4.identity(new Float32Array(16));
  },
  identity(out: Mat4) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  },
  copy(out: Mat4, a: Mat4) {
    out.set(a);
    return out;
  },
  multiply(out: Mat4, a: Mat4, b: Mat4) {
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4],
        b1 = b[i * 4 + 1],
        b2 = b[i * 4 + 2],
        b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  fromRotationTranslationScale(out: Mat4, q: Quat, t: ArrayLike<number>, s: ArrayLike<number>) {
    const x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    const sx = s[0],
      sy = s[1],
      sz = s[2];
    out[0] = (1 - (yy + zz)) * sx;
    out[1] = (xy + wz) * sx;
    out[2] = (xz - wy) * sx;
    out[3] = 0;
    out[4] = (xy - wz) * sy;
    out[5] = (1 - (xx + zz)) * sy;
    out[6] = (yz + wx) * sy;
    out[7] = 0;
    out[8] = (xz + wy) * sz;
    out[9] = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = t[0];
    out[13] = t[1];
    out[14] = t[2];
    out[15] = 1;
    return out;
  },
  invert(out: Mat4, a: Mat4) {
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return mat4.identity(out);
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  perspective(out: Mat4, fovy: number, aspect: number, near: number, far: number) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },
  ortho(
    out: Mat4,
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },
  lookAt(out: Mat4, eye: ArrayLike<number>, center: ArrayLike<number>, up: ArrayLike<number>) {
    let zx = eye[0] - center[0],
      zy = eye[1] - center[1],
      zz = eye[2] - center[2];
    let l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= l;
    zy /= l;
    zz /= l;
    let xx = up[1] * zz - up[2] * zy,
      xy = up[2] * zx - up[0] * zz,
      xz = up[0] * zy - up[1] * zx;
    l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= l;
    xy /= l;
    xz /= l;
    const yx = zy * xz - zz * xy,
      yy = zz * xx - zx * xz,
      yz = zx * xy - zy * xx;
    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },
};

// Six planes (a, b, c, d) extracted from a view-projection matrix; normals point inward. Planes
// come in pairs: the fourth row of the matrix plus and minus its first, second and third rows.
export function frustumFromMatrix(out: Float32Array, m: Mat4) {
  for (let i = 0; i < 6; i++) {
    const row = i >> 1;
    const s = i & 1 ? -1 : 1;
    const a = m[3] + s * m[row],
      b = m[7] + s * m[4 + row],
      c = m[11] + s * m[8 + row],
      d = m[15] + s * m[12 + row];
    const l = Math.sqrt(a * a + b * b + c * c) || 1;
    out[i * 4] = a / l;
    out[i * 4 + 1] = b / l;
    out[i * 4 + 2] = c / l;
    out[i * 4 + 3] = d / l;
  }
  return out;
}

export function sphereInFrustum(planes: Float32Array, x: number, y: number, z: number, r: number) {
  for (let i = 0; i < 24; i += 4) {
    if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < -r) return false;
  }
  return true;
}

// Deterministic hash noise, so the world is identical on every load and on server and client.
export function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi),
    b = hash2(xi + 1, yi),
    c = hash2(xi, yi + 1),
    d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0,
    amp = 0.5,
    freq = 1,
    norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Seeded PRNG (mulberry32) for procedural placement.
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
