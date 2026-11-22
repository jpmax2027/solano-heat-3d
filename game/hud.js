// SOLANO HEAT 3D — hud.js
// Everything drawn over the 3D view: cash, wanted stars, health and
// bust bars, the objective line, context prompts, centre messages, the
// dialogue box, and the canvas minimap with roads, traffic, police and
// the objective marker.

var EL = {};
var dialogueOpen = false;
var dlgLines = [], dlgIndex = 0, dlgTimer = 0, dlgDone = null;

function hudInit() {
  ['hud', 'cash', 'stars', 'healthFill', 'armorFill', 'bustWrap', 'bustFill', 'objective',
   'prompt', 'message', 'dialogue', 'dlgWho', 'dlgText', 'minimap', 'speedo',
   'titleScreen', 'pauseScreen', 'endScreen', 'endTitle', 'endText', 'continueBtn',
   'newGameBtn', 'continueGameBtn', 'resumeBtn', 'muteBtn'].forEach(function (id) {
    EL[id] = document.getElementById(id);
  });
}

function showMessage(text, seconds) {
  S.message = text;
  S.messageUntil = S.time + (seconds || 2.5);
  if (EL.message) { EL.message.textContent = text; EL.message.style.opacity = '1'; }
}

function showDialogue(lines, onDone) {
  if (!lines || lines.length === 0) { if (onDone) onDone(); return; }
  dlgLines = lines; dlgIndex = 0; dlgTimer = 0; dlgDone = onDone || null;
  dialogueOpen = true;
  EL.dialogue.style.display = 'block';
  renderDialogueLine();
}

function renderDialogueLine() {
  var line = dlgLines[dlgIndex];
  EL.dlgWho.textContent = line.who;
  EL.dlgText.textContent = line.text;
}

function advanceDialogue() {
  if (!dialogueOpen) return;
  dlgIndex++;
  dlgTimer = 0;
  if (dlgIndex >= dlgLines.length) {
    dialogueOpen = false;
    EL.dialogue.style.display = 'none';
    var done = dlgDone; dlgDone = null;
    if (done) done();
  } else {
    renderDialogueLine();
  }
}

function updateDialogue(dt) {
  if (!dialogueOpen) return;
  dlgTimer += dt;
  if (dlgTimer > 4.2) advanceDialogue();
}

function updateHUD() {
  EL.cash.textContent = '$' + Math.floor(S.cash).toLocaleString('en-US');
  var stars = '';
  for (var i = 0; i < 5; i++) stars += i < S.stars ? '★' : '☆';
  EL.stars.textContent = stars;
  EL.stars.style.opacity = S.stars > 0 ? '1' : '0.25';
  EL.healthFill.style.width = clamp(S.health, 0, 100) + '%';
  EL.healthFill.style.background = S.health > 30 ? '#53c24a' : '#d43a2a';
  EL.armorFill.style.width = clamp(S.armor, 0, 100) + '%';
  EL.objective.textContent = S.objective || '';
  EL.prompt.textContent = S.prompt || '';
  EL.speedo.textContent = S.driving ? Math.round(Math.abs(S.driving.speed) * 3.6) + ' km/h' : '';
  if (S.bustMeter > 0.02 && S.mode === 'play') {
    EL.bustWrap.style.display = 'block';
    EL.bustFill.style.width = (S.bustMeter * 100) + '%';
  } else {
    EL.bustWrap.style.display = 'none';
  }
  if (S.message && S.time > S.messageUntil) {
    S.message = '';
    EL.message.style.opacity = '0';
  }
  drawMinimap();
}

var MAP_SCALE = 0.55, MAP_OX = 8, MAP_OZ = 46;
function mapX(x) { return (x + 160) * MAP_SCALE + MAP_OX; }
function mapY(z) { return (z + 125) * MAP_SCALE + MAP_OZ; }

function drawMinimap() {
  var ctx = EL.minimap.getContext('2d');
  var W = EL.minimap.width, H = EL.minimap.height;
  ctx.fillStyle = '#14507e';
  ctx.fillRect(0, 0, W, H);
  // land
  ctx.fillStyle = '#5f6b52';
  ctx.fillRect(mapX(-160), mapY(-125), 360 * MAP_SCALE, 235 * MAP_SCALE);
  // sand + dock
  ctx.fillStyle = '#c9ab72';
  ctx.fillRect(mapX(-160), mapY(BEACH_Z), 360 * MAP_SCALE, (108 - BEACH_Z) * MAP_SCALE);
  ctx.fillStyle = '#6f7276';
  ctx.fillRect(mapX(DOCK.minX), mapY(DOCK.deckZ0), (DOCK.maxX - DOCK.minX) * MAP_SCALE, (DOCK.deckZ1 - DOCK.deckZ0) * MAP_SCALE);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(mapX(188), mapY(DOCK.pierZ0), (DOCK.pierEndX - 188) * MAP_SCALE, (DOCK.pierZ1 - DOCK.pierZ0) * MAP_SCALE);
  // roads
  ctx.strokeStyle = '#2f3338';
  ctx.lineWidth = 7;
  var i;
  for (i = 0; i < AVENUES_X.length; i++) {
    ctx.beginPath(); ctx.moveTo(mapX(AVENUES_X[i]), mapY(-112)); ctx.lineTo(mapX(AVENUES_X[i]), mapY(78)); ctx.stroke();
  }
  ctx.lineWidth = 7;
  for (i = 0; i < STREETS_Z.length; i++) {
    ctx.beginPath(); ctx.moveTo(mapX(-148), mapY(STREETS_Z[i])); ctx.lineTo(mapX(148), mapY(STREETS_Z[i])); ctx.stroke();
  }
  // traffic
  ctx.fillStyle = '#cfd4d8';
  for (i = 0; i < vehicles.length; i++) {
    if (vehicles[i].kind !== 'traffic') continue;
    ctx.fillRect(mapX(vehicles[i].mesh.position.x) - 1.5, mapY(vehicles[i].mesh.position.z) - 1.5, 3, 3);
  }
  if (specialCar && currentMission() && S.missionIndex === 2 && S.stepIndex >= 1) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(mapX(specialCar.mesh.position.x), mapY(specialCar.mesh.position.z), 3.4, 0, 7); ctx.fill();
  }
  // police
  var flash = Math.sin(S.time * 9) > 0;
  for (i = 0; i < policeCars.length; i++) {
    ctx.fillStyle = flash ? '#ff3b30' : '#2a6fff';
    ctx.beginPath(); ctx.arc(mapX(policeCars[i].mesh.position.x), mapY(policeCars[i].mesh.position.z), 3, 0, 7); ctx.fill();
  }
  // objective
  var t = missionTarget();
  if (t && S.mode === 'play') {
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = 2;
    var pulse = 5 + Math.sin(S.time * 5) * 1.6;
    ctx.beginPath(); ctx.arc(mapX(t.x), mapY(t.z), pulse, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath(); ctx.arc(mapX(t.x), mapY(t.z), 2.4, 0, 7); ctx.fill();
  }
  // player arrow
  var p = playerPos();
  var heading = S.driving ? S.driving.heading : player.mesh.rotation.y;
  ctx.save();
  ctx.translate(mapX(p.x), mapY(p.z));
  ctx.rotate(Math.PI - heading); // arrow shape points up; map north is up
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.4, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // frame + north
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('N', W - 16, 16);
}
