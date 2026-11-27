// Skyridge Courier — everything the eye sees, part one: the world.
// One clear job: project the island, sky, runway, rings, trees and clouds
// onto the canvas from a chase camera behind the aircraft.

import { COLOURS, RUNWAYS } from './config.js';
import { clamp, degToRad, lerp, radToDeg } from './random.js';
import { forwardVector, rightVector } from './flight.js';
import { groundHeight } from './terrain.js';
import { currentWarnings } from './missions.js';

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export function makeCamera(plane, width, height) {
  const fwd = forwardVector(plane);
  const right = rightVector(plane);
  // Up is perpendicular to forward and right; rolling the aircraft rolls it.
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  const cosR = Math.cos(plane.roll);
  const sinR = Math.sin(plane.roll);
  const rightR = {
    x: right.x * cosR + up.x * sinR,
    y: right.y * cosR + up.y * sinR,
    z: right.z * cosR + up.z * sinR,
  };
  const upR = {
    x: up.x * cosR - right.x * sinR,
    y: up.y * cosR - right.y * sinR,
    z: up.z * cosR - right.z * sinR,
  };
  const camPos = {
    x: plane.x - fwd.x * 15 + upR.x * 4.4,
    y: plane.y - fwd.y * 15 + upR.y * 4.4,
    z: plane.z - fwd.z * 15 + upR.z * 4.4,
  };
  const focal = (height / 2) / Math.tan(degToRad(35));
  return { pos: camPos, fwd, right: rightR, up: upR, focal, width, height };
}

// Project a world point to screen space; null when behind the camera.
export function project(cam, p) {
  const vx = p.x - cam.pos.x;
  const vy = p.y - cam.pos.y;
  const vz = p.z - cam.pos.z;
  const cz = vx * cam.fwd.x + vy * cam.fwd.y + vz * cam.fwd.z;
  if (cz < 2) return null;
  const cx = vx * cam.right.x + vy * cam.right.y + vz * cam.right.z;
  const cy = vx * cam.up.x + vy * cam.up.y + vz * cam.up.z;
  return {
    x: cam.width / 2 + (cx / cz) * cam.focal,
    y: cam.height / 2 - (cy / cz) * cam.focal,
    dist: cz,
    scale: cam.focal / cz,
  };
}

// ---------------------------------------------------------------------------
// Sky, sun and clouds
// ---------------------------------------------------------------------------

const SUN_DIR = { x: 0.72, y: 0.5, z: -0.48 };

export function drawSky(ctx, cam, time) {
  const { width: W, height: H } = cam;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COLOURS.skyTop);
  grad.addColorStop(0.55, COLOURS.skyMid);
  grad.addColorStop(0.8, COLOURS.skyHorizon);
  grad.addColorStop(1, '#dceef7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // The sun: a bright disc with a soft halo, fixed in the eastern sky.
  const sunPoint = project(cam, {
    x: cam.pos.x + SUN_DIR.x * 3000,
    y: cam.pos.y + SUN_DIR.y * 3000,
    z: cam.pos.z + SUN_DIR.z * 3000,
  });
  if (sunPoint && sunPoint.x > -100 && sunPoint.x < W + 100 && sunPoint.y > -100 && sunPoint.y < H + 100) {
    const halo = ctx.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, 130);
    halo.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
    halo.addColorStop(0.25, 'rgba(255, 230, 150, 0.55)');
    halo.addColorStop(1, 'rgba(255, 230, 150, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunPoint.x, sunPoint.y, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOURS.sun;
    ctx.beginPath();
    ctx.arc(sunPoint.x, sunPoint.y, 22, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawClouds(ctx, cam, clouds, time) {
  for (const cloud of clouds) {
    const drifted = { x: cloud.x + time * cloud.drift, y: cloud.y, z: cloud.z };
    const p = project(cam, drifted);
    if (!p || p.dist > 4200) continue;
    const r = cloud.radius * p.scale;
    if (r < 4) continue;
    ctx.fillStyle = `rgba(255, 255, 255, ${cloud.alpha * 0.85})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.45, p.y + r * 0.08, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.5, p.y + r * 0.06, r * 0.55, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function terrainColour(h, slope) {
  if (h < 1.5) return COLOURS.sea;
  if (h < 5) return COLOURS.sand;
  if (h < 90) {
    const t = h / 90;
    return mixColour(COLOURS.grassLow, COLOURS.grassHigh, t);
  }
  if (h < 210) {
    const t = (h - 90) / 120;
    return mixColour(COLOURS.grassHigh, COLOURS.forest, t);
  }
  if (h < 380) {
    const t = (h - 210) / 170;
    return mixColour(COLOURS.forest, COLOURS.rock, t);
  }
  return COLOURS.snow;
}

function mixColour(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

function shadeColour(rgb, factor) {
  const m = rgb.match(/\d+/g).map(Number);
  const r = Math.round(m[0] * factor);
  const g = Math.round(m[1] * factor);
  const b = Math.round(m[2] * factor);
  return `rgb(${r},${g},${b})`;
}

// The ground as strips in camera space, drawn far to near so nearer ground
// paints over farther ground. Adaptive steps keep it fast and smooth.
export function drawTerrain(ctx, cam) {
  const { fwd, right } = cam;
  const maxDist = 2000;
  // Depth bands from far to near: [from, to, step].
  const bands = [
    [2000, 1600, 170],
    [1600, 700, 130],
    [700, 300, 70],
    [300, 40, 34],
    [40, 0, 18],
  ];
  for (const [dFar, dNear, dd] of bands) {
    for (let d = dFar; d > dNear; d -= dd) {
      const halfWidth = d * 0.85 + 260;
      const dl = Math.max(34, d * 0.075);
      for (let l = -halfWidth; l < halfWidth; l += dl) {
        const corners = [];
        let ok = true;
        for (const [od, ol] of [[0, 0], [dd, 0], [dd, dl], [0, dl]]) {
          const wx = cam.pos.x + fwd.x * (d + od) + right.x * (l + ol);
          const wz = cam.pos.z + fwd.z * (d + od) + right.z * (l + ol);
          const wy = groundHeight(wx, wz);
          const p = project(cam, { x: wx, y: wy, z: wz });
          if (!p) { ok = false; break; }
          corners.push({ p, h: wy, d: d + od });
        }
        if (!ok) continue;
        const hAvg = (corners[0].h + corners[1].h + corners[2].h + corners[3].h) / 4;
        const slope = Math.abs(corners[1].h - corners[0].h) / dd + Math.abs(corners[3].h - corners[0].h) / dl;
        let colour = terrainColour(hAvg, slope);
        // Sun-side shading: ground rising away from the camera catches light.
        const rise = (corners[1].h - corners[0].h) / dd;
        colour = shadeColour(colour, clamp(0.86 + rise * 0.9 - slope * 0.12, 0.55, 1.12));
        // Distance haze melts the far ground into the sky.
        const fog = clamp((corners[0].d - 500) / 1500, 0, 0.9);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(corners[0].p.x, corners[0].p.y);
        ctx.lineTo(corners[1].p.x, corners[1].p.y);
        ctx.lineTo(corners[2].p.x, corners[2].p.y);
        ctx.lineTo(corners[3].p.x, corners[3].p.y);
        ctx.closePath();
        ctx.fill();
        // Stroke with the same colour so no hairline seams show between quads.
        ctx.strokeStyle = colour;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        if (fog > 0.02) {
          ctx.fillStyle = `rgba(207, 232, 245, ${fog})`;
          ctx.fill();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Runways
// ---------------------------------------------------------------------------

function drawRunwayStrip(ctx, cam, runway) {
  const heading = degToRad(runway.headingDeg);
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = Math.sin(heading);
  const halfLen = runway.length / 2;
  const halfW = runway.width / 2;
  const y = runway.elevation + 0.4;
  const corner = (along, across) => project(cam, {
    x: runway.x + fx * along + rx * across,
    y,
    z: runway.z + fz * along + rz * across,
  });
  const c1 = corner(-halfLen, -halfW);
  const c2 = corner(halfLen, -halfW);
  const c3 = corner(halfLen, halfW);
  const c4 = corner(-halfLen, halfW);
  if (!c1 || !c2 || !c3 || !c4) return;
  ctx.fillStyle = COLOURS.runway;
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.lineTo(c3.x, c3.y);
  ctx.lineTo(c4.x, c4.y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = COLOURS.runwayMark;
  for (let a = -halfLen + 30; a < halfLen - 20; a += 46) {
    const d1 = corner(a, -1.1);
    const d2 = corner(a + 24, -1.1);
    const d3 = corner(a + 24, 1.1);
    const d4 = corner(a, 1.1);
    if (!d1 || !d2 || !d3 || !d4) continue;
    ctx.beginPath();
    ctx.moveTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.lineTo(d3.x, d3.y);
    ctx.lineTo(d4.x, d4.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    const a = end * (halfLen - 14);
    for (const across of [-9, -3, 3, 9]) {
      const d1 = corner(a - 8, across - 1.8);
      const d2 = corner(a + 8, across - 1.8);
      const d3 = corner(a + 8, across + 1.8);
      const d4 = corner(a - 8, across + 1.8);
      if (!d1 || !d2 || !d3 || !d4) continue;
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.lineTo(d3.x, d3.y);
      ctx.lineTo(d4.x, d4.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawRunways(ctx, cam) {
  for (const runway of RUNWAYS) drawRunwayStrip(ctx, cam, runway);
}

// ---------------------------------------------------------------------------
// Rings, trees and birds
// ---------------------------------------------------------------------------

export function drawRings(ctx, cam, rings, nextIndex, time) {
  // Far rings first so nearer ones paint over them.
  const ordered = [...rings].sort((a, b) => {
    const da = Math.hypot(a.x - cam.pos.x, a.z - cam.pos.z);
    const db = Math.hypot(b.x - cam.pos.x, b.z - cam.pos.z);
    return db - da;
  });
  for (const ring of ordered) {
    if (ring.passed) continue;
    const isNext = ring.index === nextIndex;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.55;
    const right = { x: Math.cos(ring.heading), y: 0, z: Math.sin(ring.heading) };
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const p = project(cam, {
        x: ring.x + right.x * Math.cos(a) * ring.radius,
        y: ring.y + Math.sin(a) * ring.radius,
        z: ring.z + right.z * Math.cos(a) * ring.radius,
      });
      pts.push(p);
    }
    if (pts.some((p) => !p)) continue;
    // Soft glow fill.
    ctx.globalAlpha = isNext ? 0.16 + 0.06 * Math.sin(time * 5) : 0.07;
    ctx.fillStyle = COLOURS.ring;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isNext ? COLOURS.ringNext : COLOURS.ring;
    ctx.lineWidth = isNext ? 5 : 3;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Number plate above the next ring.
    if (isNext) {
      const top = project(cam, { x: ring.x, y: ring.y + ring.radius + 8, z: ring.z });
      if (top) {
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10, 20, 30, 0.55)';
        const label = `RING ${ring.index + 1}`;
        const w = ctx.measureText(label).width + 16;
        ctx.fillRect(top.x - w / 2, top.y - 12, w, 22);
        ctx.fillStyle = COLOURS.ringNext;
        ctx.fillText(label, top.x, top.y + 4);
      }
    }
  }
}

export function drawTrees(ctx, cam, trees, plane) {
  const visible = [];
  for (const tree of trees) {
    const dx = tree.x - plane.x;
    const dz = tree.z - plane.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 950 * 950) continue;
    const p = project(cam, { x: tree.x, y: tree.y, z: tree.z });
    if (!p) continue;
    visible.push({ tree, p, dist: Math.sqrt(distSq) });
  }
  visible.sort((a, b) => b.dist - a.dist);
  for (const { tree, p } of visible.slice(0, 260)) {
    const h = tree.size * p.scale;
    if (h < 2) continue;
    const w = h * 0.55;
    ctx.fillStyle = '#5d3f27';
    ctx.fillRect(p.x - h * 0.05, p.y - h * 0.25, h * 0.1, h * 0.25);
    ctx.fillStyle = tree.shade > 1 ? '#2c5a26' : '#35682e';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x - w, p.y - h * 0.22);
    ctx.lineTo(p.x + w, p.y - h * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tree.shade > 1 ? '#3a7034' : '#2c5a26';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h * 0.82);
    ctx.lineTo(p.x - w * 0.72, p.y - h * 0.12);
    ctx.lineTo(p.x + w * 0.72, p.y - h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawBirds(ctx, cam, birds, time) {
  for (const bird of birds) {
    const angle = bird.angle + time * bird.speed;
    const x = -950 + Math.cos(angle) * bird.radius;
    const z = 950 + Math.sin(angle) * bird.radius;
    const y = bird.height + Math.sin(time * 0.8 + bird.phase) * 6;
    const p = project(cam, { x, y, z });
    if (!p || p.dist > 700) continue;
    const flap = Math.sin(time * 9 + bird.phase) * 0.5;
    const s = Math.max(3, 26 * p.scale);
    ctx.strokeStyle = 'rgba(30, 40, 50, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - s * flap);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + s, p.y - s * flap);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// The aircraft, seen from the chase camera
// ---------------------------------------------------------------------------

export function drawPlane(ctx, cam, plane, time) {
  const W = cam.width;
  const H = cam.height;
  const cx = W / 2;
  const cy = H * 0.60;
  const scale = W / 1280;
  const bob = Math.sin(time * 2.1) * 2 * scale;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(-plane.roll * 0.55);
  ctx.scale(scale, scale);

  // Main wing: long, gently tapered, teal-tipped.
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.moveTo(-168, 6);
  ctx.lineTo(-30, -8);
  ctx.lineTo(30, -8);
  ctx.lineTo(168, 6);
  ctx.lineTo(160, 14);
  ctx.lineTo(-160, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0f7d7a';
  ctx.beginPath();
  ctx.moveTo(-168, 6);
  ctx.lineTo(-138, 2);
  ctx.lineTo(-134, 12);
  ctx.lineTo(-160, 14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(168, 6);
  ctx.lineTo(138, 2);
  ctx.lineTo(134, 12);
  ctx.lineTo(160, 14);
  ctx.closePath();
  ctx.fill();

  // Fuselage, seen from behind: a rounded tail cone with a cheatline.
  ctx.fillStyle = '#f4f1e8';
  ctx.beginPath();
  ctx.moveTo(-26, -34);
  ctx.quadraticCurveTo(0, -44, 26, -34);
  ctx.lineTo(20, 52);
  ctx.quadraticCurveTo(0, 60, -20, 52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8622c';
  ctx.fillRect(-26, -6, 52, 7);
  ctx.fillStyle = '#0f7d7a';
  ctx.fillRect(-26, 1, 52, 3);

  // Tail fin with the registration, and the horizontal stabiliser.
  ctx.fillStyle = '#e8622c';
  ctx.beginPath();
  ctx.moveTo(-4, -30);
  ctx.lineTo(0, -72);
  ctx.lineTo(10, -70);
  ctx.lineTo(12, -30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(4, -52);
  ctx.rotate(-0.12);
  ctx.fillText('PK-SKY', 0, 0);
  ctx.restore();
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.moveTo(-58, 34);
  ctx.lineTo(-12, 26);
  ctx.lineTo(12, 26);
  ctx.lineTo(58, 34);
  ctx.lineTo(52, 42);
  ctx.lineTo(-52, 42);
  ctx.closePath();
  ctx.fill();

  // Navigation lights: red left, green right, white strobe on the tail.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-166, 10, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34d17b';
  ctx.beginPath();
  ctx.arc(166, 10, 4, 0, Math.PI * 2);
  ctx.fill();
  if (Math.sin(time * 6) > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 58, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Landing gear: legs and wheels while the gear is down.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, 40);
    ctx.lineTo(-24, 66);
    ctx.moveTo(16, 40);
    ctx.lineTo(24, 66);
    ctx.stroke();
    ctx.fillStyle = '#22262b';
    ctx.beginPath();
    ctx.arc(-24, 70, 7, 0, Math.PI * 2);
    ctx.arc(24, 70, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cockpit frame and lit instruments
// ---------------------------------------------------------------------------

function drawRoundGauge(ctx, x, y, r, label, drawNeedle) {
  ctx.save();
  ctx.translate(x, y);
  const face = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  face.addColorStop(0, '#23303c');
  face.addColorStop(1, '#0a0f14');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9fd8ff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawNeedle(ctx, r);
  ctx.fillStyle = COLOURS.panelGlow;
  ctx.font = `600 ${Math.round(r * 0.26)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, r * 0.72);
  ctx.restore();
}

export function drawCockpit(ctx, cam, plane, sortie, time) {
  const W = cam.width;
  const H = cam.height;
  const scale = W / 1280;

  // Glareshield: the dark panel the instruments live on.
  const panelH = 118 * scale;
  const panelGrad = ctx.createLinearGradient(0, H - panelH, 0, H);
  panelGrad.addColorStop(0, '#1a232c');
  panelGrad.addColorStop(1, '#0a0e12');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - panelH * 0.72);
  ctx.quadraticCurveTo(W * 0.5, H - panelH * 1.15, W, H - panelH * 0.72);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(159, 216, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, H - panelH * 0.72);
  ctx.quadraticCurveTo(W * 0.5, H - panelH * 1.15, W, H - panelH * 0.72);
  ctx.stroke();

  // Canopy pillars at the screen edges: slim, low, out of the way.
  ctx.fillStyle = 'rgba(12, 18, 24, 0.7)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14 * scale, 0);
  ctx.lineTo(52 * scale, H * 0.30);
  ctx.lineTo(34 * scale, H * 0.33);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W - 14 * scale, 0);
  ctx.lineTo(W - 52 * scale, H * 0.30);
  ctx.lineTo(W - 34 * scale, H * 0.33);
  ctx.closePath();
  ctx.fill();

  const cy = H - 56 * scale;
  const gaugeR = 40 * scale;

  // Airspeed gauge, left.
  drawRoundGauge(ctx, W * 0.5 - 150 * scale, cy, gaugeR, 'KT', (g, r) => {
    const kt = Math.round((plane.speed * 1.94384) / 10) * 10;
    g.strokeStyle = '#7dff9a';
    g.lineWidth = 2;
    for (let v = 0; v <= 200; v += 20) {
      const a = Math.PI * 0.75 + (v / 200) * Math.PI * 1.5;
      const x1 = Math.cos(a) * (r - 7);
      const y1 = Math.sin(a) * (r - 7);
      const x2 = Math.cos(a) * (r - 2);
      const y2 = Math.sin(a) * (r - 2);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    const angle = Math.PI * 0.75 + (Math.min(plane.speed * 1.94384, 200) / 200) * Math.PI * 1.5;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle) * (r - 9), Math.sin(angle) * (r - 9));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(r * 0.42)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(String(kt), 0, r * 0.05);
  });

  // Artificial horizon, centre: a lit ball that rolls and pitches.
  drawRoundGauge(ctx, W * 0.5, cy, gaugeR, 'ATT', (g, r) => {
    g.save();
    g.beginPath();
    g.arc(0, 0, r - 4, 0, Math.PI * 2);
    g.clip();
    g.rotate(-plane.roll);
    const pitchPx = clamp(plane.pitch, -0.6, 0.6) * r * 1.1;
    g.fillStyle = '#2b6ac2';
    g.fillRect(-r, -r + pitchPx, r * 2, r);
    g.fillStyle = '#7a5a34';
    g.fillRect(-r, pitchPx, r * 2, r);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-r, pitchPx);
    g.lineTo(r, pitchPx);
    g.stroke();
    g.restore();
    g.strokeStyle = '#ffd94d';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-r * 0.45, 0);
    g.lineTo(-r * 0.12, 0);
    g.moveTo(r * 0.12, 0);
    g.lineTo(r * 0.45, 0);
    g.stroke();
    g.fillStyle = '#ffd94d';
    g.beginPath();
    g.arc(0, 0, 3, 0, Math.PI * 2);
    g.fill();
  });

  // Altimeter, right.
  drawRoundGauge(ctx, W * 0.5 + 150 * scale, cy, gaugeR, 'FT', (g, r) => {
    const altFt = plane.y * 3.28084;
    g.strokeStyle = '#9fd8ff';
    g.lineWidth = 2;
    for (let v = 0; v < 12; v++) {
      const a = (v / 12) * Math.PI * 2 - Math.PI / 2;
      const x1 = Math.cos(a) * (r - 7);
      const y1 = Math.sin(a) * (r - 7);
      const x2 = Math.cos(a) * (r - 2);
      const y2 = Math.sin(a) * (r - 2);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    const angle = ((altFt % 1000) / 1000) * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle) * (r - 9), Math.sin(angle) * (r - 9));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(r * 0.36)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(String(Math.round(altFt / 100) * 100), 0, r * 0.05);
  });

  // Throttle and fuel bars, flanking the gauges.
  const barX = W * 0.5 - 268 * scale;
  const barW = 16 * scale;
  const barH = 76 * scale;
  const barY = cy - barH / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#ffb62e';
  ctx.fillRect(barX, barY + barH * (1 - plane.throttle), barW, barH * plane.throttle);
  ctx.fillStyle = COLOURS.hud;
  ctx.font = `600 ${Math.round(11 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('THR', barX + barW / 2, barY + barH + 14 * scale);

  const fuelX = W * 0.5 + 252 * scale;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(fuelX, barY, barW, barH);
  ctx.fillStyle = plane.fuel < 15 ? COLOURS.hudRed : '#7dff9a';
  ctx.fillRect(fuelX, barY + barH * (1 - plane.fuel / 100), barW, barH * (plane.fuel / 100));
  ctx.fillStyle = COLOURS.hud;
  ctx.fillText('FUEL', fuelX + barW / 2, barY + barH + 14 * scale);

  // Gear and flaps lamps.
  ctx.font = `700 ${Math.round(12 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = plane.gearDown ? '#7dff9a' : '#ffc857';
  ctx.fillText(`GEAR ${plane.gearDown ? 'DOWN' : 'UP'}`, 18 * scale, H - 22 * scale);
  ctx.fillStyle = plane.flapsDown ? '#7dff9a' : 'rgba(232,244,255,0.55)';
  ctx.fillText(`FLAPS ${plane.flapsDown ? 'DOWN' : 'UP'}`, 18 * scale, H - 40 * scale);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function headingLabel(deg) {
  const labels = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return labels[Math.round(deg / 22.5) % 16];
}

export function drawHud(ctx, cam, plane, sortie, time) {
  const W = cam.width;
  const H = cam.height;
  const scale = W / 1280;
  const now = performance.now() / 1000;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Heading tape across the top centre.
  const headingDeg = (radToDeg(plane.heading) + 360) % 360;
  const tapeY = 34 * scale;
  const tapeHalf = 150 * scale;
  ctx.fillStyle = 'rgba(8, 16, 24, 0.45)';
  ctx.fillRect(W / 2 - tapeHalf - 10, tapeY - 22 * scale, tapeHalf * 2 + 20, 34 * scale);
  ctx.fillStyle = COLOURS.hud;
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 10) {
    const deg = Math.round((headingDeg + d) / 10) * 10;
    const norm = ((deg % 360) + 360) % 360;
    const x = W / 2 + (d / 60) * tapeHalf;
    const isCardinal = norm % 90 === 0;
    ctx.globalAlpha = 1 - Math.abs(d) / 70;
    ctx.fillRect(x - 1, tapeY - 8 * scale, 2, isCardinal ? 12 * scale : 7 * scale);
    if (isCardinal) ctx.fillText(headingLabel(norm), x, tapeY - 12 * scale);
    else if (norm % 30 === 0) ctx.fillText(String(norm).padStart(3, '0'), x, tapeY - 12 * scale);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7 * scale, tapeY + 12 * scale);
  ctx.lineTo(W / 2 + 7 * scale, tapeY + 12 * scale);
  ctx.lineTo(W / 2, tapeY + 20 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 ${Math.round(15 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = COLOURS.hud;
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}° ${headingLabel(headingDeg)}`, W / 2, tapeY + 40 * scale);

  // Airspeed, top left.
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOURS.hud;
  ctx.font = `700 ${Math.round(30 * scale)}px system-ui, sans-serif`;
  ctx.fillText(`${Math.round(plane.speed * 1.94384)}`, 22 * scale, 52 * scale);
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(232,244,255,0.75)';
  ctx.fillText('KT  AIRSPEED', 22 * scale, 72 * scale);
  const vsFpm = Math.round(plane.verticalSpeed * 196.85);
  ctx.fillStyle = vsFpm >= 0 ? '#7dff9a' : '#ffc857';
  ctx.font = `700 ${Math.round(15 * scale)}px system-ui, sans-serif`;
  ctx.fillText(`${vsFpm >= 0 ? '▲' : '▼'} ${Math.abs(vsFpm)} FPM`, 22 * scale, 96 * scale);

  // Altitude, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOURS.hud;
  ctx.font = `700 ${Math.round(30 * scale)}px system-ui, sans-serif`;
  ctx.fillText(`${Math.round(plane.y * 3.28084).toLocaleString('en-US')}`, W - 22 * scale, 52 * scale);
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(232,244,255,0.75)';
  ctx.fillText('FT  ALTITUDE', W - 22 * scale, 72 * scale);
  ctx.fillStyle = COLOURS.hud;
  ctx.font = `700 ${Math.round(15 * scale)}px system-ui, sans-serif`;
  ctx.fillText(`SCORE ${sortie.score.toLocaleString('en-US')}`, W - 22 * scale, 96 * scale);
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(232,244,255,0.75)';
  ctx.fillText(`RINGS ${sortie.ringsPassed}/${sortie.rings.length}   ${formatTime(plane.flightTime)}`, W - 22 * scale, 116 * scale);

  // Mission banner under the heading tape.
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(14 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(8, 16, 24, 0.55)';
  const banner = sortie.mission.id === 'rings'
    ? `RING RUN — next: ring ${sortie.nextRing + 1} of ${sortie.rings.length}`
    : sortie.mission.id === 'landing'
      ? 'ISLAND HOP — land on KELUD STRIP (north)'
      : 'FREE FLIGHT — explore, chase rings, mind the fuel';
  const bannerW = ctx.measureText(banner).width + 24 * scale;
  ctx.fillRect(W / 2 - bannerW / 2, 96 * scale, bannerW, 24 * scale);
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.fillText(banner, W / 2, 113 * scale);

  // Warnings, flashing, centre-top, on a dark pill so they read over sky.
  const warnings = currentWarnings(sortie);
  if (warnings.length > 0 && Math.sin(time * 8) > -0.2) {
    ctx.font = `800 ${Math.round(20 * scale)}px system-ui, sans-serif`;
    const warnW = ctx.measureText(warnings[0].text).width + 28 * scale;
    ctx.fillStyle = 'rgba(8, 16, 24, 0.55)';
    ctx.fillRect(W / 2 - warnW / 2, 146 * scale, warnW, 30 * scale);
    ctx.fillStyle = warnings[0].level === 'red' ? COLOURS.hudRed : COLOURS.hudAmber;
    ctx.fillText(warnings[0].text, W / 2, 168 * scale);
  }

  // Flash message, centre.
  if (sortie.message && now < sortie.messageUntil) {
    ctx.font = `800 ${Math.round(22 * scale)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(sortie.message, W / 2, H * 0.30);
    ctx.shadowBlur = 0;
  }

  // Next-ring pointer: when the ring is off-screen, point at it.
  const ring = sortie.rings[sortie.nextRing];
  if (ring && !ring.passed && sortie.status === 'flying') {
    const p = project(cam, { x: ring.x, y: ring.y, z: ring.z });
    const dist = Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z));
    if (!p || p.x < 40 || p.x > W - 40 || p.y < 130 || p.y > H - 160) {
      let ax = p ? p.x : W / 2;
      let ay = p ? p.y : H * 0.3;
      if (!p) {
        // Behind the camera: point sideways by the heading difference.
        const bearing = Math.atan2(ring.x - plane.x, -(ring.z - plane.z));
        const diff = wrapAngleForHud(bearing - plane.heading);
        ax = W / 2 + Math.sign(diff) * (W / 2 - 60);
        ay = H * 0.3;
      }
      ax = clamp(ax, 50, W - 50);
      ay = clamp(ay, 140, H - 170);
      ctx.fillStyle = COLOURS.ringNext;
      ctx.beginPath();
      ctx.arc(ax, ay, 16 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1206';
      ctx.font = `800 ${Math.round(15 * scale)}px system-ui, sans-serif`;
      ctx.fillText('◈', ax, ay + 5 * scale);
      ctx.fillStyle = COLOURS.hud;
      ctx.font = `600 ${Math.round(12 * scale)}px system-ui, sans-serif`;
      ctx.fillText(`${dist} m`, ax, ay + 32 * scale);
    }
  }
}

function wrapAngleForHud(rad) {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Menu and end screens
// ---------------------------------------------------------------------------

export function menuButtons(width, height) {
  const scale = width / 1280;
  const cardW = 330 * scale;
  const cardH = 118 * scale;
  const gap = 22 * scale;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (width - totalW) / 2;
  const y = height * 0.56;
  return [0, 1, 2].map((i) => ({
    x: x0 + i * (cardW + gap),
    y,
    w: cardW,
    h: cardH,
  }));
}

export function drawMenu(ctx, cam, time) {
  const W = cam.width;
  const H = cam.height;
  const scale = W / 1280;

  // Dim the scenery so the text reads.
  ctx.fillStyle = 'rgba(6, 18, 30, 0.42)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;
  ctx.font = `800 ${Math.round(64 * scale)}px system-ui, sans-serif`;
  ctx.fillText('SKYRIDGE COURIER', W / 2, H * 0.24);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.round(19 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('A bush pilot over the volcanic islands — rings, runways and one small aeroplane', W / 2, H * 0.24 + 34 * scale);
  ctx.fillStyle = 'rgba(232,244,255,0.9)';
  ctx.font = `500 ${Math.round(15 * scale)}px system-ui, sans-serif`;
  ctx.fillText('Click a mission below, or press 1, 2 or 3', W / 2, H * 0.24 + 62 * scale);

  const buttons = menuButtons(W, H);
  const missions = ['rings', 'landing', 'free'];
  const titles = ['1 · RING RUN', '2 · ISLAND HOP', '3 · FREE FLIGHT'];
  const taglines = [
    'Thread 8 gold rings down the valley',
    'Take off, cross the island, land at Kelud',
    'No orders — explore and chase rings',
  ];
  buttons.forEach((b, i) => {
    ctx.fillStyle = 'rgba(8, 20, 30, 0.78)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#ffc857';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffd94d';
    ctx.font = `800 ${Math.round(19 * scale)}px system-ui, sans-serif`;
    ctx.fillText(titles[i], b.x + b.w / 2, b.y + 34 * scale);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = `500 ${Math.round(14 * scale)}px system-ui, sans-serif`;
    ctx.fillText(taglines[i], b.x + b.w / 2, b.y + 62 * scale);
    ctx.fillStyle = 'rgba(232,244,255,0.65)';
    ctx.font = `500 ${Math.round(12 * scale)}px system-ui, sans-serif`;
    ctx.fillText(i === 0 ? '500 pts per ring · +5% fuel' : i === 1 ? 'Landing quality pays up to 2000 pts' : 'Distance pays · land anywhere flat', b.x + b.w / 2, b.y + 86 * scale);
  });

  // Controls, bottom centre.
  ctx.fillStyle = 'rgba(8, 20, 30, 0.66)';
  const controlsW = 760 * scale;
  ctx.fillRect(W / 2 - controlsW / 2, H - 108 * scale, controlsW, 84 * scale);
  ctx.fillStyle = '#e8f4ff';
  ctx.font = `600 ${Math.round(14 * scale)}px system-ui, sans-serif`;
  ctx.fillText('FLY —  ↑ ↓ pitch · ← → bank · SHIFT / CTRL throttle · mouse steers · wheel throttle', W / 2, H - 80 * scale);
  ctx.fillText('G gear · F flaps · B brake · P pause · M mute · R restart', W / 2, H - 56 * scale);
  ctx.fillStyle = 'rgba(232,244,255,0.65)';
  ctx.font = `500 ${Math.round(12 * scale)}px system-ui, sans-serif`;
  ctx.fillText('Land gently on a runway with the gear down — or anywhere flat in Free Flight. Mind the fuel gauge.', W / 2, H - 36 * scale);
}

export function drawEndScreen(ctx, cam, sortie) {
  const W = cam.width;
  const H = cam.height;
  const scale = W / 1280;
  const crashed = sortie.status === 'crashed';
  const complete = sortie.status === 'complete';
  ctx.fillStyle = crashed ? 'rgba(40, 8, 6, 0.62)' : 'rgba(6, 30, 16, 0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = crashed ? '#ff8a7a' : '#8dff9e';
  ctx.font = `800 ${Math.round(52 * scale)}px system-ui, sans-serif`;
  const title = crashed ? 'CRASHED' : complete ? 'MISSION COMPLETE' : 'LANDED SAFELY';
  ctx.fillText(title, W / 2, H * 0.32);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(19 * scale)}px system-ui, sans-serif`;
  ctx.fillText(sortie.statusDetail?.reason || '', W / 2, H * 0.32 + 38 * scale);
  ctx.font = `600 ${Math.round(17 * scale)}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffe9a8';
  const lines = [
    `Score  ${sortie.score.toLocaleString('en-US')} pts`,
    `Rings  ${sortie.ringsPassed} / ${sortie.rings.length}`,
    `Flight time  ${formatTime(sortie.plane.flightTime)}   ·   Distance  ${(sortie.plane.distanceFlown / 1000).toFixed(1)} km`,
  ];
  if (sortie.landingQuality > 0) {
    lines.push(`Landing quality  ${Math.round(sortie.landingQuality * 100)}%`);
  }
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#ffe9a8' : '#e8f4ff';
    ctx.fillText(line, W / 2, H * 0.44 + i * 30 * scale);
  });
  ctx.fillStyle = 'rgba(232,244,255,0.85)';
  ctx.font = `600 ${Math.round(16 * scale)}px system-ui, sans-serif`;
  ctx.fillText('Press R to fly again, or M for the menu', W / 2, H * 0.44 + lines.length * 30 * scale + 22 * scale);
}

export function drawPaused(ctx, cam) {
  const W = cam.width;
  const H = cam.height;
  ctx.fillStyle = 'rgba(6, 18, 30, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, H * 0.42);
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillStyle = '#e8f4ff';
  ctx.fillText('Press P to keep flying', W / 2, H * 0.42 + 34);
}
