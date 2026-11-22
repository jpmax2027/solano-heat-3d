// SOLANO HEAT 3D — vehicles.js
// The car factory (one low-poly mesh builder for every type), the parked
// cars along the kerbs, traffic that drives the road graph, and the
// arcade driving physics the player and the AI share.

var vehicles = [];         // traffic + parked (police live in police.js)
var matGlass = null, matTire = null, matLight = null, matTail = null;
var paintMats = {};

function paintMat(color) {
  if (!paintMats[color]) paintMats[color] = new THREE.MeshLambertMaterial({ color: color });
  return paintMats[color];
}

function buildCarMesh(type, colorHex) {
  if (!matGlass) {
    matGlass = new THREE.MeshLambertMaterial({ color: 0x1c2833 });
    matTire = new THREE.MeshLambertMaterial({ color: 0x14161a });
    matLight = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    matTail = new THREE.MeshBasicMaterial({ color: 0xd42a20 });
  }
  var g = new THREE.Group();
  var paint = paintMat(colorHex);
  var bodyH = type.hgt, wheelR = 0.34;
  var body = new THREE.Mesh(new THREE.BoxGeometry(type.wid, bodyH, type.len), paint);
  body.position.y = wheelR + bodyH / 2 - 0.08;
  body.castShadow = true;
  g.add(body);
  var cabin = new THREE.Mesh(new THREE.BoxGeometry(type.wid * 0.84, type.cabin, type.len * (type.id === 'van' ? 0.86 : 0.48)), matGlass);
  cabin.position.set(0, wheelR + bodyH + type.cabin / 2 - 0.1, type.id === 'van' ? 0.1 : -type.len * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  var wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  var wheels = [];
  var wx = type.wid / 2 - 0.05, wz = type.len * 0.32;
  [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(function (wp) {
    var wheel = new THREE.Mesh(wheelGeo, matTire);
    wheel.position.set(wp[0], wheelR, wp[1]);
    g.add(wheel); wheels.push(wheel);
  });
  var hl = new THREE.Mesh(new THREE.BoxGeometry(type.wid * 0.7, 0.12, 0.06), matLight);
  hl.position.set(0, wheelR + bodyH * 0.55, type.len / 2 + 0.02);
  g.add(hl);
  var tl = new THREE.Mesh(new THREE.BoxGeometry(type.wid * 0.7, 0.1, 0.06), matTail);
  tl.position.set(0, wheelR + bodyH * 0.6, -type.len / 2 - 0.02);
  g.add(tl);
  var extras = { wheels: wheels, lightMats: null };
  if (type.id === 'taxi') {
    var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd94a }));
    sign.position.set(0, wheelR + bodyH + type.cabin + 0.08, 0);
    g.add(sign);
  }
  if (type.id === 'sport') {
    var spoiler = new THREE.Mesh(new THREE.BoxGeometry(type.wid * 0.92, 0.07, 0.4), paint);
    spoiler.position.set(0, wheelR + bodyH + 0.28, -type.len * 0.44);
    g.add(spoiler);
  }
  if (type.id === 'police') {
    var bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), matTire);
    bar.position.set(0, wheelR + bodyH + type.cabin + 0.06, -type.len * 0.05);
    g.add(bar);
    var matR = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
    var matB = new THREE.MeshBasicMaterial({ color: 0x2a6fff });
    var lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.44), matR);
    lr.position.set(-0.28, wheelR + bodyH + type.cabin + 0.07, -type.len * 0.05);
    var lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.44), matB);
    lb.position.set(0.28, wheelR + bodyH + type.cabin + 0.07, -type.len * 0.05);
    g.add(lr); g.add(lb);
    extras.lightMats = [matR, matB];
  }
  g.userData.extras = extras;
  return g;
}

function makeVehicle(typeId, colorHex, x, z, heading, kind) {
  var type = null;
  for (var i = 0; i < CAR_TYPES.length; i++) if (CAR_TYPES[i].id === typeId) type = CAR_TYPES[i];
  var mesh = buildCarMesh(type, colorHex);
  mesh.position.set(x, groundYAt(x, z), z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  var v = {
    mesh: mesh, type: type, kind: kind, heading: heading, speed: 0,
    health: 100, radius: Math.max(type.len, type.wid) / 2 * 0.82,
    fromNode: -1, toNode: -1, cruise: randRange(0.36, 0.5), stuckFor: 0,
    driver: null, wrecked: false, honkAt: 0,
  };
  mesh.userData.vehicle = v;
  return v;
}

function trafficTargetPoint(v) {
  var a = roadNodes[v.fromNode], b = roadNodes[v.toNode];
  var dx = b.x - a.x, dz = b.z - a.z, len = Math.sqrt(dx * dx + dz * dz) || 1;
  var fx = dx / len, fz = dz / len;
  // right of forward (fx, fz) is (-fz, fx); lane centre sits 3.1 m right
  return { x: b.x + (-fz) * 3.1, z: b.z + fx * 3.1 };
}

function pickNextNode(v) {
  var options = roadNodes[v.toNode].next;
  var back = v.fromNode;
  var best = -1, bestScore = -Infinity;
  for (var i = 0; i < options.length; i++) {
    var n = options[i];
    if (n === back && options.length > 1) continue;
    var t = roadNodes[n];
    var dx = t.x - roadNodes[v.toNode].x, dz = t.z - roadNodes[v.toNode].z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var align = (dx / len) * fwdX(v.heading) + (dz / len) * fwdZ(v.heading);
    var score = align + randRange(0, 0.55);
    if (score > bestScore) { bestScore = score; best = n; }
  }
  if (best < 0) best = back;
  v.fromNode = v.toNode; v.toNode = best;
}

function spawnTraffic(count) {
  for (var i = 0; i < count; i++) {
    var from = randInt(0, roadNodes.length - 1);
    var to = randPick(roadNodes[from].next);
    var typeId = randPick(['sedan', 'sedan', 'hatch', 'taxi', 'van', 'pickup']);
    var color = typeId === 'taxi' ? 0xf2b21b : randPick(CAR_PAINT);
    var a = roadNodes[from], b = roadNodes[to];
    var dx = b.x - a.x, dz = b.z - a.z, len = Math.sqrt(dx * dx + dz * dz) || 1;
    var fx = dx / len, fz = dz / len;
    var t = randRange(0.25, 0.75);
    var x = a.x + dx * t + (-fz) * 3.1, z = a.z + dz * t + fx * 3.1;
    var v = makeVehicle(typeId, color, x, z, Math.atan2(fx, fz), 'traffic');
    v.fromNode = from; v.toNode = to;
    v.speed = v.type.top * v.cruise * 0.6;
    vehicles.push(v);
  }
}

function spawnParked() {
  var spots = [];
  // Kerbside parking along a few streets and avenues.
  for (var i = 0; i < 30; i++) {
    var alongX = randChance(0.5);
    if (alongX) {
      var z = randPick(STREETS_Z) + (randChance(0.5) ? 5.6 : -5.6);
      spots.push({ x: randRange(-140, 140), z: z, h: Math.PI / 2 + (z > 0 && randChance(0.5) ? Math.PI : 0) });
    } else {
      var x = randPick(AVENUES_X) + (randChance(0.5) ? 5.6 : -5.6);
      spots.push({ x: x, z: randRange(-105, 55), h: randChance(0.5) ? 0 : Math.PI });
    }
  }
  spots.push({ x: PLACES.garage.x + 4, z: PLACES.garage.z + 1, h: Math.PI / 2 });   // Rico's van spot
  spots.push({ x: PLACES.hotel.x - 5, z: 62, h: Math.PI / 2 });
  spots.push({ x: 160, z: 60, h: 0 });
  for (var k = 0; k < spots.length; k++) {
    var s = spots[k];
    var typeId = k === 0 ? 'van' : randPick(['sedan', 'hatch', 'sedan', 'pickup', 'van']);
    var v = makeVehicle(typeId, typeId === 'taxi' ? 0xf2b21b : randPick(CAR_PAINT), s.x, s.z, s.h, 'parked');
    vehicles.push(v);
  }
}

// The gold Sultan RS the Collector mission is about. One car, always:
// calling this again puts the same car back at Casa Azul, whole.
var specialCar = null;
function spawnSpecialCar() {
  if (specialCar) {
    specialCar.mesh.position.set(PLACES.casaAzul.x + 3.5, 0, PLACES.casaAzul.z - 2);
    specialCar.heading = Math.PI / 2;
    specialCar.speed = 0; specialCar.health = 100; specialCar.wrecked = false; specialCar.kind = 'parked';
    return specialCar;
  }
  specialCar = makeVehicle('sport', 0xd8a920, PLACES.casaAzul.x + 3.5, PLACES.casaAzul.z - 2, Math.PI / 2, 'parked');
  vehicles.push(specialCar);
  return specialCar;
}

function obstacleAhead(v, range) {
  // Nearest thing in front of a vehicle: another vehicle or the player.
  var fx = fwdX(v.heading), fz = fwdZ(v.heading);
  var best = null, bestD = range;
  var list = allVehicles();
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o === v) continue;
    var dx = o.mesh.position.x - v.mesh.position.x, dz = o.mesh.position.z - v.mesh.position.z;
    var ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
    if (ahead > 0 && ahead < bestD && side < 2.6) { bestD = ahead; best = o; }
  }
  if (!S.driving) {
    var p = playerPos();
    var pdx = p.x - v.mesh.position.x, pdz = p.z - v.mesh.position.z;
    var pAhead = pdx * fx + pdz * fz, pSide = Math.abs(pdx * -fz + pdz * fx);
    if (pAhead > 0 && pAhead < bestD && pSide < 2.2) { bestD = pAhead; best = 'player'; }
  }
  return best ? { what: best, dist: bestD } : null;
}

function updateTrafficCar(v, dt) {
  if (v.wrecked) return;
  var target = trafficTargetPoint(v);
  var px = v.mesh.position.x, pz = v.mesh.position.z;
  var dx = target.x - px, dz = target.z - pz;
  var distT = Math.sqrt(dx * dx + dz * dz);
  if (distT < 5) { pickNextNode(v); return; }
  var wantHeading = Math.atan2(dx, dz);
  var obstacle = obstacleAhead(v, 13 + Math.abs(v.speed) * 0.5);
  var cruise = v.type.top * v.cruise;
  var targetSpeed = cruise;
  if (obstacle) {
    targetSpeed = obstacle.dist < 6 ? 0 : cruise * 0.35;
    if (obstacle.what === 'player' && obstacle.dist < 9 && S.time > v.honkAt) { v.honkAt = S.time + randRange(3, 7); sfxHorn(); }
  }
  var turnGap = Math.abs(((wantHeading - v.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (turnGap > 0.7) targetSpeed = Math.min(targetSpeed, 6);
  v.speed = lerp(v.speed, targetSpeed, clamp(dt * (targetSpeed > v.speed ? 0.9 : 3.2), 0, 1));
  v.heading = angleLerp(v.heading, wantHeading, clamp(dt * 1.7, 0, 1));
  moveVehicle(v, dt);
  if (Math.abs(v.speed) < 0.25 && targetSpeed > 1) {
    v.stuckFor += dt;
    if (v.stuckFor > 3.5) { // nudge out of a jam: swap target for another route
      v.stuckFor = 0; pickNextNode(v);
    }
  } else v.stuckFor = 0;
}

function moveVehicle(v, dt) {
  var p = v.mesh.position;
  p.x += fwdX(v.heading) * v.speed * dt;
  p.z += fwdZ(v.heading) * v.speed * dt;
  var before = { x: p.x, z: p.z };
  var hit = collideCircle(before, v.radius * 0.72);
  p.x = before.x; p.z = before.z;
  if (hit && Math.abs(v.speed) > 3) v.speed *= 0.55;
  p.y = groundYAt(p.x, p.z);
  v.mesh.rotation.y = v.heading;
  spinWheels(v, dt);
}

function spinWheels(v, dt) {
  var wheels = v.mesh.userData.extras.wheels;
  var spin = (v.speed * dt) / 0.34;
  for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x += spin;
}

// Arcade driving for whoever holds the wheel (the player).
function stepDrivenCar(v, input, dt) {
  var t = v.type;
  if (input.up) v.speed += t.accel * dt * (v.speed < 0 ? 2.2 : 1);
  else if (input.down) v.speed -= (v.speed > 0.5 ? 26 : t.accel * 0.7) * dt;
  else v.speed -= v.speed * 0.35 * dt;                    // engine drag
  if (input.handbrake) v.speed -= v.speed * 2.4 * dt;
  v.speed = clamp(v.speed, -11, t.top);
  var steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  var speedRatio = clamp(Math.abs(v.speed) / t.top, 0, 1);
  var turnRate = steer * (0.55 + speedRatio * 0.75) * t.grip * (v.speed < 0 ? -1 : 1);
  if (Math.abs(v.speed) > 0.2) v.heading += turnRate * dt * clamp(Math.abs(v.speed) / 6, 0.25, 1);
  var p = v.mesh.position;
  var px = p.x, pz = p.z;
  p.x += fwdX(v.heading) * v.speed * dt;
  p.z += fwdZ(v.heading) * v.speed * dt;
  var probe = { x: p.x, z: p.z };
  var hitWall = collideCircle(probe, v.radius * 0.74);
  if (hitWall) {
    p.x = probe.x; p.z = probe.z;
    if (Math.abs(v.speed) > 7) {
      damageVehicle(v, Math.abs(v.speed) * 0.55);
      hurtPlayer(Math.abs(v.speed) * 0.35);
      S.shake = Math.min(0.7, Math.abs(v.speed) * 0.02);
      sfxCrash(Math.abs(v.speed) > 16);
    }
    v.speed *= 0.35;
  }
  p.y = groundYAt(p.x, p.z);
  v.mesh.rotation.y = v.heading;
  // a touch of body roll in corners, lean under acceleration
  v.mesh.rotation.z = clamp(-steer * speedRatio * 0.05, -0.06, 0.06);
  v.mesh.rotation.x = clamp((input.up ? -0.012 : 0) + (input.down && v.speed > 1 ? 0.02 : 0), -0.03, 0.03);
  spinWheels(v, dt);
  return hitWall;
}

function damageVehicle(v, amount) {
  v.health -= amount;
  if (v.health <= 0 && !v.wrecked) {
    v.wrecked = true; v.speed = 0;
    var smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 7, 6),
      new THREE.MeshBasicMaterial({ color: 0x2c2c2c, transparent: true, opacity: 0.55 })
    );
    smoke.position.set(0, 1.5, v.type.len * 0.3);
    smoke.name = 'wreckSmoke';
    v.mesh.add(smoke);
  }
}

// Circle collisions between every vehicle on the street.
function collideVehicles(dt) {
  var list = allVehicles();
  for (var i = 0; i < list.length; i++) {
    for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      var dx = b.mesh.position.x - a.mesh.position.x;
      var dz = b.mesh.position.z - a.mesh.position.z;
      var rr = (a.radius + b.radius) * 0.78;
      var d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 === 0) continue;
      var d = Math.sqrt(d2), push = (rr - d) / 2;
      var nx = dx / d, nz = dz / d;
      var aDriven = S.driving === a, bDriven = S.driving === b;
      if (!bDriven || aDriven) { b.mesh.position.x += nx * push; b.mesh.position.z += nz * push; }
      if (!aDriven || bDriven) { a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push; }
      var relSpeed = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      if (relSpeed > 5) {
        damageVehicle(a, relSpeed * 0.4); damageVehicle(b, relSpeed * 0.4);
        if (aDriven || bDriven) {
          hurtPlayer(relSpeed * 0.3);
          S.shake = Math.min(0.6, relSpeed * 0.02);
          sfxCrash(relSpeed > 13);
          registerVehicleHit(bDriven ? a : b);
        }
        a.speed *= 0.55; b.speed *= 0.55;
      } else {
        a.speed *= 0.85; b.speed *= 0.85;
      }
    }
  }
}

function allVehicles() {
  return vehicles.concat(policeCars);
}

function updateVehicles(dt) {
  for (var i = 0; i < vehicles.length; i++) {
    if (vehicles[i].kind === 'traffic') updateTrafficCar(vehicles[i], dt);
  }
  collideVehicles(dt);
}
