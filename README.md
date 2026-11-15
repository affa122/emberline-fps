# emberline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/affa122/emberline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/affa122/emberline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Emberline is a round-based tactical FPS in a decommissioned emberworks: 5v5, plant-or-defuse on two sites, a buy menu between rounds, and bots that hold lanes, rotate to a planted charge, and react to what they see and hear.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## The game

Foundry-9, a decommissioned ember-processing plant at dusk. Ember attacks, Slate defends. Win a round by eliminating the other team, by detonating the charge at Furnace (A) or Silo (B), or — as Slate — by running the clock out or defusing. First to 5 rounds takes the match.

- Four weapons (P9 Sidearm, VK-9 Ripper SMG, AR-77 Longshot rifle, DMR-50 marksman), Kevlar, and frag / smoke / flash grenades, all bought with money earned per round and per kill.
- Gunplay where stopping to aim pays: headshots, recoil and bloom, spread that punishes firing on the move, crouching and slow-walking.
- Bots with a waypoint graph, line-of-sight and hearing: they push lanes, hold sites, strafe in fights, fall back when hurt, plant the charge, and rotate to defuse.
- Everything is synthesized or drawn in code: WebAudio gunshots and stingers, a dusk-lit map with a chosen amber-and-slate palette, a minimap, kill feed, and a roster.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1a912rpf&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
