// Bot AI: nine soldiers (four Vanguard allies, five Ember attackers) that walk
// the waypoint graph, hold sites, push lanes, plant and defuse, and shoot
// back. Perception is a real line-of-sight test against the world's colliders;
// shots are aimed with distance-based error, so stopping to aim pays for the
// bots exactly as it does for the player. One Ember bot carries the charge.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findPath, clamp } from './util.js';
import { WEAPONS } from './weapons.js';

const ALLY_NAMES = ['HAVOC', 'SABLE', 'JUNO', 'ORACLE'];
const FOE_NAMES = ['WRAITH', 'FALCON', 'GHOST', 'VIPER', 'NOMAD'];
const EYE = 1.5;
const CHEST = 1.1;
const BOT_RADIUS = 0.36;

function soldierMesh(team) {
  const group = new THREE.Group();
  const trim = new THREE.Color(team === 'vanguard' ? PALETTE.ally : PALETTE.foe);
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.75, metalness: 0.1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, metalness: 0.2 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.3 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), cloth);
  legL.position.set(-0.11, 0.26, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), dark);
  torso.position.y = 0.85;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06), trimMat);
  plate.position.set(0, 0.88, -0.16);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), helmetMat);
  head.position.y = 1.36;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), trimMat);
  visor.position.set(0, 1.36, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), dark);
  gun.position.set(0.16, 1.05, -0.3);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.46, 24),
    new THREE.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(legL, legR, torso, plate, head, visor, gun, ring);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group, legL, legR, torso, head };
}

export function createBots(scene, world, rng, hooks) {
  const bots = [];
  const hitMeshes = [];
  const tmpV = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  let simTime = 0;

  function makeBot(name, team, spawn, weaponId, role) {
    const parts = soldierMesh(team);
    parts.group.position.copy(spawn);
    scene.add(parts.group);
    const bot = {
      id: bots.length,
      name,
      team,
      role,
      weapon: WEAPONS[weaponId],
      group: parts.group,
      legs: [parts.legL, parts.legR],
      torsoMesh: parts.torso,
      headMesh: parts.head,
      position: parts.group.position,
      yaw: team === 'ember' ? Math.PI : 0,
      health: 100,
      alive: true,
      state: 'hold',
      path: [],
      pathIdx: 0,
      targetNode: -1,
      holdNode: -1,
      speed: 0,
      walkPhase: 0,
      perceiveAt: rng() * 0.12,
      seenEnemy: null,
      seenPos: new THREE.Vector3(),
      seenAt: -10,
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      channel: 0,
      channelKind: null,
      strafeDir: 1,
      strafeAt: 0,
      stuckAt: 0,
      stuckPos: new THREE.Vector3(),
      investigate: null,
      lastDamageAt: -10,
      lastDamageFrom: new THREE.Vector3(),
    };
    parts.torso.userData = { bot, part: 'torso' };
    parts.head.userData = { bot, part: 'head' };
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  function spawnAll(roundSite) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    hitMeshes.length = 0;
    const vSpawns = world.spawns.vanguard;
    const eSpawns = world.spawns.ember;
    ALLY_NAMES.forEach((name, i) => {
      const bot = makeBot(name, 'vanguard', vSpawns[i].clone(), i % 2 === 0 ? 'ar77' : 'vex9', 'defender');
      bot.holdNode = roundSite === 'A' ? [17, 28, 20, 13][i] : [20, 29, 17, 13][i];
    });
    FOE_NAMES.forEach((name, i) => {
      const bot = makeBot(name, 'ember', eSpawns[i].clone(), i % 2 === 0 ? 'ar77' : 'vex9', i === 0 ? 'carrier' : 'attacker');
      bot.targetSite = roundSite;
    });
  }

  function nearestNode(bot) {
    return world.nearestWaypoint(bot.position.x, bot.position.z);
  }

  function setPath(bot, goalNode) {
    const start = nearestNode(bot);
    bot.path = findPath(world.waypoints, start, goalNode);
    bot.pathIdx = 0;
    bot.targetNode = goalNode;
  }

  function nodePos(idx, out) {
    const n = world.waypoints[idx];
    out.set(n.x, 0, n.z);
    return out;
  }

  // Perception: nearest visible enemy (player or opposing bot) within 30 m.
  function perceive(bot, time, ctx) {
    bot.perceiveAt = time + 0.12 + rng() * 0.06;
    let best = null;
    let bestD = 30;
    const eye = tmpV.set(bot.position.x, EYE, bot.position.z);
    // Facing: a bot only spots what is in front of it (60 deg half-angle),
    // unless it is very close or it was just shot by that enemy.
    const fwdX = -Math.sin(bot.yaw);
    const fwdZ = -Math.cos(bot.yaw);
    function inView(tx, tz, d) {
      if (d < 8) return true;
      const dx = (tx - bot.position.x) / d;
      const dz = (tz - bot.position.z) / d;
      return fwdX * dx + fwdZ * dz > 0.5;
    }
    if (ctx.playerAlive && bot.team !== 'vanguard') {
      const p = ctx.playerPos;
      const d = Math.hypot(p.x - bot.position.x, p.z - bot.position.z);
      // Focus fire cap: at most two bots engage the player from range, so a
      // lone player in the open is punished but not instantly deleted.
      let focusers = 0;
      for (const other of bots) {
        if (other !== bot && other.alive && other.team === bot.team && other.seenEnemy === 'player' && time - other.seenAt < 2) focusers += 1;
      }
      const capped = focusers >= 2 && d > 12;
      if (!capped && d < bestD && inView(p.x, p.z, d) && world.lineOfSight(eye.x, eye.y, eye.z, p.x, p.y + 1.1, p.z)) {
        best = { kind: 'player', d };
        bestD = d;
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const d = Math.hypot(other.position.x - bot.position.x, other.position.z - bot.position.z);
      if (d >= bestD) continue;
      if (!inView(other.position.x, other.position.z, d)) continue;
      if (world.lineOfSight(eye.x, eye.y, eye.z, other.position.x, CHEST, other.position.z)) {
        best = { kind: 'bot', bot: other, d };
        bestD = d;
      }
    }
    if (best) {
      if (bot.seenEnemy !== best.kind || (best.bot && bot.seenEnemyBot !== best.bot)) {
        bot.reaction = 0.5 + rng() * 0.6;
      }
      bot.seenEnemy = best.kind;
      bot.seenEnemyBot = best.bot ?? null;
      if (best.kind === 'player') bot.seenPos.copy(ctx.playerPos);
      else bot.seenPos.copy(best.bot.position);
      bot.seenPos.y = CHEST;
      bot.seenAt = time;
      bot.state = 'combat';
    } else if (time - bot.seenAt > 2.5) {
      bot.seenEnemy = null;
      bot.seenEnemyBot = null;
      if (bot.state === 'combat') bot.state = 'advance';
    }
    // Hearing: a recent wound reveals the shooter's position.
    if (time - bot.lastDamageAt < 2 && !best) {
      bot.seenPos.copy(bot.lastDamageFrom);
      bot.seenPos.y = CHEST;
      bot.seenAt = time;
    }
  }

  function aimError(bot, targetDist, targetSpeed) {
    let sigma = 0.035 + targetDist * 0.0022;
    if (targetSpeed > 3) sigma += 0.025;
    if (bot.speed > 0.5) sigma += 0.02;
    return sigma;
  }

  function fireAt(bot, targetPos, targetSpeed, time, ctx) {
    const def = bot.weapon;
    if (bot.burstTimer > 0) return;
    if (bot.burstLeft <= 0) {
      if (bot.pauseTimer > 0) return;
      bot.burstLeft = 3 + Math.floor(rng() * 2);
      bot.pauseTimer = 0.8 + rng() * 0.8;
    }
    bot.burstLeft -= 1;
    bot.burstTimer = def.fireGap;
    if (bot.burstLeft === 0) bot.pauseTimer = 0.8 + rng() * 0.8;

    const d = Math.hypot(targetPos.x - bot.position.x, targetPos.z - bot.position.z);
    const sigma = aimError(bot, d, targetSpeed);
    const miss = Math.abs((rng() + rng() + rng() - 1.5) / 1.5) * sigma * d * 2.2;
    const head = miss < 0.17;
    const hit = miss < 0.48;
    const muzzle = tmpDir.set(bot.position.x, 1.25, bot.position.z);
    const fwd = new THREE.Vector3(
      Math.sin(bot.yaw) * -1, 0, Math.cos(bot.yaw) * -1,
    );
    muzzle.addScaledVector(fwd, 0.55);
    const end = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    if (!hit) {
      end.x += (rng() - 0.5) * 2.4;
      end.y += (rng() - 0.5) * 1.2;
      end.z += (rng() - 0.5) * 2.4;
    }
    hooks.effects.tracer(muzzle, end);
    hooks.audio.enemyShot(d);
    if (!hit) return;
    const falloff = Math.max(0.5, 1 - d / 120);
    let dmg = Math.round(def.damage * (head ? def.headMul : 1) * falloff);
    if (bot.seenEnemy === 'player') dmg = Math.max(4, Math.round(dmg * 0.55));
    if (bot.seenEnemy === 'player') {
      hooks.damagePlayer(dmg, bot.name, head);
    } else if (bot.seenEnemyBot) {
      hooks.damageBot(bot.seenEnemyBot, dmg, head ? 'head' : 'torso', bot.name, def.name);
    }
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    const stepLen = Math.min(len, speed * dt);
    const ox = bot.position.x;
    const oz = bot.position.z;
    world.moveBody(bot.position, BOT_RADIUS, 1.7, (dx / len) * stepLen, (dz / len) * stepLen);
    bot.yaw = Math.atan2(-(dx / len), -(dz / len));
    bot.speed = Math.hypot(bot.position.x - ox, bot.position.z - oz) / Math.max(dt, 1e-4);
    bot.walkPhase += dt * bot.speed * 2.4;
    return len - stepLen < 0.6;
  }

  function updateBot(bot, dt, time, ctx) {
    if (!bot.alive) return;
    bot.burstTimer = Math.max(0, bot.burstTimer - dt);
    bot.pauseTimer = Math.max(0, bot.pauseTimer - dt);
    if (time >= bot.perceiveAt) perceive(bot, time, ctx);

    const bomb = ctx.bomb;
    const inSite = world.siteAt(bot.position.x, bot.position.z);

    // Channel logic: plant (Ember carrier) / defuse (Vanguard at planted site).
    let channeling = false;
    if (bot.team === 'ember' && bot.role === 'carrier' && bomb.status === 'idle' && inSite && inSite.id === bot.targetSite && !bot.seenEnemy) {
      bot.channel += dt;
      bot.channelKind = 'plant';
      channeling = true;
      if (bot.channel >= 3) {
        bot.channel = 0;
        bot.channelKind = null;
        hooks.onPlantComplete(inSite, bot.position);
      }
    } else if (bot.team === 'vanguard' && bomb.status === 'planted' && inSite && inSite.id === bomb.site.id && !bot.seenEnemy) {
      bot.channel += dt;
      bot.channelKind = 'defuse';
      channeling = true;
      if (bot.channel >= 5) {
        bot.channel = 0;
        bot.channelKind = null;
        hooks.onDefuseComplete();
      }
    } else {
      bot.channel = 0;
      bot.channelKind = null;
    }
    if (channeling) {
      bot.speed = 0;
      bot.group.rotation.y = bot.yaw;
      return;
    }

    // Combat: face the last seen enemy, strafe, and fire once reacted.
    if (bot.state === 'combat' && bot.seenEnemy) {
      const tp = bot.seenPos;
      const dx = tp.x - bot.position.x;
      const dz = tp.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.reaction -= dt;
      const d = Math.hypot(dx, dz);
      if (time >= bot.strafeAt) {
        bot.strafeAt = time + 0.7 + rng() * 0.9;
        bot.strafeDir = rng() < 0.5 ? -1 : 1;
      }
      if (d > 18) {
        moveToward(bot, tp.x, tp.z, dt, 3.4);
      } else if (d < 7) {
        moveToward(bot, bot.position.x - dx, bot.position.z - dz, dt, 2.4);
      } else {
        const px = -dz / (d || 1);
        const pz = dx / (d || 1);
        world.moveBody(bot.position, BOT_RADIUS, 1.7, px * bot.strafeDir * 2.2 * dt, pz * bot.strafeDir * 2.2 * dt);
        bot.speed = 2.2;
      }
      if (bot.reaction <= 0) {
        const targetSpeed = bot.seenEnemy === 'player' ? ctx.playerSpeed : 3;
        fireAt(bot, tp, targetSpeed, time, ctx);
      }
      bot.group.rotation.y = bot.yaw;
      animateLegs(bot, dt);
      return;
    }

    // Orders by role.
    let goalNode = bot.targetNode;
    let hold = false;
    if (bot.team === 'ember') {
      if (bomb.status === 'planted') {
        goalNode = bomb.site.id === 'A' ? 17 : 20;
        hold = bot.position.distanceTo(nodePos(goalNode, tmpV)) < 4;
      } else if (bot.role === 'carrier') {
        goalNode = bot.targetSite === 'A' ? 17 : 20;
      } else {
        goalNode = bot.targetSite === 'A' ? [17, 28, 3][bot.id % 3] : [20, 29, 8][bot.id % 3];
      }
    } else {
      if (bomb.status === 'planted') {
        goalNode = bomb.site.id === 'A' ? 17 : 20;
      } else {
        goalNode = bot.holdNode;
        hold = bot.position.distanceTo(nodePos(goalNode, tmpV)) < 2.5;
      }
    }
    if (bot.investigate && time - bot.investigate.at < 6 && !bot.seenEnemy) {
      goalNode = world.nearestWaypoint(bot.investigate.x, bot.investigate.z);
      hold = false;
    }

    if (hold) {
      bot.speed = 0;
      bot.yaw += Math.sin(time * 0.4 + bot.id * 1.7) * 0.002;
      bot.group.rotation.y = bot.yaw;
      return;
    }
    if (goalNode !== bot.targetNode || bot.path.length === 0) setPath(bot, goalNode);
    const far = bot.path.length > 2 && !bot.seenEnemy;
    const speed = far ? 4.6 : 3.6;
    let arrived = false;
    if (bot.pathIdx < bot.path.length) {
      const node = nodePos(bot.path[bot.pathIdx], tmpV);
      arrived = moveToward(bot, node.x, node.z, dt, speed);
      if (arrived) bot.pathIdx += 1;
    }
    // Stuck: no progress for 1.5 s while a path remains -> skip a waypoint.
    if (time - bot.stuckAt > 1.5) {
      const moved = Math.hypot(bot.position.x - bot.stuckPos.x, bot.position.z - bot.stuckPos.z);
      if (moved < 0.25 && bot.pathIdx < bot.path.length) bot.pathIdx += 1;
      bot.stuckAt = time;
      bot.stuckPos.copy(bot.position);
    }
    bot.group.rotation.y = bot.yaw;
    animateLegs(bot, dt);
  }

  function animateLegs(bot, dt) {
    const swing = bot.speed > 0.5 ? Math.sin(bot.walkPhase) * 0.45 : 0;
    bot.legs[0].rotation.x = swing;
    bot.legs[1].rotation.x = -swing;
  }

  function update(dt, time, ctx) {
    simTime = time;
    for (const bot of bots) updateBot(bot, dt, time, ctx);
  }

  function damage(bot, amount, part, attackerName, weaponName) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.lastDamageAt = simTime;
    if (attackerName === 'MITECHO' && hooks.playerPos) {
      bot.lastDamageFrom.copy(hooks.playerPos);
    }
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    bot.group.rotation.x = -Math.PI / 2 * 0.92;
    bot.group.position.y = 0.25;
    return true;
  }

  function reset(roundSite) {
    spawnAll(roundSite);
    for (const bot of bots) {
      bot.group.rotation.x = 0;
      bot.group.position.y = 0;
      bot.health = 100;
      bot.alive = true;
      bot.state = 'advance';
      bot.path = [];
      bot.pathIdx = 0;
      bot.channel = 0;
      bot.channelKind = null;
      bot.seenEnemy = null;
      bot.seenAt = -10;
      bot.investigate = null;
      bot.stuckAt = 0;
      bot.stuckPos.copy(bot.position);
      const goal = bot.team === 'ember'
        ? bot.targetSite === 'A' ? 17 : 20
        : bot.holdNode;
      setPath(bot, goal);
    }
  }

  function hearShot(pos, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
      if (d < 26) bot.investigate = { x: pos.x, z: pos.z, at: simTime };
    }
  }

  return {
    bots,
    hitMeshes,
    update,
    damage,
    reset,
    hearShot,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return bots.find((b) => b.role === 'carrier');
    },
  };
}
