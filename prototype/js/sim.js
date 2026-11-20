// DWR :: sim.js — симуляция боя: чистая логика без DOM (проверяется headless в Node).
// Контракт: DWR.Sim.createRun/spawnRoom/tick/useTargeted/useHeal/useInstant/setAuto/usePotion.
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
  const controlled = hero => hero.effects.has("stunned") || hero.effects.has("frozen");

  // --- Создание забега: герои с статами из купленных узлов; ресурсы с нуля ---
  function createRun() {
    const st = DWR.State.stats();
    const cfg = C();
    const equipped = new Set(DWR.State.data.panel.filter(id => id && DWR.State.hasSkill(id)));
    const autoSkills = new Set([...equipped].filter(DWR.State.autoEnabled));
    const heroes = {};
    for (const id of cfg.heroOrder) {
      const h = cfg.heroes[id];
      const maxHp = h.hp + ({ warrior: st.wHp, priest: st.pHp, ranger: st.rHp }[id] || 0);
      const manaMax = id === "priest" ? cfg.resources.mana.max + st.manaPool : 0;
      heroes[id] = {
        id, kind: id, x: h.x * cfg.canvas.w, facing: 1, h: HERO_H,
        maxHp, hp: maxHp, alive: true, atkT: 0.5, walkDistance: 0,
        critChance: Math.max(0, Math.min(cfg.critical.maxChance, h.critChance + (st[h.critStat] || 0))),
        dmg: id === "warrior" ? h.dmg + st.wDmg : id === "ranger" ? h.dmg + st.rDmg : 0,
        interval: id === "ranger"
          ? Math.max(0.35, h.interval * (1 + st.rSpeed))
          : id === "warrior" ? h.interval * (1 - st.wTempo) : 0,
        heal: (h.heal || 0) + st.healPow,
        rage: 0, focus: 0,
        manaMax, mana: manaMax, manaTick: 0,
        blockT: 0, effects: new Map()
      };
    }
    return {
      heroes, heroOrder: cfg.heroOrder.slice(),
      enemies: [], fx: [], events: [], attacks: [], groundWaves: [],
      equipped, autoSkills, skillCooldowns: new Map(), over: null,
      potionsLeft: DWR.State.data.panel.includes("potion") ? st.potionStock : 0,
      stats: st
    };
  }

  function inBattle(run) { return run.enemies.some(e => e.alive); }
  function rollCritical(unit) {
    return Math.random() < unit.critChance;
  }

  function restoreHealth(run, hero, value, { potion = false, critical = false } = {}) {
    if (critical) value *= C().critical.multiplier;
    const amount = Math.min(hero.maxHp - hero.hp, value);
    if (amount <= 0) return;
    hero.hp += amount;
    run.fx.push({ type: "heal", unit: hero, amount, potion, critical });
  }

  function castPriestAuto(run, priest) {
    if (priest.attackPose) return;
    const autoHeal = run.autoSkills.has("heal");
    if (autoHeal && skillStatus(run, "heal").ready) {
      let target = null;
      for (const id of run.heroOrder) {
        const hero = run.heroes[id];
        if (hero.alive && hero.hp < hero.maxHp && (!target || hero.hp < target.hp)) target = hero;
      }
      if (target && useHeal(run, target.id)) return;
    }
    if (!run.autoSkills.has("fireball")) return;
    const reserve = autoHeal ? skillStatus(run, "heal").cost : 0;
    if (priest.mana < skillStatus(run, "fireball").cost + reserve) return;
    const target = nearestEnemy(run, priest.x);
    if (target) useTargeted(run, "fireball", target.uid);
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
    run.fx = []; run.events = []; run.attacks = []; run.groundWaves = [];
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
      smashT: def.smash?.everySec || 0, howlT: def.howl?.initial ?? 0, freezeT: def.freeze?.initial ?? 0,
      lane: (def.formationGap ?? (kind === "skeletonW" ? 36 : 0)) * (index % 2)
    };
  }

  function beginSummons(run) {
    for (const lord of run.enemies) {
      const summon = lord.def.summon;
      if (!lord.alive || !summon || lord.summoned) continue;
      lord.summoned = true;
      lord.ritual = { t: 0, duration: summon.seconds, hit: false };
    }
  }

  function finishSummon(run, lord) {
    const minions = lord.def.summon.minions.map((kind, i) => {
      const unit = createEnemy(kind, lord.x - (3 - i) * 102, 1, i);
      unit.appearT = 0.40;
      return unit;
    });
    lord.ritual.hit = true;
    run.enemies.push(...minions);
    run.fx.push({ type: "summon", minions });
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
    damageHero(run, hero, Math.max(1, Math.round(d)));
  }
  function damageHero(run, hero, amount, kind) {
    hero.hp -= amount;
    run.fx.push({ type: "hurt", unit: hero, amount, kind });
    if (hero.hp <= 0) {
      hero.hp = 0; hero.alive = false;
      run.events.push({ type: "heroDead", hero });
      if (!frontHero(run)) { run.over = "wipe"; run.events.push({ type: "wipe" }); }
    }
  }
  function hitEnemy(run, e, dmg, critical) {
    if (!e.alive) return false;
    if (critical) dmg *= C().critical.multiplier;
    e.hp -= dmg;
    run.fx.push({ type: "hurt", unit: e, amount: Math.round(dmg), critical });
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      run.events.push({ type: "kill", unit: e, boss: e.boss });
      const R = C().resources;
      const { warrior: w, ranger: r, priest } = run.heroes;
      if (w.alive) w.rage = Math.min(R.rage.max, w.rage + R.rage.perKill + (run.stats.wRageKill || 0));
      if (r.alive) {
        let earned = R.focus.perKill + (run.stats.rFocusKill || 0);
        if (run.autoSkills.has("multishot")) earned = earned * C().skills.multishot.focusOnKillMultiplier + (run.stats.multishotKillFocus || 0);
        r.focus = Math.min(R.focus.max, r.focus + earned);
      }
      if (priest.alive) priest.mana = Math.min(priest.manaMax, priest.mana + (run.stats.manaOnKill || 0));
      return true;
    }
    const regen = e.def.regen;
    if (regen && e.hp <= e.maxHp * regen.threshold && !e.effects.has(regen.status)) {
      applyStatus(e, regen.status, Infinity);
      e.regenT = regen.interval;
      run.fx.push({ type: "status", unit: e, id: regen.status });
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

  function tickFreeze(run, hero, dt) {
    const status = hero.effects.get("frozen");
    if (!status) return;
    const { tickSec, healthFraction } = C().effects.frozen;
    status.nextTick ??= tickSec;
    const elapsed = status.duration - Math.max(0, status.left - dt);
    while (hero.alive && status.nextTick <= elapsed + 1e-9) {
      damageHero(run, hero, hero.maxHp * healthFraction, "frost");
      status.nextTick += tickSec;
    }
    if (!hero.alive || status.left <= dt + 1e-9) {
      hero.effects.delete("frozen");
      run.fx.push({ type: "thaw", unit: hero });
    }
  }

  function interruptHero(run, hero, id, duration) {
    applyStatus(hero, id, duration);
    hero.attackPose = null;
    hero.walking = false;
    // Уже выпущенные снаряды долетают. Отмечаем отмену в том числе внутри resolveAttacks.
    for (const attack of run.attacks) {
      if (attack.caster === hero && attack.startX === null) attack.cancelled = true;
    }
  }

  function tickRegeneration(run, enemy, dt) {
    const regen = enemy.def.regen;
    if (!regen || !enemy.alive || !enemy.effects.has(regen.status)) return;
    enemy.regenT -= dt;
    while (enemy.regenT <= 1e-9) {
      enemy.regenT += regen.interval;
      restoreHealth(run, enemy, enemy.maxHp * regen.healthFraction);
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
      if (attack.resolved || attack.cancelled) return false;
      if (attack.startX === null && !attack.caster.alive) return false;
      attack.t += dt;
      if (attack.t < attack.windup) return true;
      if (attack.startX === null) attack.startX = attack.caster.x;
      attack.x = attack.target.x + attack.offsetX;
      attack.y = torsoY(attack.target) + attack.offsetY;
      if (attack.t < attack.windup + attack.flight) return true;

      if (attack.kind === "frost") {
        const hero = attack.target;
        if (hero.alive) {
          interruptHero(run, hero, "frozen");
          run.fx.push({ type: "freeze", unit: hero });
        }
        return false;
      }
      if (attack.target.id) {
        if (attack.damage > 0) hitHero(run, attack.target, attack.damage);
      } else {
        const splash = attack.kind === "fire" ? run.stats.fireballBlast : 0;
        const neighbors = splash > 0 ? run.enemies.filter(enemy =>
          enemy.alive && enemy !== attack.target && Math.abs(enemy.x - attack.target.x) <= 110) : [];
        const direct = attack.damage > 0 && attack.target.alive &&
          (attack.kind !== "sword" || Math.abs(attack.x - attack.caster.x) <= SWORD_RANGE);
        // Взрыв фаербола использует один бросок крита для всех задетых целей.
        const critical = (direct || neighbors.length > 0) && rollCritical(attack.caster);
        if (direct) {
          const power = attack.kind === "powerStrike" || attack.kind === "slash";
          if (attack.kind === "sword" || power) meleeImpact(run, attack.caster, attack.target, power ? "power" : "sword");
          if (hitEnemy(run, attack.target, attack.damage, critical) && attack.caster.alive && power) {
            attack.caster.rage = Math.min(C().resources.rage.max, attack.caster.rage + (run.stats.powerStrikeRefund || 0));
          }
        }
        for (const enemy of neighbors) hitEnemy(run, enemy, splash, critical);
      }
      if (attack.kind === "fire") run.fx.push({ type: "fireImpact", x: attack.x, y: attack.y });
      if (attack.kind === "necroticOrb") run.fx.push({ type: "necroticImpact", x: attack.x, y: attack.y });
      // Стрела остаётся в кадре попадания; шар сменяется взрывом.
      attack.resolved = attack.flight > 0 && attack.kind !== "fire" && attack.kind !== "necroticOrb";
      return attack.resolved;
    });
  }

  function advanceWarrior(run, dt) {
    const warrior = run.heroes.warrior;
    warrior.walking = false;
    if (!warrior.alive || warrior.attackPose || controlled(warrior)) return;
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

  function howlAtParty(run, enemy) {
    for (const hero of Object.values(run.heroes)) {
      if (hero.alive) interruptHero(run, hero, enemy.def.howl.status);
    }
    run.fx.push({ type: "howl", x: enemy.x, y: -enemy.h * 0.84 });
  }

  function advanceGroundWaves(run, dt) {
    run.groundWaves = run.groundWaves.filter(wave => {
      const next = Math.min(wave.range, wave.distance + wave.speed * dt);
      const start = wave.contactReach ? -wave.contactReach : wave.distance;
      for (const id of run.heroOrder) {
        const hero = run.heroes[id];
        const offset = (hero.x - wave.origin) * wave.direction;
        if (!hero.alive || wave.hit.has(id) || offset < start || offset > next) continue;
        wave.hit.add(id);
        meleeImpact(run, wave.caster, hero, wave.kind);
        hitHero(run, hero, wave.damage);
        if (hero.alive && wave.stun) interruptHero(run, hero, "stunned", wave.stun);
      }
      wave.distance = next;
      return next < wave.range;
    });
  }

  function enemyAttack(run, e, target, dt, justStopped) {
    e.atkT -= dt;
    const { buff, howl, smash, freeze } = e.def;
    if (buff) e.buffT -= dt;
    if (howl) e.howlT -= dt;
    if (freeze) e.freezeT -= dt;
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
      const heavy = !!smash && e.smashT <= e.interval;
      const buffing = !!buff && e.buffT <= 0 && buffAllies(run, buff).length > 0;
      const howling = !!howl && e.howlT <= 0;
      const freezing = !!freeze && e.freezeT <= 0;
      const move = howling ? howl : freezing ? freeze : buffing ? buff : heavy ? smash : e.def.attack;
      // Старая конфигурация из кэша может не содержать параметров анимации.
      const windup = move?.windup ?? (e.def.ranged ? 0.55 : 0.42);
      const recovery = move?.recovery ?? 0.33;
      if (e.atkT > windup) return;
      // Первый удар в ближнем бою получает полный замах после подхода.
      if (justStopped) e.atkT = windup;
      let lockedTarget = null;
      if (freezing) {
        const candidates = run.heroOrder.map(id => run.heroes[id]).filter(hero => hero.alive);
        lockedTarget = candidates[Math.floor(Math.random() * candidates.length)];
      }
      e.attack = { windup, recovery, heavy, buffing, howling, freezing, lockedTarget,
        beam: !!move?.beam, projectile: move?.projectile,
        impact: move?.impact, wave: move?.wave, party: move?.party,
        groundX: heavy ? Math.max(0, e.x - e.h * smash.contactOffset) : null, hit: false, t: 0 };
    }
    const attack = e.attack;
    const aimed = attack.lockedTarget ?? target;
    attack.targetX = aimed.x;
    attack.targetY = torsoY(aimed);
    attack.t = attack.windup - Math.max(0, e.atkT);
    if (e.atkT > 0) return;

    attack.hit = true;
    e.atkT = e.interval;
    if (attack.howling) {
      e.howlT = howl.cooldown;
      howlAtParty(run, e);
      return;
    }
    if (attack.freezing) {
      e.freezeT = freeze.cooldown;
      if (aimed.alive) queueAttack(run, e, aimed, "frost", 0, { flight: freeze.flight, arc: 44 });
      return;
    }
    if (attack.buffing) {
      e.buffT = buff.cooldown;
      for (const unit of buffAllies(run, buff)) {
        applyStatus(unit, buff.id);
        run.fx.push({ type: "status", unit, id: buff.id });
      }
      return;
    }
    if (attack.heavy) {
      e.smashT = smash.everySec;
      const origin = attack.groundX;
      run.groundWaves.push({ kind: "smash", caster: e, damage: attackDamage(e, e.dmg * smash.dmgMul),
        origin, range: origin, speed: smash.speed, distance: 0, direction: -1, stun: smash.stun,
        contactReach: smash.contactReach, hit: new Set() });
      run.fx.push({ type: "groundSmash", x: origin });
      return;
    }
    if (smash) e.smashT -= e.interval;
    const dmg = e.dmg;
    if (e.def.ranged && !attack.beam) {
      if (attack.projectile === "necroticOrb") {
        queueAttack(run, e, target, "necroticOrb", dmg, { flight: 0.40, arc: 8 });
      } else {
        queueAttack(run, e, target, "enemyArrow", dmg, { flight: 0.28, arc: 18, offsetX: 18 });
      }
    } else if (attack.beam) {
      run.fx.push({ type: "necroticBeam", caster: e, x: attack.targetX, y: attack.targetY });
      hitHero(run, target, attackDamage(e, dmg));
    } else {
      const targets = attack.party
        ? run.heroOrder.map(id => run.heroes[id]).filter(h => h.alive)
        : [target];
      const damage = attackDamage(e, dmg);
      for (const hero of targets) {
        meleeImpact(run, e, hero, attack.impact || "enemy");
        hitHero(run, hero, damage);
      }
      if (attack.wave && !run.over) {
        run.groundWaves.push({ ...attack.wave, kind: "claw", caster: e, damage, origin: target.x, distance: 0,
          direction: Math.sign(target.x - e.x) || e.facing, hit: new Set([target.id]) });
      }
    }
  }

  // --- Тик ---
  function tick(run, dt) {
    if (run.over) return;
    const cfg = C();
    beginSummons(run);
    for (const enemy of run.enemies) {
      tickStatuses(enemy, dt);
      tickRegeneration(run, enemy, dt);
    }
    for (const id of run.heroOrder) {
      const hero = run.heroes[id], pose = hero.attackPose;
      tickFreeze(run, hero, dt);
      tickStatuses(hero, dt);
      if (!pose) continue;
      pose.t += dt;
      if (pose.t >= pose.duration) hero.attackPose = null;
    }
    if (run.over) return;
    resolveAttacks(run, dt);
    if (run.over) return;
    if (run.groundWaves.length) advanceGroundWaves(run, dt);
    if (run.over) return;
    advanceWarrior(run, dt);
    const battle = inBattle(run);
    const warrior = run.heroes.warrior, priest = run.heroes.priest, ranger = run.heroes.ranger;
    for (const [id, left] of run.skillCooldowns) {
      if (left <= dt + 1e-9) run.skillCooldowns.delete(id);
      else run.skillCooldowns.set(id, left - dt);
    }

    // Ресурсы: реген ТОЛЬКО в бою (спека: между комнатами ничего не восстанавливается)
    if (battle) {
      const R = cfg.resources;
      if (warrior.alive) warrior.rage = Math.min(R.rage.max, warrior.rage + (R.rage.regenPerSec + (run.stats.wRageRegen || 0)) * dt);
      if (ranger.alive) {
        let focusRegen = R.focus.regenPerSec + (run.stats.rFocusRegen || 0);
        if (run.autoSkills.has("multishot")) {
          focusRegen = focusRegen * cfg.skills.multishot.focusRegenMultiplier + (run.stats.multishotHaste || 0);
        }
        ranger.focus = Math.min(R.focus.max, ranger.focus + focusRegen * dt);
      }
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
        if (!controlled(warrior) && !warrior.walking && !warrior.attackPose && warrior.atkT <= 0 && tgt && Math.abs(tgt.x - warrior.x) < SWORD_RANGE) {
          warrior.atkT = warrior.interval;
          if (!run.autoSkills.has("powerStrike") || !castTargeted(run, "powerStrike", tgt)) {
            const windup = startAttackPose(warrior, Math.min(warrior.interval, AUTO_MOTION.warrior), cfg.battle.warriorContact);
            queueAttack(run, warrior, tgt, "sword", warrior.dmg, { windup });
          }
        }
      }
      // Лучник: стрельба по ближайшему к нему
      if (ranger.alive) {
        ranger.atkT -= dt;
        const tgt = nearestEnemy(run, ranger.x);
        if (!controlled(ranger) && !ranger.attackPose && ranger.atkT <= 0 && tgt) {
          if (!run.autoSkills.has("multishot") || !useMultishot(run, tgt)) {
            const windup = startAttackPose(ranger, Math.min(ranger.interval, AUTO_MOTION.ranger), ARROW_RELEASE);
            queueAttack(run, ranger, tgt, "arrow", ranger.dmg, { windup, flight: 0.22, arc: 26, offsetX: -12 });
          }
          ranger.atkT = ranger.interval;
        }
      }
      if (priest.alive) castPriestAuto(run, priest);
    }

    // Враги: melee подходят к переднему герою, все бьют переднего живого
    for (const e of run.enemies) {
      if (!e.alive) continue;
      if (e.appearT > 0) { e.appearT -= dt; continue; }
      if (e.ritual) {
        const ritual = e.ritual;
        ritual.t += dt;
        if (!ritual.hit && ritual.t >= ritual.duration) finishSummon(run, e);
        if (ritual.t >= ritual.duration + cfg.battle.castReleaseFlash) e.ritual = null;
        continue;
      }
      const target = frontHero(run);
      if (!target) break;
      const wasWalking = e.walking;
      if (!e.def.ranged && !e.attack?.howling) {
        const stopX = target.x + (e.def.stopRange ?? 95) + e.lane;
        if (e.x > stopX) {
          const step = Math.min(e.x - stopX, (e.def.speed ?? 170) * dt);
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
    const cost = Math.max(1, s.cost - (run.stats[skillId + "Cost"] || 0));
    const left = s.type === "auto" ? Math.max(0, h.atkT) : (run.skillCooldowns.get(skillId) || 0);
    const cooldown = skillId === "heal" ? C().heroes.priest.healCD : s.cooldown;
    const duration = s.type === "auto" ? h.interval : Math.max(1, cooldown - (run.stats[skillId + "Haste"] || 0));
    const frozen = h.effects.has("frozen"), stunned = h.effects.has("stunned");
    const casting = s.owner === "priest" && Boolean(h.attackPose);
    return { cost, left, duration, frozen, stunned, casting,
      ready: run.equipped.has(skillId) && h.alive && !frozen && !stunned && !casting && left === 0 && h[s.res] >= cost };
  }

  function spendSkill(run, skillId, hero, resource) {
    const state = skillStatus(run, skillId);
    if (!state.ready) return false;
    hero[resource] -= state.cost;
    if (C().skills[skillId].type !== "auto") run.skillCooldowns.set(skillId, state.duration);
    return true;
  }

  function useTargeted(run, skillId, enemyUid) {
    if (run.over || !inBattle(run)) return false;
    const e = run.enemies.find(x => x.uid === enemyUid && x.alive);
    const s = C().skills[skillId];
    if (!e || s?.type !== "targeted" || (s.manualWhileAuto === false && run.autoSkills.has(skillId))) return false;
    return castTargeted(run, skillId, e);
  }

  function castTargeted(run, skillId, e) {
    const s = C().skills[skillId];
    const h = run.heroes[s.owner];
    if (!spendSkill(run, skillId, h, s.res)) return false;
    if (skillId === "fireball") {
      const windup = startAttackPose(h, AUTO_MOTION.priest, s.release);
      queueAttack(run, h, e, "fire", s.dmg + (run.stats.fireDmg || 0),
        { windup, flight: s.flight, offsetX: -12 });
      return true;
    }
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
      const precise = (s.dmg + (run.stats.rPrecision || 0)) * (1 + (e.boss ? run.stats.preciseBoss || 0 : 0));
      queueAttack(run, h, e, "precise", precise, { windup, flight: 0.20, arc: 5 });
    }
    return true;
  }

  function useHeal(run, heroId) {
    const target = run.heroes[heroId];
    const priest = run.heroes.priest;
    const s = C().skills.heal;
    if (run.over || !target?.alive) return false;
    if (target.hp >= target.maxHp) return "full";
    if (!spendSkill(run, "heal", priest, s.res)) return false;
    priest.attackPose = { name: "heal", duration: s.animation, t: 0 };
    const urgent = target.hp / target.maxHp <= 0.35 ? (run.stats.healOverflow || 0) : 0;
    restoreHealth(run, target, priest.heal + urgent, { critical: rollCritical(priest) });
    applyStatus(target, "healWard", run.stats.healWard);
    return true;
  }

  function useInstant(run, skillId) {
    if (run.over || !inBattle(run)) return false;
    const s = C().skills[skillId];
    if (s?.type !== "instant") return false;
    const h = run.heroes[s.owner];
    if (!spendSkill(run, skillId, h, s.res)) return false;
    h.blockT = s.durSec + run.stats.blockDur;
    h.blockDuration = h.blockT;
    restoreHealth(run, h, run.stats.blockHeal || 0);
    return true;
  }

  function useMultishot(run, first) {
    const id = "multishot", s = C().skills[id], ranger = run.heroes.ranger;
    if (!spendSkill(run, id, ranger, s.res)) return false;
    const others = run.enemies.filter(enemy => enemy.alive && enemy !== first)
      .sort((a, b) => Math.abs(a.x - ranger.x) - Math.abs(b.x - ranger.x));
    const targets = [first, ...others].slice(0, s.targets);
    const windup = startAttackPose(ranger, Math.min(ranger.interval, SKILL_SWING.multishot), ARROW_RELEASE, id);
    const power = s.arrowDamage + (run.stats.rFan || 0) * 0.02;
    for (let i = 0; i < s.targets; i++) {
      const targetIndex = i % targets.length, lane = i === 1 ? -1 : i === 2 ? 1 : 0;
      const repeats = targetIndex + targets.length < s.targets;
      const bonus = repeats ? (run.stats.rExtraArrow || 0) * 0.03 : 0;
      queueAttack(run, ranger, targets[targetIndex], "multi", ranger.dmg * (power + bonus), {
        windup, flight: 0.28, arc: 27 + lane * 15, offsetY: repeats ? lane * 10 : 0
      });
    }
    return true;
  }

  function setAuto(run, id, enabled) {
    if (!C().skills[id]?.auto || !run.equipped.has(id) || run.over) return;
    if (enabled) run.autoSkills.add(id);
    else run.autoSkills.delete(id);
  }

  // Зелье; запрет при полном HP → "full"
  function usePotion(run, heroId, { fromFloor = false } = {}) {
    const h = run.heroes[heroId];
    if (run.over || !h?.alive || (!fromFloor && run.potionsLeft <= 0)) return false;
    if (h.hp >= h.maxHp) return "full";
    if (!fromFloor) run.potionsLeft--;
    restoreHealth(run, h, C().loot.potionHealBase + run.stats.potionStr, { potion: true });
    const splash = run.stats.potionSquadHeal || 0;
    if (splash > 0) for (const hero of Object.values(run.heroes)) {
      if (hero !== h && hero.alive) restoreHealth(run, hero, splash, { potion: true });
    }
    return true;
  }

  return { createRun, spawnRoom, tick, useTargeted, useInstant, useHeal, setAuto, usePotion,
           inBattle, frontHero, nearestEnemy, skillStatus, activeStatuses, applyStatus };
})();
