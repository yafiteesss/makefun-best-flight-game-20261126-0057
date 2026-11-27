// Skyridge Courier — keyboard and mouse input.
// One clear job: turn raw browser events into one tidy control state the
// flight model reads every frame. Nothing here knows about the game itself.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    // Stick: -1..1 on each axis, from keys and from the mouse combined.
    pitch: 0,
    roll: 0,
    // Throttle nudges queued by keys or the mouse wheel (-1, 0, +1 steps).
    throttleStep: 0,
    // Mouse position relative to the canvas centre, -1..1.
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    // True for one frame when the player clicks.
    clicked: false,
    clickX: 0,
    clickY: 0,
    // Edge-triggered actions, consumed by the game loop.
    pressedKeys: new Set(),
  };

  const KEY_ACTIONS = {
    KeyR: 'restart',
    KeyP: 'pause',
    Escape: 'pause',
    KeyM: 'mute',
    KeyG: 'gear',
    KeyF: 'flaps',
    KeyB: 'brake',
    Digit1: 'mission1',
    Digit2: 'mission2',
    Digit3: 'mission3',
    Enter: 'confirm',
    Space: 'confirm',
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) state.pressedKeys.add(action);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    state.mouseX = ((event.clientX - cx) / (rect.width / 2));
    state.mouseY = ((event.clientY - cy) / (rect.height / 2));
    state.mouseActive = true;
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    state.clicked = true;
    state.clickX = event.clientX - rect.left;
    state.clickY = event.clientY - rect.top;
    // First click also counts as a steering wake-up.
    state.mouseActive = true;
  }

  function onWheel(event) {
    event.preventDefault();
    state.throttleStep += event.deltaY < 0 ? 1 : -1;
  }

  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Read the current control state. Call once per frame.
  function poll() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;

    // Mouse steering: pushing the mouse away from centre is the stick.
    // It blends with the keys so either device flies the plane alone.
    if (state.mouseActive) {
      const dead = 0.06;
      const mx = Math.abs(state.mouseX) < dead ? 0 : state.mouseX;
      const my = Math.abs(state.mouseY) < dead ? 0 : state.mouseY;
      roll += mx * 0.9;
      pitch -= my * 0.9;
    }

    let throttleStep = state.throttleStep;
    // Held throttle keys are a rate (half throttle per second), applied by
    // the flight model with the frame time; the wheel is discrete steps.
    let throttleHeld = 0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal')) throttleHeld += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus')) throttleHeld -= 1;

    state.pitch = Math.max(-1, Math.min(1, pitch));
    state.roll = Math.max(-1, Math.min(1, roll));
    state.throttleStep = 0;
    return { pitch: state.pitch, roll: state.roll, throttleStep, throttleHeld };
  }

  // True once when the named action key was pressed since the last poll.
  function consumeAction(name) {
    if (state.pressedKeys.has(name)) {
      state.pressedKeys.delete(name);
      return true;
    }
    return false;
  }

  // True once when the player clicked since the last poll.
  function consumeClick() {
    if (!state.clicked) return null;
    state.clicked = false;
    return { x: state.clickX, y: state.clickY };
  }

  function anyKeyPressed() {
    return state.pressedKeys.size > 0;
  }

  // Centre the stick: call when a sortie starts so the mouse's last menu
  // position does not steer the aircraft off the runway.
  function resetMouse() {
    state.mouseX = 0;
    state.mouseY = 0;
    state.mouseActive = false;
  }

  return { state, poll, consumeAction, consumeClick, anyKeyPressed, resetMouse };
}
