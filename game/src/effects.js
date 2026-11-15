// Effects: pooled tracers, impact sparks and smoke, so the hot loops make no new
// objects every frame. A tracer is a thin stretched box between two points; a spark
// burst is one Points cloud with a fixed buffer; smoke is a few translucent spheres.
import * as THREE from 'three';

const TRACER_POOL = 24;
const SPARK_POOL = 8;
const SPARKS_PER_BURST = 14;

export function createEffects(scene) {
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, left: 0 });
  }
  let tracerNext = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const positions = new Float32Array(SPARKS_PER_BURST * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, velocities: new Float32Array(SPARKS_PER_BURST * 3), left: 0 });
  }
  let sparkNext = 0;

  const smokes = [];
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, transparent: true, opacity: 0.42, roughness: 1, depthWrite: false });
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);

  const up = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();

  return {
    tracer(from, to) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_POOL;
      dir.subVectors(to, from);
      const len = dir.length();
      if (len < 0.1) return;
      t.mesh.position.copy(from).addScaledVector(dir, 0.5);
      t.mesh.scale.set(1, 1, len);
      t.mesh.lookAt(to.x, to.y, to.z);
      t.mesh.visible = true;
      t.mesh.material.opacity = 0.9;
      t.left = 0.07;
    },
    sparksAt(point, normal) {
      const s = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_POOL;
      const pos = s.points.geometry.attributes.position;
      for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
        pos.setXYZ(i, point.x, point.y, point.z);
        const vx = (Math.random() - 0.5) * 4 + normal.x * 2;
        const vy = Math.random() * 3 + 1 + normal.y * 2;
        const vz = (Math.random() - 0.5) * 4 + normal.z * 2;
        s.velocities[i * 3] = vx;
        s.velocities[i * 3 + 1] = vy;
        s.velocities[i * 3 + 2] = vz;
      }
      pos.needsUpdate = true;
      s.points.visible = true;
      s.points.material.opacity = 0.95;
      s.left = 0.4;
    },
    smokeAt(point) {
      const group = new THREE.Group();
      for (let i = 0; i < 7; i += 1) {
        const sphere = new THREE.Mesh(smokeGeo, smokeMat.clone());
        const r = 1.6 + Math.random() * 1.4;
        sphere.scale.setScalar(r);
        sphere.position.set((Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 3);
        group.add(sphere);
      }
      group.position.copy(point);
      scene.add(group);
      smokes.push({ group, left: 12 });
      return group;
    },
    // is a point inside any live smoke cloud (blocks sight)?
    inSmoke(point) {
      for (const s of smokes) {
        if (s.left <= 0) continue;
        const dx = point.x - s.group.position.x;
        const dz = point.z - s.group.position.z;
        if (dx * dx + dz * dz < 7.3 && point.y < 4) return true;
      }
      return false;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.left <= 0) continue;
        t.left -= dt;
        t.mesh.material.opacity = Math.max(0, t.left / 0.07) * 0.9;
        if (t.left <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.left <= 0) continue;
        s.left -= dt;
        const pos = s.points.geometry.attributes.position;
        for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
          pos.setXYZ(i,
            pos.getX(i) + s.velocities[i * 3] * dt,
            Math.max(0.02, pos.getY(i) + s.velocities[i * 3 + 1] * dt),
            pos.getZ(i) + s.velocities[i * 3 + 2] * dt);
          s.velocities[i * 3 + 1] -= 12 * dt;
        }
        pos.needsUpdate = true;
        s.points.material.opacity = Math.max(0, s.left / 0.4) * 0.95;
        if (s.left <= 0) s.points.visible = false;
      }
      for (let i = smokes.length - 1; i >= 0; i -= 1) {
        const s = smokes[i];
        s.left -= dt;
        const fade = Math.min(1, s.left / 2);
        for (const sphere of s.group.children) sphere.material.opacity = 0.42 * fade;
        if (s.left <= 0) {
          scene.remove(s.group);
          smokes.splice(i, 1);
        }
      }
    },
  };
}
