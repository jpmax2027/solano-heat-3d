// SOLANO HEAT 3D — random.js
// A tiny seeded RNG so the city is the same city on every load: the same
// buildings, the same parked cars, the same palm trees. Deterministic
// dressing also keeps screenshots and tests reproducible.

var rngState = 1907;

function seedRandom(seed) { rngState = seed >>> 0; if (rngState === 0) rngState = 1; }

function rand() {
  // mulberry32: small, fast, good enough for dressing a city.
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  var t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randRange(a, b) { return a + rand() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
function randPick(list) { return list[Math.floor(rand() * list.length)]; }
function randChance(p) { return rand() < p; }
