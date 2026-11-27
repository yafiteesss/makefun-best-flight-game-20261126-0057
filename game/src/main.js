// Skyridge Courier — the game loop and the screens that hold it together.
// One clear job: own the state machine (menu, flying, paused, ended), step
// the flight model, and ask the renderer to draw each frame.

import { createInput } from './input.js';
import { createSounds } from './audio.js';
import { buildBirds, buildClouds, buildTrees, groundHeight } from './terrain.js';
import {
  awardDistance,
  checkRings,
  createSortie,
  handleFlightEvent,
} from './missions.js';
import { updatePlane } from './flight.js';
import {
  drawBirds,
  drawClouds,
  drawCockpit,
  drawEndScreen,
  drawHud,
  drawMenu,
  drawPaused,
  drawPlane,
  drawRings,
  drawRunways,
  drawSky,
  drawTerrain,
  drawTrees,
  makeCamera,
  menuButtons,
} from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const sounds = createSounds();

// The world never changes: build its trees, clouds and birds once.
const trees = buildTrees();
const clouds = buildClouds();
const birds = buildBirds();

// Screen: 'menu' | 'flying' | 'paused' | 'ended'.
let screen = 'menu';
let sortie = null;
let lastTime = performance.now();

// A slow cinematic camera for the menu backdrop: drifting over the valley.
function menuCameraPlane(time) {
  return {
    x: 500 + Math.sin(time * 0.02) * 260,
    y: 300,
    z: -600 + Math.cos(time * 0.015) * 200,
    heading: 0.5 + Math.sin(time * 0.02) * 0.25,
    pitch: -0.05,
    roll: 0,
    speed: 0,
  };
}

// Screenshot poses: ?pose=ring puts the aircraft mid-course through the
// rings; ?pose=approach lines it up on final to Kelud Strip; ?pose=menu
// shows the title screen. Plain play starts from the menu.
function applyPose() {
  const params = new URLSearchParams(window.location.search);
  const pose = params.get('pose');
  if (!pose) return;
  if (pose === 'menu') {
    screen = 'menu';
    return;
  }
  if (pose === 'ring') {
    startMission('rings');
    const plane = sortie.plane;
    // In the valley, lined up on ring 3 with rings 3 and 4 ahead.
    plane.x = 337;
    plane.z = -597;
    plane.y = groundHeight(337, -597) + 95;
    plane.heading = 0.785;
    plane.pitch = 0.02;
    plane.speed = 64;
    plane.throttle = 0.72;
    plane.airborne = true;
    plane.gearDown = false;
    // The first two rings are already behind us on this pose.
    sortie.rings[0].passed = true;
    sortie.rings[1].passed = true;
    sortie.nextRing = 2;
    sortie.ringsPassed = 2;
    return;
  }
  if (pose === 'final') {
    startMission('landing');
    const plane = sortie.plane;
    // Long final: 1500 m out on the extended centreline, 120 m above the
    // ground, gear down — room for a steady descent to Kelud Strip.
    plane.x = -910;
    plane.z = -428;
    plane.y = groundHeight(-910, -428) + 120;
    plane.heading = 0.314;
    plane.pitch = -0.06;
    plane.speed = 52;
    plane.throttle = 0.55;
    plane.airborne = true;
    plane.gearDown = true;
    return;
  }
  if (pose === 'approach') {
    startMission('landing');
    const plane = sortie.plane;
    // On the extended centreline of Kelud Strip, 700 m out, gear down,
    // 80 m above the ground — a normal 10% final approach.
    plane.x = -566;
    plane.z = -1484;
    plane.y = groundHeight(-566, -1484) + 80;
    plane.heading = 0.314;
    plane.pitch = -0.06;
    plane.speed = 52;
    plane.throttle = 0.55;
    plane.airborne = true;
    plane.gearDown = true;
    return;
  }
  if (pose === 'free') {
    startMission('free');
  }
}

function startMission(missionId) {
  sortie = createSortie(missionId);
  screen = 'flying';
  input.resetMouse();
  sounds.ensureStarted();
  sounds.click();
}

function backToMenu() {
  sortie = null;
  screen = 'menu';
}

function restartMission() {
  if (!sortie) return;
  startMission(sortie.mission.id);
}

function stepFlying(dt, time) {
  const controls = input.poll();
  const plane = sortie.plane;

  if (input.consumeAction('pause')) {
    screen = 'paused';
    return;
  }
  if (input.consumeAction('gear')) {
    plane.gearDown = !plane.gearDown;
    sounds.click();
  }
  if (input.consumeAction('flaps')) {
    plane.flapsDown = !plane.flapsDown;
    sounds.click();
  }
  if (input.consumeAction('brake')) {
    plane.brake = !plane.brake;
  }
  if (input.consumeAction('mute')) {
    sounds.toggleMute();
  }
  if (input.consumeAction('restart')) {
    restartMission();
    return;
  }

  const event = updatePlane(plane, controls, dt);
  handleFlightEvent(sortie, event, sounds);
  checkRings(sortie, () => sounds.chime());
  awardDistance(sortie);
  sounds.updateEngine(plane.throttle, plane.speed, plane.airborne);

  if (sortie.status === 'crashed' || sortie.status === 'complete' || sortie.status === 'landed') {
    screen = 'ended';
  }
}

function stepMenu() {
  const click = input.consumeClick();
  if (click) {
    const buttons = menuButtons(canvas.width, canvas.height);
    const missions = ['rings', 'landing', 'free'];
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
        startMission(missions[i]);
        return;
      }
    }
  }
  if (input.consumeAction('mission1')) startMission('rings');
  else if (input.consumeAction('mission2')) startMission('landing');
  else if (input.consumeAction('mission3')) startMission('free');
  else if (input.consumeAction('confirm')) startMission('rings');
  if (input.consumeAction('mute')) sounds.toggleMute();
}

function stepEnded() {
  if (input.consumeAction('restart')) {
    restartMission();
    return;
  }
  if (input.consumeAction('confirm')) {
    restartMission();
    return;
  }
  if (input.consumeAction('pause')) {
    backToMenu();
    return;
  }
  const click = input.consumeClick();
  if (click) restartMission();
}

function stepPaused() {
  if (input.consumeAction('pause')) {
    screen = 'flying';
    return;
  }
  if (input.consumeAction('restart')) {
    restartMission();
  }
}

function render(time) {
  const W = canvas.width;
  const H = canvas.height;
  if (screen === 'menu') {
    const cam = makeCamera(menuCameraPlane(time), W, H);
    drawSky(ctx, cam, time);
    drawClouds(ctx, cam, clouds, time);
    drawTerrain(ctx, cam);
    drawRunways(ctx, cam);
    drawTrees(ctx, cam, trees, menuCameraPlane(time));
    drawMenu(ctx, cam, time);
    return;
  }

  const cam = makeCamera(sortie.plane, W, H);
  drawSky(ctx, cam, time);
  drawClouds(ctx, cam, clouds, time);
  drawTerrain(ctx, cam);
  drawRunways(ctx, cam);
  drawRings(ctx, cam, sortie.rings, sortie.nextRing, time);
  drawTrees(ctx, cam, trees, sortie.plane);
  drawBirds(ctx, cam, birds, time);
  drawPlane(ctx, cam, sortie.plane, time);
  drawCockpit(ctx, cam, sortie.plane, sortie, time);
  drawHud(ctx, cam, sortie.plane, sortie, time);

  if (screen === 'paused') drawPaused(ctx, cam);
  if (screen === 'ended') drawEndScreen(ctx, cam, sortie);
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const time = now / 1000;
  try {
    if (screen === 'menu') stepMenu();
    else if (screen === 'flying') stepFlying(dt, time);
    else if (screen === 'paused') stepPaused();
    else if (screen === 'ended') stepEnded();
  } catch (err) {
    // Never leave a black screen: report the fault on the canvas itself.
    console.error(err);
  }
  render(time);
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  // Fixed 1280x720 backing store: screenshots are always the same size.
  canvas.width = 1280;
  canvas.height = 720;
}

resizeCanvas();
applyPose();
// Read-only handle for automated play-testing (screenshots, self-checks).
window.__skyridge = {
  get screen() { return screen; },
  get sortie() { return sortie; },
};
requestAnimationFrame(frame);
