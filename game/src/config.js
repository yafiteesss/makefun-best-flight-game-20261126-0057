// Skyridge Courier — shared tuning constants.
// One clear job: every number the rest of the game balances on lives here.

export const WORLD = {
  // Island radius in metres; beyond it the terrain sinks into the sea.
  islandRadius: 2600,
  seaLevel: 0,
  // Volcano ("Mount Kelud") position and size.
  volcanoX: 1450,
  volcanoZ: -1650,
  volcanoHeight: 430,
  volcanoRadius: 750,
  // Lake ("Telaga Biru") position and size.
  lakeX: -950,
  lakeZ: 950,
  lakeRadius: 420,
};

export const RUNWAYS = [
  {
    name: 'MERPATI FIELD',
    code: 'MRP',
    // Centre of the strip, metres in world space.
    x: 0,
    z: 250,
    headingDeg: 0,
    length: 720,
    width: 30,
    elevation: 28,
  },
  {
    name: 'KELUD STRIP',
    code: 'KLD',
    x: -350,
    z: -2150,
    headingDeg: 18,
    length: 620,
    width: 26,
    elevation: 64,
  },
];

export const PLANE = {
  // Metres per second at full throttle, level flight.
  maxSpeed: 96,
  // Speed below which the wing stops flying and the nose drops.
  stallSpeed: 26,
  // Speed the aircraft lifts off at when the pilot rotates.
  rotateSpeed: 30,
  // How fast the stick moves the nose and the wings (radians per second).
  pitchRate: 0.8,
  rollRate: 2.0,
  // Biggest bank and pitch the airframe allows.
  maxRoll: 1.25,
  maxPitch: 1.0,
  // Fuel: percent drained per second at idle and at full throttle.
  fuelIdleDrain: 0.05,
  fuelFullDrain: 0.19,
  // Fuel topped up when a ring is flown through.
  ringFuelBonus: 5,
  // Landing limits: vertical speed and bank allowed at touchdown. Speed
  // never decides a landing by itself — a fast arrival still lands, it
  // just scores worse (see scoreLanding in missions.js).
  maxLandingVs: 4.5,
  maxLandingRoll: 0.28,
};

export const RINGS = {
  count: 8,
  radius: 19,
  // Points for a ring, plus a speed bonus on top.
  basePoints: 500,
};

export const SCORING = {
  ringBase: 500,
  ringSpeedBonus: 300,
  landingBase: 1200,
  landingQualityMax: 800,
  distancePerPoint: 50,
};

export const COLOURS = {
  skyTop: '#2b6ac2',
  skyMid: '#7db8e8',
  skyHorizon: '#cfe8f5',
  sun: '#fff3c4',
  sea: '#1e6f9e',
  seaDeep: '#14557c',
  grassLow: '#4d7d38',
  grassHigh: '#6d8f3f',
  forest: '#2f5d2a',
  rock: '#7a6a55',
  snow: '#e9edf2',
  sand: '#c9b078',
  runway: '#3a3f45',
  runwayMark: '#f2f2e8',
  ring: '#ffb62e',
  ringNext: '#ffd94d',
  hud: '#e8f4ff',
  hudAmber: '#ffc857',
  hudRed: '#ff5d4d',
  hudGreen: '#7dff9a',
  panel: '#10161c',
  panelGlow: '#9fd8ff',
};

export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    title: 'RING RUN',
    tagline: 'Thread all 8 gold rings down the valley, then land at Kelud Strip.',
    goal: 'Fly through rings 1–8 in order. Each ring pays 500 pts + speed bonus and +5% fuel.',
  },
  {
    id: 'landing',
    key: '2',
    title: 'ISLAND HOP',
    tagline: 'Take off from Merpati Field and put her down gently on Kelud Strip.',
    goal: 'Land on the far runway: gear down, gentle descent, wings level. Rings on the way are bonus points.',
  },
  {
    id: 'free',
    key: '3',
    title: 'FREE FLIGHT',
    tagline: 'No orders. Explore the islands, chase rings, mind the fuel gauge.',
    goal: 'Fly as far as you like. Rings pay points; land anywhere flat to end the sortie safely.',
  },
];
