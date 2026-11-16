// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|plant|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady. window.__ember is a small test handle the maker
// uses to play-test rounds headlessly (snapshot, fixed steps, teleport, buy).
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { PALETTE } from './palette.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, createGrenades } from './weapons.js';
import { createEffects } from './effects.js';
import { createBots } from './bots.js';
import { createObjective } from './objective.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = shot ? mulberry32(seed) : mulberry32((Date.now() % 2147483647) || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const objective = createObjective(scene, audio);
const player = createPlayer(world);
const weapons = createWeapons(camera);
const grenades = createGrenades(scene, world, effects, audio);
const botHooks = {};
const bots = createBots(scene, world, random, botHooks);
const hud = createHud({
  onPlay: () => {
    audio.unlock();
    const phase = game.state.phase;
    if (phase === 'menu' || phase === 'matchEnd') {
      game.startMatch();
    } else if (game.state.paused) {
      game.state.paused = false;
      hud.hideOverlay();
      input.requestLock();
    } else if (phase === 'live') {
      input.requestLock();
    }
  },
  onBuy: (id) => game.buy(id),
  onCloseBuy: () => {
    hud.showBuy(false, game.state.money, game.state.owned);
    if (game.state.phase === 'buy') game.beginLive();
  },
});
const input = createInput(renderer.domElement, onLockChange);
const game = createGame({
  scene, camera, world, player, weapons, grenades, bots, objective, effects, hud, input, audio, rng: random,
});
Object.assign(botHooks, game.botHooks);

function onLockChange(locked) {
  const hint = document.getElementById('lock-hint');
  if (shot) return;
  if (locked) {
    game.state.paused = false;
    hud.hideOverlay();
    hint.hidden = true;
  } else if (game.state.phase === 'live' && player.state.alive) {
    game.state.paused = true;
    hud.showOverlay('paused');
  } else if (game.state.phase === 'live') {
    hint.hidden = false;
  }
}

renderer.domElement.addEventListener('click', () => {
  if (!shot && game.state.phase === 'live' && !input.state.locked) input.requestLock();
});

bots.reset('A');
player.reset(0, 14, Math.PI);
game.syncCamera();
hud.setHealth(100);
hud.setAmmo(weapons.state.mag, weapons.state.reserve);
hud.setMoney(800);
hud.setScore(0, 0);
hud.setRound(1, 9);

let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      game.step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) game.step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  game.syncCamera();
}

function nearestFoe() {
  let best = null;
  let bestD = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== 'ember') continue;
    const d = Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z);
    if (d < bestD) { bestD = d; best = bot; }
  }
  return best;
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    game.syncCamera();
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
  game.state.shotMode = true;
  hud.hideOverlay();
  if (name === 'start') {
    bots.reset('A');
    player.reset(0, 10, 0);
    game.syncCamera();
    hud.drawMinimap(world, player.state, bots.bots, new Set(), objective.state, 0);
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  game.startMatch();
  game.state.money = 5000;
  game.buy('ar77');
  game.buy('grenade');
  game.beginLive();
  if (name === 'play') {
    settle(90);
    player.reset(0, 2, 0);
    game.syncCamera();
    settle(10);
    const foe = nearestFoe();
    if (foe) {
      aimAt(new THREE.Vector3(foe.position.x, 1.1, foe.position.z));
      for (let i = 0; i < 3; i += 1) {
        game.shoot(0);
        settle(8);
      }
    }
    settle(12);
    paintTwiceThenReady();
    return;
  }
  if (name === 'plant') {
    const site = world.sites[0];
    game.onPlantComplete(site, new THREE.Vector3(site.center.x, 0, site.center.z));
    player.reset(-16, -8, 0);
    game.syncCamera();
    settle(60);
    aimAt(new THREE.Vector3(site.center.x, 1.0, site.center.z));
    paintTwiceThenReady();
    return;
  }
  if (name === 'end') {
    for (const bot of [...bots.bots]) {
      if (bot.alive && bot.team === 'ember') game.damageBot(bot, 999, 'torso', 'MITECHO', 'AR-77 RIFLE');
    }
    settle(30);
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Headless play-test handle: snapshot, fixed steps, teleport, buy, keys.
window.__ember = {
  snapshot: () => game.snapshot(),
  step(n) {
    for (let i = 0; i < n; i += 1) game.step(FIXED_STEP);
    return game.snapshot();
  },
  teleport(x, z, yaw = 0) {
    player.state.position.set(x, 0, z);
    player.state.yaw = yaw;
    player.state.pitch = 0;
    game.syncCamera();
    return game.snapshot();
  },
  aimAt(x, y, z) {
    aimAt(new THREE.Vector3(x, y, z));
    return game.snapshot();
  },
  plant(siteId) {
    const site = world.sites.find((s) => s.id === siteId) ?? world.sites[0];
    game.onPlantComplete(site, new THREE.Vector3(site.center.x, 0, site.center.z));
    return game.snapshot();
  },
  buy(id) { return game.buy(id); },
  startMatch() { game.startMatch(); return game.snapshot(); },
  beginLive() { game.beginLive(); return game.snapshot(); },
  holdKey(code, on) {
    if (on) input.state.keys.add(code);
    else input.state.keys.delete(code);
  },
  pressKey(code) { input.press(code); },
  setFiring(on) { input.state.firing = on; },
  shoot(spread = 0) { return game.shoot(spread); },
};

if (shot) runShot(shot);
else if (!params.get('test')) requestAnimationFrame(frame);
