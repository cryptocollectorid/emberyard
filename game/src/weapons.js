// Weapons: three tiers plus a frag grenade. The defs own the numbers; game.js
// owns the ray and the damage. Each weapon has its own low-poly view model
// parented to the camera, with its own silhouette and muzzle offset, so the
// buy menu choice is visible in first person. Grenades are real projectiles:
// gravity, one bounce, a timed fuse, and a blast the game resolves.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 SIDEARM', price: 0, damage: 26, headMul: 4,
    mag: 12, reserve: 48, fireGap: 0.17, auto: false, reload: 1.3,
    spreadStill: 0.004, spreadMove: 0.03, range: 60, kick: 0.011, tracer: 0.05,
  },
  vex9: {
    id: 'vex9', name: 'VEX-9 SMG', price: 1500, damage: 22, headMul: 3.5,
    mag: 28, reserve: 112, fireGap: 0.085, auto: true, reload: 2.0,
    spreadStill: 0.007, spreadMove: 0.034, range: 55, kick: 0.008, tracer: 0.045,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 RIFLE', price: 2700, damage: 34, headMul: 4,
    mag: 25, reserve: 100, fireGap: 0.115, auto: true, reload: 2.4,
    spreadStill: 0.0025, spreadMove: 0.028, range: 80, kick: 0.014, tracer: 0.06,
  },
};

export const GRENADE = { id: 'grenade', name: 'FRAG GRENADE', price: 300, maxCarry: 2 };

const BODY = 0x2e3238;
const GRIP = 0x17191d;
const STEEL = 0x8f979e;

function buildPistol() {
  const g = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.5, metalness: 0.4 });
  const mGrip = new THREE.MeshStandardMaterial({ color: GRIP, roughness: 0.8, metalness: 0.1 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), mBody);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), mGrip);
  grip.position.set(0, -0.07, 0.08);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.02), mGrip);
  sight.position.set(0, 0.035, -0.1);
  g.add(slide, grip, sight);
  return { group: g, muzzle: new THREE.Vector3(0, 0.01, -0.16) };
}

function buildSmg() {
  const g = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.5, metalness: 0.4 });
  const mGrip = new THREE.MeshStandardMaterial({ color: GRIP, roughness: 0.8, metalness: 0.1 });
  const mSteel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.35, metalness: 0.6 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.3), mBody);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), mSteel);
  barrel.position.set(0, 0.02, -0.26);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.06), mGrip);
  mag.position.set(0, -0.11, -0.02);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), mGrip);
  stock.position.set(0, -0.01, 0.22);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.05), mSteel);
  sight.position.set(0, 0.055, -0.05);
  g.add(receiver, barrel, mag, stock, sight);
  return { group: g, muzzle: new THREE.Vector3(0, 0.02, -0.42) };
}

function buildRifle() {
  const g = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.5, metalness: 0.4 });
  const mGrip = new THREE.MeshStandardMaterial({ color: GRIP, roughness: 0.8, metalness: 0.1 });
  const mSteel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.35, metalness: 0.6 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42), mBody);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), mSteel);
  barrel.position.set(0, 0.025, -0.4);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), mGrip);
  handguard.position.set(0, 0.01, -0.28);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.2), mGrip);
  stock.position.set(0, -0.02, 0.3);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), mBody);
  mag.position.set(0, -0.11, 0.02);
  const magAngle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), mBody);
  magAngle.position.set(0, -0.16, 0.05);
  magAngle.rotation.x = 0.25;
  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.14), mSteel);
  scope.position.set(0, 0.075, -0.08);
  g.add(receiver, barrel, handguard, stock, mag, magAngle, scope);
  return { group: g, muzzle: new THREE.Vector3(0, 0.025, -0.62) };
}

const BUILDERS = { p9: buildPistol, vex9: buildSmg, ar77: buildRifle };

export function createWeapons(camera) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    const built = BUILDERS[id]();
    built.group.position.set(0.24, -0.2, -0.42);
    built.group.visible = false;
    camera.add(built.group);
    models[id] = built;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(flashLight);

  const state = {
    current: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bob: 0,
  };
  models.p9.group.visible = true;

  const muzzleWorld = new THREE.Vector3();

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current].group;
    state.bob += dt * (moving ? 11 : 0);
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 + (moving ? Math.sin(state.bob) * 0.006 : 0);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    if (state.flash > 0) {
      const m = models[state.current].muzzle;
      flash.position.set(0.24 + m.x, -0.2 + m.y + 0.02, -0.42 + m.z - 0.05);
      flash.rotation.z = state.flash * 28;
      flashLight.position.copy(flash.position);
      flashLight.intensity = 14;
    } else {
      flashLight.intensity = 0;
    }
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = WEAPONS[state.current];
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return WEAPONS[state.current]; },
    switchTo(id) {
      if (!WEAPONS[id] || id === state.current) return false;
      models[state.current].group.visible = false;
      state.current = id;
      const def = WEAPONS[id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      models[id].group.visible = true;
      return true;
    },
    equipOwned(id, mag, reserve) {
      models[state.current].group.visible = false;
      state.current = id;
      state.mag = mag;
      state.reserve = reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      models[id].group.visible = true;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.current].fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.current];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[state.current];
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMove;
    },
    refill() {
      const def = WEAPONS[state.current];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      const m = models[state.current].muzzle;
      muzzleWorld.set(0.24 + m.x, -0.2 + m.y, -0.42 + m.z);
      camera.localToWorld(muzzleWorld);
      out.copy(muzzleWorld);
      return out;
    },
  };
}

// A thrown frag: gravity, one damped bounce, a 1.6 s fuse after the first
// impact, and a blast the game resolves through onBlast.
export function createGrenades(scene, world, effects, audio) {
  const active = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a5a2e, roughness: 0.6, metalness: 0.3 });
  const tmp = new THREE.Vector3();

  function throwGrenade(from, dir, speed, onBlast) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    const vel = dir.clone().multiplyScalar(speed);
    vel.y += 2.2;
    active.push({ mesh, vel, fuse: 2.4, bounced: false, onBlast });
    audio.grenadePin();
  }

  function step(dt) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const g = active[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const p = g.mesh.position;
      const nx = p.x + g.vel.x * dt;
      const nz = p.z + g.vel.z * dt;
      const ny = p.y + g.vel.y * dt;
      if (!world.overlaps(nx, p.z, 0.1, 1)) p.x = nx;
      else { g.vel.x *= -0.35; g.bounced = true; }
      if (!world.overlaps(p.x, nz, 0.1, 1)) p.z = nz;
      else { g.vel.z *= -0.35; g.bounced = true; }
      if (ny <= 0.09) {
        p.y = 0.09;
        if (Math.abs(g.vel.y) > 1.5) { g.vel.y = Math.abs(g.vel.y) * 0.35; g.bounced = true; }
        else g.vel.y = 0;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      } else {
        p.y = ny;
      }
      if (g.bounced && g.fuse > 1.6) g.fuse = 1.6;
      g.mesh.rotation.x += dt * 6;
      g.mesh.rotation.z += dt * 4;
      if (g.fuse <= 0) {
        tmp.copy(p);
        scene.remove(g.mesh);
        active.splice(i, 1);
        effects.explosion(tmp);
        audio.explosion();
        g.onBlast(tmp);
      }
    }
  }

  return { throwGrenade, step, clear() { for (const g of active) scene.remove(g.mesh); active.length = 0; } };
}
