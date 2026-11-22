// SOLANO HEAT 3D — audio.js
// Every sound is synthesised with WebAudio: no audio files, nothing to
// load. A lazy AudioContext starts on the first user gesture (the title
// screen button), and one master gain honours the mute toggle.

var AU = { ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null, musicTimer: 0, musicStep: 0 };

function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
    AU.master = AU.ctx.createGain();
    AU.master.gain.value = S.muted ? 0 : 0.5;
    AU.master.connect(AU.ctx.destination);
  } catch (e) { AU.ctx = null; }
}

function audioSetMuted(muted) {
  if (AU.master && AU.ctx) AU.master.gain.linearRampToValueAtTime(muted ? 0 : 0.5, AU.ctx.currentTime + 0.1);
}

function tone(freq, dur, type, vol, slideTo, delay) {
  if (!AU.ctx || S.muted) return;
  var t0 = AU.ctx.currentTime + (delay || 0);
  var osc = AU.ctx.createOscillator();
  var gain = AU.ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol || 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain); gain.connect(AU.master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur, vol, lowFreq) {
  if (!AU.ctx || S.muted) return;
  var len = Math.floor(AU.ctx.sampleRate * dur);
  var buffer = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = AU.ctx.createBufferSource(); src.buffer = buffer;
  var filter = AU.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowFreq || 800;
  var gain = AU.ctx.createGain(); gain.gain.value = vol || 0.3;
  src.connect(filter); filter.connect(gain); gain.connect(AU.master);
  src.start();
}

function sfxDoor() { tone(180, 0.08, 'square', 0.12); tone(120, 0.1, 'square', 0.1, 0, 0.07); }
function sfxCrash(hard) { noiseBurst(hard ? 0.35 : 0.18, hard ? 0.5 : 0.28, hard ? 500 : 900); tone(70, 0.25, 'sine', 0.3, 40); }
function sfxPickup() { tone(660, 0.09, 'sine', 0.18); tone(990, 0.14, 'sine', 0.18, 0, 0.08); }
function sfxCash() { tone(880, 0.07, 'triangle', 0.2); tone(1174, 0.07, 'triangle', 0.2, 0, 0.06); tone(1568, 0.16, 'triangle', 0.2, 0, 0.12); }
function sfxFail() { tone(220, 0.2, 'sawtooth', 0.14, 160); tone(160, 0.3, 'sawtooth', 0.14, 110, 0.16); }
function sfxBusted() { tone(392, 0.16, 'square', 0.14); tone(311, 0.16, 'square', 0.14, 0, 0.16); tone(233, 0.4, 'square', 0.16, 0, 0.32); }
function sfxStep() { noiseBurst(0.05, 0.05, 500); }
function sfxHorn() { tone(370, 0.22, 'square', 0.1); tone(466, 0.22, 'square', 0.08); }

// Continuous engine hum while driving; pitch follows speed.
function engineSound(speedRatio, running) {
  if (!AU.ctx) return;
  if (running && !AU.engineOsc) {
    AU.engineOsc = AU.ctx.createOscillator(); AU.engineOsc.type = 'sawtooth';
    var filter = AU.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
    AU.engineGain = AU.ctx.createGain(); AU.engineGain.gain.value = 0.0;
    AU.engineOsc.connect(filter); filter.connect(AU.engineGain); AU.engineGain.connect(AU.master);
    AU.engineOsc.start();
  }
  if (AU.engineOsc) {
    var target = running ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    AU.engineOsc.frequency.value = 55 + Math.abs(speedRatio) * 130;
    AU.engineGain.gain.linearRampToValueAtTime(S.muted ? 0 : target, AU.ctx.currentTime + 0.08);
  }
}

// Two-tone siren that fades with the nearest police distance.
function sirenSound(nearestCopDist) {
  if (!AU.ctx) return;
  var want = nearestCopDist < 60 ? clamp(0.05 * (1 - nearestCopDist / 60), 0, 0.05) : 0;
  if (want > 0 && !AU.sirenOsc) {
    AU.sirenOsc = AU.ctx.createOscillator(); AU.sirenOsc.type = 'triangle';
    AU.sirenGain = AU.ctx.createGain(); AU.sirenGain.gain.value = 0;
    AU.sirenOsc.connect(AU.sirenGain); AU.sirenGain.connect(AU.master);
    AU.sirenOsc.start();
  }
  if (AU.sirenOsc) {
    AU.sirenOsc.frequency.value = (Math.sin(S.time * 5.2) > 0) ? 720 : 540;
    AU.sirenGain.gain.linearRampToValueAtTime(S.muted ? 0 : want, AU.ctx.currentTime + 0.1);
  }
}

// A lazy bassline while driving: eight steps, minor key, very quiet.
var BASSLINE = [55, 0, 55, 65.4, 0, 55, 49, 58.3];
function musicUpdate(dt) {
  if (!AU.ctx || S.muted || !S.driving) return;
  AU.musicTimer -= dt;
  if (AU.musicTimer <= 0) {
    AU.musicTimer = 0.24;
    var f = BASSLINE[AU.musicStep % BASSLINE.length];
    AU.musicStep++;
    if (f) tone(f, 0.22, 'triangle', 0.10);
  }
}
