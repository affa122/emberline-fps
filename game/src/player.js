// Movement: acceleration, friction, gravity, crouch, walk and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows
// anyone. The mover is shared by the player and the bots.
import * as THREE from 'three';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.6;
export const CROUCH_EYE = 1.02;
export const WALK_SPEED = 5.4;
export const CROUCH_SPEED = 2.4;
export const SNEAK_SPEED = 2.8;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // Move an actor (position/velocity Vector3s, height, onGround flag on the object).
  // wishX/wishZ is the desired horizontal direction (already normalised), speed the
  // target speed. Returns the object, with position/velocity/onGround updated.
  function move(actor, dt, wishX, wishZ, speed) {
    const blend = Math.min(1, (actor.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / Math.max(1, speed));
    actor.velocity.x += (wishX * speed - actor.velocity.x) * blend;
    actor.velocity.z += (wishZ * speed - actor.velocity.z) * blend;
    if (actor.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      actor.velocity.x *= damp;
      actor.velocity.z *= damp;
    }
    actor.velocity.y -= GRAVITY * dt;
    const height = actor.height;
    const nextX = actor.position.x + actor.velocity.x * dt;
    if (!overlaps(nextX, actor.position.y, actor.position.z, height, 0.04)) actor.position.x = nextX;
    else actor.velocity.x = 0;
    const nextZ = actor.position.z + actor.velocity.z * dt;
    if (!overlaps(actor.position.x, actor.position.y, nextZ, height, 0.04)) actor.position.z = nextZ;
    else actor.velocity.z = 0;
    actor.position.y += actor.velocity.y * dt;
    actor.onGround = false;
    const hit = overlaps(actor.position.x, actor.position.y, actor.position.z, height, 0);
    if (hit && actor.velocity.y <= 0) {
      actor.position.y = hit.max.y;
      actor.velocity.y = 0;
      actor.onGround = true;
    } else if (hit) {
      actor.position.y = hit.min.y - height;
      actor.velocity.y = 0;
    }
    if (actor.position.y < 0) {
      actor.position.y = 0;
      actor.velocity.y = 0;
      actor.onGround = true;
    }
    actor.velocity.y = Math.max(-30, actor.velocity.y);
    return actor;
  }

  return { move, overlaps };
}

export function createPlayer(mover) {
  const body = {
    position: new THREE.Vector3(0, 0, 14.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    onGround: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && !mover.overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const sneaking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = body.crouching ? CROUCH_SPEED : sneaking ? SNEAK_SPEED : WALK_SPEED;
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    mover.move(body, dt, wish.x, wish.z, speed);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
