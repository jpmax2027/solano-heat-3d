// SOLANO HEAT 3D — police.js
// The Port Solano PD: Interceptors that spawn off-screen, hunt, ram and
// box the player in; a helicopter with a searchlight at high heat; and
// the bust meter that fills when they pin a stationary player.

var policeCars = [];
var heli = null;

function wantedCopCount() {
  return S.stars <= 0 ? 0 : Math.min(5, S.stars);
}

function spawnCop() {
  var p = playerPos();
  for (var tries = 0; tries < 12; tries++) {
    var node = randPick(roadNodes);
    var d = dist2d(node.x, node.z, p.x, p.z);
    if (d < 55 || d > 95) continue;
    var v = makeVehicle('police', 0xf0f0f0, node.x, node.z, randRange(0, Math.PI * 2), 'police');
    v.stuckFor = 0;
    policeCars.push(v);
    return v;
  }
  return null;
}

function removeCop(v) {
  scene.remove(v.mesh);
  var i = policeCars.indexOf(v);
  if (i >= 0) policeCars.splice(i, 1);
}

function probeBlocked(x, z, heading, dist) {
  var probe = { x: x + fwdX(heading) * dist, z: z + fwdZ(heading) * dist };
  var before = { x: probe.x, z: probe.z };
  var hit = collideCircle(probe, 1.7);
  return hit && dist2d(before.x, before.z, probe.x, probe.z) > 0.4;
}

function updateCop(v, dt) {
  if (v.wrecked) { v.speed = 0; return; }
  var p = playerPos();
  var pos = v.mesh.position;
  var dist = dist2d(pos.x, pos.z, p.x, p.z);
  // Aim a little ahead of a moving target so intercepts actually meet.
  var leadX = p.x, leadZ = p.z;
  if (S.driving) { leadX += fwdX(S.driving.heading) * S.driving.speed * 0.45; leadZ += fwdZ(S.driving.heading) * S.driving.speed * 0.45; }
  var want = Math.atan2(leadX - pos.x, leadZ - pos.z);
  if (probeBlocked(pos.x, pos.z, want, 9)) {
    var left = want + 0.85, right = want - 0.85;
    if (!probeBlocked(pos.x, pos.z, left, 9)) want = left;
    else if (!probeBlocked(pos.x, pos.z, right, 9)) want = right;
  }
  var aggression = 0.8 + S.stars * 0.045;
  var targetSpeed = v.type.top * aggression;
  if (dist < 7) targetSpeed = Math.min(targetSpeed, Math.max(6, dist * 1.6));
  if (dist > 130) targetSpeed = v.type.top;
  v.speed = lerp(v.speed, targetSpeed, clamp(dt * (targetSpeed > v.speed ? 0.8 : 2.6), 0, 1));
  v.heading = angleLerp(v.heading, want, clamp(dt * 2.1, 0, 1));
  moveVehicle(v, dt);
  // Flash the light bar.
  var mats = v.mesh.userData.extras.lightMats;
  if (mats) {
    var phase = Math.sin(S.time * 11 + v.mesh.id) > 0;
    mats[0].color.setHex(phase ? 0xff2a20 : 0x57120e);
    mats[1].color.setHex(phase ? 0x12275c : 0x2a6fff);
  }
  if (Math.abs(v.speed) < 0.3 && dist > 14) {
    v.stuckFor += dt;
    if (v.stuckFor > 4) { // hopelessly wedged: the unit gives up and despawns
      removeCop(v);
    }
  } else v.stuckFor = 0;
}

function policeSeePlayer() {
  if (heli && heli.active) return true;
  var p = playerPos();
  for (var i = 0; i < policeCars.length; i++) {
    if (policeCars[i].wrecked) continue;
    if (dist2d(policeCars[i].mesh.position.x, policeCars[i].mesh.position.z, p.x, p.z) < RULES.sightRange) return true;
  }
  return false;
}

function nearestCopDist() {
  var p = playerPos(), best = 9999;
  for (var i = 0; i < policeCars.length; i++) {
    var d = dist2d(policeCars[i].mesh.position.x, policeCars[i].mesh.position.z, p.x, p.z);
    if (d < best) best = d;
  }
  return best;
}

function updatePolice(dt) {
  var want = wantedCopCount();
  var active = 0;
  for (var i = 0; i < policeCars.length; i++) if (!policeCars[i].wrecked) active++;
  if (active < want) spawnCop();
  for (var k = policeCars.length - 1; k >= 0; k--) {
    var v = policeCars[k];
    updateCop(v, dt);
    var p = playerPos();
    if (S.stars <= 0 && dist2d(v.mesh.position.x, v.mesh.position.z, p.x, p.z) > 95) removeCop(v);
  }
  updateHeli(dt);
  updateBust(dt);
  sirenSound(nearestCopDist());
}

function updateBust(dt) {
  if (S.mode !== 'play' || S.stars <= 0) { S.bustMeter = Math.max(0, S.bustMeter - dt * 0.7); return; }
  var p = playerPos();
  var near = false;
  for (var i = 0; i < policeCars.length; i++) {
    if (policeCars[i].wrecked) continue;
    var range = S.driving ? 9.5 : 5.2;
    if (dist2d(policeCars[i].mesh.position.x, policeCars[i].mesh.position.z, p.x, p.z) < range) { near = true; break; }
  }
  var pinned = S.driving ? Math.abs(S.driving.speed) < 1.6 : player.speedNow < 0.8;
  if (near && pinned) {
    S.bustMeter += dt / (S.driving ? RULES.bustTimeCar : RULES.bustTimeFoot);
    if (S.bustMeter >= 1) { S.bustMeter = 0; doBusted(); }
  } else {
    S.bustMeter = Math.max(0, S.bustMeter - dt * 0.55);
  }
}

// ---- The helicopter -------------------------------------------------------
function buildHeli() {
  var g = new THREE.Group();
  var matBody = new THREE.MeshLambertMaterial({ color: 0x27313c });
  var matAccent = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 5.6), matBody);
  body.castShadow = true;
  g.add(body);
  var nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.4), matAccent);
  nose.position.set(0, -0.2, 3.2);
  g.add(nose);
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.6), matBody);
  tail.position.set(0, 0.3, -4.6);
  g.add(tail);
  var fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.7), matAccent);
  fin.position.set(0, 0.7, -6.8);
  g.add(fin);
  var rotorGeo = new THREE.BoxGeometry(11.5, 0.06, 0.5);
  var rotor = new THREE.Mesh(rotorGeo, new THREE.MeshBasicMaterial({ color: 0x181c20 }));
  rotor.position.y = 1.25;
  rotor.name = 'mainRotor';
  g.add(rotor);
  var skidGeo = new THREE.BoxGeometry(0.12, 0.12, 3.6);
  [-0.9, 0.9].forEach(function (sx) {
    var skid = new THREE.Mesh(skidGeo, matBody);
    skid.position.set(sx, -1.25, 0.4);
    g.add(skid);
  });
  var coneGeo = new THREE.CylinderGeometry(0.7, 7.5, 30, 12, 1, true);
  coneGeo.translate(0, -15, 0);
  var cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color: 0xfff3b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
  }));
  cone.name = 'spotCone';
  cone.rotation.x = -Math.PI / 2; // lay the downward cone along the group's forward axis
  g.add(cone);
  var light = new THREE.SpotLight(0xfff3b0, 0, 80, 0.4, 0.5, 0);
  light.name = 'spotLight';
  g.add(light);
  g.add(light.target);
  g.visible = false;
  scene.add(g);
  return { mesh: g, active: false, orbit: 0, rotor: rotor, light: light, cone: cone };
}

function updateHeli(dt) {
  if (!heli) heli = buildHeli();
  var shouldFly = S.stars >= 4 && S.mode === 'play';
  var p = playerPos();
  if (shouldFly && !heli.active) {
    heli.active = true;
    heli.mesh.visible = true;
    heli.mesh.position.set(p.x + 60, 34, p.z - 60);
    showMessage('Police helicopter overhead!', 2.6);
  }
  if (!shouldFly && heli.active) {
    heli.active = false;
    heli.mesh.visible = false;
    heli.light.intensity = 0;
    return;
  }
  if (!heli.active) return;
  heli.orbit += dt * 0.24;
  var tx = p.x + Math.cos(heli.orbit) * 17, tz = p.z + Math.sin(heli.orbit) * 17;
  var pos = heli.mesh.position;
  pos.x = lerp(pos.x, tx, clamp(dt * 1.4, 0, 1));
  pos.z = lerp(pos.z, tz, clamp(dt * 1.4, 0, 1));
  pos.y = lerp(pos.y, 30 + Math.sin(S.time * 0.8) * 1.6, clamp(dt * 1.4, 0, 1));
  heli.mesh.lookAt(p.x, 0, p.z);
  heli.rotor.rotation.y += dt * 28;
  heli.light.intensity = 2.2;
  heli.light.position.set(0, -1, 0);
  heli.light.target.position.set(0, 0, 40); // straight down the nose, where lookAt points
}
