// SOLANO HEAT 3D — shots.js
// Screenshot staging, in the spirit of the kit starter's shots: open
// game/index.html?shot=<name> and the named scene is set up from real
// gameplay state — a driven car, an open dialogue, a live police chase,
// the dock escape — then window.__SHOT_READY is set so the capture tool
// knows the frame is honest. Nothing here runs without ?shot=.

(function () {
  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  if (!shot) return;

  function waitFor(fn, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        if (fn()) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(poll, 120);
      })();
    });
  }

  function frames(n) {
    return new Promise(function (resolve) {
      (function step(left) {
        if (left <= 0) return resolve();
        requestAnimationFrame(function () { step(left - 1); });
      })(n);
    });
  }

  function freshGame() {
    startGame(false);
    while (dialogueOpen) advanceDialogue();
  }

  function putPlayerInCar(typeId, color, x, z, heading, speed) {
    var v = makeVehicle(typeId, color, x, z, heading, 'parked');
    vehicles.push(v);
    player.mesh.position.set(x - 2, 0, z);
    enterVehicle(v);
    v.speed = speed;
    return v;
  }

  function placeCop(cop, x, z, heading, speed) {
    if (!cop) return;
    cop.mesh.position.set(x, groundYAt(x, z), z);
    cop.heading = heading;
    cop.mesh.rotation.y = heading;
    cop.speed = speed;
  }

  var scenes = {
    // The cover: flat out along the boulevard in a red sedan, the whole
    // city behind, mission one on the HUD, minimap live.
    cover: function () {
      freshGame();
      putPlayerInCar('sedan', 0xc23b2e, -64, 70, Math.PI / 2, 21);
      return frames(26);
    },
    // On foot at the Taller Solano, mid-conversation with Rico.
    talk: function () {
      freshGame();
      S.stepIndex = 0;
      player.mesh.position.set(PLACES.garage.x + 1.5, 0, PLACES.garage.z - 1);
      player.mesh.rotation.y = 0;
      S.camYaw = 0.12; // look south, at the Taller Solano sign
      return waitFor(function () { return dialogueOpen; }, 9000).then(function () { return frames(14); });
    },
    // Four stars downtown: Interceptors in the frame, helicopter overhead.
    chase: function () {
      freshGame();
      var car = putPlayerInCar('hatch', 0x2e6fc2, 30, -20, 0, 15);
      addHeat(4.0);
      return waitFor(function () {
        return policeCars.length >= 2 && heli && heli.active;
      }, 14000).then(function () {
        // Units spawn far off; pull two of them into the shot — one
        // ahead in the lane, one closing on the right flank. Their AI
        // keeps hunting from there, so the frame is live pursuit.
        var p = car.mesh.position;
        placeCop(policeCars[0], p.x - 3.4, p.z + 18, 0, 15);
        if (policeCars[1]) placeCop(policeCars[1], p.x + 4.6, p.z - 7, 0.15, 16);
        car.speed = 15;
        return frames(10);
      });
    },
    // The finale: Muelle 9 at three stars, the pier and the boat beyond.
    escape: function () {
      freshGame();
      startMission(3, false);
      S.stepIndex = 1;
      beginStep();
      var van = putPlayerInCar('van', 0xe8e4da, 156, 72, Math.PI / 2, 11);
      return waitFor(function () { return policeCars.length >= 2; }, 14000).then(function () {
        // One unit comes down the deck head-on, still metres away when
        // the shutter falls: close enough to read, too far to ram.
        placeCop(policeCars[0], 177, 67, -Math.PI / 2, 7);
        S.heat = 3; S.stars = 3;
        van.speed = 11; // still rolling when the shutter falls
        return frames(10);
      });
    },
  };

  window.addEventListener('load', function () {
    waitFor(function () { return window.__SH3 && window.__SH3.booted; }, 8000).then(function () {
      var run = scenes[shot] || scenes.cover;
      return run();
    }).then(function () {
      return frames(3);
    }).then(function () {
      window.__SHOT_READY = shot;
    });
  });
})();
