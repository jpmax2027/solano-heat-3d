// SOLANO HEAT 3D — config.js
// Shared constants and the single mutable game-state object S.
// Every other file reads its tuning from here so the city, the cars and
// the rules all agree with each other.

// ---- City layout (metres; +x east, +z south, y up) ----------------------
// Avenues run north-south, streets run east-west. The boulevard at
// BOULEVARD_Z is the southernmost street: south of it lies the beach
// strip, the sand and the ocean. The dock quarter sits at the east edge.
var AVENUES_X = [-120, -70, -20, 30, 80, 130]; // north-south road centres
var STREETS_Z = [-90, -50, -10, 30, 70];       // east-west road centres
var ROAD_HALF = 7;          // half the road width
var SIDEWALK = 3.4;         // sidewalk band beyond the road edge
var CITY = { minX: -152, maxX: 152, minZ: -122, maxZ: 84 };
var BEACH_Z = 84;           // boulevard sidewalk ends, sand begins
var SAND_END_Z = 106;       // waterline
var DOCK = { minX: 152, maxX: 196, deckZ0: 44, deckZ1: 84, pierZ0: 58, pierZ1: 72, pierEndX: 208 };

// Named places the story uses. Positions are on sidewalks beside the road.
var PLACES = {
  garage:   { x: -104, z: 37, name: 'Taller Solano' },     // Rico's workshop
  hospital: { x: 44,  z: -83, name: 'Hospital Brisa' },
  station:  { x: -56, z: -57, name: 'Port Solano PD' },
  hotel:    { x: 96,  z: 63, name: 'Hotel Brisa' },
  chopshop: { x: 116, z: -37, name: 'Desguace Luna' },
  casaAzul: { x: -36, z: 23, name: 'Casa Azul' },
  dockGate: { x: 158, z: 64, name: 'Muelle 9 — Dock Gate' },
  pierEnd:  { x: 202, z: 65, name: 'Muelle 9 — Pier End' },
  spawn:    { x: -112, z: 44, name: 'Calle Brisa' },
};

// ---- Cars ----------------------------------------------------------------
var CAR_TYPES = [
  { id: 'sedan',  name: 'Brisa Sedan',  len: 4.4, wid: 1.9, hgt: 0.62, cabin: 0.55, top: 34, accel: 13, grip: 1.0 },
  { id: 'hatch',  name: 'Pico Hatch',   len: 3.8, wid: 1.8, hgt: 0.66, cabin: 0.6,  top: 30, accel: 12, grip: 1.0 },
  { id: 'taxi',   name: 'Solano Taxi',  len: 4.4, wid: 1.9, hgt: 0.62, cabin: 0.55, top: 33, accel: 13, grip: 1.0 },
  { id: 'van',    name: 'Carga Van',    len: 5.2, wid: 2.1, hgt: 1.15, cabin: 0.75, top: 27, accel: 10, grip: 0.9 },
  { id: 'pickup', name: 'Duna Pickup',  len: 5.0, wid: 2.0, hgt: 0.8,  cabin: 0.6,  top: 31, accel: 12, grip: 0.95 },
  { id: 'sport',  name: 'Sultan RS',    len: 4.5, wid: 1.95, hgt: 0.5, cabin: 0.42, top: 46, accel: 19, grip: 1.15 },
  { id: 'police', name: 'Interceptor',  len: 4.6, wid: 1.95, hgt: 0.6, cabin: 0.52, top: 42, accel: 17, grip: 1.1 },
];
var CAR_PAINT = [0xc23b2e, 0x2e6fc2, 0xe8e4da, 0x30343a, 0x3fae6a, 0xe08a1e, 0x7a4fc2, 0xb8bcc2, 0x14424e, 0xd6537a];

// ---- Rules ---------------------------------------------------------------
var RULES = {
  walkSpeed: 3.4, sprintSpeed: 6.4, playerRadius: 0.55,
  enterRange: 3.4, bustTimeFoot: 2.0, bustTimeCar: 2.6,
  heatDecay: 0.10, unseenDelay: 5, sightRange: 52,
  hitPedHeat: 1.4, hitCarHeat: 0.35, hitCopHeat: 1.0, theftHeat: 1.0,
  hospitalFee: 150, bustFeeRate: 0.12,
};

// ---- The one shared state object ------------------------------------------
var S = {
  mode: 'title',            // title | play | pause | busted | wasted | done
  time: 0, cash: 120, health: 100, armor: 0,
  heat: 0, stars: 0, unseenFor: 0, bustMeter: 0,
  missionIndex: 0, missionDone: false, stepIndex: 0,
  driving: null,            // vehicle the player is in, or null on foot
  muted: false, started: false,
  camYaw: 0, camPitch: 0.32, shake: 0,
  message: '', messageUntil: 0, objective: '',
  stats: { stolen: 0, hits: 0, missions: 0 },
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2d(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angleLerp(a, b, t) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// Heading convention everywhere: forward = (sin h, 0, cos h).
function fwdX(h) { return Math.sin(h); }
function fwdZ(h) { return Math.cos(h); }
function rightX(h) { return -Math.cos(h); }
function rightZ(h) { return Math.sin(h); }

var SAVE_KEY = 'solano-heat-3d-save-v1';
function saveGame() {
  try {
    var p = playerPos();
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: S.cash, missionIndex: S.missionIndex, missionDone: S.missionDone,
      x: p.x, z: p.z, stats: S.stats,
    }));
  } catch (e) { /* storage unavailable: play on without a save */ }
}
function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
}
