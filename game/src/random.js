// Skyridge Courier — deterministic randomness.
// One clear job: a seeded generator and smooth value noise, so the island
// is the same every run and screenshots can be reproduced.

// mulberry32: small, fast, seeded pseudo-random generator.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a pair of integer lattice coordinates to a stable 0..1 value.
function latticeHash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

// Two-dimensional value noise in 0..1, smooth and tile-free.
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = latticeHash(ix, iz, seed);
  const b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed);
  const d = latticeHash(ix + 1, iz + 1, seed);
  const u = smoothStep(fx);
  const v = smoothStep(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise: several octaves of value noise, normalised to 0..1.
export function fbmNoise(x, z, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep between two edges, 0 below lo and 1 above hi.
export function smoothBetween(v, lo, hi) {
  if (v <= lo) return 0;
  if (v >= hi) return 1;
  return smoothStep((v - lo) / (hi - lo));
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Wrap an angle in radians to (-PI, PI].
export function wrapAngle(rad) {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Distance from point (px, pz) to the segment (ax, az)-(bx, bz).
export function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t;
  const qz = az + dz * t;
  return Math.hypot(px - qx, pz - qz);
}
