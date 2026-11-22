// SOLANO HEAT 3D — main.js
// The glue: input, the chase camera, getting in and out of cars, the
// wanted rules (heat rises with crime, cools when unseen), busted and
// wasted, pause, saving, the title screen, and the main loop.

var keysDown = {};
var pointerLocked = false;

function addHeat(n) {
  S.heat = clamp(S.heat + n, 0, 5);
  S.stars = S.heat <= 0 ? 0 : Math.ceil(S.heat);
}

function registerPedHit() {
  addHeat(RULES.hitPedHeat);
  var p = playerPos();
  scarePeds(p.x, p.z, 16);
  showMessage('You hit a pedestrian!', 2.4);
}

function registerVehicleHit(other) {
  if (other.kind === 'police') addHeat(RULES.hitCopHeat);
  else addHeat(RULES.hitCarHeat);
}

function hurtPlayer(amount) {
  if (S.mode !== 'play') return;
  var rest = amount;
  if (S.armor > 0) {
    var absorbed = Math.min(S.armor, amount * 0.55);
    S.armor -= absorbed;
    rest = amount - absorbed;
  }
  S.health -= rest;
  if (S.health <= 0) { S.health = 0; doWasted(); }
}

function nearestVehicle(range) {
  var p = player.mesh.position;
  var best = null, bestD = range;
  var list = allVehicles();
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    if (v.wrecked) continue;
    var d = dist2d(p.x, p.z, v.mesh.position.x, v.mesh.position.z) - v.radius;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function enterVehicle(v) {
  if (v.kind === 'traffic') {
    ejectDriver(v);
    S.stats.stolen++;
    addHeat(RULES.theftHeat);
    scarePeds(v.mesh.position.x, v.mesh.position.z, 11);
    showMessage('Car stolen!', 1.8);
  } else if (v.kind === 'parked') {
    S.stats.stolen++;
    if (nearestCopDist() < RULES.sightRange) { addHeat(RULES.theftHeat); showMessage('Spotted stealing a car!', 1.8); }
  }
  v.kind = 'player';
  S.driving = v;
  player.mesh.visible = false;
  S.camYaw = v.heading;
  sfxDoor();
}

function exitVehicle(silent) {
  var v = S.driving;
  if (!v) return;
  S.driving = null;
  if (v.kind === 'player') v.kind = 'parked';
  var p = v.mesh.position;
  var side = { x: p.x - rightX(v.heading) * (v.type.wid / 2 + 1.1), z: p.z - rightZ(v.heading) * (v.type.wid / 2 + 1.1) };
  collideCircle(side, RULES.playerRadius);
  player.mesh.position.set(side.x, groundYAt(side.x, side.z), side.z);
  player.mesh.rotation.y = v.heading;
  player.heading = v.heading;
  player.mesh.visible = true;
  engineSound(0, false);
  if (!silent) sfxDoor();
}

function clearPolice() {
  for (var i = policeCars.length - 1; i >= 0; i--) removeCop(policeCars[i]);
  if (heli) { heli.active = false; heli.mesh.visible = false; heli.light.intensity = 0; }
}

function respawnAt(place) {
  if (S.driving) exitVehicle(true);
  player.mesh.position.set(place.x, 0, place.z);
  player.mesh.visible = true;
  S.health = 100;
  S.heat = 0; S.stars = 0; S.bustMeter = 0; S.unseenFor = 0;
  clearPolice();
}

function doBusted() {
  if (S.mode !== 'play') return;
  S.mode = 'busted';
  var fee = Math.min(S.cash, Math.round(S.cash * RULES.bustFeeRate) + 50);
  S.cash -= fee;
  sfxBusted();
  EL.endTitle.textContent = 'BUSTED';
  EL.endText.textContent = 'The Port Solano PD got their driver. Bail and fines cost you $' + fee + ', and the job on the table is off.';
  EL.endScreen.style.display = 'flex';
  document.exitPointerLock && document.exitPointerLock();
}

function doWasted() {
  if (S.mode !== 'play') return;
  S.mode = 'wasted';
  var fee = Math.min(S.cash, RULES.hospitalFee);
  S.cash -= fee;
  sfxFail();
  EL.endTitle.textContent = 'WASTED';
  EL.endText.textContent = 'You wake up at Hospital Brisa with a $' + fee + ' bill and a story nobody will believe. The job on the table is off.';
  EL.endScreen.style.display = 'flex';
  document.exitPointerLock && document.exitPointerLock();
}

function continueFromEnd() {
  EL.endScreen.style.display = 'none';
  respawnAt(S.mode === 'busted' ? PLACES.station : PLACES.hospital);
  S.mode = 'play';
  failCurrentMission();
  saveGame();
}

// ---- Input ---------------------------------------------------------------
function bindInput(canvas) {
  window.addEventListener('keydown', function (ev) {
    keysDown[ev.code] = true;
    if (ev.code === 'KeyM') toggleMute();
    if (ev.code === 'KeyP' || ev.code === 'Escape') {
      if (S.mode === 'play') pauseGame();
      else if (S.mode === 'pause') resumeGame();
    }
    if (ev.code === 'KeyE' || ev.code === 'KeyF') {
      if (S.mode === 'play') interact();
      else if (S.mode === 'busted' || S.mode === 'wasted') continueFromEnd();
    }
    if (['ArrowUp', 'ArrowDown', 'Space'].indexOf(ev.code) >= 0) ev.preventDefault();
  });
  window.addEventListener('keyup', function (ev) { keysDown[ev.code] = false; });
  canvas.addEventListener('click', function () {
    if (S.mode === 'play' && !pointerLocked) canvas.requestPointerLock && canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', function () {
    pointerLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', function (ev) {
    if (!pointerLocked || S.mode !== 'play') return;
    S.camYaw -= ev.movementX * 0.0026;
    S.camPitch = clamp(S.camPitch + ev.movementY * 0.0022, 0.06, 1.05);
  });
}

function interact() {
  if (dialogueOpen) { advanceDialogue(); return; }
  if (S.driving) { exitVehicle(false); return; }
  var v = nearestVehicle(RULES.enterRange);
  if (v && Math.abs(v.speed) < 9) enterVehicle(v);
}

function driveInput() {
  return {
    up: !!(keysDown.KeyW || keysDown.ArrowUp),
    down: !!(keysDown.KeyS || keysDown.ArrowDown),
    left: !!(keysDown.KeyA || keysDown.ArrowLeft),
    right: !!(keysDown.KeyD || keysDown.ArrowRight),
    handbrake: !!keysDown.Space,
  };
}

function updatePlayer(dt) {
  if (S.driving) {
    if (S.driving.wrecked) { showMessage('This car is wrecked!', 2); exitVehicle(false); return; }
    stepDrivenCar(S.driving, driveInput(), dt);
    engineSound(S.driving.speed / S.driving.type.top, true);
    S.prompt = 'E — Get out';
    return;
  }
  engineSound(0, false);
  var f = (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) - (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0);
  var r = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0);
  var fx = fwdX(S.camYaw), fz = fwdZ(S.camYaw);
  var rx = rightX(S.camYaw), rz = rightZ(S.camYaw);
  var dirX = fx * f + rx * r, dirZ = fz * f + rz * r;
  updatePlayerOnFoot(dt, dirX, dirZ, !!(keysDown.ShiftLeft || keysDown.ShiftRight));
  var near = nearestVehicle(RULES.enterRange);
  if (dialogueOpen) S.prompt = 'E — Continue';
  else if (near && Math.abs(near.speed) < 9) S.prompt = 'E — Enter ' + near.type.name + (near.kind === 'traffic' ? ' (steal it)' : '');
  else S.prompt = '';
}

// ---- Camera ---------------------------------------------------------------
var camPos = { x: -112, y: 26, z: 92 };
function updateCamera(dt) {
  var px, py, pz, lx, ly, lz;
  if (S.mode === 'title') {
    var a = S.time * 0.05;
    px = Math.cos(a) * 120; pz = Math.sin(a) * 120 - 10; py = 34;
    lx = 0; ly = 6; lz = -10;
    camPos.x = lerp(camPos.x, px, clamp(dt * 1.2, 0, 1));
    camPos.y = lerp(camPos.y, py, clamp(dt * 1.2, 0, 1));
    camPos.z = lerp(camPos.z, pz, clamp(dt * 1.2, 0, 1));
  } else if (S.driving) {
    var v = S.driving, p = v.mesh.position;
    var back = 10.5 + Math.abs(v.speed) * 0.06;
    px = p.x - fwdX(v.heading) * back;
    pz = p.z - fwdZ(v.heading) * back;
    py = p.y + 4.1;
    var k = 1 - Math.exp(-dt * 4.2);
    camPos.x += (px - camPos.x) * k;
    camPos.y += (py - camPos.y) * k;
    camPos.z += (pz - camPos.z) * k;
    lx = p.x + fwdX(v.heading) * 7; ly = p.y + 1.5; lz = p.z + fwdZ(v.heading) * 7;
    camera.position.set(camPos.x, Math.max(camPos.y, groundYAt(camPos.x, camPos.z) + 0.7), camPos.z);
    camera.lookAt(lx, ly, lz);
    return;
  } else {
    var pp = player.mesh.position;
    var dist = 7.6, height = Math.sin(S.camPitch) * dist;
    var flat = Math.cos(S.camPitch) * dist;
    px = pp.x - fwdX(S.camYaw) * flat;
    pz = pp.z - fwdZ(S.camYaw) * flat;
    py = pp.y + 1.4 + height;
    var k2 = 1 - Math.exp(-dt * 10);
    camPos.x += (px - camPos.x) * k2;
    camPos.y += (py - camPos.y) * k2;
    camPos.z += (pz - camPos.z) * k2;
    lx = pp.x + fwdX(S.camYaw) * 3; ly = pp.y + 1.5; lz = pp.z + fwdZ(S.camYaw) * 3;
  }
  var shakeX = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  var shakeY = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  camera.position.set(camPos.x + shakeX, Math.max(camPos.y, groundYAt(camPos.x, camPos.z) + 0.55) + shakeY, camPos.z);
  camera.lookAt(lx, ly, lz);
}

// ---- Flow ------------------------------------------------------------------
function pauseGame() {
  if (S.mode !== 'play') return;
  S.mode = 'pause';
  EL.pauseScreen.style.display = 'flex';
  document.exitPointerLock && document.exitPointerLock();
}
function resumeGame() {
  if (S.mode !== 'pause') return;
  S.mode = 'play';
  EL.pauseScreen.style.display = 'none';
}
function toggleMute() {
  S.muted = !S.muted;
  audioSetMuted(S.muted);
  EL.muteBtn.textContent = S.muted ? '🔇' : '🔊';
}

function startGame(useSave) {
  audioInit();
  EL.titleScreen.style.display = 'none';
  EL.hud.style.display = 'block';
  S.mode = 'play';
  S.started = true;
  var save = useSave ? loadSave() : null;
  if (save) {
    S.cash = save.cash || 0;
    S.stats = save.stats || S.stats;
    player.mesh.position.set(save.x || PLACES.spawn.x, 0, save.z || PLACES.spawn.z);
    if (save.missionDone) {
      S.missionDone = true;
      S.objective = 'Free roam — Port Solano is yours. Steal something nice.';
    } else {
      startMission(save.missionIndex || 0, false);
    }
    showMessage('Welcome back to Port Solano.', 2.6);
  } else {
    clearSave();
    S.cash = 120; S.health = 100;
    player.mesh.position.set(PLACES.spawn.x, 0, PLACES.spawn.z);
    startMission(0, true);
  }
  var p = player.mesh.position;
  camPos.x = p.x - 6; camPos.y = 4; camPos.z = p.z + 8;
}

// ---- Main loop ---------------------------------------------------------------
var lastNow = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min((now - lastNow) / 1000 || 0.016, 0.05);
  lastNow = now;
  if (S.mode !== 'pause') S.time += dt;
  var playing = S.mode === 'play';
  var worldLive = playing || S.mode === 'title';
  if (worldLive) {
    updateVehicles(dt);
    updatePeds(dt);
  }
  if (playing) {
    updatePlayer(dt);
    updatePolice(dt);
    updateMissions(dt);
    updateDialogue(dt);
    musicUpdate(dt);
    // Heat cools only while nobody in uniform can see you.
    if (policeSeePlayer()) S.unseenFor = 0;
    else S.unseenFor += dt;
    if (S.unseenFor > RULES.unseenDelay && S.heat > 0) {
      S.heat = Math.max(0, S.heat - RULES.heatDecay * dt);
      S.stars = S.heat <= 0 ? 0 : Math.ceil(S.heat);
      if (S.heat === 0) showMessage('You lost the heat.', 2);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 1.8);
    updateHUD();
  }
  tickWorld(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function boot() {
  var canvas = document.getElementById('gameCanvas');
  initWorld(canvas);
  hudInit();
  createPlayer();
  spawnParked();
  spawnSpecialCarHome();
  spawnTraffic(14);
  spawnPeds(22);
  bindInput(canvas);
  EL.newGameBtn.addEventListener('click', function () { startGame(false); });
  EL.continueGameBtn.addEventListener('click', function () { startGame(true); });
  EL.resumeBtn.addEventListener('click', resumeGame);
  EL.continueBtn.addEventListener('click', continueFromEnd);
  EL.muteBtn.addEventListener('click', toggleMute);
  if (loadSave()) EL.continueGameBtn.style.display = 'block';
  S.camYaw = Math.PI;
  window.__SH3 = makeTestHooks();
  requestAnimationFrame(frame);
}

// The Sultan lives at Casa Azul from the start as set dressing; the
// Collector mission simply points Rio at it.
function spawnSpecialCarHome() {
  spawnSpecialCar();
}

function makeTestHooks() {
  return {
    booted: true,
    state: function () {
      var p = playerPos();
      return {
        mode: S.mode, cash: S.cash, health: Math.round(S.health), stars: S.stars,
        heat: Math.round(S.heat * 100) / 100, missionIndex: S.missionIndex, stepIndex: S.stepIndex,
        missionDone: S.missionDone, driving: S.driving ? S.driving.type.id : null,
        player: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 },
        cops: policeCars.length, heli: !!(heli && heli.active),
        dialogueOpen: dialogueOpen, objective: S.objective,
        vehicles: vehicles.length, peds: peds.length,
      };
    },
    start: function (useSave) { startGame(!!useSave); },
    teleport: function (x, z) {
      var p = S.driving ? S.driving.mesh.position : player.mesh.position;
      p.x = x; p.z = z; p.y = groundYAt(x, z);
      if (S.driving) S.driving.speed = 0;
    },
    setHeat: function (n) { addHeat(n - S.heat); },
    enterNearest: function () { var v = nearestVehicle(6); if (v) enterVehicle(v); return !!v; },
    exit: function () { exitVehicle(false); },
    advanceDialogue: function () { advanceDialogue(); },
    closeDialogue: function () { while (dialogueOpen) advanceDialogue(); },
    startMissionAt: function (i) { startMission(i, false); },
    key: function (code, down) { keysDown[code] = !!down; },
    pressKey: function (code) { // a tap: down now, up next frame
      keysDown[code] = true;
      setTimeout(function () { keysDown[code] = false; }, 90);
      if (code === 'KeyE' && S.mode === 'play') interact();
    },
    setCamYaw: function (yaw) { S.camYaw = yaw; },
    hurt: function (n) { hurtPlayer(n); },
  };
}

window.addEventListener('load', boot);
