// The DOM HUD: health, ammo, money, timer, scores, kill feed, minimap, buy
// menu and overlays. It never touches the simulation; game.js pushes numbers
// in and reads the play / buy callbacks out.
import { WEAPONS, GRENADE } from './weapons.js';

const COPY = {
  start: {
    title: 'EMBERYARD',
    copy: 'Round-based tactical FPS. Plant the charge at Silo or Crane — or stop Ember from doing it. Five rounds take the match.',
    action: 'CLICK TO DEPLOY',
  },
  paused: {
    title: 'EMBERYARD',
    copy: 'Paused. Click to resume the round.',
    action: 'CLICK TO RESUME',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreVan = $('score-van');
  const scoreEmb = $('score-emb');
  const roundNum = $('round-num');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const hitmarker = $('hitmarker');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const bombTimer = $('bomb-timer');
  const vignette = $('damage-vignette');
  const deadNote = $('dead-note');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHp = -1;
  let lastMoney = -1;
  let lastTimer = '';

  play.addEventListener('click', () => callbacks.onPlay());
  $('buy-close').addEventListener('click', () => callbacks.onCloseBuy());

  function buildBuy() {
    buyItems.innerHTML = '';
    const cards = [
      ...Object.values(WEAPONS).map((w) => ({ id: w.id, name: w.name, price: w.price, desc: `${w.damage} dmg · ${w.mag} rounds · ${w.auto ? 'auto' : 'semi-auto'}` })),
      { id: GRENADE.id, name: GRENADE.name, price: GRENADE.price, desc: 'Thrown with G · blast radius 6 m' },
    ];
    for (const card of cards) {
      const el = document.createElement('button');
      el.className = 'buy-card';
      el.type = 'button';
      el.innerHTML = `<b>${card.name}</b><span>${card.desc}</span><i>${card.price === 0 ? 'OWNED' : '$' + card.price}</i>`;
      el.addEventListener('click', () => callbacks.onBuy(card.id));
      el.dataset.item = card.id;
      buyItems.appendChild(el);
    }
  }
  buildBuy();

  function drawMinimap(world, player, bots, visibleFoes, bomb, time) {
    const w = minimap.width;
    const h = minimap.height;
    const bx = world.bounds.x;
    const bz = world.bounds.z;
    const sx = w / (bx * 2);
    const sz = h / (bz * 2);
    const X = (x) => (x + bx) * sx;
    const Z = (z) => (z + bz) * sz;
    mapCtx.fillStyle = '#12151c';
    mapCtx.fillRect(0, 0, w, h);
    for (const r of world.mapRects) {
      mapCtx.fillStyle = '#3a414c';
      mapCtx.fillRect(X(r.x), Z(r.z), Math.max(1, r.w * sx), Math.max(1, r.d * sz));
    }
    for (const site of world.sites) {
      mapCtx.strokeStyle = bomb.status === 'planted' && bomb.site === site ? '#e5484d' : '#f0a830';
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(X(site.center.x), Z(site.center.z), site.radius * sx, 0, Math.PI * 2);
      mapCtx.stroke();
      mapCtx.fillStyle = '#f0a830';
      mapCtx.font = 'bold 11px sans-serif';
      mapCtx.fillText(site.id, X(site.center.x) - 3, Z(site.center.z) + 4);
    }
    if (bomb.status === 'planted') {
      const blink = Math.sin(time * 8) > 0;
      mapCtx.fillStyle = blink ? '#e5484d' : '#7a1d1d';
      mapCtx.beginPath();
      mapCtx.arc(X(bomb.position.x), Z(bomb.position.z), 4, 0, Math.PI * 2);
      mapCtx.fill();
    }
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.team === 'vanguard') {
        mapCtx.fillStyle = '#37c8ab';
        mapCtx.beginPath();
        mapCtx.arc(X(bot.position.x), Z(bot.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      } else if (visibleFoes.has(bot.id)) {
        mapCtx.fillStyle = '#e5484d';
        mapCtx.beginPath();
        mapCtx.arc(X(bot.position.x), Z(bot.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }
    if (player.alive) {
      const px = X(player.position.x);
      const pz = Z(player.position.z);
      mapCtx.save();
      mapCtx.translate(px, pz);
      mapCtx.rotate(Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI / 2);
      mapCtx.fillStyle = '#e9e6df';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    }
  }

  return {
    setHealth(hp) {
      if (hp === lastHp) return;
      lastHp = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
    },
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { weaponName.textContent = name; },
    setMoney(m) {
      if (m === lastMoney) return;
      lastMoney = m;
      moneyEl.textContent = `$${m}`;
      buyMoney.textContent = `$${m}`;
    },
    setTimer(text, urgent) {
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('urgent', !!urgent);
    },
    setScore(van, emb) {
      scoreVan.textContent = String(van);
      scoreEmb.textContent = String(emb);
    },
    setRound(n, max) { roundNum.textContent = `ROUND ${n} / ${max}`; },
    setBombTimer(seconds) {
      bombTimer.hidden = seconds === null;
      if (seconds !== null) bombTimer.textContent = `CHARGE ${seconds.toFixed(0)}s`;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    killfeed(killer, victim, weapon, headshot) {
      const el = document.createElement('div');
      el.className = 'feed-row';
      el.innerHTML = `<b class="${killer === 'MITECHO' ? 'me' : ''}">${killer}</b> <span>${headshot ? '◉' : '▸'} ${weapon}</span> <b>${victim}</b>`;
      killfeed.prepend(el);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 4500);
    },
    banner(titleText, subText, holdMs = 2200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    setPlant(progress, label) {
      if (label === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setDead(dead) { deadNote.hidden = !dead; },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
    },
    showPanel(titleText, copyText, actionText) {
      title.textContent = titleText;
      copy.textContent = copyText;
      play.textContent = actionText;
      overlay.hidden = false;
    },
    hideOverlay() { overlay.hidden = true; },
    showBuy(open, money, owned) {
      buyMenu.hidden = !open;
      this.setMoney(money);
      for (const card of buyItems.children) {
        const id = card.dataset.item;
        const ownedNow = owned.has(id) || (WEAPONS[id] && WEAPONS[id].price === 0);
        card.classList.toggle('owned', !!ownedNow);
        card.querySelector('i').textContent = ownedNow ? 'OWNED' : `$${WEAPONS[id] ? WEAPONS[id].price : GRENADE.price}`;
      }
    },
    drawMinimap,
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
