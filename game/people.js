// SOLANO HEAT 3D — people.js
// Low-poly people: Rio (the player) and the pedestrians of Port Solano.
// Peds stroll between sidewalk corners, flee danger, and go down when a
// car finds them. Traffic drivers are never rendered inside their cars
// (the glass is dark); a stolen car's driver appears at the door and runs.

var player = null;
var peds = [];
var PED_SHIRTS = [0xd95f43, 0x3f7fbf, 0xe3c04a, 0x5da85f, 0xe8e4da, 0x8a5fc0, 0x3fbfae, 0xd6537a];
var PED_PANTS = [0x2b3440, 0x5c4a33, 0x39506b, 0x707880, 0x243028];

function buildPerson(shirt, pants, skin, hair) {
  var g = new THREE.Group();
  var matShirt = new THREE.MeshLambertMaterial({ color: shirt });
  var matPants = new THREE.MeshLambertMaterial({ color: pants });
  var matSkin = new THREE.MeshLambertMaterial({ color: skin });
  var matHair = new THREE.MeshLambertMaterial({ color: hair });
  function limb(w, h, d, mat, x, y, z) {
    var geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0); // pivot at the top so limbs swing
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  var legL = limb(0.17, 0.85, 0.19, matPants, -0.13, 0.88, 0);
  var legR = limb(0.17, 0.85, 0.19, matPants, 0.13, 0.88, 0);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.3), matShirt);
  torso.position.y = 1.2; torso.castShadow = true;
  g.add(torso);
  var armL = limb(0.13, 0.72, 0.15, matShirt, -0.35, 1.46, 0);
  var armR = limb(0.13, 0.72, 0.15, matShirt, 0.35, 1.46, 0);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.3, 0.27), matSkin);
  head.position.y = 1.68; head.castShadow = true;
  g.add(head);
  var cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), matHair);
  cap.position.y = 1.86;
  g.add(cap);
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  return g;
}

function animatePerson(mesh, phase, amount) {
  var l = mesh.userData.limbs;
  var swing = Math.sin(phase) * 0.65 * amount;
  l.legL.rotation.x = swing; l.legR.rotation.x = -swing;
  l.armL.rotation.x = -swing * 0.8; l.armR.rotation.x = swing * 0.8;
}

function createPlayer() {
  var mesh = buildPerson(0x1f8a8c, 0x2b3440, 0xc98d64, 0x1d1712);
  mesh.position.set(PLACES.spawn.x, 0, PLACES.spawn.z);
  scene.add(mesh);
  player = { mesh: mesh, heading: Math.PI, walkPhase: 0, speedNow: 0 };
  return player;
}

function playerPos() {
  if (S.driving) return S.driving.mesh.position;
  return player.mesh.position;
}

function sidewalkTarget() {
  // A random point on a random sidewalk band somewhere in the city.
  if (randChance(0.5)) {
    var x = randPick(AVENUES_X) + (randChance(0.5) ? 1 : -1) * (ROAD_HALF + 1.9);
    return { x: clamp(x, -148, 148), z: randRange(-112, 76) };
  }
  var z = randPick(STREETS_Z) + (randChance(0.5) ? 1 : -1) * (ROAD_HALF + 1.9);
  return { x: randRange(-146, 146), z: clamp(z, -114, 78) };
}

function spawnPeds(count) {
  for (var i = 0; i < count; i++) {
    var t = sidewalkTarget();
    var mesh = buildPerson(randPick(PED_SHIRTS), randPick(PED_PANTS), randPick([0xc98d64, 0x8a5a38, 0xe8b48f, 0x6e4526]), 0x241a12);
    mesh.position.set(t.x, groundYAt(t.x, t.z), t.z);
    scene.add(mesh);
    var next = sidewalkTarget();
    peds.push({ mesh: mesh, state: 'walk', tx: next.x, tz: next.z, walkPhase: randRange(0, 6), fleeFor: 0, downFor: 0, speed: randRange(1.1, 1.7) });
  }
}

function spawnPedAt(x, z, fleeFromX, fleeFromZ) {
  var mesh = buildPerson(randPick(PED_SHIRTS), randPick(PED_PANTS), 0xc98d64, 0x241a12);
  mesh.position.set(x, groundYAt(x, z), z);
  scene.add(mesh);
  var ped = { mesh: mesh, state: 'flee', tx: x, tz: z, walkPhase: 0, fleeFor: 2.6, downFor: 0, speed: 1.4, fx: fleeFromX, fz: fleeFromZ };
  peds.push(ped);
  return ped;
}

// The driver of a stolen car bails out and runs for it.
function ejectDriver(v) {
  var p = v.mesh.position;
  var sideX = rightX(v.heading), sideZ = rightZ(v.heading);
  spawnPedAt(p.x - sideX * 2.2, p.z - sideZ * 2.2, p.x, p.z);
}

function scarePeds(x, z, radius) {
  for (var i = 0; i < peds.length; i++) {
    var ped = peds[i];
    if (ped.state === 'walk' && dist2d(ped.mesh.position.x, ped.mesh.position.z, x, z) < radius) {
      ped.state = 'flee'; ped.fleeFor = randRange(1.6, 3); ped.fx = x; ped.fz = z;
    }
  }
}

function updatePed(ped, dt) {
  var p = ped.mesh.position;
  if (ped.state === 'down') {
    ped.downFor -= dt;
    ped.mesh.rotation.x = lerp(ped.mesh.rotation.x, -Math.PI / 2, clamp(dt * 7, 0, 1));
    if (ped.downFor <= 0) {
      // Get up far from the action and stroll on.
      var t = sidewalkTarget();
      p.set(t.x, 0, t.z);
      ped.mesh.rotation.x = 0;
      ped.state = 'walk';
      var n = sidewalkTarget(); ped.tx = n.x; ped.tz = n.z;
    }
    return;
  }
  var tx, tz, speed;
  if (ped.state === 'flee') {
    ped.fleeFor -= dt;
    var away = Math.atan2(p.x - ped.fx, p.z - ped.fz);
    tx = p.x + Math.sin(away) * 10; tz = p.z + Math.cos(away) * 10;
    speed = 5.4;
    if (ped.fleeFor <= 0) { ped.state = 'walk'; var n2 = sidewalkTarget(); ped.tx = n2.x; ped.tz = n2.z; }
  } else {
    tx = ped.tx; tz = ped.tz; speed = ped.speed;
    if (dist2d(p.x, p.z, tx, tz) < 1.4) { var n3 = sidewalkTarget(); ped.tx = n3.x; ped.tz = n3.z; return; }
  }
  var heading = Math.atan2(tx - p.x, tz - p.z);
  ped.mesh.rotation.y = angleLerp(ped.mesh.rotation.y, heading, clamp(dt * 8, 0, 1));
  var probe = { x: p.x + Math.sin(heading) * speed * dt, z: p.z + Math.cos(heading) * speed * dt };
  collideCircle(probe, 0.4);
  p.x = probe.x; p.z = probe.z;
  p.y = groundYAt(p.x, p.z);
  ped.walkPhase += dt * speed * 3.4;
  animatePerson(ped.mesh, ped.walkPhase, ped.state === 'flee' ? 1.15 : 0.8);

  // Cars are dangerous: a fast car on top of a ped puts the ped down.
  var list = allVehicles();
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    if (Math.abs(v.speed) < 3.5) continue;
    if (dist2d(p.x, p.z, v.mesh.position.x, v.mesh.position.z) < v.radius * 0.85 + 0.35) {
      ped.state = 'down'; ped.downFor = 7;
      if (v === S.driving) registerPedHit();
      break;
    }
  }
}

function updatePeds(dt) {
  for (var i = 0; i < peds.length; i++) updatePed(peds[i], dt);
}

// On-foot movement for Rio himself. dirX/dirZ is a unit wish-direction in
// world space (already camera-relative), sprint picks the pace.
function updatePlayerOnFoot(dt, dirX, dirZ, sprint) {
  var mesh = player.mesh;
  var moving = (dirX !== 0 || dirZ !== 0);
  var speed = sprint ? RULES.sprintSpeed : RULES.walkSpeed;
  player.speedNow = moving ? speed : 0;
  if (moving) {
    var len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    var hx = dirX / len, hz = dirZ / len;
    player.heading = Math.atan2(hx, hz);
    mesh.rotation.y = angleLerp(mesh.rotation.y, player.heading, clamp(dt * 14, 0, 1));
    var probe = { x: mesh.position.x + hx * speed * dt, z: mesh.position.z + hz * speed * dt };
    collideCircle(probe, RULES.playerRadius);
    mesh.position.x = probe.x; mesh.position.z = probe.z;
    player.walkPhase += dt * speed * 2.6;
  }
  mesh.position.y = groundYAt(mesh.position.x, mesh.position.z);
  animatePerson(mesh, player.walkPhase, moving ? (sprint ? 1.2 : 0.85) : 0);

  // Traffic can run Rio down, too.
  if (S.mode === 'play') {
    var list = allVehicles();
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (Math.abs(v.speed) < 6) continue;
      if (dist2d(mesh.position.x, mesh.position.z, v.mesh.position.x, v.mesh.position.z) < v.radius * 0.8 + 0.4) {
        hurtPlayer(Math.abs(v.speed) * 0.55);
        S.shake = 0.5;
        sfxCrash(true);
        var away = Math.atan2(mesh.position.x - v.mesh.position.x, mesh.position.z - v.mesh.position.z);
        var probe2 = { x: mesh.position.x + Math.sin(away) * 3.4, z: mesh.position.z + Math.cos(away) * 3.4 };
        collideCircle(probe2, RULES.playerRadius);
        mesh.position.x = probe2.x; mesh.position.z = probe2.z;
        break;
      }
    }
  }
}
