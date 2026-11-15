// Rounds: freeze time, the buy phase, the live round, plant and defuse channels,
// the fuse, and the economy. Money is earned per round and per kill and spent in
// the buy menu; a round is won by elimination, by the charge, or by the clock.
import { PHASE, WIN_ROUNDS, ROUND_SECONDS, FREEZE_SECONDS, FUSE_SECONDS, START_MONEY } from './state.js';
import { SITES } from './map.js';
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';

const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;

export function createRounds(game, audio, emit) {
  function aliveCount(team) {
    let n = 0;
    for (const a of game.actors) if (a.alive && a.team === team) n += 1;
    return n;
  }

  function startRound() {
    game.roundTime = ROUND_SECONDS;
    game.freezeLeft = FREEZE_SECONDS;
    game.phaseTime = 0;
    game.phase = PHASE.FREEZE;
    game.bomb = null;
    game.roundWinner = null;
    game.roundReason = '';
    for (const a of game.actors) {
      a.action = null;
      a.actionProgress = 0;
      a.hasBomb = false;
    }
    // the player carries the charge at the start of every round
    const player = game.actors[0];
    player.hasBomb = true;
    game.carrier = player;
    autoBuyBots();
    emit('round-freeze', { round: game.round });
  }

  function autoBuyBots() {
    for (const a of game.actors) {
      if (a.isPlayer || !a.alive) continue;
      if (a.money >= WEAPONS.rifle.price && !a.owned.rifle) {
        a.money -= WEAPONS.rifle.price;
        a.owned.rifle = true;
        a.weapon = 'rifle';
      }
      if (a.money >= ARMOR_PRICE && a.armor <= 0) {
        a.money -= ARMOR_PRICE;
        a.armor = 100;
      }
      if (a.money >= GRENADES.he.price && a.grenades.he === 0) {
        a.money -= GRENADES.he.price;
        a.grenades.he = 1;
      }
    }
  }

  function buy(actor, item) {
    if (game.phase !== PHASE.FREEZE) return false;
    if (item === 'armor') {
      if (actor.armor > 0 || actor.money < ARMOR_PRICE) return false;
      actor.money -= ARMOR_PRICE;
      actor.armor = 100;
      return true;
    }
    if (item in WEAPONS) {
      const def = WEAPONS[item];
      if (actor.owned[item]) {
        actor.weapon = item;
        return true;
      }
      if (actor.money < def.price) return false;
      actor.money -= def.price;
      actor.owned[item] = true;
      actor.weapon = item;
      return true;
    }
    if (item in GRENADES) {
      const def = GRENADES[item];
      if (actor.grenades[item] >= def.max || actor.money < def.price) return false;
      actor.money -= def.price;
      actor.grenades[item] += 1;
      return true;
    }
    return false;
  }

  function nearSite(actor) {
    for (const [key, site] of Object.entries(SITES)) {
      const dx = actor.position.x - site.center.x;
      const dz = actor.position.z - site.center.z;
      if (dx * dx + dz * dz < site.radius * site.radius) return key;
    }
    return null;
  }

  function endRound(winner, reason) {
    if (game.phase !== PHASE.LIVE) return;
    game.phase = PHASE.ROUND_END;
    game.phaseTime = 0;
    game.roundWinner = winner;
    game.roundReason = reason;
    game.score[winner] += 1;
    const loser = winner === 'ember' ? 'slate' : 'ember';
    game.lossStreak[loser] += 1;
    game.lossStreak[winner] = 0;
    const loserBonus = Math.min(3400, 1900 + (game.lossStreak[loser] - 1) * 500);
    for (const a of game.actors) {
      if (a.team === winner) a.money += 3250;
      else a.money += loserBonus;
      a.money = Math.min(16000, a.money);
    }
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    emit('round-end', { winner, reason, score: { ...game.score } });
    if (game.score[winner] >= WIN_ROUNDS) {
      game.phase = PHASE.MATCH_END;
      game.matchWinner = winner;
      emit('match-end', { winner, score: { ...game.score } });
    }
  }

  function stepChannels(dt) {
    for (const a of game.actors) {
      if (!a.alive || !a.action) continue;
      if (a.action === 'plant') {
        const site = nearSite(a);
        if (!site) {
          a.action = null;
          a.actionProgress = 0;
          continue;
        }
        a.actionProgress += dt / PLANT_SECONDS;
        if (Math.floor(a.actionProgress * 10) !== Math.floor((a.actionProgress - dt / PLANT_SECONDS) * 10)) audio.plantTick();
        if (a.actionProgress >= 1) {
          a.action = null;
          a.actionProgress = 0;
          a.hasBomb = false;
          game.carrier = null;
          const center = SITES[site].center;
          game.bomb = { site, x: center.x, z: center.z, fuse: FUSE_SECONDS, lastBeep: 0 };
          emit('bomb-planted', { site });
        }
      } else if (a.action === 'defuse') {
        if (!game.bomb) {
          a.action = null;
          a.actionProgress = 0;
          continue;
        }
        const d = Math.hypot(game.bomb.x - a.position.x, game.bomb.z - a.position.z);
        if (d > 3.5) {
          a.action = null;
          a.actionProgress = 0;
          continue;
        }
        a.actionProgress += dt / DEFUSE_SECONDS;
        if (a.actionProgress >= 1) {
          a.action = null;
          a.actionProgress = 0;
          game.bomb = null;
          endRound('slate', 'Charge defused');
        }
      }
    }
    // the player dropping the channel decays progress instead of resetting it
    const player = game.actors[0];
    if (player.alive && !player.action && player.actionProgress > 0) {
      player.actionProgress = Math.max(0, player.actionProgress - dt * 0.25);
    }
  }

  function step(dt) {
    if (game.phase === PHASE.FREEZE) {
      game.freezeLeft -= dt;
      game.phaseTime += dt;
      if (game.freezeLeft <= 0) {
        game.phase = PHASE.LIVE;
        game.phaseTime = 0;
        emit('round-live', { round: game.round });
      }
      return;
    }
    if (game.phase === PHASE.ROUND_END) {
      game.phaseTime += dt;
      if (game.phaseTime > 4 && game.phase !== PHASE.MATCH_END) {
        game.round += 1;
        emit('next-round', { round: game.round });
        startRound();
      }
      return;
    }
    if (game.phase !== PHASE.LIVE) return;
    game.roundTime -= dt;
    stepChannels(dt);
    if (game.phase !== PHASE.LIVE) return; // a channel may have ended the round

    // the fuse
    if (game.bomb) {
      game.bomb.fuse -= dt;
      const interval = game.bomb.fuse > 20 ? 1 : game.bomb.fuse > 10 ? 0.5 : 0.25;
      if (game.time - game.bomb.lastBeep >= interval) {
        game.bomb.lastBeep = game.time;
        audio.beep(game.bomb.fuse <= 10);
      }
      if (game.bomb.fuse <= 0) {
        game.bomb = null;
        emit('bomb-exploded', {});
        endRound('ember', 'Charge detonated');
        return;
      }
    }

    // elimination / clock
    const emberAlive = aliveCount('ember');
    const slateAlive = aliveCount('slate');
    if (emberAlive === 0) {
      endRound('slate', game.bomb ? 'Defenders eliminated the attackers' : 'Ember eliminated');
      return;
    }
    if (slateAlive === 0) {
      endRound('ember', game.bomb ? 'Charge secured' : 'Slate eliminated');
      return;
    }
    if (game.roundTime <= 0 && !game.bomb) {
      endRound('slate', 'Time expired');
    }
  }

  return {
    startRound,
    startMatch() {
      game.score = { ember: 0, slate: 0 };
      game.round = 1;
      game.lossStreak = { ember: 0, slate: 0 };
      game.matchWinner = null;
      startRound();
    },
    step,
    buy,
    nearSite,
    aliveCount,
    canPlant(actor) {
      return actor.hasBomb && !game.bomb && nearSite(actor) !== null;
    },
    canDefuse(actor) {
      if (!game.bomb) return false;
      const d = Math.hypot(game.bomb.x - actor.position.x, game.bomb.z - actor.position.z);
      return d <= 3.5;
    },
  };
}
