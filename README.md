# solano-heat-3d

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jpmax2027/solano-heat-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jpmax2027/solano-heat-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLANO HEAT 3D** is a complete open-world crime game in real 3D that
runs in the browser from static files — no build step, no network, just
`game/index.html` and the vendored three.js build beside it. Welcome back
to **Port Solano**, a sun-soaked coastal city at golden hour: six avenues,
five streets, a palm-lined boulevard, a beach, the sea, and the Muelle 9
dock quarter.

You are **Rio Vargas**, a getaway driver fresh in town with $120 and a
phone number. A four-job story chain carries the game: run Rico's package
from the dock to the Hotel Brisa, beat Lucia's Beach Run checkpoints,
steal the gold **Sultan RS** for Luna's chop shop, and finish with a
three-star escape to the boat at the end of the pier.

What is in the city:

- A real 3D world (three.js, vendored under `game/vendor/`): instanced
  buildings with lit windows, signed landmarks (Taller Solano, Hospital
  Brisa, Port Solano PD, Hotel Brisa, Desguace Luna, Casa Azul), palms,
  lamps, containers, a wooden pier over the bay, animated water and a
  gradient sky with warm fog and soft shadows.
- Third-person on foot with a mouse-look camera, sprint, and collision —
  or behind the wheel of anything parked or moving. Traffic drivers bail
  out and run when you take their car.
- Traffic AI that drives the road graph, changes lanes at intersections,
  brakes for obstacles and honks at jaywalkers; pedestrians who stroll
  the sidewalks, flee reckless driving, and go down when a car finds them.
- A 1–5 star wanted system: theft, hits and mission heat raise it, staying
  unseen cools it. Interceptors spawn off-screen, hunt, ram and box you
  in; at four stars a police helicopter joins with a working searchlight.
  Get pinned and you are **BUSTED**; hit zero health and you are
  **WASTED** — both cost cash and drop you at the station or the hospital,
  and the job on the table is off.
- Car damage with wrecks and smoke, arcade driving with body roll, a
  working 2D minimap (roads, traffic, police, the objective, the gold
  Sultan), HUD with cash, stars, health, armor, speed and the objective
  line, phone dialogue, and a pause menu.
- A four-mission story with dialogue, timers, a checkpoint race, cash
  rewards and a free-roam ending; progress (cash, missions, position)
  saves to localStorage.
- Procedural WebAudio sound only — engine hum that follows your speed,
  two-tone sirens that fade with distance, crashes, pickups, cash
  registers and a quiet bassline on the road. No audio files.

Controls (also on the title screen): WASD or arrows to walk and drive,
**E** or **F** to enter/exit a car and advance dialogue, **Shift** to
sprint, mouse to look (click the game for pointer lock), **Space** for
the handbrake, **P** or **Esc** to pause, **M** to mute.

To play, serve the repo root (`node serve.ts`) and open `/game/` — or
host `game/` on any static server. The four files in `screenshots/` are
real renders of this build, staged through the game's own `?shot=`
scenes (see `game/shots.js` and `game/shots.json`).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=zbqpv30a&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
