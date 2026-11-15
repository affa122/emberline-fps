// State kept in one place: the whole match lives on this object, and every module
// reads and writes it through here. Nothing else holds match state.
import * as THREE from 'three';

export const PHASE = {
  MENU: 'menu',
  FREEZE: 'freeze',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const WIN_ROUNDS = 5;
export const ROUND_SECONDS = 100;
export const FREEZE_SECONDS = 8;
export const FUSE_SECONDS = 35;
export const START_MONEY = 800;

export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed) {
  const random = mulberry32(seed);
  return {
    random,
    seed,
    phase: PHASE.MENU,
    round: 1,
    score: { ember: 0, slate: 0 },
    roundTime: FREEZE_SECONDS,
    freezeLeft: FREEZE_SECONDS,
    phaseTime: 0,
    matchWinner: null,
    roundWinner: null,
    roundReason: '',
    // the bomb: null until planted
    bomb: null,
    // actors: index 0 is the player; the rest are bots. Filled by main.js.
    actors: [],
    // noise events bots hear: {x, z, radius, time}
    noises: [],
    // kill feed entries: {text, team, time}
    feed: [],
    // per-round economy log for the buy menu
    lastRound: { ember: 0, slate: 0 },
    lossStreak: { ember: 0, slate: 0 },
    carrier: null,
    time: 0,
    // scratch vectors, reused so hot loops allocate nothing
    tmpA: new THREE.Vector3(),
    tmpB: new THREE.Vector3(),
    tmpC: new THREE.Vector3(),
  };
}

export function actorState(team, name, isPlayer) {
  return {
    name,
    team,
    isPlayer: !!isPlayer,
    alive: true,
    health: 100,
    armor: 0,
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: 1.6,
    height: 1.72,
    crouching: false,
    onGround: true,
    // weapon slot: 'sidearm' | 'smg' | 'rifle' | 'marksman'; owned set for the buy menu
    weapon: 'sidearm',
    owned: { sidearm: true, smg: false, rifle: false, marksman: false },
    grenades: { he: 0, smoke: 0, flash: 0 },
    grenadeSelected: 'he',
    hasBomb: false,
    // bot brain, null for the player
    brain: null,
    // visual group, filled by bots.js / player viewmodel
    group: null,
    hitMeshes: [],
    lastSeen: 0,
    lastShotAt: 0,
    flashUntil: 0,
    // plant / defuse progress 0..1
    action: null,
    actionProgress: 0,
  };
}
