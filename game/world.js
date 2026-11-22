// SOLANO HEAT 3D — world.js
// Builds Port Solano: the road grid, city blocks with instanced
// buildings, signed landmarks, palms, lamps, the beach, the ocean and
// the Muelle 9 dock. Also owns the collision boxes, the road graph the
// traffic drives on, and the objective marker pillar.

var scene = null, camera = null, renderer = null, sunLight = null;
var colliders = [];        // {minX, maxX, minZ, maxZ} solid boxes
var roadNodes = [];        // {x, z, next: [node indices]}
var waterTex = null, markerPillar = null, markerRing = null;

function canvasTexture(w, h, draw, repeatX, repeatY) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTexture() {
  return canvasTexture(128, 256, function (g, w, h) {
    g.fillStyle = '#33373c'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#c8a83c';
    for (var y = 8; y < h; y += 42) g.fillRect(w / 2 - 2, y, 4, 22);
    g.fillStyle = 'rgba(240,240,240,0.85)';
    g.fillRect(3, 0, 3, h); g.fillRect(w - 6, 0, 3, h);
  });
}

function buildingTexture() {
  return canvasTexture(128, 256, function (g, w, h) {
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, w, h);
    for (var y = 10; y < h - 12; y += 22) {
      for (var x = 10; x < w - 14; x += 24) {
        var lit = Math.random() < 0.24;
        g.fillStyle = lit ? '#ffd98a' : '#33424f';
        g.fillRect(x, y, 14, 13);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x, y, 14, 3);
      }
    }
  });
}

function noiseTexture(base, fleck) {
  return canvasTexture(128, 128, function (g, w, h) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 700; i++) {
      g.fillStyle = fleck; g.globalAlpha = Math.random() * 0.16;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    g.globalAlpha = 1;
  }, 24, 24);
}

function signTexture(text, bg, fg) {
  var tex = canvasTexture(512, 128, function (g, w, h) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function addCollider(cx, cz, w, d) {
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}

// Push a circle (x, z, radius r) out of every collider and the world
// bounds. Returns true when a push happened (a hit).
function collideCircle(p, r) {
  var hit = false;
  for (var i = 0; i < colliders.length; i++) {
    var b = colliders[i];
    var nx = clamp(p.x, b.minX, b.maxX), nz = clamp(p.z, b.minZ, b.maxZ);
    var dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.000001) {
        var d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: leave by the shallowest side
        var l = p.x - b.minX, rt = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
        var m = Math.min(l, rt, t, bt);
        if (m === l) p.x = b.minX - r; else if (m === rt) p.x = b.maxX + r;
        else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  // Land bounds: no swimming. The south sea starts past the waterline;
  // the east bay starts past x=198, except along the pier deck.
  if (p.z > SAND_END_Z + 1 && p.x < 198) { p.z = SAND_END_Z + 1; hit = true; }
  if (p.x > 198 && !(p.z > DOCK.pierZ0 - 1 && p.z < DOCK.pierZ1 + 1)) { p.x = 198; hit = true; }
  p.x = clamp(p.x, CITY.minX - 6, DOCK.pierEndX - 1);
  p.z = clamp(p.z, CITY.minZ - 6, SAND_END_Z + 1);
  return hit;
}

function groundYAt(x, z) {
  if (x >= 190 && x <= DOCK.pierEndX && z >= DOCK.pierZ0 && z <= DOCK.pierZ1) return 0.42; // the pier
  if (x >= DOCK.minX && x <= 196 && z >= DOCK.deckZ0 && z <= DOCK.deckZ1) return 0.12;     // dock deck
  return 0;
}

function buildRoadGraph() {
  roadNodes = [];
  var index = {};
  for (var i = 0; i < AVENUES_X.length; i++) {
    for (var j = 0; j < STREETS_Z.length; j++) {
      index[AVENUES_X[i] + ',' + STREETS_Z[j]] = roadNodes.length;
      roadNodes.push({ x: AVENUES_X[i], z: STREETS_Z[j], next: [] });
    }
  }
  function link(a, b) { roadNodes[a].next.push(b); roadNodes[b].next.push(a); }
  for (var a = 0; a < AVENUES_X.length; a++) {
    for (var s = 0; s < STREETS_Z.length; s++) {
      var id = index[AVENUES_X[a] + ',' + STREETS_Z[s]];
      if (s + 1 < STREETS_Z.length) link(id, index[AVENUES_X[a] + ',' + STREETS_Z[s + 1]]);
      if (a + 1 < AVENUES_X.length) link(id, index[AVENUES_X[a + 1] + ',' + STREETS_Z[s]]);
    }
  }
}

var LANDMARKS = [
  { place: 'garage',   cx: -104, cz: 47,  w: 17, h: 6.5, d: 11, color: 0xb0562f, sign: 'TALLER SOLANO', signBg: '#20262b', signFg: '#ffb347' },
  { place: 'hospital', cx: 44,   cz: -73, w: 19, h: 13,  d: 12, color: 0xe8ecec, sign: 'HOSPITAL BRISA', signBg: '#eef4f4', signFg: '#c22e2e' },
  { place: 'station',  cx: -56,  cz: -67, w: 17, h: 9,   d: 11, color: 0x39506b, sign: 'PORT SOLANO PD', signBg: '#16222e', signFg: '#9fc6ee' },
  { place: 'hotel',    cx: 96,   cz: 53,  w: 17, h: 17,  d: 11, color: 0xe6cf9e, sign: 'HOTEL BRISA', signBg: '#3a2c14', signFg: '#ffd98a' },
  { place: 'chopshop', cx: 116,  cz: -38, w: 15, h: 6,   d: 12, color: 0x5c6650, sign: 'DESGUACE LUNA', signBg: '#1e241a', signFg: '#b7d977' },
  { place: 'casaAzul', cx: -36,  cz: 13,  w: 14, h: 10,  d: 12, color: 0x2e6fc2, sign: 'CASA AZUL', signBg: '#12283f', signFg: '#a8d4ff' },
];

function makeLandmark(def) {
  var group = new THREE.Group();
  var mat = new THREE.MeshLambertMaterial({ color: def.color, map: buildingTexture() });
  var box = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), mat);
  box.position.y = def.h / 2; box.castShadow = true; box.receiveShadow = true;
  group.add(box);
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(def.w - 2, 13), 2.6),
    new THREE.MeshBasicMaterial({ map: signTexture(def.sign, def.signBg, def.signFg) })
  );
  // Face the sign toward the nearest road: landmarks sit beside a street,
  // so face south or north by which side of the street the place is on.
  var faceSouth = def.place === 'garage' || def.place === 'station' || def.place === 'hotel';
  sign.position.set(0, def.h - 2.2, faceSouth ? -def.d / 2 - 0.06 : def.d / 2 + 0.06);
  if (faceSouth) sign.rotation.y = Math.PI;
  group.add(sign);
  group.position.set(def.cx, 0, def.cz);
  scene.add(group);
  addCollider(def.cx, def.cz, def.w + 0.4, def.d + 0.4);
}

function nearLandmark(x, z) {
  for (var i = 0; i < LANDMARKS.length; i++) {
    if (dist2d(x, z, LANDMARKS[i].cx, LANDMARKS[i].cz) < 15) return true;
  }
  return false;
}

function buildBuildings() {
  var placements = [];
  var tints = [0xf2e3c2, 0xe8b48f, 0xd97f5e, 0xb8ccd4, 0xf0efe8, 0xc9d6b0, 0xe3a7b0, 0x9fb6c9, 0xf5d76e, 0xd8d3c8];
  for (var a = 0; a < AVENUES_X.length - 1; a++) {
    for (var s = 0; s < STREETS_Z.length - 1; s++) {
      var x0 = AVENUES_X[a] + ROAD_HALF + SIDEWALK, x1 = AVENUES_X[a + 1] - ROAD_HALF - SIDEWALK;
      var z0 = STREETS_Z[s] + ROAD_HALF + SIDEWALK, z1 = STREETS_Z[s + 1] - ROAD_HALF - SIDEWALK;
      // sidewalk slab for the block
      var slab = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0 + 2, 0.18, z1 - z0 + 2),
        new THREE.MeshLambertMaterial({ color: 0x9aa0a2 })
      );
      slab.position.set((x0 + x1) / 2, 0.09, (z0 + z1) / 2);
      slab.receiveShadow = true;
      scene.add(slab);
      var downtown = 1 - clamp(dist2d((x0 + x1) / 2, (z0 + z1) / 2, -20, -10) / 190, 0, 1);
      for (var px = 0; px < 2; px++) {
        for (var pz = 0; pz < 2; pz++) {
          var cx = lerp(x0 + (x1 - x0) * 0.27, x0 + (x1 - x0) * 0.73, px);
          var cz = lerp(z0 + (z1 - z0) * 0.27, z0 + (z1 - z0) * 0.73, pz);
          if (nearLandmark(cx, cz) || randChance(0.18)) continue;
          var w = randRange(9, 13.5), d = randRange(8, 11.5);
          var h = randRange(8, 17) + downtown * randRange(6, 30);
          placements.push({ x: cx, z: cz, w: w, d: d, h: h, tint: randPick(tints) });
          addCollider(cx, cz, w + 0.3, d + 0.3);
        }
      }
    }
  }
  var geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  var mat = new THREE.MeshLambertMaterial({ map: buildingTexture() });
  var mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  var col = new THREE.Color();
  for (var i = 0; i < placements.length; i++) {
    var p = placements[i];
    pv.set(p.x, 0.18, p.z); sc.set(p.w, p.h, p.d);
    m4.compose(pv, q, sc);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(p.tint));
  }
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildPalmsAndLamps() {
  var spots = [];
  for (var x = -146; x <= 146; x += 15) { spots.push({ x: x + randRange(-2, 2), z: 79.6, s: randRange(0.9, 1.25) }); }
  for (var x2 = -140; x2 <= 140; x2 += 23) { spots.push({ x: x2, z: 59.8, s: randRange(0.85, 1.1) }); }
  for (var i = 0; i < 26; i++) spots.push({ x: randRange(-148, 148), z: randRange(88, 101), s: randRange(0.8, 1.3) });
  var trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 5.4, 5);
  trunkGeo.translate(0, 2.7, 0);
  var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  var frondGeo = new THREE.BoxGeometry(0.15, 0.05, 2.3);
  frondGeo.translate(0, 0, 1.05);
  var frondMat = new THREE.MeshLambertMaterial({ color: 0x3d8b37 });
  var fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length * 6);
  var m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  var fi = 0;
  for (var k = 0; k < spots.length; k++) {
    var p = spots[k], lean = randRange(-0.09, 0.09), topX = p.x + lean * 10, topZ = p.z;
    e.set(0, 0, lean); q.setFromEuler(e); v.set(p.x, 0, p.z); sc.set(p.s, p.s, p.s);
    m4.compose(v, q, sc); trunks.setMatrixAt(k, m4);
    for (var f = 0; f < 6; f++) {
      e.set(0.88, (f / 6) * Math.PI * 2 + randRange(-0.2, 0.2), 0);
      q.setFromEuler(e);
      v.set(topX, 5.3 * p.s, topZ);
      m4.compose(v, q, sc); fronds.setMatrixAt(fi++, m4);
    }
    if (p.z < BEACH_Z) addCollider(p.x, p.z, 0.5, 0.5);
  }
  trunks.castShadow = true;
  scene.add(trunks); scene.add(fronds);

  var lampSpots = [];
  for (var a = 0; a < AVENUES_X.length; a++) for (var s2 = 0; s2 < STREETS_Z.length; s2++) {
    lampSpots.push({ x: AVENUES_X[a] + 8.6, z: STREETS_Z[s2] + 8.6 });
    lampSpots.push({ x: AVENUES_X[a] - 8.6, z: STREETS_Z[s2] - 8.6 });
  }
  var poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5); poleGeo.translate(0, 2.8, 0);
  var poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3c4147 }), lampSpots.length);
  var headGeo = new THREE.SphereGeometry(0.32, 6, 5); headGeo.translate(0, 5.7, 0);
  var heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), lampSpots.length);
  for (var l = 0; l < lampSpots.length; l++) {
    v.set(lampSpots[l].x, 0, lampSpots[l].z); q.identity(); sc.set(1, 1, 1);
    m4.compose(v, q, sc); poles.setMatrixAt(l, m4); heads.setMatrixAt(l, m4);
  }
  scene.add(poles); scene.add(heads);
}

function buildDockAndBeach() {
  var sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 30),
    new THREE.MeshLambertMaterial({ map: noiseTexture('#d9bd8a', '#b89a62') })
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(20, 0.03, 95);
  sand.receiveShadow = true;
  scene.add(sand);

  waterTex = canvasTexture(256, 256, function (g, w, h) {
    g.fillStyle = '#1668a0'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 130; i++) {
      g.strokeStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.13) + ')';
      g.lineWidth = 2;
      var y = Math.random() * h, x = Math.random() * w, len = 14 + Math.random() * 36;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
    }
  }, 30, 30);
  var waterMat = new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd4ee, shininess: 90, specular: 0x99ccee });
  var seaSouth = new THREE.Mesh(new THREE.PlaneGeometry(760, 220), waterMat);
  seaSouth.rotation.x = -Math.PI / 2; seaSouth.position.set(20, 0.02, 108 + 110);
  scene.add(seaSouth);
  var seaEast = new THREE.Mesh(new THREE.PlaneGeometry(220, 340), waterMat);
  seaEast.rotation.x = -Math.PI / 2; seaEast.position.set(198 + 110, 0.02, 40);
  scene.add(seaEast);

  // Dock deck, warehouse, containers, crates.
  var deck = new THREE.Mesh(
    new THREE.BoxGeometry(DOCK.maxX - DOCK.minX, 0.24, DOCK.deckZ1 - DOCK.deckZ0),
    new THREE.MeshLambertMaterial({ color: 0x6f7276 })
  );
  deck.position.set((DOCK.minX + DOCK.maxX) / 2, 0, (DOCK.deckZ0 + DOCK.deckZ1) / 2);
  deck.receiveShadow = true;
  scene.add(deck);
  var warehouse = new THREE.Mesh(
    new THREE.BoxGeometry(26, 10, 15),
    new THREE.MeshLambertMaterial({ color: 0x7a8894, map: buildingTexture() })
  );
  warehouse.position.set(174, 5.12, 51.5); warehouse.castShadow = true;
  scene.add(warehouse);
  addCollider(174, 51.5, 26.4, 15.4);
  var dockSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 3.4),
    new THREE.MeshBasicMaterial({ map: signTexture('MUELLE 9', '#20303c', '#ffd98a') })
  );
  dockSign.position.set(174, 8, 43.7); dockSign.rotation.y = Math.PI;
  scene.add(dockSign);

  var contGeo = new THREE.BoxGeometry(6.1, 2.6, 2.44);
  var contMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var contColors = [0xc23b2e, 0x2e6fc2, 0x3fae6a, 0xe08a1e, 0x707880];
  var contSpots = [];
  var ci;
  for (ci = 0; ci < 9; ci++) contSpots.push({ x: 162 + (ci % 3) * 8, z: 66 + Math.floor(ci / 3) * 6.4, ry: 0 });
  for (ci = 0; ci < 4; ci++) contSpots.push({ x: 188, z: 48 + ci * 4.4, ry: Math.PI / 2 });
  var conts = new THREE.InstancedMesh(contGeo, contMat, contSpots.length);
  var m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  var col = new THREE.Color();
  for (ci = 0; ci < contSpots.length; ci++) {
    e.set(0, contSpots[ci].ry, 0); q.setFromEuler(e);
    v.set(contSpots[ci].x, 1.42, contSpots[ci].z);
    m4.compose(v, q, sc); conts.setMatrixAt(ci, m4);
    conts.setColorAt(ci, col.setHex(contColors[ci % contColors.length]));
    addCollider(contSpots[ci].x, contSpots[ci].z, contSpots[ci].ry === 0 ? 6.5 : 2.8, contSpots[ci].ry === 0 ? 2.8 : 6.5);
  }
  conts.castShadow = true;
  scene.add(conts);

  var pier = new THREE.Mesh(
    new THREE.BoxGeometry(DOCK.pierEndX - 188, 0.5, DOCK.pierZ1 - DOCK.pierZ0),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
  );
  pier.position.set((188 + DOCK.pierEndX) / 2, 0.17, (DOCK.pierZ0 + DOCK.pierZ1) / 2);
  pier.receiveShadow = true;
  scene.add(pier);
  for (var px = 192; px <= 206; px += 7) {
    var pile = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x5e4c33 }));
    pile.position.set(px, -0.8, DOCK.pierZ0 + 1);
    scene.add(pile);
  }
}

function buildRoads() {
  var texV = asphaltTexture(); texV.repeat.set(1, 18);
  var texH = asphaltTexture(); texH.repeat.set(24, 1);
  var matV = new THREE.MeshLambertMaterial({ map: texV });
  var matH = new THREE.MeshLambertMaterial({ map: texH });
  var i, mesh;
  for (i = 0; i < AVENUES_X.length; i++) {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 208), matV);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(AVENUES_X[i], 0.01, -19);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (i = 0; i < STREETS_Z.length; i++) {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(306, ROAD_HALF * 2), matH);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.012, STREETS_Z[i]);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // intersections: plain asphalt squares so dashes do not cross
  var plain = new THREE.MeshLambertMaterial({ color: 0x33373c });
  for (var a = 0; a < AVENUES_X.length; a++) {
    for (var s = 0; s < STREETS_Z.length; s++) {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2), plain);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(AVENUES_X[a], 0.02, STREETS_Z[s]);
      scene.add(mesh);
    }
  }
}

function buildObjectiveMarker() {
  var geo = new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true);
  var mat = new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
  markerPillar = new THREE.Mesh(geo, mat);
  markerPillar.position.y = 13;
  markerPillar.visible = false;
  scene.add(markerPillar);
  var ringGeo = new THREE.RingGeometry(1.9, 2.5, 24);
  var ringMat = new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  markerRing = new THREE.Mesh(ringGeo, ringMat);
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.visible = false;
  scene.add(markerRing);
}

function setObjectiveMarker(x, z, on) {
  markerPillar.visible = on; markerRing.visible = on;
  if (on) {
    var y = groundYAt(x, z);
    markerPillar.position.set(x, y + 13, z);
    markerRing.position.set(x, y + 0.25, z);
  }
}

function initWorld(canvas) {
  seedRandom(20261122);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe6cf9e, 150, 520);

  var skyGeo = new THREE.SphereGeometry(640, 16, 10);
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a80b8) }, horizon: { value: new THREE.Color(0xf6d49a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.7)), 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
  camera.position.set(-112, 4, 58);

  var hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a7a55, 0.98);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xffe0ae, 1.85);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -85; sunLight.shadow.camera.right = 85;
  sunLight.shadow.camera.top = 85; sunLight.shadow.camera.bottom = -85;
  sunLight.shadow.camera.far = 320;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight); scene.add(sunLight.target);

  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ map: noiseTexture('#77755f', '#5d5c48') })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(30, -0.06, 30);
  ground.receiveShadow = true;
  scene.add(ground);

  buildRoadGraph();
  buildRoads();
  buildBuildings();
  for (var i = 0; i < LANDMARKS.length; i++) makeLandmark(LANDMARKS[i]);
  buildPalmsAndLamps();
  buildDockAndBeach();
  buildObjectiveMarker();

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function tickWorld(dt) {
  if (waterTex) waterTex.offset.y -= dt * 0.008;
  if (markerRing && markerRing.visible) {
    var s = 1 + Math.sin(S.time * 4) * 0.12;
    markerRing.scale.set(s, s, 1);
  }
  // Keep the shadow frustum centred on the player.
  var p = playerPos();
  sunLight.position.set(p.x - 70, 95, p.z - 35);
  sunLight.target.position.set(p.x, 0, p.z);
}
