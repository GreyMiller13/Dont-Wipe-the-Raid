// DWR :: sim.js — симуляция боя: чистая логика без DOM (проверяется headless в Node).
// Контракт: DWR.Sim.createRun/spawnRoom/tick/useTargeted/useInstant/cyclePriestMode/usePotion.
// Рендер (run.js) читает run.fx (эффекты кадра) и run.events (события: kill, heroDead, wipe).
"use strict";
window.DWR = window.DWR || {};

DWR.Sim = (function () {
  const C = () => DWR.CONFIG;
  let uidSeq = 1;
  const HERO_H = 210; // рост героев на канвасе; соотношения по договорённости: гоблины 0.79, король ×1.8
  const SWORD_RANGE = 140;
  const ARROW_RELEASE = 4 / 6;
  const AUTO_MOTION = { warrior: 0.58, ranger: 0.60, priest: 0.94 };
  const SKILL_SWING = { multishot: 0.63, preciseShot: 0.75, powerStrike: 0.72 };
  const PRIEST_MODES = Object.keys(C().priestModes);

  // --- Создание забега: герои с статами из купленных узлов; ресурсы с нуля ---
  function createRun() {
    const st = DWR.State.stats();
    const cfg = C();
    const heroes = {};
    for (const id of cfg.heroOrder) {
      const h = cfg.heroes[id];
      const maxHp = h.hp + ({ warrior: st.wHp, priest: st.pHp, ranger: st.rHp }[id] || 0);
      const manaMax = id === "priest" ? cfg.resources.mana.max + st.manaPool : 0;
      heroes[id] = {
        id, kind: id, x: h.x * cfg.canvas.w, facing: 1, h: HERO_H,
        maxHp, hp: maxHp, alive: true, atkT: 0.5, walkDistance: 0,
        dmg: id === "warrior" ? h.dmg + st.wDmg : id === "ranger" ? h.dmg + st.rDmg : 0,
        interval: id === "ranger"
          ? Math.max(0.35, h.interval * (1 + st.rSpeed))
          : id === "warrior" ? h.interval * (1 - st.wTempo) : 0,
        heal: (h.heal || 0) + st.healPow, healCD: Math.max(1, (h.healCD || 0) - st.healHaste), healT: 0,
        fireballT: 0,
        rage: 0, focus: 0,
        manaMax, mana: manaMax, manaTick: 0,
        blockT: 0, effects: new Map()
      };
    }
    return {
      heroes, heroOrder: cfg.heroOrder.slice(),
      enemies: [], fx: [], events: [], attacks: [],
      skillCooldowns: new Map(),
      priestMode: PRIEST_MODES[0], over: null,
      potionsLeft: DWR.State.data.panel.includes("potion") ? st.potionStock : 0,
      stats: st
    };
  }

  function inBattle(run) { return run.enemies.some(e => e.alive); }
  function priestSpellStatus(run, id) {
    const priest = run.heroes.priest, mode = run.priestMode;
    const spell = C().priestSpells[id], attack = id === "fireball";
    const left = attack ? priest.fireballT : priest.healT;
    const duration = attack ? Math.max(1, spell.cooldown - (run.stats.fireballHaste || 0)) : priest.healCD;
    const cost = Math.max(1, spell.cost - (run.stats[id + "Cost"] || 0));
    const reserve = attack && mode === "balance"
      ? Math.max(1, C().priestSpells.heal.cost - (run.stats.healCost || 0)) : 0;
    const enabled = priest.alive && (mode === "balance" || mode === (attack ? "attack" : "heal"));
    const hasMana = priest.mana >= cost;
    const canPay = priest.mana >= cost + reserve;
    return { left, duration, cost, enabled, hasMana, canPay, ready: enabled && left === 0 && canPay };
  }

  function restoreHealth(run, hero, value, potion = false) {
    const amount = Math.min(hero.maxHp - hero.hp, value);
    if (amount <= 0) return;
    hero.hp += amount;
    run.fx.push({ type: "heal", unit: hero, amount, potion });
  }

  function castPriestSpell(run, priest) {
    if (priest.attackPose) return;
    const { heal, fireball } = C().priestSpells;
    const healing = priestSpellStatus(run, "heal");
    if (healing.ready) {
      let target = null;
      for (const id of run.heroOrder) {
        const hero = run.heroes[id];
        if (hero.alive && hero.hp < hero.maxHp && (!target || hero.hp < target.hp)) target = hero;
      }
      if (target) {
        priest.mana -= healing.cost;
        priest.healT = healing.duration;
        priest.attackPose = { name: "heal", duration: heal.animation, t: 0 };
        const urgent = target.hp / target.maxHp <= 0.35 ? (run.stats.healOverflow || 0) : 0;
        restoreHealth(run, target, priest.heal + urgent);
        applyStatus(target, "healWard", run.stats.healWard);
        return;
      }
    }
    const attack = priestSpellStatus(run, "fireball");
    if (!attack.ready) return;
    const target = nearestEnemy(run, priest.x);
    if (!target) return;
    priest.mana -= attack.cost;
    priest.fireballT = attack.duration;
    const windup = startAttackPose(priest, AUTO_MOTION.priest, fireball.release);
    queueAttack(run, priest, target, "fire", fireball.dmg + (run.stats.fireDmg || 0),
      { windup, flight: fireball.flight, offsetX: -12 });
  }
  function frontHero(run) {
    for (const id of run.heroOrder) if (run.heroes[id].alive) return run.heroes[id];
    return null;
  }
  function nearestEnemy(run, x) {
    let best = null, bd = Infinity;
    for (const e of run.enemies) if (e.alive) {
      const d = Math.abs(e.x - x);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // --- Заспавнить комнату (roomIndex — индекс в CONFIG.rooms) ---
  function spawnRoom(run, roomIndex) {
    const cfg = C();
    const room = cfg.rooms[roomIndex];
    for (const id of run.heroOrder) {
      const hero = run.heroes[id];
      if (hero.alive) hero.x = cfg.heroes[id].x * cfg.canvas.w;
      hero.walking = false;
      hero.walkDistance = 0;
      hero.attackPose = null;
    }
    const isCombat = !room.boss && !room.chest;
    const mm = isCombat ? 1 + cfg.enemyGrowthPerRoom * (room.tier ?? roomIndex) : 1;
    run.enemies = [];
    const list = room.enemies;
    list.forEach((kind, i) => {
      const span = cfg.battle.enemyXTo - cfg.battle.enemyXFrom;
      const frac = list.length === 1 ? 0.5 : i / (list.length - 1);
      const x = (cfg.battle.enemyXFrom + span * frac) * cfg.canvas.w;
      run.enemies.push(createEnemy(kind, x, mm, i));
    });
    run.fx = []; run.events = []; run.attacks = [];
    const priest = run.heroes.priest;
    if (priest.alive) priest.mana = Math.min(priest.manaMax, priest.mana + (run.stats.manaOnRoom || 0));
  }

  function createEnemy(kind, x, multiplier, index) {
    const def = C().enemies[kind];
    const hp = Math.round(def.hp * multiplier);
    const goblinScale = kind === "goblinW" || kind === "goblinA" ? 0.79 : 1;
    return {
      uid: uidSeq++, kind, def, x, facing: -1, boss: !!def.boss,
      h: Math.round(HERO_H * def.sizeMul * goblinScale),
      hp, maxHp: hp, dmg: def.dmg * multiplier, interval: def.interval,
      alive: true, atkT: 1.2 + index * 0.3, walking: !def.ranged, walkDistance: 0, attack: null,
      effects: new Map(), buffT: def.buff?.initial ?? 0,
      smashT: def.smash?.everySec || 0,
      lane: kind === "skeletonW" ? 36 * (index % 2) : 0
    };
  }

  function beginSummons(run) {
    for (const lord of run.enemies) {
      const summon = lord.def.summon;
      if (!lord.alive || !summon || lord.summoned) continue;
      lord.summoned = true;
      lord.ritual = { t: 0, duration: summon.seconds };
      const minions = summon.minions.map((kind, i) => {
        const unit = createEnemy(kind, lord.x - (3 - i) * 102, 1, i);
        unit.appearT = 0.40;
        return unit;
      });
      run.enemies.push(...minions);
      run.fx.push({ type: "summon", minions });
    }
  }

  // --- Урон ---
  function hitHero(run, hero, dmg) {
    if (!hero.alive) return;
    let d = dmg;
    if (hero.id === "warrior") {
      d *= 1 - (run.stats.wArmor || 0);
      if (hero.blockT > 0) d *= (1 - C().skills.block.dmgReduce);
    }
    for (const id of hero.effects.keys()) d *= C().effects[id]?.damageTakenMultiplier ?? 1;
    d = Math.max(1, Math.round(d));
    hero.hp -= d;
    run.fx.push({ type: "hurt", unit: hero, amount: d });
    if (hero.hp <= 0) {
      hero.hp = 0; hero.alive = false;
      run.events.push({ type: "heroDead", hero });
      if (!frontHero(run)) { run.over = "wipe"; run.events.push({ type: "wipe" }); }
    }
  }
  function hitEnemy(run, e, dmg) {
    if (!e.alive) return false;
    e.hp -= dmg;
    run.fx.push({ type: "hurt", unit: e, amount: Math.round(dmg) });
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      run.events.push({ type: "kill", unit: e, boss: e.boss });
      const R = C().resources;
      const { warrior: w, ranger: r, priest } = run.heroes;
      if (w.alive) w.rage = Math.min(R.rage.max, w.rage + R.rage.perKill + (run.stats.wRageKill || 0));
      if (r.alive) r.focus = Math.min(R.focus.max, r.focus + R.focus.perKill + (run.stats.rFocusKill || 0));
      if (priest.alive) priest.mana = Math.min(priest.manaMax, priest.mana + (run.stats.manaOnKill || 0));
      return true;
    }
    return false;
  }

  // координаты корпусов для визуальных линий (y — смещение от пола)
  const torsoY = (u) => -(u.h * 0.55);

  function meleeImpact(run, caster, target, kind) {
    const side = Math.sign(caster.x - target.x) || -caster.facing;
    const x = target.x + side * Math.min(22, target.h * 0.12);
    run.fx.push({ type: "meleeImpact", kind, x, y: torsoY(target), side, blocked: target.blockT > 0 });
  }

  function applyStatus(unit, id, duration = C().effects[id]?.duration) {
    if (duration > 0) unit.effects.set(id, { id, duration, left: duration });
  }

  function activeStatuses(unit) {
    const statuses = [...unit.effects.values()];
    if (unit.blockT > 0) statuses.push({ id: "block", left: unit.blockT,
      duration: unit.blockDuration || C().skills.block.durSec });
    return statuses;
  }

  function tickStatuses(unit, dt) {
    for (const [id, status] of unit.effects) {
      status.left -= dt;
      if (status.left <= 1e-9) unit.effects.delete(id);
    }
  }

  function attackDamage(unit, value) {
    for (const id of unit.effects.keys()) value *= C().effects[id]?.damageMultiplier ?? 1;
    return value;
  }

  function startAttackPose(caster, duration, contact, pose = "attack") {
    caster.attackPose = { name: pose, duration, t: 0 };
    return duration * contact;
  }

  function interruptAutoAttack(run, caster, kind) {
    // Навык отменяет только незавершённый замах автоатаки.
    run.attacks = run.attacks.filter(a => a.caster !== caster || a.kind !== kind || a.startX !== null);
  }

  function queueAttack(run, caster, target, kind, damage,
    { windup = 0, flight = 0, arc = 0, offsetX = 0, offsetY = 0 } = {}) {
    run.attacks.push({ caster, target, kind, damage: attackDamage(caster, damage), windup, flight, arc, offsetX, offsetY,
      t: 0, startX: windup > 0 ? null : caster.x, x: target.x + offsetX, y: torsoY(target) + offsetY });
  }

  function resolveAttacks(run, dt) {
    if (!run.attacks.length) return;
    run.attacks = run.attacks.filter(attack => {
      if (attack.resolved) return false;
      if (attack.startX === null && !attack.caster.alive) return false;
      attack.t += dt;
      if (attack.t < attack.windup) return true;
      if (attack.startX === null) attack.startX = attack.caster.x;
      attack.x = attack.target.x + attack.offsetX;
      attack.y = torsoY(attack.target) + attack.offsetY;
      if (attack.t < attack.windup + attack.flight) return true;

      if (attack.damage > 0) {
        if (attack.target.id) hitHero(run, attack.target, attack.damage);
        else if (attack.target.alive && (attack.kind !== "sword" || Math.abs(attack.x - attack.caster.x) <= SWORD_RANGE)) {
          const power = attack.kind === "powerStrike" || attack.kind === "slash";
          if (attack.kind === "sword" || power) meleeImpact(run, attack.caster, attack.target, power ? "power" : "sword");
          const killed = hitEnemy(run, attack.target, attack.damage);
          if (killed && attack.caster.alive && power) {
            attack.caster.rage = Math.min(C().resources.rage.max, attack.caster.rage + (run.stats.powerStrikeRefund || 0));
          }
        }
      }
      if (attack.kind === "fire") {
        const splash = run.stats.fireballBlast || 0;
        if (splash > 0) {
          for (const enemy of run.enemies) {
            if (enemy !== attack.target && Math.abs(enemy.x - attack.target.x) <= 110) hitEnemy(run, enemy, splash);
          }
        }
        run.fx.push({ type: "fireImpact", x: attack.x, y: attack.y });
      }
      if (attack.kind === "necroticOrb") run.fx.push({ type: "necroticImpact", x: attack.x, y: attack.y });
      // Стрела остаётся в кадре попадания; шар сменяется взрывом.
      attack.resolved = attack.flight > 0 && attack.kind !== "fire" && attack.kind !== "necroticOrb";
      return attack.resolved;
    });
  }

  function advanceWarrior(run, dt) {
    const warrior = run.heroes.warrior;
    warrior.walking = false;
    if (!warrior.alive || warrior.attackPose) return;
    const target = nearestEnemy(run, warrior.x);
    if (!target) return;
    const { warriorAdvanceSpeed, warriorStopRange } = C().battle;
    const speed = warriorAdvanceSpeed + (run.stats.wStride || 0);
    const step = Math.max(0, Math.min(target.x - warrior.x - warriorStopRange, speed * dt));
    warrior.x += step;
    warrior.walkDistance += step;
    warrior.walking = step > 0;
  }

  function buffAllies(run, buff) {
    return run.enemies.filter(unit => unit.alive && buff.targets.includes(unit.kind));
  }

  function enemyAttack(run, e, target, dt, justStopped) {
    e.atkT -= dt;
    const buff = e.def.buff;
    if (buff) e.buffT -= dt;
    if (e.walking) {
      e.attack = null;
      return;
    }
    if (e.attack?.hit) {
      e.attack.t += dt;
      if (e.attack.t >= e.attack.windup + e.attack.recovery) e.attack = null;
      return;
    }
    if (!e.attack) {
      const heavy = !!e.def.smash && e.smashT <= e.interval;
      const buffing = !!buff && e.buffT <= 0 && buffAllies(run, buff).length > 0;
      const move = buffing ? buff : heavy ? e.def.smash : e.def.attack;
      // Старая конфигурация из кэша может не содержать параметров анимации.
      const windup = move?.windup ?? (e.def.ranged ? 0.55 : 0.42);
      const recovery = move?.recovery ?? 0.33;
      if (e.atkT > windup) return;
      // Первый удар в ближнем бою получает полный замах после подхода.
      if (justStopped) e.atkT = windup;
      e.attack = { windup, recovery, heavy, buffing, beam: !!move?.beam, projectile: move?.projectile,
        hit: false, t: 0, targetX: target.x };
    }
    const attack = e.attack;
    attack.targetX = target.x;
    attack.targetY = torsoY(target);
    attack.t = attack.windup - Math.max(0, e.atkT);
    if (e.atkT > 0) return;

    attack.hit = true;
    e.atkT = e.interval;
    if (attack.buffing) {
      e.buffT = buff.cooldown;
      for (const unit of buffAllies(run, buff)) {
        applyStatus(unit, buff.id);
        run.fx.push({ type: "status", unit, id: buff.id });
      }
      return;
    }
    if (e.def.smash) e.smashT = attack.heavy ? e.def.smash.everySec : e.smashT - e.interval;
    const dmg = attack.heavy ? e.dmg * e.def.smash.dmgMul : e.dmg;
    if (e.def.ranged && !attack.beam) {
      if (attack.projectile === "necroticOrb") {
        queueAttack(run, e, target, "necroticOrb", dmg, { flight: 0.40, arc: 8 });
      } else {
        queueAttack(run, e, target, "enemyArrow", dmg, { flight: 0.28, arc: 18, offsetX: 18 });
      }
    } else {
      if (attack.beam) run.fx.push({ type: "necroticBeam", caster: e, x: attack.targetX, y: attack.targetY });
      else if (!e.def.ranged) meleeImpact(run, e, target, attack.heavy ? "smash" : "enemy");
      hitHero(run, target, attackDamage(e, dmg));
    }
  }

  // --- Тик ---
  function tick(run, dt) {
    if (run.over) return;
    const cfg = C();
    beginSummons(run);
    for (const enemy of run.enemies) tickStatuses(enemy, dt);
    for (const id of run.heroOrder) {
      const hero = run.heroes[id], pose = hero.attackPose;
      tickStatuses(hero, dt);
      if (!pose) continue;
      pose.t += dt;
      if (pose.t >= pose.duration) hero.attackPose = null;
    }
    resolveAttacks(run, dt);
    if (run.over) return;
    advanceWarrior(run, dt);
    const battle = inBattle(run);
    const warrior = run.heroes.warrior, priest = run.heroes.priest, ranger = run.heroes.ranger;
    priest.healT = Math.max(0, priest.healT - dt);
    priest.fireballT = Math.max(0, priest.fireballT - dt);
    for (const [id, left] of run.skillCooldowns) {
      if (left <= dt + 1e-9) run.skillCooldowns.delete(id);
      else run.skillCooldowns.set(id, left - dt);
    }

    // Ресурсы: реген ТОЛЬКО в бою (спека: между комнатами ничего не восстанавливается)
    if (battle) {
      const R = cfg.resources;
      if (warrior.alive) warrior.rage = Math.min(R.rage.max, warrior.rage + (R.rage.regenPerSec + (run.stats.wRageRegen || 0)) * dt);
      if (ranger.alive) ranger.focus = Math.min(R.focus.max, ranger.focus + (R.focus.regenPerSec + (run.stats.rFocusRegen || 0)) * dt);
      if (priest.alive && priest.manaMax > 0) {
        priest.manaTick += dt;
        const period = Math.max(0.5, cfg.resources.mana.tickSec + run.stats.manaRegen);
        while (priest.manaTick >= period) {
          priest.manaTick -= period;
          priest.mana = Math.min(priest.manaMax, priest.mana + cfg.resources.mana.regenPerTick);
        }
      }
    }
    if (warrior.blockT > 0) warrior.blockT = Math.max(0, warrior.blockT - dt);

    if (battle) {
      // Воин: ближняя атака ближайшего
      if (warrior.alive) {
        warrior.atkT -= dt;
        const tgt = nearestEnemy(run, warrior.x);
        if (!warrior.walking && !warrior.attackPose && warrior.atkT <= 0 && tgt && Math.abs(tgt.x - warrior.x) < SWORD_RANGE) {
          warrior.atkT = warrior.interval;
          const windup = startAttackPose(warrior, Math.min(warrior.interval, AUTO_MOTION.warrior), cfg.battle.warriorContact);
          queueAttack(run, warrior, tgt, "sword", warrior.dmg, { windup });
        }
      }
      // Лучник: стрельба по ближайшему к нему
      if (ranger.alive) {
        ranger.atkT -= dt;
        const tgt = nearestEnemy(run, ranger.x);
        if (!ranger.attackPose && ranger.atkT <= 0 && tgt) {
          ranger.atkT = ranger.interval;
          const windup = startAttackPose(ranger, Math.min(ranger.interval, AUTO_MOTION.ranger), ARROW_RELEASE);
          queueAttack(run, ranger, tgt, "arrow", ranger.dmg, { windup, flight: 0.22, arc: 26, offsetX: -12 });
        }
      }
      if (priest.alive) castPriestSpell(run, priest);
    }

    // Враги: melee подходят к переднему герою, все бьют переднего живого
    for (const e of run.enemies) {
      if (!e.alive) continue;
      if (e.appearT > 0) { e.appearT -= dt; continue; }
      if (e.ritual) {
        e.ritual.t += dt;
        if (e.ritual.t >= e.ritual.duration) e.ritual = null;
        continue;
      }
      const target = frontHero(run);
      if (!target) break;
      const wasWalking = e.walking;
      if (!e.def.ranged) {
        const stopX = target.x + 95 + e.lane;
        if (e.x > stopX) {
          const step = Math.min(e.x - stopX, 170 * dt);
          e.x -= step;
          e.walkDistance += step;
          e.walking = true;
        } else e.walking = false;
      }
      enemyAttack(run, e, target, dt, wasWalking && !e.walking);
    }
  }

  // --- Активные действия ---
  function skillStatus(run, skillId) {
    const s = C().skills[skillId], h = run.heroes[s.owner];
    const cost = Math.max(0, s.cost - (run.stats[skillId + "Cost"] || 0));
    const left = run.skillCooldowns.get(skillId) || 0;
    const duration = Math.max(1, s.cooldown - (run.stats[skillId + "Haste"] || 0));
    return { cost, left, duration, ready: h.alive && left === 0 && h[s.res] >= cost };
  }

  function spendSkill(run, skillId, hero, resource) {
    const state = skillStatus(run, skillId);
    if (!state.ready) return false;
    hero[resource] -= state.cost;
    run.skillCooldowns.set(skillId, state.duration);
    return true;
  }

  function useTargeted(run, skillId, enemyUid) {
    if (run.over || !inBattle(run)) return false;
    const e = run.enemies.find(x => x.uid === enemyUid && x.alive);
    const s = C().skills[skillId];
    if (!e || s?.type !== "targeted") return false;
    const h = run.heroes[s.owner];
    if (!spendSkill(run, skillId, h, s.res)) return false;
    const duration = SKILL_SWING[skillId];
    h.atkT = Math.max(h.atkT, duration);
    if (skillId === "powerStrike") {
      interruptAutoAttack(run, h, "sword");
      const windup = startAttackPose(h, duration, C().battle.warriorContact, skillId);
      // Умение остаётся прицельным на любой дистанции. Вдали видна летящая дуга удара.
      const distant = Math.abs(e.x - h.x) >= SWORD_RANGE;
      queueAttack(run, h, e, distant ? "slash" : "powerStrike", s.dmg + (run.stats.wStrike || 0),
        { windup, flight: distant ? 0.24 : 0 });
    } else { // preciseShot
      interruptAutoAttack(run, h, "arrow");
      const windup = startAttackPose(h, duration, ARROW_RELEASE, skillId);
      const damage = (s.dmg + (run.stats.rPrecision || 0)) * (1 + (e.boss ? run.stats.preciseBoss || 0 : 0));
      queueAttack(run, h, e, "precise", damage, { windup, flight: 0.20, arc: 5 });
    }
    return true;
  }

  function useInstant(run, skillId) {
    if (run.over || !inBattle(run)) return false;
    const s = C().skills[skillId];
    if (s?.type !== "instant") return false;
    const h = run.heroes[s.owner];
    if (!spendSkill(run, skillId, h, s.res)) return false;
    if (skillId === "block") {
      h.blockT = s.durSec + run.stats.blockDur;
      h.blockDuration = h.blockT;
      restoreHealth(run, h, run.stats.blockHeal || 0);
    } else { // multishot
      const duration = SKILL_SWING[skillId];
      h.atkT = Math.max(h.atkT, duration);
      interruptAutoAttack(run, h, "arrow");
      const windup = startAttackPose(h, duration, ARROW_RELEASE, skillId);
      const count = s.targets + (run.stats.rExtraArrow || 0);
      const alive = run.enemies.filter(e => e.alive).sort((a, b) => a.x - b.x).slice(0, count);
      const damage = s.dmg + (run.stats.rFan || 0);
      for (let i = 0; i < count; i++) {
        const lane = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1) * Math.ceil(i / 2);
        // Базовый залп распределяется по целям. Стрелы от прокачки могут попасть повторно.
        const repeat = !alive[i] && i >= s.targets;
        const target = alive[i] || alive[repeat ? (i - s.targets) % alive.length : 0];
        queueAttack(run, h, target, "multi", alive[i] ? damage : repeat ? damage * 0.5 : 0, {
          windup, flight: 0.30, arc: 22 + lane * 32, offsetY: alive[i] ? 0 : repeat ? lane * 9 : lane * 44
        });
      }
    }
    return true;
  }

  function cyclePriestMode(run) {
    if (run.over || !run.heroes.priest.alive) return false;
    const current = PRIEST_MODES.indexOf(run.priestMode);
    run.priestMode = PRIEST_MODES[(current + 1) % PRIEST_MODES.length];
    return true;
  }

  // Зелье; запрет при полном HP → "full"
  function usePotion(run, heroId, { fromFloor = false } = {}) {
    const h = run.heroes[heroId];
    if (run.over || !h?.alive || (!fromFloor && run.potionsLeft <= 0)) return false;
    if (h.hp >= h.maxHp) return "full";
    if (!fromFloor) run.potionsLeft--;
    restoreHealth(run, h, C().loot.potionHealBase + run.stats.potionStr, true);
    const splash = run.stats.potionSquadHeal || 0;
    if (splash > 0) for (const hero of Object.values(run.heroes)) {
      if (hero !== h && hero.alive) restoreHealth(run, hero, splash, true);
    }
    return true;
  }

  return { createRun, spawnRoom, tick, useTargeted, useInstant, cyclePriestMode, usePotion,
           inBattle, frontHero, nearestEnemy, priestSpellStatus, skillStatus, activeStatuses, applyStatus };
})();
