// The map: Foundry-9, a decommissioned emberworks. Two bombsites (A Furnace north-west,
// B Silo north-east), three lanes (A-long west, Mid centre, B-long east), connectors
// between them. Every box is a collider for movement and a surface a bullet stops on.
// Waypoints are the graph the bots walk; hold spots are where defenders post up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.5;

// [width, height, depth, x, y, z, material]
const BOXES = [
  // floor and outer walls
  [47.2, 0.4, 35.2, 0, -0.2, 0, 'floor'],
  [0.6, WALL_H, 35.2, -23.3, WALL_H / 2, 0, 'wall'],
  [0.6, WALL_H, 35.2, 23.3, WALL_H / 2, 0, 'wall'],
  [47.2, WALL_H, 0.6, 0, WALL_H / 2, -17.3, 'wall'],
  [47.2, WALL_H, 0.6, 0, WALL_H / 2, 17.3, 'wall'],
  // mid choke wall: centre door plus side gaps
  [7, 3.4, 0.8, -5.5, 1.7, -5, 'wall'],
  [7, 3.4, 0.8, 5.5, 1.7, -5, 'wall'],
  // lane-shaping walls
  [0.8, 3.2, 8, -15, 1.6, 2, 'wall'],
  [0.8, 3.2, 8, 15, 1.6, 2, 'wall'],
  // A site: the furnace block and its cover
  [4.4, 3.6, 3.2, -18.6, 1.8, -12.4, 'steel'],
  [2.2, 1.1, 1.1, -14.2, 0.55, -9.2, 'crate'],
  [1.1, 1.1, 1.1, -13.0, 0.55, -13.6, 'crate'],
  [2.2, 1.1, 1.1, -20.4, 0.55, -8.6, 'crate'],
  [1.1, 2.2, 1.1, -21.4, 1.1, -13.8, 'crate'],
  // B site: silo tanks (boxed) and cover
  [3.4, 4.2, 3.4, 16.2, 2.1, -12.8, 'steel'],
  [3.0, 3.4, 3.0, 20.2, 1.7, -9.6, 'steel'],
  [2.2, 1.1, 1.1, 13.6, 0.55, -9.4, 'crate'],
  [1.1, 1.1, 1.1, 12.6, 0.55, -13.8, 'crate'],
  [1.1, 2.2, 1.1, 21.2, 1.1, -14.2, 'crate'],
  // mid: boiler pillars and pipes
  [1.5, 4.5, 1.5, -2.6, 2.25, 0.5, 'steel'],
  [1.5, 4.5, 1.5, 2.6, 2.25, 0.5, 'steel'],
  [5.6, 0.9, 0.9, 0, 3.6, -5, 'steel'],
  [1.1, 1.1, 2.2, -6.5, 0.55, 3.4, 'crate'],
  [1.1, 1.1, 2.2, 6.5, 0.55, 3.4, 'crate'],
  [2.2, 1.1, 1.1, -3.4, 0.55, -9.6, 'crate'],
  [2.2, 1.1, 1.1, 3.4, 0.55, -9.6, 'crate'],
  // long lanes: crates to crouch behind
  [1.1, 1.1, 1.1, -20.5, 0.55, 4.5, 'crate'],
  [2.2, 1.1, 1.1, -19.0, 0.55, -2.5, 'crate'],
  [1.1, 1.1, 1.1, 20.5, 0.55, 4.5, 'crate'],
  [2.2, 1.1, 1.1, 19.0, 0.55, -2.5, 'crate'],
  [1.1, 1.1, 1.1, -11.5, 0.55, 8.0, 'crate'],
  [1.1, 1.1, 1.1, 11.5, 0.55, 8.0, 'crate'],
  // spawn cover
  [2.2, 1.1, 1.1, -6.0, 0.55, 13.5, 'crate'],
  [2.2, 1.1, 1.1, 6.0, 0.55, 13.5, 'crate'],
  [2.2, 1.1, 1.1, -6.0, 0.55, -13.5, 'crate'],
  [2.2, 1.1, 1.1, 6.0, 0.55, -13.5, 'crate'],
  // barrels (boxed approximations, r 0.45)
  [0.9, 1.1, 0.9, -9.0, 0.55, -11.5, 'steel'],
  [0.9, 1.1, 0.9, 9.0, 0.55, -11.5, 'steel'],
  [0.9, 1.1, 0.9, -17.5, 0.55, 2.0, 'steel'],
  [0.9, 1.1, 0.9, 17.5, 0.55, 2.0, 'steel'],
];

// Waypoint graph the bots walk. Edges are bidirectional.
const NODES = {
  spawnE: [0, 14.5],
  spawnS: [0, -14.5],
  aLong1: [-20.5, 10],
  aLong2: [-20.5, 0],
  aLong3: [-20.5, -6.5],
  bLong1: [20.5, 10],
  bLong2: [20.5, 0],
  bLong3: [20.5, -6.5],
  mid1: [0, 8],
  mid2: [0, 0],
  mid3: [0, -8.5],
  midA: [-10.5, -7.5],
  midB: [10.5, -7.5],
  siteA: [-17.5, -11.5],
  siteB: [17.5, -11.5],
  aMid: [-10.5, 4],
  bMid: [10.5, 4],
};
const EDGES = [
  ['spawnE', 'mid1'], ['spawnE', 'aLong1'], ['spawnE', 'bLong1'],
  ['mid1', 'mid2'], ['mid1', 'aMid'], ['mid1', 'bMid'],
  ['mid2', 'mid3'], ['mid2', 'midA'], ['mid2', 'midB'],
  ['mid3', 'spawnS'], ['mid3', 'siteA'], ['mid3', 'siteB'], ['mid3', 'midA'], ['mid3', 'midB'],
  ['aLong1', 'aLong2'], ['aLong2', 'aLong3'], ['aLong3', 'siteA'], ['aLong2', 'midA'], ['aMid', 'midA'],
  ['bLong1', 'bLong2'], ['bLong2', 'bLong3'], ['bLong3', 'siteB'], ['bLong2', 'midB'], ['bMid', 'midB'],
  ['midA', 'siteA'], ['midB', 'siteB'],
  ['aLong2', 'aMid'], ['bLong2', 'bMid'],
];

// Where defenders post up: [x, z, yaw]
const HOLD_SPOTS = {
  siteA: [[-14.6, -13.2, 2.2], [-20.6, -9.0, 1.2]],
  siteB: [[14.6, -13.2, -2.2], [20.6, -9.0, -1.2]],
  mid: [[-1.5, -8.0, 0.1], [1.5, -8.0, -0.1]],
  aLong: [[-20.5, -4.5, 0.4]],
  bLong: [[20.5, -4.5, -0.4]],
};

export const SITES = {
  A: { name: 'Furnace', center: new THREE.Vector3(-17.5, 0, -11.5), radius: 4.6 },
  B: { name: 'Silo', center: new THREE.Vector3(17.5, 0, -11.5), radius: 4.6 },
};

export const SPAWNS = {
  ember: [[-3, 14.5], [-1, 15.2], [1, 15.2], [3, 14.5], [0, 13.2]],
  slate: [[-3, -14.5], [-1, -15.2], [1, -15.2], [3, -14.5], [0, -13.2]],
};

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 190px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'steel' ? 0.55 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.03,
    });
  }
  const siteMatA = new THREE.MeshBasicMaterial({ map: letterTexture('A', '#f08a1d'), transparent: true, opacity: 0.9, depthWrite: false });
  const siteMatB = new THREE.MeshBasicMaterial({ map: letterTexture('B', '#7ba7d4'), transparent: true, opacity: 0.9, depthWrite: false });
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6, roughness: 0.4 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  for (const [w, h, d, x, y, z, mat] of BOXES) box(w, h, d, x, y, z, mat);

  // Site floor letters + glowing furnace strip
  for (const [mat, x, z] of [[siteMatA, -17.5, -11.5], [siteMatB, 17.5, -11.5]]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(x, 0.02, z);
    plate.receiveShadow = true;
    group.add(plate);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.5), glowMat);
  strip.position.set(-18.6, 3.7, -12.4);
  group.add(strip);

  // Distant silhouettes outside the walls, so the skyline reads at a glance
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 1 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0x2a1f10 });
  for (const [x, z, w, h] of [[-34, -8, 8, 14], [34, 4, 7, 18], [-12, -30, 10, 11], [16, -30, 6, 16], [-36, 12, 6, 9], [36, -14, 9, 12]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), silhouette);
    b.position.set(x, h / 2 - 0.5, z);
    group.add(b);
    for (let i = 0; i < 4; i += 1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
      win.position.set(x - w / 2 + 1 + i * 1.6, 3 + (i % 2) * 3, z + w / 2 + 0.02);
      if (x > 0) win.rotation.y = Math.PI;
      group.add(win);
    }
  }

  // Light: low warm sun from the west, cool fill from the east, dusk sky
  scene.fog = new THREE.Fog(new THREE.Color(0x2a211a), 35, 95);
  const sky = new THREE.HemisphereLight(new THREE.Color(0xa8845c), new THREE.Color(0x2a241f), 1.35);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 3.0);
  key.position.set(-26, 18, 10);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x5d7ea6), 0.9);
  fill.position.set(20, 12, -8);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(0xf08a1d), 14, 16, 1.6);
  furnaceLight.position.set(-18.6, 3.2, -11.0);
  scene.add(furnaceLight);
  const siloLight = new THREE.PointLight(new THREE.Color(0x5d7ea6), 10, 15, 1.6);
  siloLight.position.set(17.5, 3.4, -11.5);
  scene.add(siloLight);

  // Waypoint adjacency for BFS
  const adjacency = {};
  for (const name of Object.keys(NODES)) adjacency[name] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    nodes: NODES,
    adjacency,
    holdSpots: HOLD_SPOTS,
    // wall footprints for the minimap: [x, z, width, depth]
    minimapWalls: BOXES.map(([w, _h, d, x, _y, z]) => [x, z, w, d]),
    nearestNode(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const [name, [nx, nz]] of Object.entries(NODES)) {
        const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
        if (d < bestD) {
          bestD = d;
          best = name;
        }
      }
      return best;
    },
    // BFS route between waypoints; returns array of node names including start and goal
    route(from, to) {
      if (from === to) return [from];
      const prev = { [from]: null };
      const queue = [from];
      while (queue.length) {
        const cur = queue.shift();
        for (const next of adjacency[cur] ?? []) {
          if (!(next in prev)) {
            prev[next] = cur;
            if (next === to) {
              const path = [to];
              let n = to;
              while (prev[n] !== null) {
                n = prev[n];
                path.unshift(n);
              }
              return path;
            }
            queue.push(next);
          }
        }
      }
      return [from, to];
    },
  };
}
