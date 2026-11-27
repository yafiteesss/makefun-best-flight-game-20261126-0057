// Skyridge Courier — the island itself.
// One clear job: ground height, runways, ring course, trees and clouds.
// Everything is a pure function of world coordinates, so the world never
// changes between runs and the renderer and the flight model always agree.

import { WORLD, RUNWAYS, RINGS } from './config.js';
import { clamp, degToRad, distanceToSegment, fbmNoise, makeRng, smoothBetween, valueNoise } from './random.js';

// ---------------------------------------------------------------------------
// Ground height
// ---------------------------------------------------------------------------

// Local coordinates of a world point relative to a runway: along is metres
// down the strip from its centre, across is metres sideways from it.
export function runwayLocal(runway, x, z) {
  const heading = degToRad(runway.headingDeg);
  const dx = x - runway.x;
  const dz = z - runway.z;
  const along = dx * Math.sin(heading) + dz * -Math.cos(heading);
  const across = dx * Math.cos(heading) + dz * Math.sin(heading);
  return { along, across };
}

// Raw rolling terrain before runways are flattened into it.
function rawHeight(x, z) {
  // Distance from the island centre; the island sinks into the sea outside.
  const distCentre = Math.hypot(x, z);
  const islandFalloff = smoothBetween(WORLD.islandRadius - distCentre, -220, 260);

  // Rolling hills: two octaves of noise over the whole island.
  const hills = fbmNoise(x / 950 + 7.3, z / 950 + 2.9, 11, 3);
  let h = 12 + hills * 130;

  // A long ridge along the east side, for the valley the rings thread.
  const ridge = smoothBetween(x, 700, 1500) * (1 - smoothBetween(Math.abs(z + 400), 900, 1800));
  h += ridge * 120;

  // Mount Kelud: a steep volcanic cone in the north-east.
  const dVolcano = Math.hypot(x - WORLD.volcanoX, z - WORLD.volcanoZ);
  h += WORLD.volcanoHeight * Math.exp(-((dVolcano / WORLD.volcanoRadius) ** 2));

  // Telaga Biru: a scooped lake basin in the south-west.
  const dLake = Math.hypot(x - WORLD.lakeX, z - WORLD.lakeZ);
  h -= 46 * Math.exp(-((dLake / WORLD.lakeRadius) ** 2));

  // Sink below sea level outside the island, with a beach band at the edge.
  h = h * islandFalloff - (1 - islandFalloff) * 26;
  return h;
}

export function groundHeight(x, z) {
  let h = rawHeight(x, z);
  // Carve the ring valley: the course threads a low corridor through the
  // hills, so a pilot can actually fly it instead of climbing a ridge.
  let nearest = Infinity;
  let nearestFloor = 30;
  for (let i = 0; i < RING_WAYPOINTS.length - 1; i++) {
    const a = RING_WAYPOINTS[i];
    const b = RING_WAYPOINTS[i + 1];
    const d = distanceToSegment(x, z, a.x, a.z, b.x, b.z);
    if (d < nearest) {
      nearest = d;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
      nearestFloor = 30 + 34 * ((i + t) / (RING_WAYPOINTS.length - 1));
    }
  }
  if (nearest < 170) {
    const factor = smoothBetween(170 - nearest, 0, 100);
    h = h * (1 - factor) + Math.min(h, nearestFloor + 6) * factor;
  }
  // Flatten the ground into each runway so strips sit on level earth.
  for (const runway of RUNWAYS) {
    const { along, across } = runwayLocal(runway, x, z);
    const halfLen = runway.length / 2;
    const flatZone = smoothBetween(halfLen + 150 - Math.abs(along), 0, 130)
      * smoothBetween(110 - Math.abs(across), 0, 70);
    if (flatZone > 0) {
      h = h * (1 - flatZone) + runway.elevation * flatZone;
    }
  }
  return h;
}

// True when the point is on a runway strip (used for landings).
export function onRunway(x, z) {
  for (const runway of RUNWAYS) {
    const { along, across } = runwayLocal(runway, x, z);
    if (Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2) {
      return runway;
    }
  }
  return null;
}

// True when the point is over open water (sea or lake).
export function overWater(x, z) {
  if (groundHeight(x, z) < WORLD.seaLevel + 1.5) return true;
  return false;
}

// Approximate slope at a point, for shading and for tree placement.
export function groundSlope(x, z) {
  const step = 12;
  const dx = groundHeight(x + step, z) - groundHeight(x - step, z);
  const dz = groundHeight(x, z + step) - groundHeight(x, z - step);
  return Math.hypot(dx, dz) / (2 * step);
}

// ---------------------------------------------------------------------------
// Ring course
// ---------------------------------------------------------------------------

// Waypoints of the ring course, from Merpati Field up the valley to Kelud Strip.
const RING_WAYPOINTS = [
  { x: 0, z: -120, lift: 70 },
  { x: 260, z: -520, lift: 85 },
  { x: 620, z: -880, lift: 100 },
  { x: 880, z: -1150, lift: 120 },
  { x: 760, z: -1500, lift: 110 },
  { x: 420, z: -1780, lift: 95 },
  { x: 0, z: -1980, lift: 85 },
  { x: -350, z: -2150, lift: 70 },
];

// Catmull-Rom interpolation between waypoints, so the course curves smoothly.
function coursePoint(t) {
  const n = RING_WAYPOINTS.length;
  const span = n - 1;
  const f = clamp(t, 0, 1) * span;
  const i = Math.min(Math.floor(f), span - 1);
  const u = f - i;
  const p0 = RING_WAYPOINTS[Math.max(i - 1, 0)];
  const p1 = RING_WAYPOINTS[i];
  const p2 = RING_WAYPOINTS[i + 1];
  const p3 = RING_WAYPOINTS[Math.min(i + 2, n - 1)];
  const blend = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return {
    x: blend(p0.x, p1.x, p2.x, p3.x),
    z: blend(p0.z, p1.z, p2.z, p3.z),
    lift: blend(p0.lift, p1.lift, p2.lift, p3.lift),
  };
}

// The rings themselves: centre, facing direction and radius.
export function buildRings() {
  const rings = [];
  for (let i = 0; i < RINGS.count; i++) {
    const t = (i + 0.5) / RINGS.count;
    const point = coursePoint(t);
    const ahead = coursePoint(Math.min(t + 0.02, 1));
    const heading = Math.atan2(ahead.x - point.x, -(ahead.z - point.z));
    const ground = groundHeight(point.x, point.z);
    rings.push({
      index: i,
      x: point.x,
      y: ground + point.lift,
      z: point.z,
      heading,
      radius: RINGS.radius,
      passed: false,
    });
  }
  return rings;
}

// ---------------------------------------------------------------------------
// Trees, clouds, birds
// ---------------------------------------------------------------------------

// Deterministic tree scatter: positions that stay fixed for every session.
export function buildTrees() {
  const rng = makeRng(20261126);
  const trees = [];
  let tries = 0;
  while (trees.length < 650 && tries < 6000) {
    tries++;
    const x = (rng() * 2 - 1) * 2400;
    const z = (rng() * 2 - 1) * 2400;
    const h = groundHeight(x, z);
    if (h < 10 || h > 210) continue;
    if (onRunway(x, z)) continue;
    if (overWater(x, z)) continue;
    if (groundSlope(x, z) > 0.55) continue;
    // Keep trees out of the ring corridor so the course stays readable.
    let nearCourse = false;
    for (let t = 0; t <= 1; t += 0.05) {
      const p = coursePoint(t);
      if (Math.hypot(x - p.x, z - p.z) < 55) { nearCourse = true; break; }
    }
    if (nearCourse) continue;
    trees.push({ x, z, y: h, size: 7 + rng() * 9, shade: 0.75 + rng() * 0.4 });
  }
  return trees;
}

// Soft clouds drifting slowly over the island.
export function buildClouds() {
  const rng = makeRng(777);
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    clouds.push({
      x: (rng() * 2 - 1) * 2800,
      y: 380 + rng() * 220,
      z: (rng() * 2 - 1) * 2800,
      radius: 90 + rng() * 160,
      drift: 2 + rng() * 4,
      alpha: 0.5 + rng() * 0.3,
    });
  }
  return clouds;
}

// A few seabirds circling the lake for life in the sky.
export function buildBirds() {
  const birds = [];
  for (let i = 0; i < 7; i++) {
    birds.push({
      angle: (i / 7) * Math.PI * 2,
      radius: 120 + (i % 3) * 60,
      height: 90 + (i % 4) * 25,
      speed: 0.12 + (i % 3) * 0.03,
      phase: i * 1.7,
    });
  }
  return birds;
}
