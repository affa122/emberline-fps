// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=cover|site|buy|action with &seed=N stages a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createGame, actorState, PHASE } from './state.js';
import { createWorld, SPAWNS, SITES } from './map.js';
import { createMover, createPlayer } from './player.js';
import { createViewModel, createWeaponState, weaponStep, weaponReady, weaponTakeRound, weaponPullTrigger, weaponReload, weaponSpread, WEAPONS } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const game = createGame(seed);
const random = game.random;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
game.minimapWalls = world.minimapWalls;
const mover = createMover(world.colliders);
const effects = createEffects(scene);
const audio = createAudio();
const combat = createCombat(game, world, effects, audio);

// the player is actors[0]
const playerActor = actorState('ember', 'You', true);
playerActor.position.set(SPAWNS.ember[0][0], 0, SPAWNS.ember[0][1]);
playerActor.yaw = Math.PI;
game.actors.push(playerActor);

const bots = createBots(scene, game, world, mover, combat, effects, audio);
bots.spawnAll();

const player = createPlayer(mover);
player.state.position.copy(playerActor.position);
player.state.yaw = Math.PI;
const viewModel = createViewModel(camera);
const weaponState = createWeaponState('sidearm');
viewModel.setWeapon('sidearm');

const hud = createHud(game, {
  onBuy(item) {
    if (rounds.buy(playerActor, item)) {
      audio.buy();
      syncWeapon();
      hud.setMoney(playerActor.money);
    } else {
      audio.denied();
    }
  },
  onDeploy() {
    hud.showBuy(false, 0);
    input.requestLock();
  },
});

const rounds = createRounds(game, audio, (type, data) => {
  if (type === 'round-freeze') {
    hud.banner(`ROUND ${data.round}`, 'Buy phase — press B for the shop', 2400);
    hud.showBuy(true, playerActor.money);
    hud.setScore(game.score.ember, game.score.slate, game.round);
  } else if (type === 'round-live') {
    hud.banner('FIGHT', 'First to 5 rounds takes the match', 1400);
    hud.showBuy(false, 0);
  } else if (type === 'round-end') {
    const won = data.winner === 'ember';
    hud.banner(won ? 'EMBER WINS THE ROUND' : 'SLATE WINS THE ROUND', data.reason, 3000);
    hud.setScore(game.score.ember, game.score.slate, game.round);
    input.releaseLock();
  } else if (type === 'bomb-planted') {
    hud.banner('CHARGE PLANTED', `Site ${data.site} — ${35}s to detonation`, 2600);
    audio.beep(true);
  } else if (type === 'bomb-exploded') {
    audio.explosion();
    shake = 1.2;
  } else if (type === 'match-end') {
    hud.showOverlay('end', { winner: data.winner });
    input.releaseLock();
  } else if (type === 'next-round') {
    respawnPlayer();
    bots.respawnAll(SPAWNS);
    bots.resetRound();
  }
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    audio.unlock();
  } else if (game.phase === PHASE.LIVE && playerActor.alive && game.phase !== PHASE.MATCH_END) {
    hud.showOverlay('paused');
  }
});

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (game.phase === PHASE.MENU || game.phase === PHASE.MATCH_END) {
    startMatch();
    return;
  }
  input.requestLock();
});

document.getElementById('deploy').addEventListener('click', () => {
  hud.showBuy(false, 0);
  input.requestLock();
});

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const eyePos = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
let shake = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let lastHealth = 100;
let stepTimer = 0;
let minimapTimer = 0;
let wasFiring = false;
let bombMesh = null;

function syncWeapon() {
  const ws = weaponState;
  const def = WEAPONS[playerActor.weapon];
  ws.kind = playerActor.weapon;
  ws.mag = def.mag;
  ws.reserve = def.reserve;
  ws.cooldown = 0;
  ws.reloadLeft = 0;
  ws.bloom = 0;
  viewModel.setWeapon(playerActor.weapon);
  hud.setAmmo(ws.mag, ws.reserve, def.name);
}

function respawnPlayer() {
  const spawn = SPAWNS.ember[0];
  playerActor.alive = true;
  playerActor.health = 100;
  playerActor.armor = 0;
  playerActor.grenades = { he: 0, smoke: 0, flash: 0 };
  playerActor.position.set(spawn[0], 0, spawn[1]);
  playerActor.velocity.set(0, 0, 0);
  playerActor.yaw = Math.PI;
  playerActor.pitch = 0;
  playerActor.action = null;
  playerActor.actionProgress = 0;
  player.state.position.copy(playerActor.position);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = Math.PI;
  player.state.pitch = 0;
  player.state.eye = 1.6;
  syncWeapon();
  hud.setHealth(100, 0);
  hud.setMoney(playerActor.money);
  lastHealth = 100;
}

function startMatch() {
  for (const a of game.actors) {
    a.money = 800;
    a.kills = 0;
    a.deaths = 0;
    a.owned = { sidearm: true, smg: false, rifle: false, marksman: false };
    a.weapon = 'sidearm';
  }
  respawnPlayer();
  bots.respawnAll(SPAWNS);
  bots.resetRound();
  rounds.startMatch();
  hud.hideOverlay();
  hud.showBuy(true, playerActor.money);
  started = true;
}

function syncCamera() {
  let px;
  let py;
  let pz;
  let yaw;
  let pitch;
  if (playerActor.alive) {
    px = player.state.position.x;
    py = player.state.position.y + player.state.eye;
    pz = player.state.position.z;
    yaw = player.state.yaw;
    pitch = player.state.pitch;
  } else {
    // spectate the first living teammate, else the view stays where you fell
    const mate = game.actors.find((a) => a.alive && a.team === 'ember');
    if (mate) {
      px = mate.position.x;
      py = mate.position.y + 1.5;
      pz = mate.position.z;
      yaw = mate.yaw;
      pitch = 0;
    } else {
      px = player.state.position.x;
      py = player.state.position.y + 1.6;
      pz = player.state.position.z;
      yaw = player.state.yaw;
      pitch = player.state.pitch;
    }
  }
  if (shake > 0) {
    px += (random() - 0.5) * shake * 0.15;
    py += (random() - 0.5) * shake * 0.15;
  }
  camera.position.set(px, py, pz);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const aiming = input.state.aiming && playerActor.weapon === 'marksman';
  const targetFov = aiming ? 52 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  playerActor.yaw = player.state.yaw;
  playerActor.pitch = player.state.pitch;
  syncCamera();
}

function shoot() {
  if (!weaponTakeRound(weaponState)) {
    audio.dryFire();
    weaponReload(weaponState);
    return false;
  }
  weaponPullTrigger(weaponState);
  camera.getWorldDirection(aimDir);
  eyePos.copy(camera.position);
  const spread = weaponSpread(weaponState, player.groundSpeed(), player.state.crouching, input.state.aiming);
  const result = combat.shoot(playerActor, eyePos, aimDir, weaponState, spread, random);
  viewModel.pullTrigger();
  player.recoil(WEAPONS[playerActor.weapon].kick + random() * 0.003, (random() * 2 - 1) * 0.003);
  audio.shot(playerActor.weapon);
  combat.noise(playerActor.position.x, playerActor.position.z, 26);
  if (result.hit) {
    hud.hitMarker(result.killed, result.killed ? 4000 : 90);
    if (result.killed) audio.kill();
    else audio.hit();
  }
  hud.setAmmo(weaponState.mag, weaponState.reserve, WEAPONS[playerActor.weapon].name);
  return true;
}

function throwSelectedGrenade() {
  const kind = playerActor.grenadeSelected;
  if (combat.throwGrenade(playerActor, kind)) {
    hud.setGrenades(playerActor.grenades, playerActor.grenadeSelected);
  }
}

function step(dt) {
  elapsed += dt;
  game.time = elapsed;
  shake = Math.max(0, shake - dt * 1.4);
  rounds.step(dt);

  // player
  if (playerActor.alive && (game.phase === PHASE.LIVE || game.phase === PHASE.FREEZE)) {
    player.step(dt, input.state.keys);
    playerActor.position.copy(player.state.position);
    playerActor.velocity.copy(player.state.velocity);
    playerActor.yaw = player.state.yaw;
    playerActor.pitch = player.state.pitch;
    playerActor.eye = player.state.eye;
    playerActor.crouching = player.state.crouching;
    playerActor.onGround = player.state.onGround;
    playerActor.height = player.state.height;
    // footsteps
    const speed = player.groundSpeed();
    if (speed > 1 && player.state.onGround) {
      stepTimer -= dt * speed;
      if (stepTimer <= 0) {
        stepTimer = 2.2;
        audio.step();
      }
    }
    // plant / defuse channel on E
    if (input.state.keys.has('KeyE')) {
      if (rounds.canPlant(playerActor)) playerActor.action = 'plant';
      else if (rounds.canDefuse(playerActor)) playerActor.action = 'defuse';
      else playerActor.action = null;
    } else {
      playerActor.action = null;
    }
    // flashbang whiteout
    if (elapsed < playerActor.flashUntil) {
      const strength = Math.min(1, (playerActor.flashUntil - elapsed) / 1.2);
      hud.flashWhite(strength);
    }
  }
  weaponStep(weaponState, dt);
  if (playerActor.alive && playerActor.health < lastHealth) {
    hud.damageFlash();
    audio.hurt();
  }
  lastHealth = playerActor.health;

  // bots only think and fight while the round is live; in freeze and in the
  // menu they hold where they stand
  if (game.phase === PHASE.LIVE) bots.step(dt);
  combat.stepGrenades(dt);
  effects.step(dt);

  // bomb visual: blinking charge where planted
  if (game.bomb && !bombMesh) {
    bombMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd8442e, emissive: 0xd8442e, emissiveIntensity: 0.8 }),
    );
    bombMesh.position.set(game.bomb.x, 0.15, game.bomb.z);
    scene.add(bombMesh);
  } else if (!game.bomb && bombMesh) {
    scene.remove(bombMesh);
    bombMesh = null;
  }
  if (bombMesh) {
    bombMesh.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(elapsed * (game.bomb.fuse > 10 ? 4 : 10))) * 1.2;
  }

  // carrier handover: if the player died with the charge, a living attacker takes it
  if (!game.carrier && game.phase === PHASE.LIVE) {
    const next = game.actors.find((a) => a.alive && a.team === 'ember' && !a.isPlayer);
    if (next) {
      next.hasBomb = true;
      game.carrier = next;
    }
  }
  if (game.carrier && !game.carrier.alive) game.carrier = null;

  bots.syncVisuals();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerActor.alive && input.state.locked) player.look(look.x, look.y);

    // edge-triggered keys
    if (input.wasPressed('KeyB') && game.phase === PHASE.FREEZE) {
      hud.showBuy(document.getElementById('buy').hidden, playerActor.money);
    }
    if (input.wasPressed('KeyR') && playerActor.alive) {
      if (weaponReload(weaponState)) audio.reload();
    }
    if (input.wasPressed('KeyQ') && playerActor.alive) {
      const order = ['he', 'smoke', 'flash'];
      const idx = order.indexOf(playerActor.grenadeSelected);
      playerActor.grenadeSelected = order[(idx + 1) % order.length];
      hud.setGrenades(playerActor.grenades, playerActor.grenadeSelected);
    }
    if (input.wasPressed('KeyG') && playerActor.alive) throwSelectedGrenade();
    // weapon slots 1-4, buy keys during freeze
    for (const [index, kind] of ['sidearm', 'smg', 'rifle', 'marksman'].entries()) {
      if (!input.wasPressed(`Digit${index + 1}`)) continue;
      if (game.phase === PHASE.FREEZE) {
        if (rounds.buy(playerActor, kind)) {
          audio.buy();
          syncWeapon();
          hud.setMoney(playerActor.money);
        } else audio.denied();
      } else if (playerActor.owned[kind] && playerActor.weapon !== kind) {
        playerActor.weapon = kind;
        syncWeapon();
      }
    }
    if (game.phase === PHASE.FREEZE) {
      if (input.wasPressed('Digit5') && rounds.buy(playerActor, 'armor')) {
        audio.buy();
        hud.setMoney(playerActor.money);
      }
      const grenadeKeys = { Digit6: 'he', Digit7: 'smoke', Digit8: 'flash' };
      for (const [code, kind] of Object.entries(grenadeKeys)) {
        if (input.wasPressed(code) && rounds.buy(playerActor, kind)) {
          audio.buy();
          hud.setMoney(playerActor.money);
        }
      }
      if (input.wasPressed('Enter')) {
        hud.showBuy(false, 0);
        input.requestLock();
      }
    }

    // firing: auto weapons hold, semi-auto fire on the rising edge
    if (playerActor.alive && input.state.locked && (game.phase === PHASE.LIVE)) {
      const def = WEAPONS[playerActor.weapon];
      const wantFire = def.auto ? input.state.firing : input.state.firing && !wasFiring;
      if (wantFire && weaponReady(weaponState)) shoot();
    }
    wasFiring = input.state.firing;

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;

    syncCamera();
    // HUD, throttled where cheap to cache
    hud.setAmmo(weaponState.mag, weaponState.reserve, WEAPONS[playerActor.weapon].name);
    hud.setHealth(playerActor.health, playerActor.armor);
    hud.setMoney(playerActor.money);
    hud.setTimer(game.phase === PHASE.FREEZE ? game.freezeLeft : game.roundTime, game.phase);
    hud.setGrenades(playerActor.grenades, playerActor.grenadeSelected);
    hud.setCrosshairSpread(4 + weaponSpread(weaponState, player.groundSpeed(), player.state.crouching, input.state.aiming) * 900);
    hud.setBomb(game.bomb ? game.bomb.fuse : null);
    if (playerActor.action) {
      const label = playerActor.action === 'plant' ? 'PLANTING CHARGE…' : 'DEFUSING…';
      hud.setAction(label, playerActor.actionProgress);
    } else {
      hud.setAction(null, 0);
    }
    hud.pushFeed();
    hud.setRoster();
    minimapTimer -= dt;
    if (minimapTimer <= 0) {
      minimapTimer = 0.25;
      hud.drawMinimap();
    }
  }
  viewModel.step(dt, player.groundSpeed(), weaponState.reloadLeft > 0, weaponState.reloadLeft > 0 ? 1 - weaponState.reloadLeft / weaponState.reloadTime : 0);
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  startMatch();
  hud.showBuy(false, 0);
  game.phase = PHASE.LIVE;
  game.roundTime = 87;
  // stage the actors deterministically
  const slate = game.actors.filter((a) => a.team === 'slate');
  const ember = game.actors.filter((a) => a.team === 'ember' && !a.isPlayer);
  if (name === 'cover') {
    player.state.position.set(0, 0, 8);
    player.state.yaw = 0;
    player.state.pitch = 0.02;
    slate[0].position.set(-1.5, 0, -6);
    slate[0].yaw = Math.PI;
    slate[1].position.set(3.2, 0, -8.5);
    slate[1].yaw = Math.PI * 0.9;
    ember[0].position.set(-3.5, 0, 4);
    ember[0].yaw = 0;
    settle(24);
    aimAt(tmpVec.set(-1.5, 1.4, -6));
    shoot();
    settle(2);
  } else if (name === 'site') {
    // Plant at A: player just south-east of the furnace, looking across the
    // site at the furnace face and the defender holding it.
    player.state.position.set(-13.5, 0, -5.5);
    player.state.yaw = 0.64;
    player.state.pitch = 0;
    slate[0].position.set(-16.8, 0, -9.6);
    slate[0].yaw = 2.26;
    slate[1].position.set(-20.6, 0, -9.0);
    slate[1].yaw = 1.9;
    playerActor.action = 'plant';
    playerActor.actionProgress = 0.62;
    settle(18);
    aimAt(tmpVec.set(-17.8, 1.4, -10.8));
    hud.setAction('PLANTING CHARGE…', 0.62);
    shoot();
    settle(1);
  } else if (name === 'buy') {
    game.phase = PHASE.FREEZE;
    game.freezeLeft = 6.5;
    player.state.position.set(0, 0, 14.5);
    player.state.yaw = Math.PI;
    player.state.pitch = 0;
    playerActor.money = 4700;
    settle(10);
    hud.showBuy(true, playerActor.money);
    hud.banner('ROUND 1', 'Buy phase — press B for the shop', 60000);
  } else if (name === 'action') {
    // Smoke fight at B: smoke drifts left of the lane, the defender by the
    // silo stays visible on the right, tracer crosses between them.
    player.state.position.set(16.5, 0, 3.5);
    player.state.yaw = -0.35;
    player.state.pitch = 0.02;
    slate[0].position.set(17.0, 0, -6.5);
    slate[0].yaw = 3.2;
    slate[1].position.set(21.0, 0, -12.0);
    slate[1].yaw = 2.6;
    effects.smokeAt(tmpVec.set(12.6, 0.5, -8.5));
    settle(20);
    aimAt(tmpVec.set(17.0, 1.3, -6.5));
    shoot();
    settle(2);
  }
  playerActor.position.copy(player.state.position);
  playerActor.yaw = player.state.yaw;
  playerActor.pitch = player.state.pitch;
  hud.hideBanner();
  hud.setAmmo(weaponState.mag, weaponState.reserve, WEAPONS[playerActor.weapon].name);
  hud.setHealth(playerActor.health, playerActor.armor);
  hud.setMoney(playerActor.money);
  hud.setTimer(game.roundTime, game.phase);
  hud.setScore(game.score.ember, game.score.slate, game.round);
  hud.setRoster();
  hud.pushFeed();
  hud.drawMinimap();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = { game, playerActor };

// debug handle for the screenshot script
window.__shotError = null;
window.addEventListener('error', (event) => {
  window.__shotError = String(event.message || event.error);
});

hud.showOverlay('start');
hud.setAmmo(weaponState.mag, weaponState.reserve, WEAPONS.sidearm.name);
hud.setHealth(100, 0);
hud.setMoney(playerActor.money);
hud.setScore(0, 0, 1);
hud.setGrenades(playerActor.grenades, playerActor.grenadeSelected);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
