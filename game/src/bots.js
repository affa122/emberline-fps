// Bots: the other nine players. Each has a body the player can shoot (torso, head,
// legs), a role for the round, and a small brain: route along the waypoint graph,
// hold a spot, engage what it sees, plant or defuse the charge, rotate to a
// planted bomb, and fall back when hurt. Perception is line of sight plus hearing.
import * as THREE from 'three';
import { TEAM } from './palette.js';
import { actorState } from './state.js';
import { createWeaponState, weaponStep, weaponReady, weaponTakeRound, weaponPullTrigger, weaponSpread, WEAPONS } from './weapons.js';

const EMBER_NAMES = ['Ash', 'Cinder', 'Flint', 'Soot'];
const SLATE_NAMES = ['Gravel', 'Iron', 'Nickel', 'Cobalt', 'Zinc'];
const BOT_SPEED = 4.2;
const BOT_EYE = 1.5;

function buildBody(scene, team, name) {
  const group = new THREE.Group();
  const colors = TEAM[team];
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.dark), roughness: 0.85 });
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.color), roughness: 0.5, emissive: new THREE.Color(colors.color), emissiveIntensity: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
  torso.position.y = 1.08;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skin);
  head.position.y = 1.62;
  head.userData.part = 'head';
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), trim);
  band.position.y = 1.68;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.68, 0.22), cloth);
  legL.position.set(-0.14, 0.34, 0);
  legL.userData.part = 'legs';
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.68, 0.22), cloth);
  legR.position.set(0.14, 0.34, 0);
  legR.userData.part = 'legs';
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), trim);
  gun.position.set(0.24, 1.18, -0.2);
  gun.rotation.x = 0.12;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, 1.2, -0.55);
  group.add(torso, head, band, legL, legR, gun, flash);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, legL, legR, flash };
}

export function createBots(scene, game, world, mover, combat, effects, audio) {
  const bots = [];
  const eye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const aimDir = new THREE.Vector3();

  function makeBot(team, name, spawn, weaponKind) {
    const actor = actorState(team, name, false);
    actor.position.set(spawn[0], 0, spawn[1]);
    actor.weapon = weaponKind;
    actor.owned = { sidearm: true, smg: true, rifle: true, marksman: false };
    const parts = buildBody(scene, team, name);
    actor.group = parts.group;
    actor.hitMeshes = [parts.torso, parts.head, parts.legL, parts.legR];
    for (const mesh of actor.hitMeshes) mesh.userData.actor = actor;
    const brain = {
      role: team === 'ember' ? 'push' : 'hold',
      lane: null,
      route: [],
      routeIndex: 0,
      holdSpot: null,
      target: null,
      lastPerceive: 0,
      reactionAt: 0,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeUntil: 0,
      scanYaw: 0,
      skill: 0.7 + game.random() * 0.25,
      weaponState: createWeaponState(weaponKind),
      flash: parts.flash,
      flashLeft: 0,
      investigate: null,
      walkPhase: game.random() * 6,
    };
    actor.brain = brain;
    game.actors.push(actor);
    bots.push(actor);
    return actor;
  }

  // Friendly marker above teammates so the player never mistakes one for an enemy
  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = 32;
  markerCanvas.height = 32;
  const mctx = markerCanvas.getContext('2d');
  mctx.fillStyle = '#f08a1d';
  mctx.beginPath();
  mctx.moveTo(16, 4);
  mctx.lineTo(28, 20);
  mctx.lineTo(16, 28);
  mctx.lineTo(4, 20);
  mctx.closePath();
  mctx.fill();
  const markerTex = new THREE.CanvasTexture(markerCanvas);

  function addMarker(actor) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, transparent: true, depthTest: false }));
    sprite.scale.setScalar(0.3);
    sprite.position.y = 2.05;
    actor.group.add(sprite);
  }

  function spawnAll() {
    const emberSpawns = [[-3, 14.5], [-1, 15.2], [1, 15.2], [3, 14.5]];
    const slateSpawns = [[-3, -14.5], [-1, -15.2], [1, -15.2], [3, -14.5], [0, -13.2]];
    const emberGuns = ['rifle', 'rifle', 'smg', 'rifle'];
    for (let i = 0; i < 4; i += 1) {
      const bot = makeBot('ember', EMBER_NAMES[i], emberSpawns[i], emberGuns[i]);
      addMarker(bot);
    }
    const slateGuns = ['rifle', 'rifle', 'smg', 'rifle', 'rifle'];
    for (let i = 0; i < 5; i += 1) makeBot('slate', SLATE_NAMES[i], slateSpawns[i], slateGuns[i]);
  }

  function resetRound() {
    const random = game.random;
    // defenders: two hold A, two hold B, one holds mid
    const slate = bots.filter((b) => b.team === 'slate');
    const assignments = [
      { spot: 'siteA', node: 'siteA' },
      { spot: 'siteA', node: 'siteA' },
      { spot: 'siteB', node: 'siteB' },
      { spot: 'siteB', node: 'siteB' },
      { spot: 'mid', node: 'mid3' },
    ];
    for (let i = 0; i < slate.length; i += 1) {
      const bot = slate[i];
      const a = assignments[i];
      const spots = world.holdSpots[a.spot];
      const spot = spots[Math.floor(random() * spots.length)];
      bot.brain.holdSpot = { x: spot[0], z: spot[1], yaw: spot[2] };
      bot.brain.role = 'hold';
      bot.brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), a.node);
      bot.brain.routeIndex = 0;
      bot.brain.target = null;
      bot.brain.investigate = null;
      bot.action = null;
      bot.actionProgress = 0;
    }
    // attackers: split across the three lanes
    const ember = bots.filter((b) => b.team === 'ember');
    const lanes = ['aLong3', 'bLong3', 'mid3', 'aLong3'];
    for (let i = 0; i < ember.length; i += 1) {
      const bot = ember[i];
      const pick = lanes[i % lanes.length];
      bot.brain.role = 'push';
      bot.brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), pick);
      bot.brain.routeIndex = 0;
      bot.brain.target = null;
      bot.brain.investigate = null;
      bot.action = null;
      bot.actionProgress = 0;
    }
    // one attacker carries the charge if the player is dead; the player carries it otherwise
    const carrier = ember[Math.floor(random() * ember.length)];
    carrier.hasBomb = game.actors[0].alive ? false : true;
  }

  function perceive(bot, dt) {
    const brain = bot.brain;
    brain.lastPerceive += dt;
    if (brain.lastPerceive < 0.12) return;
    brain.lastPerceive = 0;
    const now = game.time;
    if (now < bot.flashUntil) {
      brain.target = null;
      return;
    }
    eye.set(bot.position.x, bot.position.y + BOT_EYE, bot.position.z);
    let best = null;
    let bestScore = Infinity;
    for (const other of game.actors) {
      if (!other.alive || other.team === bot.team) continue;
      const dx = other.position.x - bot.position.x;
      const dz = other.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 52) continue;
      // inside the bot's forward cone?
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
      if (dot < 0.25 && dist > 4) continue;
      toTarget.set(other.position.x, other.position.y + 1.3, other.position.z);
      if (!combat.hasLineOfSight(eye, toTarget)) continue;
      const score = dist + (other.isPlayer ? 0 : 3);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best && brain.target !== best) brain.reactionAt = now + 0.28 + game.random() * 0.35;
    brain.target = best;
    // hearing: a recent noise nearby pulls the bot's attention
    if (!best) {
      for (let i = game.noises.length - 1; i >= 0; i -= 1) {
        const n = game.noises[i];
        if (now - n.time > 2) continue;
        const d = Math.hypot(n.x - bot.position.x, n.z - bot.position.z);
        if (d < n.radius) {
          brain.investigate = { x: n.x, z: n.z, until: now + 4 };
          break;
        }
      }
    }
  }

  function aimError(bot, target, speed) {
    const dist = bot.position.distanceTo(target.position);
    const targetSpeed = Math.hypot(target.velocity.x, target.velocity.z);
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 1 ? 0.012 : 0;
    const base = 0.014 + dist * 0.0011 + targetSpeed * 0.0035 + moving;
    return base * (1.25 - bot.brain.skill);
  }

  function botShoot(bot, dt) {
    const brain = bot.brain;
    const target = brain.target;
    if (!target || game.time < brain.reactionAt) return;
    weaponStep(brain.weaponState, dt);
    if (brain.burstLeft <= 0) {
      if (brain.burstPause > 0) {
        brain.burstPause -= dt;
        return;
      }
      brain.burstLeft = 3 + Math.floor(game.random() * 3);
      brain.burstPause = 0;
    }
    if (!weaponReady(brain.weaponState)) return;
    if (!weaponTakeRound(brain.weaponState)) {
      // dry: reload
      brain.weaponState.reloadLeft = WEAPONS[brain.weaponState.kind].reload;
      brain.weaponState.reloadTime = WEAPONS[brain.weaponState.kind].reload;
      return;
    }
    weaponPullTrigger(brain.weaponState);
    eye.set(bot.position.x, bot.position.y + BOT_EYE, bot.position.z);
    toTarget.set(target.position.x, target.position.y + 1.25, target.position.z);
    aimDir.subVectors(toTarget, eye).normalize();
    const err = aimError(bot, target, 0);
    const spread = weaponSpread(brain.weaponState, Math.hypot(bot.velocity.x, bot.velocity.z), false, false) + err;
    const result = combat.shoot(bot, eye, aimDir, brain.weaponState, spread, game.random);
    brain.flashLeft = 0.06;
    brain.burstLeft -= 1;
    if (brain.burstLeft === 0) brain.burstPause = 0.45 + game.random() * 0.5;
    combat.noise(bot.position.x, bot.position.z, 26);
    audio.distantShot();
    if (result.hit && result.hit.isPlayer) audio.hurt();
    if (result.killed && result.hit && !result.hit.isPlayer) audio.kill();
  }

  function faceToward(bot, x, z) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    if (dx * dx + dz * dz < 0.01) return;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, 0.12);
  }

  function followRoute(bot, dt, speed) {
    const brain = bot.brain;
    if (brain.routeIndex >= brain.route.length) return true;
    const node = world.nodes[brain.route[brain.routeIndex]];
    const dx = node[0] - bot.position.x;
    const dz = node[1] - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      brain.routeIndex += 1;
      return brain.routeIndex >= brain.route.length;
    }
    faceToward(bot, node[0], node[1]);
    mover.move(bot, dt, dx / dist, dz / dist, speed);
    return false;
  }

  function stepBot(bot, dt) {
    const brain = bot.brain;
    if (!bot.alive) {
      bot.group.rotation.x = Math.max(-1.5, bot.group.rotation.x - dt * 4);
      return;
    }
    brain.flashLeft = Math.max(0, brain.flashLeft - dt);
    brain.flash.material.opacity = brain.flashLeft > 0 ? 0.95 : 0;
    perceive(bot, dt);

    // planting / defusing channels: stand still and work
    if (bot.action === 'plant' || bot.action === 'defuse') {
      mover.move(bot, dt, 0, 0, 0);
      return;
    }

    const target = brain.target;
    if (target && target.alive) {
      // engage: strafe and shoot
      if (game.time > brain.strafeUntil) {
        brain.strafeDir = game.random() < 0.5 ? -1 : 1;
        brain.strafeUntil = game.time + 0.7 + game.random() * 0.8;
      }
      faceToward(bot, target.position.x, target.position.z);
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const sx = -fz * brain.strafeDir;
      const sz = fx * brain.strafeDir;
      mover.move(bot, dt, sx, sz, 2.6);
      botShoot(bot, dt);
      return;
    }

    // low health: fall back toward spawn
    if (bot.health < 30 && brain.role !== 'retreat') {
      brain.role = 'retreat';
      const home = bot.team === 'ember' ? 'spawnE' : 'spawnS';
      brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), home);
      brain.routeIndex = 0;
    }
    if (brain.role === 'retreat') {
      if (followRoute(bot, dt, BOT_SPEED)) brain.role = bot.team === 'ember' ? 'push' : 'hold';
      return;
    }

    // bomb planted: defenders rotate to the planted site
    if (game.bomb && bot.team === 'slate' && brain.role !== 'defuse-run') {
      brain.role = 'defuse-run';
      const site = game.bomb.site;
      brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), site === 'A' ? 'siteA' : 'siteB');
      brain.routeIndex = 0;
    }
    if (brain.role === 'defuse-run') {
      const arrived = followRoute(bot, dt, BOT_SPEED);
      if (arrived && game.bomb) {
        const d = Math.hypot(game.bomb.x - bot.position.x, game.bomb.z - bot.position.z);
        if (d < 3.5) {
          bot.action = 'defuse';
          bot.actionProgress = 0;
        }
      }
      return;
    }

    // attacker with the charge: push to the nearest site and plant
    if (bot.hasBomb && brain.role === 'push') {
      const siteNode = bot.position.x < 0 ? 'siteA' : 'siteB';
      if (brain.route.length === 0 || brain.route[brain.route.length - 1] !== siteNode) {
        brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), siteNode);
        brain.routeIndex = 0;
      }
      const arrived = followRoute(bot, dt, BOT_SPEED);
      if (arrived) {
        const site = siteNode === 'siteA' ? 'A' : 'B';
        bot.action = 'plant';
        bot.actionProgress = 0;
        bot.brain.plantSite = site;
      }
      return;
    }

    if (brain.role === 'hold' && brain.holdSpot) {
      const arrived = followRoute(bot, dt, BOT_SPEED);
      if (arrived) {
        // scan: slow sweep
        brain.scanYaw += dt * 0.35;
        bot.yaw = brain.holdSpot.yaw + Math.sin(brain.scanYaw) * 0.7;
        mover.move(bot, dt, 0, 0, 0);
      }
      return;
    }

    // push role: walk the route, then hold at the end
    if (brain.role === 'push') {
      const arrived = followRoute(bot, dt, BOT_SPEED);
      if (arrived) {
        brain.role = 'hold';
        brain.holdSpot = { x: bot.position.x, z: bot.position.z, yaw: bot.yaw };
      }
      return;
    }

    // investigate a noise
    if (brain.investigate && game.time < brain.investigate.until) {
      const node = world.nearestNode(brain.investigate.x, brain.investigate.z);
      if (brain.route.length === 0 || brain.route[brain.route.length - 1] !== node) {
        brain.route = world.route(world.nearestNode(bot.position.x, bot.position.z), node);
        brain.routeIndex = 0;
      }
      followRoute(bot, dt, BOT_SPEED * 0.9);
    }
  }

  function step(dt) {
    for (const bot of bots) stepBot(bot, dt);
    // walk-cycle bob for the legs
    for (const bot of bots) {
      if (!bot.alive) continue;
      const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
      if (speed > 0.5) {
        bot.brain.walkPhase += dt * speed * 1.4;
        const swing = Math.sin(bot.brain.walkPhase) * 0.35;
        bot.group.rotation.z = swing * 0.06;
      }
    }
  }

  function syncVisuals() {
    for (const bot of bots) {
      bot.group.position.set(bot.position.x, bot.position.y, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      if (bot.alive) bot.group.rotation.x = 0;
    }
  }

  return {
    bots,
    spawnAll,
    resetRound,
    step,
    syncVisuals,
    respawnAll(spawns) {
      const ember = bots.filter((b) => b.team === 'ember');
      const slate = bots.filter((b) => b.team === 'slate');
      for (let i = 0; i < ember.length; i += 1) {
        const bot = ember[i];
        bot.alive = true;
        bot.health = 100;
        bot.armor = 0;
        bot.position.set(spawns.ember[i][0], 0, spawns.ember[i][1]);
        bot.velocity.set(0, 0, 0);
        bot.yaw = Math.PI;
        bot.hasBomb = false;
        bot.action = null;
        bot.actionProgress = 0;
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.brain.weaponState = createWeaponState(bot.weapon);
      }
      for (let i = 0; i < slate.length; i += 1) {
        const bot = slate[i];
        bot.alive = true;
        bot.health = 100;
        bot.armor = 0;
        bot.position.set(spawns.slate[i][0], 0, spawns.slate[i][1]);
        bot.velocity.set(0, 0, 0);
        bot.yaw = 0;
        bot.hasBomb = false;
        bot.action = null;
        bot.actionProgress = 0;
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.brain.weaponState = createWeaponState(bot.weapon);
      }
    },
  };
}
