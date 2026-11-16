// The match: phases, rounds, economy, shooting, the objective and the score.
// One place owns the state; the modules own their own behaviour. A fixed
// 60 Hz step drives it, rendering never does.
import * as THREE from 'three';
import { WEAPONS, GRENADE } from './weapons.js';
import { clamp } from './util.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const ROUND_END_SECONDS = 5;
const WIN_TARGET = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const KILL_REWARD = 300;
const WIN_REWARD = 325;
const LOSS_REWARD = 1400;
const DEFUSE_REWARD = 300;
const PLAYER_NAME = 'MITECHO';

export function createGame(deps) {
  const { scene, camera, world, player, weapons, grenades, bots, objective, effects, hud, input, audio, rng } = deps;
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const endPoint = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    paused: false,
    shotMode: false,
    round: 1,
    score: { vanguard: 0, ember: 0 },
    money: START_MONEY,
    owned: new Set(['p9']),
    ammoState: {},
    grenades: 0,
    kills: 0,
    deaths: 0,
    timer: 0,
    roundSite: 'A',
    defuseProgress: 0,
    defuseBeepAt: 0,
    time: 0,
    spectateBot: null,
    matchWinner: null,
    roundEnded: false,
  };

  for (const id of Object.keys(WEAPONS)) {
    state.ammoState[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }

  const shootables = () => world.shootables.concat(bots.hitMeshes);
  const playerState = player.state;

  // --- economy -------------------------------------------------------------
  function saveAmmo() {
    const id = weapons.state.current;
    state.ammoState[id] = { mag: weapons.state.mag, reserve: weapons.state.reserve };
  }

  function switchWeapon(id) {
    if (!state.owned.has(id) || id === weapons.state.current) return false;
    saveAmmo();
    const a = state.ammoState[id];
    weapons.equipOwned(id, a.mag, a.reserve);
    hud.setWeapon(WEAPONS[id].name);
    hud.setAmmo(a.mag, a.reserve);
    return true;
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === GRENADE.id) {
      if (state.grenades >= GRENADE.maxCarry) { audio.denied(); return false; }
      if (state.money < GRENADE.price) { audio.denied(); return false; }
      state.money -= GRENADE.price;
      state.grenades += 1;
      hud.setMoney(state.money);
      audio.buy();
      return true;
    }
    const def = WEAPONS[id];
    if (!def) return false;
    if (state.owned.has(id)) {
      switchWeapon(id);
      audio.click();
      return true;
    }
    if (state.money < def.price) { audio.denied(); return false; }
    state.money -= def.price;
    state.owned.add(id);
    state.ammoState[id] = { mag: def.mag, reserve: def.reserve };
    switchWeapon(id);
    hud.setMoney(state.money);
    hud.showBuy(true, state.money, state.owned);
    audio.buy();
    return true;
  }

  // --- rounds ---------------------------------------------------------------
  function startMatch() {
    state.score = { vanguard: 0, ember: 0 };
    state.round = 1;
    state.money = START_MONEY;
    state.owned = new Set(['p9']);
    state.grenades = 0;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    startRound();
  }

  function startRound() {
    state.roundSite = rng() < 0.5 ? 'A' : 'B';
    state.defuseProgress = 0;
    state.roundEnded = false;
    state.spectateBot = null;
    const spawn = world.spawns.vanguard[4];
    player.reset(spawn.x, spawn.z, 0);
    bots.reset(state.roundSite);
    objective.reset();
    grenades.clear();
    for (const id of state.owned) {
      state.ammoState[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    const cur = state.owned.has(weapons.state.current) ? weapons.state.current : 'p9';
    const a = state.ammoState[cur];
    weapons.equipOwned(cur, a.mag, a.reserve);
    hud.setWeapon(WEAPONS[cur].name);
    hud.setHealth(100);
    hud.setAmmo(a.mag, a.reserve);
    hud.setMoney(state.money);
    hud.setScore(state.score.vanguard, state.score.ember);
    hud.setRound(state.round, MAX_ROUNDS);
    hud.setDead(false);
    hud.setBombTimer(null);
    hud.setPlant(0, null);
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    hud.showBuy(true, state.money, state.owned);
    hud.banner(`ROUND ${state.round}`, `Defend Silo and Crane — Ember pushes Site ${state.roundSite} first`, 2600);
    syncCamera();
  }

  function beginLive() {
    if (state.phase !== 'buy') return;
    state.phase = 'live';
    state.timer = ROUND_SECONDS;
    hud.showBuy(false, state.money, state.owned);
    hud.hideOverlay();
    hud.banner('DEFEND THE SITES', 'Hold Silo and Crane. Stop the plant.', 1800);
    input.requestLock();
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live' || state.roundEnded) return;
    state.roundEnded = true;
    state.score[winner] += 1;
    const playerWon = winner === 'vanguard';
    state.money += playerWon ? WIN_REWARD : LOSS_REWARD;
    hud.setMoney(state.money);
    hud.setScore(state.score.vanguard, state.score.ember);
    hud.setBombTimer(null);
    hud.setPlant(0, null);
    if (document.pointerLockElement) document.exitPointerLock();
    state.phase = 'roundEnd';
    state.timer = ROUND_END_SECONDS;
    const scoreLine = `Vanguard ${state.score.vanguard} — ${state.score.ember} Ember`;
    if (playerWon) {
      hud.banner('ROUND WON', `${reason} · ${scoreLine}`, 4200);
      audio.roundWin();
    } else {
      hud.banner('ROUND LOST', `${reason} · ${scoreLine}`, 4200);
      audio.roundLose();
    }
  }

  function endMatch() {
    const v = state.score.vanguard;
    const e = state.score.ember;
    state.matchWinner = v === e ? 'draw' : v > e ? 'vanguard' : 'ember';
    state.phase = 'matchEnd';
    const text = state.matchWinner === 'draw'
      ? `A draw, ${v} — ${e}. Neither side takes Rustyard.`
      : state.matchWinner === 'vanguard'
        ? `Vanguard takes Rustyard, ${v} — ${e}. The sites held.`
        : `Ember takes Rustyard, ${e} — ${v}. The charge did its work.`;
    hud.showPanel(state.matchWinner === 'vanguard' ? 'VICTORY' : state.matchWinner === 'draw' ? 'DRAW' : 'DEFEAT', `${text} Kills ${state.kills} · Deaths ${state.deaths}.`, 'PLAY AGAIN');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // --- combat -----------------------------------------------------------------
  function shoot(spreadOverride = null) {
    if (state.phase !== 'live' || !playerState.alive) return false;
    if (!weapons.takeRound()) {
      audio.dryFire();
      return false;
    }
    const def = weapons.def();
    camera.getWorldDirection(direction);
    const spread = spreadOverride === null ? weapons.spread(player.groundSpeed()) : spreadOverride;
    direction.x += (rng() * 2 - 1) * spread;
    direction.y += (rng() * 2 - 1) * spread;
    direction.z += (rng() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(shootables(), false);
    const hit = hits[0] ?? null;
    weapons.muzzleWorld(muzzle);
    if (hit) {
      endPoint.copy(hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part;
        const dmg = Math.round(def.damage * (part === 'head' ? def.headMul : 1));
        effects.hitPuff(hit.point);
        damageBot(bot, dmg, part, PLAYER_NAME, def.name);
      } else {
        effects.impact(hit.point, hit.face ? hit.face.normal : tmpV.set(0, 1, 0));
      }
    } else {
      endPoint.copy(camera.position).addScaledVector(direction, def.range);
    }
    effects.tracer(muzzle, endPoint);
    weapons.pullTrigger();
    player.recoil(def.kick + rng() * 0.004, (rng() * 2 - 1) * 0.004);
    audio.shot(def.id);
    bots.hearShot(playerState.position, 'vanguard');
    hud.setAmmo(weapons.state.mag, weapons.state.reserve);
    return true;
  }

  function damageBot(bot, amount, part, attackerName, weaponName) {
    if (!bot.alive) return;
    const killed = bots.damage(bot, amount, part, attackerName, weaponName);
    if (!killed) {
      if (attackerName === PLAYER_NAME) {
        audio.hit();
        hud.hitMarker(false, state.shotMode ? 4000 : 120);
      }
      return;
    }
    hud.killfeed(attackerName, bot.name, weaponName, part === 'head');
    if (attackerName === PLAYER_NAME) {
      state.kills += 1;
      state.money += KILL_REWARD;
      hud.setMoney(state.money);
      audio.kill();
    }
    hud.hitMarker(true, state.shotMode ? 4000 : 120);
  }

  function damagePlayer(amount, attackerName, head) {
    if (state.phase !== 'live' || !playerState.alive) return;
    playerState.health -= amount;
    hud.setHealth(playerState.health);
    hud.damageFlash();
    audio.hurt();
    if (playerState.health > 0) return;
    playerState.health = 0;
    playerState.alive = false;
    state.deaths += 1;
    hud.killfeed(attackerName, PLAYER_NAME, head ? 'HEADSHOT' : 'AR-77 RIFLE', head);
    hud.setDead(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function blastDamage(pos, radius, maxDmg, attackerName, weaponName) {
    const hurt = (targetPos, hp, apply) => {
      const d = Math.hypot(targetPos.x - pos.x, targetPos.z - pos.z);
      if (d > radius) return;
      const dmg = Math.round(maxDmg * (1 - d / radius) + 10);
      apply(dmg);
    };
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      hurt(bot.position, bot.health, (dmg) => {
        const killed = bots.damage(bot, dmg, 'torso', attackerName, weaponName);
        if (killed) {
          hud.killfeed(attackerName, bot.name, weaponName, false);
          if (attackerName === PLAYER_NAME) { state.kills += 1; state.money += KILL_REWARD; hud.setMoney(state.money); }
        }
      });
    }
    if (playerState.alive) {
      hurt(playerState.position, playerState.health, (dmg) => damagePlayer(Math.round(dmg * 0.5), attackerName, false));
    }
  }

  // --- objective ---------------------------------------------------------------
  function onPlantComplete(site, pos) {
    objective.plantAt(site, pos);
    hud.banner('CHARGE PLANTED', `Ember planted at Site ${site.id}. Defuse it.`, 3000);
    audio.plantBeep();
  }

  function onDefuseComplete() {
    objective.defuse();
    endRound('vanguard', 'CHARGE DEFUSED');
  }

  function onExplode(pos) {
    effects.explosion(pos);
    audio.explosion();
    blastDamage(pos, 9, 120, 'CHARGE', 'CHARGE');
    endRound('ember', 'CHARGE DETONATED');
  }

  // --- camera ------------------------------------------------------------------
  function syncCamera() {
    camera.position.set(playerState.position.x, playerState.position.y + playerState.eye, playerState.position.z);
    camera.rotation.set(playerState.pitch, playerState.yaw, 0, 'YXZ');
  }

  function spectateCamera() {
    if (!state.spectateBot || !state.spectateBot.alive) {
      state.spectateBot = bots.bots.find((b) => b.alive && b.team === 'vanguard') ?? null;
      if (!state.spectateBot) return false;
    }
    const b = state.spectateBot;
    const backX = Math.sin(b.yaw) * 3.2;
    const backZ = Math.cos(b.yaw) * 3.2;
    camera.position.set(b.position.x + backX, 2.6, b.position.z + backZ);
    camera.lookAt(b.position.x, 1.2, b.position.z);
    return true;
  }

  // --- per-frame ----------------------------------------------------------------
  function step(dt) {
    state.time += dt;
    effects.step(dt);
    grenades.step(dt);

    if (state.phase === 'menu' || state.paused) return;
    if (state.phase === 'matchEnd') return;

    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) beginLive();
    } else if (state.phase === 'live') {
      state.timer -= dt;
      const look = input.takeLook();
      player.look(look.x, look.y);
      if (playerState.alive) player.step(dt, input.state.keys);
      weapons.step(dt, player.groundSpeed());
      if (input.state.firing && weapons.ready()) shoot();
      if (input.wasPressed('KeyR')) weapons.reload();
      if (input.wasPressed('KeyG') && state.grenades > 0 && playerState.alive) {
        camera.getWorldDirection(direction);
        const from = tmpV.copy(camera.position).addScaledVector(direction, 0.5);
        from.y -= 0.1;
        grenades.throwGrenade(from, direction, 11, (pos) => blastDamage(pos, 6, 90, PLAYER_NAME, 'FRAG'));
        state.grenades -= 1;
      }
      if (input.wasPressed('Digit1')) switchWeapon('p9');
      if (input.wasPressed('Digit2')) switchWeapon('vex9');
      if (input.wasPressed('Digit3')) switchWeapon('ar77');
      // Player defuse: hold E inside the planted site.
      const bomb = objective.state;
      if (bomb.status === 'planted' && playerState.alive) {
        const site = world.siteAt(playerState.position.x, playerState.position.z);
        if (site && site.id === bomb.site.id && input.state.keys.has('KeyE')) {
          state.defuseProgress += dt / objective.defuseSeconds;
          hud.setPlant(clamp(state.defuseProgress, 0, 1), 'DEFUSING CHARGE');
          if (state.time >= state.defuseBeepAt) {
            state.defuseBeepAt = state.time + 1;
            audio.defuseBeep();
          }
          if (state.defuseProgress >= 1) {
            state.defuseProgress = 0;
            state.money += DEFUSE_REWARD;
            hud.setMoney(state.money);
            objective.defuse();
            endRound('vanguard', 'CHARGE DEFUSED');
          }
        } else {
          state.defuseProgress = 0;
          hud.setPlant(0, null);
        }
      }
      // Bots act.
      bots.update(dt, state.time, {
        playerAlive: playerState.alive,
        playerPos: playerState.position,
        playerSpeed: player.groundSpeed(),
        bomb: objective.state,
      });
      objective.step(dt, state.time, onExplode);
      // Round end checks.
      if (bots.aliveCount('ember') === 0) endRound('vanguard', 'EMBER ELIMINATED');
      else if (bots.aliveCount('vanguard') === 0 && !playerState.alive) endRound('ember', 'VANGUARD ELIMINATED');
      else if (objective.state.status === 'exploded') { /* onExplode already ended it */ }
      else if (state.timer <= 0 && objective.state.status !== 'planted') endRound('vanguard', 'TIME — SITES HELD');
      else if (state.timer <= 0 && objective.state.status === 'planted') state.timer = 0;
    } else if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.score.vanguard >= WIN_TARGET || state.score.ember >= WIN_TARGET || state.round >= MAX_ROUNDS) endMatch();
        else { state.round += 1; startRound(); }
      }
    }

    // HUD refresh.
    const mm = Math.max(0, Math.ceil(state.timer));
    const timerText = state.phase === 'buy' ? `BUY ${mm}s`
      : state.phase === 'live' ? `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`
      : state.phase === 'roundEnd' ? '' : '';
    hud.setTimer(timerText, state.phase === 'live' && mm <= 10);
    hud.setBombTimer(objective.state.status === 'planted' ? objective.state.timer : null);
    if (state.phase === 'live' || state.phase === 'buy' || state.phase === 'roundEnd') {
      const visibleFoes = new Set();
      const eye = camera.position;
      for (const bot of bots.bots) {
        if (!bot.alive || bot.team !== 'foe' && bot.team !== 'ember') continue;
        const d = Math.hypot(bot.position.x - eye.x, bot.position.z - eye.z);
        if (d > 42) continue;
        if (world.lineOfSight(eye.x, eye.y, eye.z, bot.position.x, 1.1, bot.position.z)) visibleFoes.add(bot.id);
      }
      hud.drawMinimap(world, playerState, bots.bots, visibleFoes, objective.state, state.time);
    }
    if (state.phase === 'live' && !playerState.alive) spectateCamera();
    else if (state.phase !== 'menu') syncCamera();
  }

  // --- hooks handed to the bots --------------------------------------------------
  const botHooks = {
    effects,
    audio,
    playerPos: playerState.position,
    damagePlayer,
    damageBot,
    onPlantComplete,
    onDefuseComplete,
  };

  // Bots were created with these hooks in main.js; expose the game for shots.
  return {
    state,
    step,
    syncCamera,
    startMatch,
    beginLive,
    buy,
    shoot,
    damageBot,
    damagePlayer,
    blastDamage,
    onPlantComplete,
    onDefuseComplete,
    onExplode,
    endRound,
    startRound,
    botHooks,
    snapshot() {
      return {
        phase: state.phase,
        round: state.round,
        score: { ...state.score },
        money: state.money,
        kills: state.kills,
        deaths: state.deaths,
        timer: Number(state.timer.toFixed(2)),
        site: state.roundSite,
        owned: [...state.owned],
        grenades: state.grenades,
        player: {
          x: Number(playerState.position.x.toFixed(2)),
          z: Number(playerState.position.z.toFixed(2)),
          hp: Math.round(playerState.health),
          alive: playerState.alive,
          weapon: weapons.state.current,
          mag: weapons.state.mag,
        },
        bots: bots.bots.map((b) => ({
          name: b.name, team: b.team,
          x: Number(b.position.x.toFixed(1)), z: Number(b.position.z.toFixed(1)),
          hp: Math.round(b.health), alive: b.alive, state: b.state,
          channel: b.channelKind, channelProgress: Number(b.channel.toFixed(2)),
        })),
        bomb: {
          status: objective.state.status,
          site: objective.state.site ? objective.state.site.id : null,
          timer: Number(objective.state.timer.toFixed(1)),
        },
      };
    },
  };
}
