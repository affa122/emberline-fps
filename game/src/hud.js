// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, roster,
// kill feed, buy menu, banners, minimap and overlays. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';
import { TEAM } from './palette.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(game, callbacks) {
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playBtn = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoWeapon = el('ammo-weapon');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorFill = el('armor-fill');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreEmber = el('score-ember');
  const scoreSlate = el('score-slate');
  const roundValue = el('round-value');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const feedEl = el('feed');
  const rosterEl = el('roster');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyEl = el('buy');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const bombEl = el('bomb');
  const bombFill = el('bomb-fill');
  const bombLabel = el('bomb-label');
  const actionEl = el('action');
  const actionFill = el('action-fill');
  const actionLabel = el('action-label');
  const vignette = el('vignette');
  const flashEl = el('flash');
  const grenadeEl = el('grenades');
  const minimap = el('minimap');
  const minimapCtx = minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastFeedLen = 0;
  let lastRoster = '';

  function buildBuyMenu() {
    const items = [];
    for (const [key, def] of Object.entries(WEAPONS)) {
      items.push({ id: key, name: def.name, price: def.price, desc: `${def.damage} dmg · ${def.mag} rounds` });
    }
    items.push({ id: 'armor', name: 'Kevlar vest', price: ARMOR_PRICE, desc: 'Absorbs half of incoming damage' });
    for (const [key, def] of Object.entries(GRENADES)) {
      items.push({ id: key, name: def.name, price: def.price, desc: 'Throw with the number key' });
    }
    buyItems.innerHTML = '';
    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'buy-item';
      div.dataset.item = item.id;
      div.innerHTML = `<b>${item.name}</b><span>${item.desc}</span><em>$${item.price}</em>`;
      div.addEventListener('click', () => callbacks.onBuy(item.id));
      buyItems.appendChild(div);
    }
  }
  buildBuyMenu();

  function drawMinimap() {
    const ctx = minimapCtx;
    const W = minimap.width;
    const H = minimap.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20, 18, 15, 0.85)';
    ctx.fillRect(0, 0, W, H);
    const sx = (x) => ((x + 23) / 46) * W;
    const sz = (z) => ((z + 17) / 34) * H;
    // walls
    ctx.fillStyle = '#4a443c';
    for (const [x, z, w, d] of game.minimapWalls) {
      ctx.fillRect(sx(x - w / 2), sz(z - d / 2), Math.max(1, (w / 46) * W), Math.max(1, (d / 34) * H));
    }
    // sites
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f08a1d';
    ctx.fillText('A', sx(-17.5), sz(-11.5) + 4);
    ctx.fillStyle = '#7ba7d4';
    ctx.fillText('B', sx(17.5), sz(-11.5) + 4);
    // bomb
    if (game.bomb) {
      ctx.fillStyle = '#d8442e';
      ctx.beginPath();
      ctx.arc(sx(game.bomb.x), sz(game.bomb.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // actors
    for (const a of game.actors) {
      if (!a.alive) continue;
      const px = sx(a.position.x);
      const py = sz(a.position.z);
      ctx.fillStyle = a.isPlayer ? '#ffffff' : TEAM[a.team].css;
      if (a.isPlayer) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-a.yaw);
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(4, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return {
    setAmmo(mag, reserve, weaponName) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoWeapon.textContent = weaponName;
    },
    setHealth(hp, armor) {
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthFill.style.width = `${Math.max(0, hp)}%`;
      armorFill.style.width = `${Math.max(0, armor)}%`;
      healthFill.style.background = hp <= 30 ? '#d8442e' : hp <= 60 ? '#f08a1d' : '#7fb069';
    },
    setMoney(m) {
      moneyValue.textContent = `$${m}`;
      buyMoney.textContent = `$${m}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      timerValue.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timerValue.style.color = phase === 'live' && s <= 10 ? '#d8442e' : '';
    },
    setScore(ember, slate, round) {
      scoreEmber.textContent = String(ember);
      scoreSlate.textContent = String(slate);
      roundValue.textContent = `ROUND ${round}`;
    },
    setGrenades(g, selected) {
      grenadeEl.innerHTML = '';
      for (const [key, count] of Object.entries(g)) {
        const span = document.createElement('span');
        span.className = 'grenade' + (selected === key ? ' selected' : '');
        span.textContent = `${key.toUpperCase()} ×${count}`;
        grenadeEl.appendChild(span);
      }
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    flashWhite(strength) {
      flashEl.style.opacity = String(Math.min(1, strength));
      setTimeout(() => {
        flashEl.style.opacity = '0';
      }, 120);
    },
    pushFeed() {
      if (game.feed.length === lastFeedLen) return;
      lastFeedLen = game.feed.length;
      feedEl.innerHTML = '';
      for (const entry of game.feed.slice(-5)) {
        const div = document.createElement('div');
        div.className = 'feed-line';
        const killerColor = entry.killerTeam ? TEAM[entry.killerTeam].css : '#9a938a';
        const victimColor = TEAM[entry.victimTeam].css;
        div.innerHTML = `<b style="color:${killerColor}">${entry.killer}</b> <span>${entry.headshot ? '◉' : '✕'} ${entry.weapon}</span> <b style="color:${victimColor}">${entry.victim}</b>`;
        feedEl.appendChild(div);
      }
    },
    setRoster() {
      const key = game.actors.map((a) => `${a.name}:${a.alive ? Math.ceil(a.health) : 0}:${a.hasBomb ? 1 : 0}`).join('|');
      if (key === lastRoster) return;
      lastRoster = key;
      rosterEl.innerHTML = '';
      for (const a of game.actors) {
        const div = document.createElement('div');
        div.className = `roster-row ${a.alive ? '' : 'dead'}`;
        div.innerHTML = `<i style="background:${TEAM[a.team].css}"></i><b>${a.isPlayer ? 'You' : a.name}</b><span class="hp"><u style="width:${Math.max(0, a.health)}%"></u></span>${a.hasBomb ? '<em>●</em>' : ''}`;
        rosterEl.appendChild(div);
      }
    },
    banner(title, sub, ms = 2200) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.classList.remove('on');
    },
    setBomb(fuse) {
      if (fuse === null) {
        bombEl.hidden = true;
        return;
      }
      bombEl.hidden = false;
      bombLabel.textContent = `CHARGE ${fuse.toFixed(1)}s`;
      bombFill.style.width = `${Math.max(0, (fuse / 35) * 100)}%`;
    },
    setAction(label, frac) {
      if (label === null) {
        actionEl.hidden = true;
        return;
      }
      actionEl.hidden = false;
      actionLabel.textContent = label;
      actionFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showBuy(open, money) {
      buyEl.hidden = !open;
      if (open) {
        buyMoney.textContent = `$${money}`;
        el('buy-round').textContent = String(game.round);
        for (const item of buyItems.children) {
          const id = item.dataset.item;
          const price = id === 'armor' ? ARMOR_PRICE : (WEAPONS[id] || GRENADES[id]).price;
          item.classList.toggle('cant', money < price);
        }
      }
    },
    showOverlay(mode, data = {}) {
      const copy = {
        start: { title: 'EMBERLINE', copy: 'Foundry-9. Five attackers, five defenders, one charge. Plant it at Furnace or Silo — or drop the whole enemy team.', action: 'Click to play' },
        paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
        end: { title: data.winner === 'ember' ? 'EMBER TAKES THE MATCH' : 'SLATE TAKES THE MATCH', copy: `${game.score.ember} — ${game.score.slate}. The foundry goes quiet.`, action: 'Play again' },
      }[mode];
      overlayTitle.textContent = copy.title;
      overlayCopy.textContent = copy.copy;
      playBtn.textContent = copy.action;
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playBtn.addEventListener('click', handler);
    },
    drawMinimap,
  };
}
