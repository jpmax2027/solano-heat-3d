// SOLANO HEAT 3D — missions.js
// Rio Vargas's story in four jobs for the people of Port Solano: meet
// Rico at the Taller, run his package to the Hotel Brisa, race Lucia's
// beach checkpoints, steal the gold Sultan RS for Luna's chop shop, and
// finish with a three-star run to the end of Muelle 9.

var MISSIONS = [
  {
    title: 'Welcome to Port Solano',
    contact: 'Rico',
    reward: 250,
    intro: [
      { who: 'Rico (phone)', text: 'Rio! You made it to Port Solano. Get over to my workshop, Taller Solano — I have work and the rent is not paying itself.' },
    ],
    steps: [
      { kind: 'goto', x: PLACES.garage.x, z: PLACES.garage.z, r: 6, label: 'Meet Rico at Taller Solano',
        talk: [
          { who: 'Rico', text: 'There he is. Listen — a package is waiting at the Muelle 9 dock gate. Customs looks the other way for me, not for strangers, so be quick.' },
          { who: 'Rico', text: 'Pick it up on foot, then take it to the Hotel Brisa. My cousin at the desk will know what to do. And Rio — any car on the street is yours if you are brave enough.' },
        ] },
      { kind: 'pickup', x: PLACES.dockGate.x, z: PLACES.dockGate.z, r: 2.6, label: 'Pick up the package at Muelle 9 (on foot)' },
      { kind: 'deliver', x: PLACES.hotel.x, z: PLACES.hotel.z, r: 7, label: 'Deliver the package to Hotel Brisa' },
    ],
    outro: [
      { who: 'Rico (phone)', text: 'Delivered and paid. You drive like you were born here, primo. Rest up — Lucia at the hotel has something faster in mind.' },
    ],
  },
  {
    title: 'Beach Run',
    contact: 'Lucia',
    reward: 400,
    intro: [
      { who: 'Lucia (phone)', text: 'So you are Rico\'s new driver. I run a little racing club on the boulevard. Come see me at the Hotel Brisa and prove the talk.' },
    ],
    steps: [
      { kind: 'goto', x: PLACES.hotel.x, z: PLACES.hotel.z, r: 6, label: 'Meet Lucia at Hotel Brisa',
        talk: [
          { who: 'Lucia', text: 'Rules are simple: six checkpoints, boulevard to the dock road, against my clock. Bring a car with some life in it — steal a good one if yours is slow.' },
          { who: 'Lucia', text: 'Beat the time and the club remembers your name. The markers will guide you. Go!' },
        ] },
      { kind: 'checkpoints', label: 'Hit every checkpoint before the clock runs out', timeLimit: 80,
        points: [
          { x: -100, z: 70 }, { x: -40, z: 70 }, { x: 20, z: 70 },
          { x: 80, z: 70 }, { x: 130, z: 40 }, { x: 130, z: -10 },
        ] },
    ],
    outro: [
      { who: 'Lucia (phone)', text: 'That time stands. The club is yours whenever you want a wheel, Rio. Careful though — Luna at Desguace Luna pays better and asks worse.' },
    ],
  },
  {
    title: 'The Collector',
    contact: 'Luna',
    reward: 750,
    intro: [
      { who: 'Luna (phone)', text: 'A little bird says you can drive. Desguace Luna, north side. I have a shopping list with one item on it, and it is gold.' },
    ],
    steps: [
      { kind: 'goto', x: PLACES.chopshop.x, z: PLACES.chopshop.z, r: 6, label: 'Meet Luna at Desguace Luna',
        talk: [
          { who: 'Luna', text: 'A collector at Casa Azul keeps a gold Sultan RS in his drive and never locks it. Rude, really. Bring it to me in one piece.' },
          { who: 'Luna', text: 'The moment you take it, half the city will call it in. Expect stars. Lose them or outrun them — I pay for the car, not the drama.' },
        ],
        onStart: function () { spawnSpecialCar(); } },
      { kind: 'steal', label: 'Steal the gold Sultan RS at Casa Azul' },
      { kind: 'deliverCar', x: PLACES.chopshop.x, z: PLACES.chopshop.z, r: 8, label: 'Bring the Sultan RS to Desguace Luna' },
    ],
    outro: [
      { who: 'Luna (phone)', text: 'Gold, intact, and the police still looking the wrong way. You are wasted on package work, Rio. Rico says it is time for the big one.' },
    ],
  },
  {
    title: 'Heat Wave',
    contact: 'Rico',
    reward: 1200,
    intro: [
      { who: 'Rico (phone)', text: 'Last job, and it is the big one. Meet me at the Muelle 9 gate tonight. No questions on the phone.' },
    ],
    steps: [
      { kind: 'goto', x: PLACES.dockGate.x, z: PLACES.dockGate.z, r: 6, label: 'Meet Rico at the Muelle 9 gate',
        talk: [
          { who: 'Rico', text: 'A boat waits at the end of the pier and a captain who owes me his life. The whole dock is wired into the police band tonight — the second you roll, it is three stars.' },
          { who: 'Rico', text: 'Get me to that boat, Rio. Whatever it takes. If you make it, Port Solano is yours.' },
        ] },
      { kind: 'escape', x: PLACES.pierEnd.x, z: PLACES.pierEnd.z, r: 6, label: 'Escape to the boat at the end of Muelle 9!',
        onStart: function () { S.heat = 3; S.stars = 3; showMessage('Three stars — GO!', 3); } },
    ],
    outro: [
      { who: 'Rico', text: 'We made it. Whatever they say about Rio Vargas after tonight... let them say it. Port Solano remembers its own.' },
    ],
  },
];

var stepRuntime = { cpIndex: 0, timeLeft: 0 };

function currentMission() {
  return S.missionDone ? null : MISSIONS[S.missionIndex];
}

function currentStep() {
  var m = currentMission();
  return m ? m.steps[S.stepIndex] : null;
}

function missionTarget() {
  var step = currentStep();
  if (!step) return null;
  if (step.kind === 'steal') {
    if (specialCar) return { x: specialCar.mesh.position.x, z: specialCar.mesh.position.z, label: step.label };
    return null;
  }
  if (step.kind === 'checkpoints') {
    var cp = step.points[stepRuntime.cpIndex];
    return cp ? { x: cp.x, z: cp.z, label: step.label } : null;
  }
  return { x: step.x, z: step.z, label: step.label };
}

function beginStep() {
  var step = currentStep();
  stepRuntime = { cpIndex: 0, timeLeft: step && step.timeLimit ? step.timeLimit : 0 };
  if (step && step.onStart) step.onStart();
  refreshObjective();
}

function refreshObjective() {
  var step = currentStep();
  var m = currentMission();
  if (!m || !step) {
    S.objective = S.missionDone ? 'Free roam — Port Solano is yours. Steal something nice.' : '';
    setObjectiveMarker(0, 0, false);
    return;
  }
  S.objective = m.title + ': ' + step.label;
  var t = missionTarget();
  if (t) setObjectiveMarker(t.x, t.z, true);
}

function startMission(index, withIntro) {
  S.missionIndex = index;
  S.stepIndex = 0;
  var m = currentMission();
  if (!m) { S.missionDone = true; refreshObjective(); return; }
  if (withIntro && m.intro) showDialogue(m.intro, function () { beginStep(); });
  else beginStep();
  refreshObjective();
}

function completeStep() {
  var step = currentStep();
  var m = currentMission();
  sfxPickup();
  S.stepIndex++;
  if (S.stepIndex >= m.steps.length) { completeMission(); return; }
  var next = currentStep();
  if (next.talk) showDialogue(next.talk, function () { beginStep(); });
  else beginStep();
  refreshObjective();
}

function completeMission() {
  var m = currentMission();
  S.cash += m.reward;
  S.stats.missions++;
  sfxCash();
  showMessage(m.title + ' complete — $' + m.reward, 4);
  var nextIndex = S.missionIndex + 1;
  var finish = function () {
    if (nextIndex >= MISSIONS.length) {
      S.missionDone = true;
      S.objective = 'Free roam — Port Solano is yours. Steal something nice.';
      setObjectiveMarker(0, 0, false);
      showMessage('Story complete! Free roam unlocked.', 5);
    } else {
      startMission(nextIndex, true);
    }
    saveGame();
  };
  if (m.outro) showDialogue(m.outro, finish);
  else finish();
}

// Busted or wasted mid-job: the job restarts from its first step.
function failCurrentMission() {
  if (S.missionDone) return;
  var m = currentMission();
  if (!m) return;
  S.stepIndex = 0;
  if (S.missionIndex === 2 && !specialCar) spawnSpecialCar();
  if (specialCar && S.missionIndex === 2) {
    // Put the Sultan back at Casa Azul for another try.
    specialCar.mesh.position.set(PLACES.casaAzul.x + 3.5, 0, PLACES.casaAzul.z - 2);
    specialCar.kind = 'parked'; specialCar.speed = 0; specialCar.health = 100; specialCar.wrecked = false;
  }
  showMessage('The job fell apart — start "' + m.title + '" again.', 3.6);
  beginStep();
}

function updateMissions(dt) {
  if (S.mode !== 'play' || dialogueOpen || S.missionDone) return;
  var step = currentStep();
  if (!step) return;
  var p = playerPos();
  var t = missionTarget();
  if (step.kind === 'steal' && t) setObjectiveMarker(t.x, t.z, true); // the marker follows the car

  if (step.kind === 'goto' || step.kind === 'deliver' || step.kind === 'escape') {
    if (dist2d(p.x, p.z, step.x, step.z) < step.r) {
      if (step.kind === 'escape') S.heat = 0; // the boat outruns the law
      if (step.talk && !step._talked) {
        step._talked = true;
        showDialogue(step.talk, function () { completeStep(); });
        return;
      }
      completeStep();
    }
  } else if (step.kind === 'pickup') {
    if (!S.driving && dist2d(p.x, p.z, step.x, step.z) < step.r) {
      showMessage('Package collected.', 2.4);
      completeStep();
    }
  } else if (step.kind === 'steal') {
    if (S.driving && S.driving === specialCar) {
      addHeat(2);
      showMessage('That is the Sultan! Now get it to Luna.', 3);
      completeStep();
    }
  } else if (step.kind === 'deliverCar') {
    if (S.driving && S.driving === specialCar && dist2d(p.x, p.z, step.x, step.z) < step.r) {
      var car = specialCar;
      exitVehicle(true);
      car.kind = 'parked';
      completeStep();
    }
  } else if (step.kind === 'checkpoints') {
    if (!S.driving) { S.objective = currentMission().title + ': You need a car for the Beach Run!'; return; }
    stepRuntime.timeLeft -= dt;
    var cp = step.points[stepRuntime.cpIndex];
    S.objective = currentMission().title + ': Checkpoint ' + (stepRuntime.cpIndex + 1) + '/' + step.points.length +
      ' — ' + Math.max(0, Math.ceil(stepRuntime.timeLeft)) + 's';
    if (cp) setObjectiveMarker(cp.x, cp.z, true);
    if (stepRuntime.timeLeft <= 0) {
      sfxFail();
      showMessage('Out of time — the run restarts.', 3);
      stepRuntime.cpIndex = 0;
      stepRuntime.timeLeft = step.timeLimit;
      refreshObjective();
      return;
    }
    if (cp && dist2d(p.x, p.z, cp.x, cp.z) < 10) {
      stepRuntime.cpIndex++;
      sfxPickup();
      if (stepRuntime.cpIndex >= step.points.length) completeStep();
      else showMessage('Checkpoint! ' + stepRuntime.cpIndex + '/' + step.points.length, 1.6);
    }
  }
}
