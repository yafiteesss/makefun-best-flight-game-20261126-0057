// Skyridge Courier — the flight model.
// One clear job: move one small bush plane through the air like a plane:
// throttle sets speed, bank turns the nose, pitch trades speed for height,
// and too slow means the wing quits and the nose drops.

import { PLANE } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { groundHeight, onRunway, overWater } from './terrain.js';

// A fresh aircraft sitting on Merpati Field, lined up for takeoff.
export function createPlane() {
  return {
    x: 0,
    y: 30.2,
    z: 560,
    heading: 0,
    pitch: 0,
    roll: 0,
    // Metres per second.
    speed: 0,
    // Vertical speed, metres per second.
    verticalSpeed: 0,
    throttle: 0,
    fuel: 100,
    gearDown: true,
    flapsDown: false,
    brake: false,
    // True once the wheels have left the ground.
    airborne: false,
    // Highest the aircraft has been above the ground since takeoff: a
    // touchdown only counts once the sortie has properly left the ground,
    // so a hop on the runway cannot farm landing points.
    peakAgl: 0,
    // Seconds since the sortie began.
    flightTime: 0,
    // Metres flown this sortie.
    distanceFlown: 0,
  };
}

// Forward direction of the aircraft as a unit vector.
export function forwardVector(plane) {
  const cp = Math.cos(plane.pitch);
  return {
    x: Math.sin(plane.heading) * cp,
    y: Math.sin(plane.pitch),
    z: -Math.cos(plane.heading) * cp,
  };
}

// Right-hand direction of the aircraft as a unit vector.
export function rightVector(plane) {
  return {
    x: Math.cos(plane.heading),
    y: 0,
    z: Math.sin(plane.heading),
  };
}

// Step the aircraft one frame. Returns an event string when something
// notable happens: 'takeoff', 'stall', 'touchdown' or 'crash'.
export function updatePlane(plane, controls, dt) {
  const event = { name: null, detail: null };

  // Throttle: each wheel step is a 6% nudge; held keys move it over time.
  plane.throttle = clamp(
    plane.throttle + controls.throttleStep * 0.06 + (controls.throttleHeld || 0) * 0.5 * dt,
    0,
    1,
  );

  // Control authority grows with airspeed: at a standstill the stick is dead.
  const authority = clamp(plane.speed / 42, 0.22, 1);
  plane.pitch = clamp(plane.pitch + controls.pitch * PLANE.pitchRate * authority * dt, -PLANE.maxPitch, PLANE.maxPitch);
  plane.roll = clamp(plane.roll + controls.roll * PLANE.rollRate * authority * dt, -PLANE.maxRoll, PLANE.maxRoll);

  // Hands off the stick: the wings level themselves, gently, and the nose
  // eases back toward level flight so a tap of the stick never leaves the
  // aircraft stuck in a steep climb or dive.
  if (controls.roll === 0) {
    plane.roll -= plane.roll * 0.9 * dt;
    if (Math.abs(plane.roll) < 0.01) plane.roll = 0;
  }
  if (controls.pitch === 0) {
    plane.pitch -= plane.pitch * 0.35 * dt;
    if (Math.abs(plane.pitch) < 0.005) plane.pitch = 0;
  }

  // A banked wing turns the nose: turn rate grows with bank, shrinks with speed.
  const turnRate = Math.min(
    (Math.sin(plane.roll) * 9.81) / Math.max(plane.speed, 25) * 2.6,
    0.6,
  );
  plane.heading = wrapAngle(plane.heading + turnRate * dt);

  // Speed chases the throttle: flaps and brakes drag it down.
  let targetSpeed = 16 + plane.throttle * (PLANE.maxSpeed - 16);
  if (plane.flapsDown) targetSpeed *= 0.82;
  if (plane.brake) targetSpeed *= 0.45;
  if (!plane.airborne && plane.speed < 4) targetSpeed = Math.max(targetSpeed, plane.throttle * 30);
  plane.speed += (targetSpeed - plane.speed) * 0.4 * dt;

  // Climb is speed times the sine of pitch; a stalled wing sinks instead.
  let verticalSpeed = plane.speed * Math.sin(plane.pitch);
  const stalled = plane.airborne && plane.speed < PLANE.stallSpeed;
  if (stalled) {
    verticalSpeed -= (PLANE.stallSpeed - plane.speed) * 1.1;
    plane.pitch -= 0.25 * dt;
    if (!event.name) event.name = 'stall';
  }

  // On the ground the aircraft stays planted until rotation speed — and
  // when it does rotate, it lifts off with the nose's climb at once, so the
  // next frame does not put it straight back on the runway.
  const ground = groundHeight(plane.x, plane.z);
  const wasAirborne = plane.airborne;
  if (!plane.airborne) {
    plane.y = ground + 2.2;
    if (plane.speed >= PLANE.rotateSpeed && plane.pitch > 0.06) {
      plane.airborne = true;
      plane.peakAgl = 0;
      verticalSpeed = plane.speed * Math.sin(plane.pitch);
      event.name = 'takeoff';
    } else {
      verticalSpeed = 0;
    }
  }

  const fwd = forwardVector(plane);
  const step = plane.speed * dt;
  plane.x += fwd.x * step;
  plane.z += fwd.z * step;
  plane.y += verticalSpeed * dt;
  plane.verticalSpeed = verticalSpeed;
  plane.flightTime += dt;
  plane.distanceFlown += step;

  // Fuel burns with throttle; an empty tank means a dead stick glide.
  plane.fuel = Math.max(0, plane.fuel - (PLANE.fuelIdleDrain + plane.throttle * PLANE.fuelFullDrain) * dt);
  if (plane.fuel <= 0 && plane.throttle > 0) {
    plane.throttle = 0;
  }

  // Keep the sortie inside the charted area: a soft wall turns the nose back.
  const distCentre = Math.hypot(plane.x, plane.z);
  if (distCentre > 3400) {
    const back = Math.atan2(-plane.x, plane.z);
    const diff = wrapAngle(back - plane.heading);
    plane.heading = wrapAngle(plane.heading + clamp(diff, -1, 1) * 0.8 * dt);
  }

  // Track the highest the aircraft has been above the ground this flight.
  if (plane.airborne) {
    plane.peakAgl = Math.max(plane.peakAgl, plane.y - groundHeight(plane.x, plane.z));
  }

  // Ground contact: a good landing, a ditching, or a crash. The wheels sit
  // 2.2 m above the ground, so touching down is checked there — but a plane
  // that only brushes the ground while climbing away is not a crash: the
  // crash line sits 1.2 m lower, and a gentle descent onto a strip lands.
  const groundNow = groundHeight(plane.x, plane.z);
  if (plane.airborne && plane.y <= groundNow + 2.2) {
    plane.y = groundNow + 2.2;
    const runway = onRunway(plane.x, plane.z);
    // A touchdown needs the gear down, a gentle descent and level wings.
    // Speed does not decide it — a fast arrival still lands, it just
    // scores worse (see scoreLanding); a hard one is a crash.
    const gentle = Math.abs(verticalSpeed) <= PLANE.maxLandingVs
      && Math.abs(plane.roll) <= PLANE.maxLandingRoll;
    if (runway && plane.gearDown && gentle && plane.peakAgl > 8 && !overWater(plane.x, plane.z)) {
      plane.airborne = false;
      plane.speed *= 0.94;
      event.name = 'touchdown';
      event.detail = { runway, verticalSpeed };
    } else if (plane.peakAgl <= 8 && verticalSpeed <= 0.5) {
      // A hop that never left the ground: settle back onto the runway with
      // no points and no fuss, and try the takeoff again.
      plane.airborne = false;
    } else if (plane.y <= groundNow + 1.0 || verticalSpeed < -1) {
      event.name = 'crash';
      event.detail = {
        reason: overWater(plane.x, plane.z)
          ? 'Ditched in the water'
          : !plane.gearDown && runway
            ? 'Belly landing — gear was up'
            : Math.abs(verticalSpeed) > PLANE.maxLandingVs
              ? 'Hit the ground too hard'
              : 'Clipped the terrain',
        verticalSpeed,
      };
    }
  }

  // Rolling out after touchdown: brakes and drag bleed the speed off.
  if (!plane.airborne && wasAirborne && event.name !== 'crash') {
    plane.speed = Math.max(0, plane.speed - (plane.brake ? 22 : 9) * dt);
  }

  return event;
}

// Knots and feet, the units a pilot reads on the dials.
export function knots(speedMs) {
  return speedMs * 1.94384;
}

export function feet(altitudeM) {
  return altitudeM * 3.28084;
}
