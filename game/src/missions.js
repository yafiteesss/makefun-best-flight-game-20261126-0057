// Skyridge Courier — missions, score and sortie state.
// One clear job: what the pilot is trying to do, what it pays, and when the
// sortie is won, lost, or simply over.

import { MISSIONS, SCORING, PLANE } from './config.js';
import { buildRings, groundHeight } from './terrain.js';
import { createPlane } from './flight.js';
import { radToDeg } from './random.js';

export function createSortie(missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  const plane = createPlane();
  // Free flight starts already airborne, cruising over the valley.
  if (missionId === 'free') {
    plane.x = 300;
    plane.z = -700;
    plane.y = 320;
    plane.heading = 0.35;
    plane.speed = 62;
    plane.throttle = 0.7;
    plane.airborne = true;
    plane.pitch = 0.02;
  }
  return {
    mission,
    plane,
    rings: buildRings(),
    nextRing: 0,
    ringsPassed: 0,
    score: 0,
    distancePoints: 0,
    status: 'flying',
    // 'flying' | 'paused' | 'crashed' | 'landed' | 'complete'
    statusDetail: null,
    message: null,
    messageUntil: 0,
    landingQuality: 0,
    bestStreak: 0,
  };
}

// A short-lived banner message on the HUD.
export function flashMessage(sortie, text, seconds, now) {
  sortie.message = text;
  sortie.messageUntil = now + seconds;
}

// Ring check: is the aircraft inside the next ring's disc?
export function checkRings(sortie, playChime) {
  if (sortie.status !== 'flying') return;
  const ring = sortie.rings[sortie.nextRing];
  if (!ring) return;
  const dx = sortie.plane.x - ring.x;
  const dy = sortie.plane.y - ring.y;
  const dz = sortie.plane.z - ring.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= ring.radius) {
    ring.passed = true;
    sortie.ringsPassed++;
    const speedBonus = Math.round((sortie.plane.speed / 96) * SCORING.ringSpeedBonus);
    const points = SCORING.ringBase + speedBonus;
    sortie.score += points;
    sortie.plane.fuel = Math.min(100, sortie.plane.fuel + PLANE.ringFuelBonus);
    if (playChime) playChime();
    flashMessage(sortie, `RING ${ring.index + 1} — +${points} PTS`, 2.2, performance.now() / 1000);
    sortie.nextRing++;
    if (sortie.nextRing >= sortie.rings.length) {
      if (sortie.mission.id === 'rings') {
        sortie.status = 'complete';
        sortie.statusDetail = { reason: 'All 8 rings threaded — course complete!' };
        sortie.score += 1000;
      } else {
        // Other missions get a fresh course to keep chasing.
        sortie.rings = buildRings();
        sortie.nextRing = 0;
        flashMessage(sortie, 'COURSE COMPLETE — +1000 PTS, rings reset', 3, performance.now() / 1000);
        sortie.score += 1000;
      }
    }
  }
}

// Landing scoring: gentle, centred, wings level, nose on the strip heading,
// and not too fast — a hot arrival still lands, it just pays less.
export function scoreLanding(sortie, runway, verticalSpeed) {
  const plane = sortie.plane;
  const headingError = Math.abs(((radToDeg(plane.heading) - runway.headingDeg + 540) % 360) - 180);
  const vsScore = Math.max(0, 1 - Math.abs(verticalSpeed) / PLANE.maxLandingVs);
  const headingScore = Math.max(0, 1 - headingError / 45);
  const rollScore = Math.max(0, 1 - Math.abs(plane.roll) / PLANE.maxLandingRoll);
  const speedScore = Math.max(0, 1 - Math.max(0, plane.speed - 40) / 25);
  const quality = (vsScore * 0.4 + headingScore * 0.25 + rollScore * 0.15 + speedScore * 0.2);
  sortie.landingQuality = quality;
  const points = Math.round(SCORING.landingBase + quality * SCORING.landingQualityMax);
  sortie.score += points;
  return { points, quality, headingError };
}

// Called when the flight model reports an event.
export function handleFlightEvent(sortie, event, sounds) {
  if (!event || !event.name) return;
  const now = performance.now() / 1000;
  if (event.name === 'takeoff') {
    flashMessage(sortie, 'AIRBORNE — gear up when ready (G)', 2.5, now);
    if (sounds) sounds.takeoff();
  } else if (event.name === 'stall') {
    flashMessage(sortie, 'STALL — nose down, throttle up!', 1.2, now);
  } else if (event.name === 'touchdown') {
    const { runway, verticalSpeed } = event.detail;
    const landing = scoreLanding(sortie, runway, verticalSpeed);
    if (sortie.mission.id === 'landing' && runway.code === 'KLD') {
      sortie.status = 'complete';
      sortie.statusDetail = {
        reason: `Landed at ${runway.name} — ${landing.points} pts`,
        landing,
      };
    } else if (sortie.mission.id === 'rings' && sortie.nextRing >= sortie.rings.length) {
      sortie.status = 'complete';
      sortie.statusDetail = { reason: 'Course complete — and a clean landing!', landing };
    } else if (sortie.mission.id === 'free') {
      sortie.status = 'landed';
      sortie.statusDetail = { reason: `Down safe at ${runway.name} — ${landing.points} pts`, landing };
    } else {
      // Ring Run, down early: the sortie goes on. Throttle up and take off
      // again — a bush pilot does not give up for one firm touchdown.
      flashMessage(sortie, `DOWN SAFE — ${landing.points} PTS · throttle up to fly on`, 3.5, now);
    }
    if (sounds) sounds.thud();
  } else if (event.name === 'crash') {
    sortie.status = 'crashed';
    sortie.statusDetail = { reason: event.detail.reason, verticalSpeed: event.detail.verticalSpeed };
    if (sounds) sounds.crash();
  }
}

// Distance trickles points in, so a long careful flight still pays.
export function awardDistance(sortie) {
  const target = Math.floor(sortie.plane.distanceFlown / SCORING.distancePerPoint);
  if (target > sortie.distancePoints) {
    sortie.score += target - sortie.distancePoints;
    sortie.distancePoints = target;
  }
}

// Warnings the HUD shows, most urgent first.
export function currentWarnings(sortie) {
  const warnings = [];
  const plane = sortie.plane;
  if (plane.fuel <= 0) warnings.push({ text: 'NO FUEL — GLIDING', level: 'red' });
  else if (plane.fuel < 15) warnings.push({ text: 'LOW FUEL', level: 'red' });
  if (plane.airborne && plane.speed < 30) warnings.push({ text: 'STALL', level: 'red' });
  const agl = plane.y - groundHeight(plane.x, plane.z);
  if (plane.airborne && !plane.gearDown && agl < 120) warnings.push({ text: 'GEAR UP — LOW', level: 'amber' });
  if (plane.airborne && plane.speed > 92) warnings.push({ text: 'OVERSPEED', level: 'amber' });
  return warnings;
}
