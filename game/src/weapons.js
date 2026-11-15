// Weapons: the numbers and the view model. One table drives the buy menu, the HUD
// and the shooting, so a price or damage never disagrees between them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    name: 'P9 Sidearm', price: 0, damage: 26, headMult: 4, legMult: 0.75,
    mag: 12, reserve: 48, gap: 0.16, auto: false, reload: 1.4,
    spreadStill: 0.003, spreadMove: 0.02, range: 40, kick: 0.006, zoom: 1,
  },
  smg: {
    name: 'VK-9 Ripper', price: 1200, damage: 22, headMult: 4, legMult: 0.75,
    mag: 25, reserve: 100, gap: 0.085, auto: true, reload: 1.7,
    spreadStill: 0.006, spreadMove: 0.032, range: 30, kick: 0.005, zoom: 1,
  },
  rifle: {
    name: 'AR-77 Longshot', price: 2700, damage: 34, headMult: 4, legMult: 0.75,
    mag: 30, reserve: 90, gap: 0.1, auto: true, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, range: 60, kick: 0.009, zoom: 1,
  },
  marksman: {
    name: 'DMR-50 Marksman', price: 3200, damage: 70, headMult: 4, legMult: 0.75,
    mag: 10, reserve: 30, gap: 0.9, auto: false, reload: 2.4,
    spreadStill: 0.0009, spreadMove: 0.05, range: 80, kick: 0.02, zoom: 1.45,
  },
};

export const GRENADES = {
  he: { name: 'Frag grenade', price: 300, max: 1 },
  smoke: { name: 'Smoke grenade', price: 300, max: 1 },
  flash: { name: 'Flash grenade', price: 200, max: 1 },
};

export const ARMOR_PRICE = 650;

// The view model: boxes for receiver, barrel, stock and grip, plus a muzzle flash
// plane and light. It bobs with movement, kicks when fired and tilts while reloading.
export function createViewModel(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.44), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), grip);
  barrel.position.set(0, 0.028, -0.4);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.24), grip);
  stock.position.set(0, -0.025, 0.31);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), accent);
  sight.position.set(0, 0.085, -0.1);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), grip);
  mag.position.set(0, -0.12, -0.02);
  model.add(receiver, barrel, stock, sight, mag);
  model.position.set(0.24, -0.21, -0.44);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.98);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5, 1.5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { kick: 0, bob: 0, flash: 0 };

  return {
    state,
    step(dt, speed, reloading, reloadFrac) {
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      state.flash = Math.max(0, state.flash - dt);
      state.bob += dt * speed * 1.6;
      const bobY = Math.sin(state.bob * 2) * 0.006 * Math.min(1, speed / 5);
      const bobX = Math.cos(state.bob) * 0.004 * Math.min(1, speed / 5);
      model.position.set(0.24 + bobX, -0.21 + bobY, -0.44 + state.kick);
      model.rotation.x = state.kick * 2.4 - (reloading ? 0.55 * Math.sin(reloadFrac * Math.PI) : 0);
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
    },
    pullTrigger() {
      state.kick = 0.06;
      state.flash = 0.06;
    },
    // rescale the model a little per weapon so the four guns read differently
    setWeapon(kind) {
      const scale = kind === 'marksman' ? 1.18 : kind === 'smg' ? 0.82 : kind === 'sidearm' ? 0.62 : 1;
      model.scale.setScalar(scale);
      barrel.scale.z = kind === 'marksman' ? 1.5 : kind === 'smg' ? 0.7 : 1;
    },
  };
}

// Per-actor weapon state: magazine, reserve, cooldown, reload timer, bloom.
export function createWeaponState(kind) {
  const def = WEAPONS[kind];
  return {
    kind,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    reloadTime: def.reload,
    bloom: 0,
  };
}

export function weaponStep(ws, dt) {
  ws.cooldown = Math.max(0, ws.cooldown - dt);
  ws.bloom = Math.max(0, ws.bloom - dt * 0.09);
  if (ws.reloadLeft > 0) {
    ws.reloadLeft = Math.max(0, ws.reloadLeft - dt);
    if (ws.reloadLeft === 0) {
      const def = WEAPONS[ws.kind];
      const need = def.mag - ws.mag;
      const take = Math.min(need, ws.reserve);
      ws.mag += take;
      ws.reserve -= take;
    }
  }
}

export function weaponReady(ws) {
  return ws.mag > 0 && ws.cooldown === 0 && ws.reloadLeft === 0;
}

export function weaponTakeRound(ws) {
  if (ws.mag <= 0) return false;
  ws.mag -= 1;
  return true;
}

export function weaponPullTrigger(ws) {
  const def = WEAPONS[ws.kind];
  ws.cooldown = def.gap;
  ws.bloom = Math.min(0.05, ws.bloom + (ws.kind === 'marksman' ? 0.05 : 0.008));
}

export function weaponReload(ws) {
  const def = WEAPONS[ws.kind];
  if (ws.reloadLeft > 0 || ws.mag === def.mag || ws.reserve === 0) return false;
  ws.reloadLeft = def.reload;
  ws.reloadTime = def.reload;
  return true;
}

export function weaponSpread(ws, speed, crouching, aiming) {
  const def = WEAPONS[ws.kind];
  const move = Math.min(1, speed / 5.4);
  let spread = def.spreadStill + move * def.spreadMove + ws.bloom;
  if (crouching) spread *= 0.7;
  if (aiming) spread *= 0.55;
  return spread;
}
