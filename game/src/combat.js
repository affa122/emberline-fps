// Combat: one shooting resolution shared by the player and the bots. A shot is a
// ray against the world and every actor's hit meshes; damage falls off with range,
// headshots multiply, armour absorbs. Grenades fly, bounce once, then do their job.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const HEAD_MULT_FALLBACK = 4;

export function createCombat(game, world, effects, audio) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const grenades = [];

  const shootableScratch = [];

  function collectShootables(excludeActor) {
    shootableScratch.length = 0;
    const list = world.shootables;
    for (let i = 0; i < list.length; i += 1) shootableScratch.push(list[i]);
    for (const actor of game.actors) {
      if (!actor.alive || actor === excludeActor) continue;
      for (const mesh of actor.hitMeshes) shootableScratch.push(mesh);
    }
    return shootableScratch;
  }

  function damageActor(target, amount, part, attacker, weaponKind) {
    if (!target.alive) return false;
    let dealt = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, dealt * 0.5);
      target.armor -= absorbed;
      dealt -= absorbed;
    }
    target.health -= dealt;
    target.lastShotAt = game.time;
    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.deaths += 1;
      if (attacker) attacker.kills += 1;
      if (attacker && attacker.isPlayer) attacker.money += 300;
      if (attacker && !attacker.isPlayer && attacker.team === 'ember') attacker.money += 300;
      game.feed.push({
        killer: attacker ? attacker.name : '—',
        killerTeam: attacker ? attacker.team : null,
        victim: target.name,
        victimTeam: target.team,
        weapon: weaponKind,
        headshot: part === 'head',
        time: game.time,
      });
      if (game.feed.length > 6) game.feed.shift();
      // the bomb drops where its carrier fell
      if (target.hasBomb) {
        target.hasBomb = false;
        game.carrier = null;
      }
      return true;
    }
    return false;
  }

  // Fire one hitscan shot. Returns { hit: actor|null, part, killed, point, distance }.
  function shoot(shooter, eyePos, aimDir, ws, spread, random) {
    const def = WEAPONS[ws.kind];
    direction.copy(aimDir);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    origin.copy(eyePos);
    raycaster.set(origin, direction);
    const targets = collectShootables(shooter);
    const hits = raycaster.intersectObjects(targets, false);
    const muzzle = hitPoint.copy(eyePos).addScaledVector(direction, 0.6);
    let result = { hit: null, part: null, killed: false, point: null, distance: 0 };
    if (hits.length === 0) {
      effects.tracer(muzzle, origin.clone().addScaledVector(direction, 60));
      return result;
    }
    const hit = hits[0];
    const end = hit.point;
    effects.tracer(muzzle, end);
    const distance = hit.distance;
    const falloff = distance > def.range ? Math.max(0.5, 1 - (distance - def.range) / def.range) : 1;
    if (hit.object.userData.actor) {
      const target = hit.object.userData.actor;
      const part = hit.object.userData.part || 'torso';
      const mult = part === 'head' ? (def.headMult || HEAD_MULT_FALLBACK) : part === 'legs' ? def.legMult : 1;
      const killed = damageActor(target, def.damage * mult * falloff, part, shooter, ws.kind);
      result = { hit: target, part, killed, point: end.clone(), distance };
    } else {
      if (hit.face) normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      else normal.set(0, 1, 0);
      effects.sparksAt(end, normal);
    }
    return result;
  }

  function hasLineOfSight(from, to) {
    // smoke on either end or the middle blocks sight
    const mid = origin.copy(from).lerp(to, 0.5);
    if (effects.inSmoke(from) || effects.inSmoke(to) || effects.inSmoke(mid)) return false;
    direction.subVectors(to, from);
    const dist = direction.length();
    if (dist < 0.1) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = dist - 0.4;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function throwGrenade(actor, kind) {
    if (actor.grenades[kind] <= 0) return false;
    actor.grenades[kind] -= 1;
    const dir = direction.set(-Math.sin(actor.yaw) * Math.cos(actor.pitch), Math.sin(actor.pitch), -Math.cos(actor.yaw) * Math.cos(actor.pitch));
    const pos = actor.position.clone();
    pos.y += actor.eye;
    pos.addScaledVector(dir, 0.5);
    grenades.push({
      kind,
      owner: actor,
      pos,
      vel: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: kind === 'he' ? 1.6 : 1.1,
      bounced: false,
    });
    audio.grenadeThrow();
    return true;
  }

  function stepGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.25) {
        g.pos.y = 0.25;
        if (!g.bounced) {
          g.vel.multiplyScalar(0.45);
          g.vel.y = Math.abs(g.vel.y) * 0.4;
          g.bounced = true;
        } else {
          g.vel.set(0, 0, 0);
        }
      }
      if (g.pos.x < -22.6 || g.pos.x > 22.6) g.vel.x *= -0.4;
      if (g.pos.z < -16.6 || g.pos.z > 16.6) g.vel.z *= -0.4;
      if (g.fuse <= 0) {
        if (g.kind === 'he') {
          effects.sparksAt(g.pos, normal.set(0, 1, 0));
          audio.explosion();
          for (const actor of game.actors) {
            if (!actor.alive) continue;
            const d = actor.position.distanceTo(g.pos);
            if (d < 7) {
              const dmg = Math.round(95 * (1 - d / 7));
              const killed = damageActor(actor, dmg, 'torso', g.owner, 'he');
              if (killed && g.owner.isPlayer) audio.kill();
            }
          }
          game.noises.push({ x: g.pos.x, z: g.pos.z, radius: 40, time: game.time });
        } else if (g.kind === 'smoke') {
          effects.smokeAt(g.pos);
        } else if (g.kind === 'flash') {
          audio.flash();
          for (const actor of game.actors) {
            if (!actor.alive || actor === g.owner) continue;
            const d = actor.position.distanceTo(g.pos);
            if (d < 26) {
              // blinded only if facing the flash
              const toFlash = origin.copy(g.pos).sub(actor.position).normalize();
              const facing = direction.set(-Math.sin(actor.yaw), 0, -Math.cos(actor.yaw));
              if (toFlash.dot(facing) > -0.2) actor.flashUntil = game.time + 2.5 * (1 - d / 30);
            }
          }
          const player = game.actors[0];
          if (player.alive) {
            const d = player.position.distanceTo(g.pos);
            if (d < 26) {
              const toFlash = origin.copy(g.pos).sub(player.position).normalize();
              const facing = direction.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
              if (toFlash.dot(facing) > -0.2) player.flashUntil = game.time + 2.2 * (1 - d / 30);
            }
          }
        }
        grenades.splice(i, 1);
      }
    }
  }

  return {
    shoot,
    damageActor,
    hasLineOfSight,
    throwGrenade,
    stepGrenades,
    noise(x, z, radius) {
      game.noises.push({ x, z, radius, time: game.time });
    },
  };
}
