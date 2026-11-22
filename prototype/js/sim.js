// DWR :: sim.js — симуляция боя: чистая логика без DOM (проверяется headless в Node).
// Контракт: DWR.Sim.createRun/spawnRoom/tick/useTargeted/useHeal/useInstant/setAuto/usePotion.
// Рендер (run.js) читает эффекты кадра и события исхода боя.
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
  const controlled = unit => unit.effects.has("stunned") || unit.effects.has("frozen") || unit.effects.has("riftImpaled");
  const arrowShots = new Set(["arrow", "enemyArrow", "multi", "precise"]);
  const bossSpecialAttacks = new Set(["smash", "stunStrike"]);
  const areaAttacks = new Set(["smash", "claw", "clawWave", "riftFireball"]);
  const attackSkills = { fire: "fireball", slash: "powerStrike", multi: "multishot", precise: "preciseShot" };
  const canRaise = kind => kind === "skeletonW" || kind === "skeletonA";
  const acceptsFire = enemy => enemy.def.fireDamageMultiplier !== 0;
  const bombChargeKey = id => id === "noiseBomb" ? "noiseBombsLeft" : "bombsLeft";
  const soundCue = (run, cue, x) => run.fx.push({ type: "sound", cue, x });

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
      enemies: [], fx: [], events: [], attacks: [], groundWaves: [], tornadoes: [], bombThrows: [],
      combatReports: [], combatRoom: null, fusion: null,
      equipped, autoSkills, skillCooldowns: new Map(), over: null,
      potionsLeft: DWR.State.data.panel.includes("potion") ? st.potionStock : 0,
      bombsLeft: equipped.has("bomb") ? DWR.State.bombStock(st) : 0,
      noiseBombsLeft: equipped.has("noiseBomb") ? DWR.State.bombStock(st, "noiseBomb") : 0,
      stats: st
    };
  }

  function inBattle(run) { return Boolean(run.fusion) || run.enemies.some(e => e.alive); }
  const targetable = enemy => enemy?.alive && !enemy.rift?.hidden;
  const vulnerable = enemy => targetable(enemy) && !enemy.effects.has("riftStone");
  function rollCritical(unit) {
    return Math.random() < unit.critChance;
  }

  function restoreHealth(run, hero, value, { potion = false, critical = false, massHeal = false, caster, skill } = {}) {
    if (critical) value *= C().critical.multiplier;
    const amount = Math.min(hero.maxHp - hero.hp, value);
    if (amount <= 0) return;
    hero.hp += amount;
    const report = run.combatRoom?.heroes[hero.id];
    if (report) {
      report.healingReceived += amount;
      if (potion) report.potionHealing += amount;
      if (caster) {
        const healing = run.combatRoom.heroes[caster.id].healing;
        healing[skill] = (healing[skill] ?? 0) + amount;
      }
    }
    run.fx.push({ type: "heal", unit: hero, amount, potion, critical, massHeal });
  }

  function castPriestAuto(run, priest, battle) {
    if (priest.attackPose) return;
    if (run.autoSkills.has("dispel") && skillStatus(run, "dispel").ready) {
      const target = dispelTarget(run) ?? nearestEnemy(run, priest.x, canDispelEnemy);
      if (target && useDispel(run, target.id ?? target.uid)) return;
    }
    if (!battle && !hasHeroDamageEffect(run)) return;
    if (run.autoSkills.has("massHeal") && skillStatus(run, "massHeal").ready) {
      const { heal } = C().skills.massHeal;
      const wounded = Object.values(run.heroes).filter(hero => hero.alive && hero.hp < hero.maxHp);
      if (wounded.length >= 2 && wounded.reduce((missing, hero) => missing + hero.maxHp - hero.hp, 0) >= heal &&
          useInstant(run, "massHeal")) return;
    }
    const autoHeal = run.autoSkills.has("heal");
    if (autoHeal && skillStatus(run, "heal").ready) {
      let target = null;
      for (const id of run.heroOrder) {
        const hero = run.heroes[id];
        if (hero.alive && hero.hp < hero.maxHp && (!target || hero.hp < target.hp)) target = hero;
      }
      if (target && useHeal(run, target.id)) return;
    }
    const reserve = autoHeal ? skillStatus(run, "heal").cost : 0;
    const autoFireball = run.autoSkills.has("fireball");
    const target = autoFireball ? rangedTarget(run, priest.x, acceptsFire) : null;
    if (!target?.flanking && run.autoSkills.has("fireTornado") && canLaunchTornado(run, acceptsFire) &&
        beginPriestCast(run, "fireTornado")) return;
    if (!target) return;
    if (priest.mana < skillStatus(run, "fireball").cost + reserve) return;
    useTargeted(run, "fireball", target.uid);
  }
  function frontHero(run) {
    for (const id of run.heroOrder) if (run.heroes[id].alive) return run.heroes[id];
    return null;
  }
  function nearestEnemy(run, x, include = () => true) {
    let best = null, bd = Infinity;
    for (const e of run.enemies) if (targetable(e) && include(e)) {
      const d = Math.abs(e.x - x);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function warriorRearGuard(run) {
    const { warrior, priest, ranger } = run.heroes;
    return [priest, ranger].find(hero => hero.alive && hero.x <= warrior.x);
  }

  function warriorObstructed(run, enemy) {
    const guard = warriorRearGuard(run);
    return guard && enemy.x <= guard.x;
  }

  const warriorTarget = (run, warrior) =>
    nearestEnemy(run, warrior.x, enemy => enemy.x >= warrior.x && vulnerable(enemy)) ??
    nearestEnemy(run, warrior.x, enemy => enemy.x >= warrior.x) ??
    nearestEnemy(run, warrior.x, enemy => vulnerable(enemy) && !warriorObstructed(run, enemy)) ??
    nearestEnemy(run, warrior.x);
  const canWarriorTarget = (run, enemy) => {
    const x = run.heroes.warrior.x;
    return !warriorObstructed(run, enemy) &&
      (enemy.x >= x || !run.enemies.some(unit => targetable(unit) && unit.x >= x));
  };
  function rangedTarget(run, x, include = () => true) {
    const canHit = enemy => vulnerable(enemy) && include(enemy);
    return nearestEnemy(run, x, enemy => enemy.flanking && canHit(enemy)) ?? nearestEnemy(run, x, canHit);
  }

  function enemyTarget(run, enemy) {
    if (!enemy.flanking) return frontHero(run);
    const { warrior, priest, ranger } = run.heroes;
    const rear = priest.alive && (!ranger.alive || Math.abs(priest.x - enemy.x) <= Math.abs(ranger.x - enemy.x))
      ? priest : ranger.alive ? ranger : null;
    if (!rear) return frontHero(run);
    // Ближайший герой на пути закрывает проход к цели.
    const tankBlocks = warrior.alive && warrior.x >= Math.min(enemy.x, rear.x) && warrior.x <= Math.max(enemy.x, rear.x);
    return tankBlocks ? warrior : rear;
  }

  // --- Заспавнить комнату (roomIndex — индекс в CONFIG.rooms) ---
  function spawnRoom(run, roomIndex) {
    const cfg = C();
    const room = cfg.rooms[roomIndex];
    const heroes = Object.fromEntries(run.heroOrder.map(id => [id, {
      damage: {}, healing: {}, healingReceived: 0, potionHealing: 0, death: null
    }]));
    run.combatRoom = { roomIndex, heroes };
    run.combatReports.push(run.combatRoom);
    for (const id of run.heroOrder) {
      const hero = run.heroes[id];
      if (hero.alive) {
        hero.x = cfg.heroes[id].x * cfg.canvas.w;
        hero.facing = 1;
      }
      hero.walking = false;
      hero.walkDistance = 0;
      hero.attackPose = null;
    }
    const isCombat = !room.boss && !room.chest;
    const mm = isCombat ? 1 + cfg.enemyGrowthPerRoom * (room.tier ?? roomIndex) : 1;
    run.enemies = [];
    const list = room.enemies;
    const spawnTo = cfg.enemies[list[0]]?.rift ? 0.885 : cfg.battle.enemyXTo;
    list.forEach((kind, i) => {
      const span = spawnTo - cfg.battle.enemyXFrom;
      const frac = list.length === 1 ? 0.5 : i / (list.length - 1);
      const x = (cfg.battle.enemyXFrom + span * frac) * cfg.canvas.w;
      run.enemies.push(createEnemy(kind, x, mm, i));
    });
    run.fusion = room.fusion ? { kind: room.fusion, parts: run.enemies.slice(), delay: null } : null;
    run.fx = []; run.events = []; run.attacks = []; run.groundWaves = []; run.tornadoes = []; run.bombThrows = [];
    const priest = run.heroes.priest;
    if (priest.alive) priest.mana = Math.min(priest.manaMax, priest.mana + (run.stats.manaOnRoom || 0));
  }

  function createEnemy(kind, x, multiplier, index) {
    const def = C().enemies[kind];
    const hp = Math.round(def.hp * multiplier);
    const goblinScale = kind === "goblinW" || kind === "goblinA" ? 0.79 : 1;
    const enemy = {
      uid: uidSeq++, kind, def, x, multiplier, facing: -1, boss: !!def.boss,
      h: Math.round(HERO_H * def.sizeMul * goblinScale),
      hp, maxHp: hp, dmg: def.dmg * multiplier, interval: def.interval,
      armor: def.armor ?? 0,
      alive: true, atkT: 1.2 + index * 0.3, walking: !def.ranged, walkDistance: 0, attack: null,
      effects: new Map(), buffT: def.buff?.initial ?? 0,
      guardT: def.guard?.initial ?? 0, stunStrikeT: def.stunStrike?.initial ?? 0,
      furnaceT: def.furnace?.interval ?? 0,
      summonT: 0,
      smashT: def.smash?.everySec || 0, howlT: def.howl?.initial ?? 0, freezeT: def.freeze?.initial ?? 0,
      lane: (def.formationGap ?? (kind === "skeletonW" ? 36 : 0)) * (index % 2)
    };
    if (def.rift) enemy.rift = {
      cooldowns: Object.fromEntries(def.rift.moves.map(move => [move, C().riftMoves[move].initial])),
      motion: null, hidden: false, nextFire: false
    };
    if (def.fusionPart) enemy.noLoot = true;
    return enemy;
  }

  function summonPopulation(run, lord) {
    const ritual = lord.ritual;
    let count = ritual?.kind === "summon" && !ritual.hit ? lord.def.summon.minions.length : 0;
    for (const unit of run.enemies) {
      if (!unit.alive) continue;
      if (unit.summonedBy === lord.uid) count++;
      if (unit.ritual?.corpse?.summonedBy === lord.uid && !unit.ritual.hit) count++;
    }
    return count;
  }

  function hasRoomToRaise(run, corpse) {
    if (!corpse.summonedBy) return true;
    const lord = run.enemies.find(unit => unit.uid === corpse.summonedBy && unit.alive);
    return !lord || summonPopulation(run, lord) < lord.def.summon.maxActive;
  }

  function tickRitual(run, caster, dt) {
    const { summon, raise } = caster.def;
    if (summon) caster.summonT -= dt;
    const ritual = caster.ritual;
    if (ritual) {
      ritual.t += dt;
      if (!ritual.hit && ritual.t + 1e-9 >= ritual.duration) {
        ritual.hit = true;
        if (ritual.kind === "raise") finishRaise(run, caster, ritual.corpse);
        else finishSummon(run, caster, ritual.reinforcements);
      }
      if (ritual.t >= ritual.duration + C().battle.castReleaseFlash) caster.ritual = null;
      return true;
    }
    if (caster.attack) return false;

    if (summon && caster.summonT <= 0) {
      if (summonPopulation(run, caster) + summon.minions.length > summon.maxActive) return false;
      const reinforcements = Boolean(caster.summoned);
      caster.ritual = { kind: "summon", t: 0, duration: reinforcements ? summon.repeatSeconds : summon.seconds,
        hit: false, reinforcements };
      caster.summonT = summon.cooldown;
      return true;
    }
    if (!raise || caster.hasRaised) return false;
    const corpse = run.enemies.find(unit => !unit.alive && canRaise(unit.kind) &&
      !unit.raised && !unit.reanimated && !unit.raiseBy && hasRoomToRaise(run, unit));
    if (!corpse) return false;
    corpse.raiseBy = caster;
    caster.facing = Math.sign(corpse.x - caster.x) || caster.facing;
    caster.ritual = { kind: "raise", t: 0, duration: raise.seconds, hit: false, corpse };
    return true;
  }

  function cancelRitual(unit) {
    if (unit.ritual?.corpse?.raiseBy === unit) unit.ritual.corpse.raiseBy = null;
    unit.ritual = null;
  }

  function finishRaise(run, caster, corpse) {
    corpse.raised = true;
    corpse.raiseBy = null;
    caster.hasRaised = true;
    const unit = createEnemy(corpse.kind, corpse.x, corpse.multiplier, 0);
    unit.reanimated = unit.noLoot = true;
    unit.summonedBy = corpse.summonedBy;
    const warrior = run.heroes.warrior;
    unit.flanking = corpse.flanking || (warrior.alive && corpse.x < warrior.x);
    unit.facing = Math.sign(enemyTarget(run, unit).x - unit.x) || unit.facing;
    unit.appearT = 0.4;
    run.enemies.push(unit);
    run.fx.push({ type: "raise", unit, corpse });
  }

  function finishSummon(run, lord, reinforcements) {
    const rearX = Math.min(...Object.values(run.heroes).filter(hero => hero.alive).map(hero => hero.x));
    const minions = lord.def.summon.minions.map((kind, i, types) => {
      const flanking = reinforcements && canRaise(kind);
      const x = flanking ? Math.max(48 + 65 * i, rearX - 132 + 65 * i) : lord.x - (types.length - i) * 102;
      const unit = createEnemy(kind, x, 1, i);
      unit.flanking = flanking;
      unit.summonedBy = lord.uid;
      unit.noLoot = reinforcements;
      unit.facing = flanking ? 1 : -1;
      unit.appearT = 0.4;
      return unit;
    });
    lord.summoned = true;
    run.enemies.push(...minions);
    run.fx.push({ type: "summon", minions, caster: lord });
  }

  // --- Урон ---
  function masteryAdjustedDamage(run, hero, damage, enemy, ability) {
    const effect = C().effects[ability];
    if (hero.id === "warrior" && C().enemies[enemy]?.boss && (effect?.bossSpecial || bossSpecialAttacks.has(ability))) {
      return damage * (1 - (run.stats.wBossGuard || 0));
    }
    if (hero.id === "ranger" && (effect?.area || areaAttacks.has(ability))) {
      return damage * (1 - (run.stats.rAreaGuard || 0));
    }
    return damage;
  }

  function hitHero(run, target, dmg, enemy, ability) {
    if (!target.alive) return;
    const hero = damageRecipient(run, target);
    let d = masteryAdjustedDamage(run, hero, dmg, enemy.kind, ability);
    if (hero.id === "warrior") {
      d *= 1 - (run.stats.wArmor || 0);
      if (hero.blockT > 0) d *= (1 - C().skills.block.dmgReduce);
    }
    for (const id of hero.effects.keys()) d *= C().effects[id]?.damageTakenMultiplier ?? 1;
    damageHero(run, hero, Math.max(1, Math.round(d)), enemy.kind, ability, target);
  }

  function damageRecipient(run, hero) {
    const warrior = run.heroes.warrior;
    if (hero === warrior || !warrior.alive || !warrior.effects.has("sacrifice")) return hero;
    run.fx.push({ type: "sacrificeRedirect", from: hero, to: warrior });
    return warrior;
  }
  function damageHero(run, hero, amount, enemy, ability, target, kind) {
    const barrier = hero.effects.get("healBarrier");
    if (barrier?.capacity > 0) {
      const absorbed = Math.min(amount, barrier.capacity);
      barrier.capacity -= absorbed;
      if (barrier.capacity <= 1e-9) hero.effects.delete("healBarrier");
      run.fx.push({ type: "absorb", unit: hero, amount: absorbed });
      amount -= absorbed;
      if (amount <= 1e-9) return;
    }
    hero.hp -= amount;
    run.fx.push({ type: "hurt", unit: hero, amount, kind });
    if (hero.hp <= 0) {
      hero.hp = 0; hero.alive = false;
      if (run.combatRoom) {
        run.combatRoom.heroes[hero.id].death = { enemy, ability, redirectedFrom: target === hero ? null : target.id };
      }
      run.events.push({ type: "heroDead", hero });
      if (!frontHero(run)) { run.over = "wipe"; run.events.push({ type: "wipe" }); }
    }
  }
  function hitEnemy(run, e, dmg, critical, caster, skill, melee = false) {
    if (!vulnerable(e)) return false;
    if (skill === "fireball" || skill === "fireTornado") {
      if (!acceptsFire(e)) return false;
      dmg *= e.def.fireDamageMultiplier ?? 1;
    }
    if (critical) dmg *= C().critical.multiplier;
    dmg = effectMultiplier(e, "damageTakenMultiplier", dmg);
    const armored = e.armor > 0;
    const dealt = Math.min(dmg, armored ? e.armor : e.hp);
    if (run.combatRoom && dealt > 0) {
      const abilities = run.combatRoom.heroes[caster.id].damage;
      const damage = abilities[skill] ??= { health: 0, armor: 0 };
      damage[armored ? "armor" : "health"] += dealt;
    }
    if (e.furnaceCast) {
      e.furnaceCast.remaining = Math.max(0, e.furnaceCast.remaining - dealt);
      if (e.furnaceCast.remaining <= 1e-9) {
        e.furnaceCast = null;
        run.fx.push({ type: "furnaceInterrupt", unit: e });
      }
    }
    if (armored) {
      // Последний удар по пластинам разрушает броню целиком. Следующий уже снимает здоровье.
      e.armor -= dealt;
      run.fx.push({ type: "hurt", unit: e, amount: Math.round(dealt), critical, kind: "armor" });
      if (e.armor === 0) grantStatus(run, e, "kragRage");
      return false;
    }
    e.hp -= dmg;
    run.fx.push({ type: "hurt", unit: e, amount: Math.round(dmg), critical });
    if (dmg > 0 && melee && caster.alive && e.effects.has("riftCloak")) stackRiftCloak(run, caster, e);
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      e.furnaceCast = null;
      cancelRitual(e);
      if (e.def.escape) {
        e.attack = null;
        e.escape = { elapsed: 0 };
        soundCue(run, "teleport", e.x);
      } else {
        if (e.rift) { e.attack = null; e.rift.motion = null; }
        run.events.push({ type: "kill", unit: e, boss: e.boss && !e.def.fusionPart });
        grantDefeatResources(run);
      }
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

  function grantDefeatResources(run) {
    const resources = C().resources;
    const { warrior, ranger, priest } = run.heroes;
    if (warrior.alive) warrior.rage = Math.min(resources.rage.max, warrior.rage + resources.rage.perKill + (run.stats.wRageKill || 0));
    if (ranger.alive) {
      let earned = resources.focus.perKill + (run.stats.rFocusKill || 0);
      if (run.autoSkills.has("multishot")) earned = earned * C().skills.multishot.focusOnKillMultiplier + (run.stats.multishotKillFocus || 0);
      ranger.focus = Math.min(resources.focus.max, ranger.focus + earned);
    }
    if (priest.alive) priest.mana = Math.min(priest.manaMax, priest.mana + (run.stats.manaOnKill || 0));
  }

  function tickEscape(run, enemy, dt) {
    const { escape } = enemy;
    if (!escape || escape.finished) return;
    const { duration } = enemy.def.escape;
    escape.elapsed = Math.min(duration, escape.elapsed + dt);
    if (escape.elapsed + 1e-9 < duration) return;
    escape.elapsed = duration;
    escape.finished = true;
    for (const attack of run.attacks) {
      if (attack.caster === enemy && attack.kind === "frost") attack.cancelled = true;
    }
    for (const hero of Object.values(run.heroes)) {
      if (hero.effects.get("frozen")?.source === enemy.kind) thawHero(run, hero);
    }
    grantDefeatResources(run);
    run.events.push({ type: "bossEscaped", unit: enemy });
  }

  const grounded = { lift: 0, height: 0 };
  function spikeElevation(unit) {
    const effect = unit.effects.get("riftImpaled");
    if (!effect || !unit.alive) return grounded;
    const growth = Math.min(1, (effect.duration - effect.left) / 0.19, effect.left / 0.34);
    const height = effect.height * 0.94 * growth * growth * (3 - 2 * growth);
    return { height, sourceHeight: effect.height, lift: Math.max(0, height - unit.h * 0.52) };
  }

  // Координаты корпусов для визуальных линий (y — смещение от пола).
  const torsoY = unit => -unit.h * 0.55 - spikeElevation(unit).lift;

  function meleeImpact(run, caster, target, kind) {
    const side = Math.sign(caster.x - target.x) || -caster.facing;
    const reach = target.def?.rift ? Math.min(target.h * 0.36, Math.abs(caster.x - target.x) * 0.7)
      : Math.min(22, target.h * 0.12);
    const x = target.x + side * reach;
    run.fx.push({ type: "meleeImpact", kind, x, y: torsoY(target), side, blocked: target.blockT > 0 });
  }

  function applyStatus(unit, id, duration = C().effects[id]?.duration, source) {
    if (duration > 0) unit.effects.set(id, { id, duration, left: duration, source, untilTick: unit.effects.get(id)?.untilTick });
  }

  function grantStatus(run, unit, id, source) {
    applyStatus(unit, id, undefined, source);
    run.fx.push({ type: "status", unit, id });
  }

  function stackRiftCloak(run, hero, source) {
    const id = "riftCloakBurn";
    const stacks = Math.min(C().effects[id].maxStacks, (hero.effects.get(id)?.stacks ?? 0) + 1);
    grantStatus(run, hero, id, source.kind);
    hero.effects.get(id).stacks = stacks;
  }

  function activeStatuses(unit) {
    const statuses = [...unit.effects.values()];
    if (unit.blockT > 0) statuses.push({ id: "block", left: unit.blockT,
      duration: unit.blockDuration || C().skills.block.durSec });
    return statuses;
  }

  function tickStatuses(unit, dt) {
    let next;
    for (const [id, status] of unit.effects) {
      status.left -= dt;
      if (status.left <= 1e-9) {
        unit.effects.delete(id);
        const after = C().effects[id]?.after;
        if (after) next = after;
      }
    }
    if (next) applyStatus(unit, next);
  }

  function hasHeroDamageEffect(run) {
    return run.heroOrder.some(id => {
      const hero = run.heroes[id];
      return hero.alive && [...hero.effects.keys()].some(effect => C().effects[effect]?.tickSec);
    });
  }

  function thawHero(run, hero) {
    if (hero.effects.delete("frozen")) run.fx.push({ type: "thaw", unit: hero });
  }

  function tickHeroDamage(run, hero, dt) {
    for (const status of hero.effects.values()) {
      const { tickSec, healthFraction } = C().effects[status.id] ?? {};
      if (!tickSec) continue;
      const frozen = status.id === "frozen";
      status.untilTick = (status.untilTick ?? tickSec) - Math.min(dt, status.left);
      while (hero.alive && status.untilTick <= 1e-9) {
        const recipient = damageRecipient(run, hero);
        const amount = masteryAdjustedDamage(run, recipient, hero.maxHp * healthFraction * (status.stacks ?? 1),
          status.source, status.id);
        damageHero(run, recipient, amount, status.source, status.id, hero, frozen ? "frost" : status.id);
        status.untilTick += tickSec;
      }
      if (frozen && (!hero.alive || status.left <= dt + 1e-9)) thawHero(run, hero);
    }
  }

  function interruptHero(run, hero, id, duration, source) {
    applyStatus(hero, id, duration, source);
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
    return effectMultiplier(unit, "damageMultiplier", value);
  }

  function meleeRange(enemy, base) {
    return base + (enemy.def.rift ? Math.max(0, enemy.h - 180) * 0.42 : 0);
  }

  function withinSwordRange(run, enemy) {
    return Math.abs(enemy.x - run.heroes.warrior.x) <= meleeRange(enemy, SWORD_RANGE);
  }

  function riftStopRange(enemy) {
    return Math.max(enemy.def.stopRange, meleeRange(enemy, C().battle.warriorStopRange)) + enemy.lane;
  }

  function effectMultiplier(unit, stat, value = 1) {
    for (const id of unit.effects.keys()) value *= C().effects[id]?.[stat] ?? 1;
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
    { windup = 0, flight = 0, arc = 0, offsetX = 0, offsetY = 0, skillId } = {}) {
    const direction = Math.sign(target.x - caster.x) || caster.facing;
    offsetX *= caster.id ? direction : -direction;
    const attack = { caster, target, kind, facing: caster.facing, damage: attackDamage(caster, damage), windup, flight, arc, offsetX, offsetY,
      skillId, t: 0, startX: null, x: target.x + offsetX, y: torsoY(target) + offsetY };
    if (kind === "sword" || kind === "powerStrike" || kind === "slash") soundCue(run, "swing", caster.x);
    if (windup <= 0) releaseAttack(run, attack);
    run.attacks.push(attack);
  }

  function releaseAttack(run, attack) {
    attack.startX = attack.caster.x;
    if (attack.skillId) startSkillCooldown(run, attack.skillId);
    const cue = attack.kind === "riftFireball" ? "firebolt" : attack.kind === "riftBoulder" ? "swing" : attack.kind;
    if (attack.flight > 0 && attack.kind !== "slash") soundCue(run, cue, attack.startX);
  }

  function resolveAttacks(run, dt) {
    if (!run.attacks.length) return;
    run.attacks = run.attacks.filter(attack => {
      if (attack.resolved || attack.cancelled) return false;
      if (attack.startX === null && !attack.caster.alive) return false;
      attack.t += dt;
      if (attack.t < attack.windup) return true;
      if (attack.startX === null) releaseAttack(run, attack);
      attack.x = attack.target.x + attack.offsetX;
      attack.y = torsoY(attack.target) + attack.offsetY;
      if (attack.t < attack.windup + attack.flight) return true;
      if (attack.target.alive && arrowShots.has(attack.kind)) soundCue(run, "arrowHit", attack.target.x);
      if (attack.target.alive && attack.kind === "firebolt") soundCue(run, "fireImpact", attack.target.x);

      if (attack.kind === "frost") {
        const hero = attack.target;
        if (hero.alive) {
          interruptHero(run, hero, "frozen", undefined, attack.caster.kind);
          run.fx.push({ type: "freeze", unit: hero });
        }
        return false;
      }
      if (attack.kind === "riftBoulder" || attack.kind === "riftFireball") {
        resolveRiftProjectile(run, attack);
        return false;
      }
      if (attack.target.id) {
        if (attack.damage > 0) hitHero(run, attack.target, attack.damage, attack.caster, attack.kind);
        if (attack.kind === "firebolt" && attack.target.alive) grantStatus(run, attack.target, "ember", attack.caster.kind);
      } else {
        const skill = attackSkills[attack.kind] ?? attack.kind;
        const splash = attack.kind === "fire" ? run.stats.fireballBlast : 0;
        const neighbors = splash > 0 ? run.enemies.filter(enemy =>
          vulnerable(enemy) && enemy !== attack.target && Math.abs(enemy.x - attack.target.x) <= 110) : [];
        const melee = attack.kind === "sword" || attack.kind === "powerStrike";
        const direct = attack.damage > 0 && vulnerable(attack.target) &&
          (!melee || !warriorObstructed(run, attack.target)) &&
          (attack.kind !== "sword" || withinSwordRange(run, attack.target));
        // Взрыв фаербола использует один бросок крита для всех задетых целей.
        const critical = (direct || neighbors.length > 0) && rollCritical(attack.caster);
        if (direct) {
          const power = attack.kind === "powerStrike" || attack.kind === "slash";
          if (attack.kind === "sword" || power) meleeImpact(run, attack.caster, attack.target, power ? "power" : "sword");
          if (hitEnemy(run, attack.target, attack.damage, critical, attack.caster, skill, melee) && attack.caster.alive && power) {
            attack.caster.rage = Math.min(C().resources.rage.max, attack.caster.rage + (run.stats.powerStrikeRefund || 0));
          }
        }
        for (const enemy of neighbors) hitEnemy(run, enemy, splash, critical, attack.caster, skill);
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
    const target = warriorTarget(run, warrior);
    if (!target) return;
    warrior.facing = Math.sign(target.x - warrior.x) || warrior.facing;
    const { warriorAdvanceSpeed, warriorStopRange, warriorRearGap } = C().battle;
    const speed = warriorAdvanceSpeed + (run.stats.wStride || 0);
    const guard = warrior.facing === -1 && warriorRearGuard(run);
    const approach = target.x - warrior.facing * meleeRange(target, warriorStopRange);
    const destination = guard ? Math.max(approach, guard.x + warriorRearGap) : approach;
    const distance = (destination - warrior.x) * warrior.facing;
    if (distance <= 0 || dt <= 0) return;
    const nextX = distance <= speed * dt ? destination : warrior.x + warrior.facing * speed * dt;
    warrior.walkDistance += Math.abs(nextX - warrior.x);
    warrior.walking = nextX !== warrior.x;
    warrior.x = nextX;
  }

  function specialAttackKey(unit) {
    const attack = unit.attack;
    if (attack?.riftMove) return C().riftMoves[attack.riftMove]?.cast ?? null;
    return attack?.freezing ? "frost" : attack?.howling ? "howl" : attack?.heavy ? "smash"
      : attack?.buffing ? (unit.def.buff.id === "orcWarCry" ? "orcWarCry" : "buff")
      : attack?.guarding ? "orcGuard" : attack?.stunning ? "hammerStun" : null;
  }

  function noiseBombHit(run, enemy, stun) {
    if (enemy.def.interruptImmune || enemy.effects.has("riftStone")) return;
    let interrupted = false;
    if (enemy.ritual && !enemy.ritual.hit) {
      cancelRitual(enemy);
      interrupted = true;
    }
    if (enemy.attack && !enemy.attack.hit) {
      const special = specialAttackKey(enemy);
      const timer = {
        frost: "freeze", howl: "howl", smash: "smash", orcWarCry: "buff", buff: "buff",
        orcGuard: "guard", hammerStun: "stunStrike"
      }[special];
      if (special && enemy.attack.riftMove) {
        cancelRiftCast(enemy);
        interrupted = true;
      } else if (timer) {
        enemy[timer + "T"] = enemy.def[timer].cooldown ?? enemy.def[timer].everySec;
        interrupted = true;
      }
      if (special || !enemy.boss) {
        enemy.attack = null;
        enemy.atkT = enemy.interval;
      }
    }
    if (interrupted) run.fx.push({ type: "castInterrupted", unit: enemy });
    if (enemy.boss) return;
    applyStatus(enemy, "stunned", stun);
    enemy.walking = false;
    enemy.attack = null;
  }

  function advanceHeroProjectiles(run, dt) {
    run.tornadoes = run.tornadoes.filter(tornado => {
      const edge = C().canvas.w;
      const next = Math.min(edge, tornado.x + tornado.speed * dt);
      for (const enemy of run.enemies) {
        if (!vulnerable(enemy) || tornado.hit.has(enemy) || enemy.x < tornado.origin ||
            enemy.x < tornado.x - 28 || enemy.x > next) continue;
        tornado.hit.add(enemy);
        hitEnemy(run, enemy, tornado.damage, rollCritical(tornado.caster), tornado.caster, "fireTornado");
        run.fx.push({ type: "tornadoHit", unit: enemy });
      }
      tornado.x = next;
      return next < edge;
    });
    run.bombThrows = run.bombThrows.filter(bomb => {
      bomb.t += dt;
      if (bomb.t + 1e-9 < bomb.flight) return true;
      for (const enemy of run.enemies) {
        if (targetable(enemy) && Math.abs(enemy.x - bomb.x) <= bomb.radius) {
          if (bomb.id === "noiseBomb") noiseBombHit(run, enemy, bomb.stun);
          else hitEnemy(run, enemy, bomb.damage, rollCritical(bomb.caster), bomb.caster, "bomb");
        }
      }
      run.fx.push({ type: bomb.id === "noiseBomb" ? "noiseBombImpact" : "bombImpact", x: bomb.x, radius: bomb.radius });
      return false;
    });
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
        if (wave.damage > 0) {
          meleeImpact(run, wave.caster, hero, wave.kind);
          hitHero(run, hero, wave.damage, wave.caster, wave.kind === "claw" ? "clawWave" : wave.kind);
        }
        if (hero.alive && wave.stun) interruptHero(run, hero, "stunned", wave.stun);
        if (hero.alive && wave.status) grantStatus(run, hero, wave.status, wave.caster.kind);
      }
      wave.distance = next;
      return next < wave.range;
    });
  }

  function tickFurnace(run, boss, dt) {
    const spec = boss.def.furnace;
    boss.furnaceT -= dt;
    if (boss.furnaceCast) {
      boss.furnaceCast.elapsed += dt;
      if (boss.furnaceCast.elapsed + 1e-9 < spec.duration) return;
      const edge = C().canvas.w;
      run.groundWaves.push({ kind: "furnace", caster: boss, origin: edge, range: edge, direction: -1,
        speed: spec.speed, distance: 0, damage: 0, status: spec.status, hit: new Set() });
      soundCue(run, "furnaceWave", boss.x);
      boss.furnaceCast = null;
    }
    if (boss.furnaceT <= 1e-9) {
      boss.furnaceT += spec.interval;
      boss.furnaceCast = { elapsed: 0, remaining: spec.interruptDamage };
      soundCue(run, "furnaceCharge", boss.x);
      // Молот продолжает обычный цикл, пока независимо заполняется полоса горна.
      if (boss.attack?.stunning && !boss.attack.hit) boss.attack = null;
    }
  }

  function chooseHero(run, include) {
    const candidates = run.heroOrder.map(id => run.heroes[id]).filter(hero => hero.alive && include(hero));
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }

  function resolveRiftProjectile(run, attack) {
    const { caster, target, damage, kind } = attack;
    if (kind === "riftBoulder") {
      if (!target.alive) return;
      const move = C().riftMoves.boulder;
      meleeImpact(run, caster, target, "smash");
      hitHero(run, target, damage, caster, kind);
      if (target.alive && Math.random() < move.stunChance) interruptHero(run, target, "stunned", move.stun, caster.kind);
      return;
    }
    const move = C().riftMoves.fireball;
    run.fx.push({ type: "fireImpact", x: attack.x, y: attack.y });
    for (const hero of Object.values(run.heroes)) {
      if (!hero.alive || Math.abs(hero.x - target.x) > move.radius) continue;
      hitHero(run, hero, damage * (hero === target ? 1 : move.splash), caster, kind);
      if (hero.alive && Math.random() < move.burnChance) grantStatus(run, hero, "riftBurn", caster.kind);
    }
  }

  function startRiftMotion(enemy, name, extras) {
    enemy.attack = null;
    enemy.walking = false;
    enemy.rift.motion = { name, elapsed: 0, duration: C().riftMotion[name], ...extras };
  }

  function cancelRiftCast(enemy) {
    const move = enemy.attack.riftMove;
    enemy.rift.cooldowns[move] = C().riftMoves[move].cooldown;
    enemy.attack = null;
    enemy.atkT = enemy.interval;
  }

  function endStone(enemy) {
    const motion = enemy.rift.motion;
    const remaining = motion?.name === "petrify" ? 1 - motion.elapsed / motion.duration : 0;
    enemy.effects.delete("riftStone");
    startRiftMotion(enemy, "unstone", { elapsed: remaining * C().riftMotion.unstone });
  }

  function tickRiftStone(run, enemy, dt) {
    const stone = enemy.effects.get("riftStone");
    if (!enemy.alive || !stone) return;
    const spec = C().effects.riftStone;
    stone.untilTick = (stone.untilTick ?? spec.tickSec) - Math.min(dt, stone.left);
    while (stone.untilTick <= 1e-9) {
      restoreHealth(run, enemy, enemy.maxHp * spec.regenFraction);
      stone.untilTick += spec.tickSec;
    }
    if (stone.left <= dt + 1e-9) endStone(enemy);
  }

  function tickFusion(run, dt) {
    const fusion = run.fusion;
    if (!fusion || fusion.parts.some(part => part.alive)) return;
    if (fusion.delay === null) fusion.delay = Math.max(...fusion.parts.map(part => part.def.fall.duration));
    fusion.delay -= dt;
    if (fusion.delay > 1e-9) return;
    const [earth, fire] = fusion.parts;
    const x = Math.max(210, Math.min((earth.x + fire.x) / 2, C().canvas.w - 205));
    const enemy = createEnemy(fusion.kind, x, 1, 0);
    earth.merged = true;
    fire.merged = true;
    enemy.rift.hidden = true;
    startRiftMotion(enemy, "merge", { sources: { earth, fire } });
    run.enemies.push(enemy);
    run.fusion = null;
    soundCue(run, "armorBreak", x);
  }

  function burrowExit(run, enemy) {
    const { ranger, priest } = run.heroes;
    const rear = Math.min(ranger.x, priest.x), front = Math.max(ranger.x, priest.x);
    const options = [0.075, 0.46, 0.69, 0.85].map(part => C().canvas.w * part)
      .filter(x => (x < rear || x > front) && Math.abs(x - enemy.x) > 184);
    const clear = options.filter(x => Object.values(run.heroes).every(hero => !hero.alive || Math.abs(hero.x - x) > 85));
    const places = clear.length ? clear : options;
    return places[Math.floor(Math.random() * places.length)];
  }

  function tickRiftMotion(run, enemy, dt) {
    const { rift } = enemy;
    const motion = rift.motion;
    motion.elapsed += dt;
    if (motion.name === "burrow") {
      const t = motion.elapsed / motion.duration;
      rift.hidden = t >= 0.27 && t < 0.85;
      if (t >= 0.59) {
        enemy.x = motion.exitX;
        enemy.flanking = run.heroes.warrior.alive && enemy.x < run.heroes.warrior.x;
      }
    }
    if (motion.elapsed + 1e-9 < motion.duration) return;
    rift.hidden = false;
    rift.motion = null;
  }

  function resolveRiftMove(run, enemy, attack) {
    const { lockedTarget: target, riftMove: move } = attack;
    const spec = C().riftMoves[move];
    if (spec && Object.hasOwn(enemy.rift.cooldowns, move)) enemy.rift.cooldowns[move] = spec.cooldown;
    if (move === "petrify") {
      grantStatus(run, enemy, "riftStone");
      startRiftMotion(enemy, "petrify");
    } else if (move === "burrow") {
      startRiftMotion(enemy, "burrow", { originX: enemy.x, exitX: burrowExit(run, enemy) });
    } else if (move === "cloak") {
      grantStatus(run, enemy, "riftCloak");
    } else if (target?.alive) {
      if (move === "boulder" || move === "fireball") {
        queueAttack(run, enemy, target, move === "boulder" ? "riftBoulder" : "riftFireball",
          enemy.dmg * spec.damage, { flight: spec.flight, arc: spec.arc });
      } else if (move === "spike") {
        interruptHero(run, target, "riftImpaled", undefined, enemy.kind);
        target.effects.get("riftImpaled").height = enemy.h;
        soundCue(run, "smash", target.x);
      } else if (Math.abs(target.x - enemy.x) <= riftStopRange(enemy) + 28) {
        meleeImpact(run, enemy, target, "enemy");
        hitHero(run, target, attackDamage(enemy, enemy.dmg), enemy, "melee");
        if (target.alive && enemy.def.rift.melee.burn) grantStatus(run, target, "riftBurn", enemy.kind);
      }
    }
    if (enemy.def.rift.alternate && (move === "melee" || move === "fireball")) enemy.rift.nextFire = move === "melee";
  }

  function tickRiftEnemy(run, enemy, dt) {
    const { rift } = enemy;
    const def = enemy.def.rift;
    for (const move of def.moves) rift.cooldowns[move] -= dt;
    if (rift.motion) { tickRiftMotion(run, enemy, dt); return; }
    if (controlled(enemy) || enemy.effects.has("riftStone")) return;
    enemy.atkT -= dt;
    const attack = enemy.attack;
    if (attack) {
      attack.t += dt;
      if (!attack.hit && attack.t + 1e-9 >= attack.windup) {
        attack.hit = true;
        resolveRiftMove(run, enemy, attack);
      }
      if (attack.t + 1e-9 >= attack.windup + attack.recovery) enemy.attack = null;
      return;
    }
    const target = enemyTarget(run, enemy);
    if (!target) return;
    enemy.facing = Math.sign(target.x - enemy.x) || enemy.facing;
    const gap = Math.abs(target.x - enemy.x) - riftStopRange(enemy);
    const ready = def.moves.find(move => rift.cooldowns[move] <= 0);
    const fallback = rift.nextFire || (enemy.def.ranged && gap > 0) ? "fireball" : "melee";
    const move = ready ?? fallback;
    if (enemy.atkT <= 0 && (move !== "melee" || gap <= 1e-9)) {
      const spec = move === "melee" ? def.melee : C().riftMoves[move];
      const aimed = move === "boulder" || move === "fireball" || move === "spike"
        ? chooseHero(run, () => true) : target;
      enemy.facing = Math.sign(aimed.x - enemy.x) || enemy.facing;
      enemy.walking = false;
      enemy.atkT = enemy.interval;
      enemy.attack = { riftMove: move, windup: spec.windup, recovery: spec.recovery, lockedTarget: aimed, t: 0, hit: false };
      soundCue(run, move === "melee" ? "swing" : move === "petrify" ? "guard" : move === "cloak" || move === "fireball" ? "castFire" : "castLight", enemy.x);
    } else if (!enemy.def.ranged && gap > 0) {
      const step = Math.min(gap, enemy.def.speed * dt);
      enemy.x += enemy.facing * step;
      enemy.walkDistance += step;
      enemy.walking = true;
    } else enemy.walking = false;
  }

  function enemyAttack(run, e, target, dt, justStopped) {
    const attackDt = dt * effectMultiplier(e, "attackSpeedMultiplier");
    e.atkT -= attackDt;
    const { buff, howl, smash, freeze, guard, stunStrike, bleed } = e.def;
    if (buff) e.buffT -= dt;
    if (howl) e.howlT -= dt;
    if (freeze) e.freezeT -= dt;
    if (guard) e.guardT -= dt;
    if (stunStrike) e.stunStrikeT -= dt;
    if (e.walking) {
      e.attack = null;
      return;
    }
    if (e.attack?.hit) {
      e.attack.t += attackDt;
      if (e.attack.t >= e.attack.windup + e.attack.recovery) e.attack = null;
      return;
    }
    if (!e.attack) {
      const heavy = !!smash && e.smashT <= e.interval;
      const buffing = !!buff && e.buffT <= 0 && buffAllies(run, buff).length > 0;
      const howling = !!howl && e.howlT <= 0;
      const freezing = !!freeze && e.freezeT <= 0;
      const guarding = !!guard && e.guardT <= 0;
      const stunning = !!stunStrike && e.stunStrikeT <= 0 && !e.furnaceCast;
      const move = howling ? howl : freezing ? freeze : buffing ? buff : heavy ? smash
        : guarding ? guard : stunning ? stunStrike : e.def.attack;
      // Старая конфигурация из кэша может не содержать параметров анимации.
      const windup = move?.windup ?? (e.def.ranged ? 0.55 : 0.42);
      const recovery = move?.recovery ?? 0.33;
      if (e.atkT > windup) return;
      // Первый удар в ближнем бою получает полный замах после подхода.
      if (justStopped) e.atkT = windup;
      let lockedTarget = null;
      if (freezing || stunning) lockedTarget = chooseHero(run, () => true);
      else if (move?.aimRear) lockedTarget = chooseHero(run, hero => hero.id !== "warrior") ?? target;
      e.attack = { windup, recovery, heavy, buffing, howling, freezing, guarding, stunning, lockedTarget,
        beam: !!move?.beam, projectile: move?.projectile,
        impact: move?.impact, wave: move?.wave, party: move?.party,
        groundX: heavy ? Math.max(0, e.x - e.h * smash.contactOffset) : null, hit: false, t: 0 };
      if (freezing || (buffing && buff.id !== "orcWarCry")) soundCue(run, "castLight", e.x);
      else if (heavy || stunning || !e.def.ranged && !buffing && !howling && !guarding) soundCue(run, "swing", e.x);
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
      e.atkT = howl.nextAttackDelay ?? e.interval;
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
      for (const unit of buffAllies(run, buff)) grantStatus(run, unit, buff.id);
      return;
    }
    if (attack.guarding) {
      e.guardT = guard.cooldown;
      grantStatus(run, e, guard.status);
      return;
    }
    if (attack.stunning) {
      e.stunStrikeT = stunStrike.cooldown;
      if (aimed.alive) {
        meleeImpact(run, e, aimed, attack.impact);
        hitHero(run, aimed, attackDamage(e, e.dmg), e, "stunStrike");
        if (aimed.alive) interruptHero(run, aimed, "stunned", stunStrike.stun);
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
      if (attack.projectile === "firebolt") {
        if (aimed.alive) queueAttack(run, e, aimed, "firebolt", dmg, { flight: 0.42, arc: 11 });
      } else if (attack.projectile === "necroticOrb") {
        queueAttack(run, e, target, "necroticOrb", dmg, { flight: 0.40, arc: 8 });
      } else {
        queueAttack(run, e, target, "enemyArrow", dmg, { flight: 0.28, arc: 18, offsetX: 18 });
      }
    } else if (attack.beam) {
      run.fx.push({ type: "necroticBeam", caster: e, x: attack.targetX, y: attack.targetY });
      hitHero(run, target, attackDamage(e, dmg), e, "necroticBeam");
    } else {
      const targets = attack.party
        ? run.heroOrder.map(id => run.heroes[id]).filter(h => h.alive)
        : [target];
      const damage = attackDamage(e, dmg);
      const ability = e.kind === "orc-axe" ? "axe" : e.kind === "krag" ? "hammer" : attack.impact ?? "melee";
      for (const hero of targets) {
        meleeImpact(run, e, hero, attack.impact || "enemy");
        hitHero(run, hero, damage, e, ability);
        if (hero.alive && bleed && Math.random() < bleed.chance) grantStatus(run, hero, bleed.status, e.kind);
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
    for (const [id, left] of run.skillCooldowns) {
      if (left <= dt + 1e-9) run.skillCooldowns.delete(id);
      else run.skillCooldowns.set(id, left - dt);
    }
    for (const enemy of run.enemies) {
      if (enemy.rift) tickRiftStone(run, enemy, dt);
      tickStatuses(enemy, dt);
      tickRegeneration(run, enemy, dt);
      tickEscape(run, enemy, dt);
    }
    for (const id of run.heroOrder) {
      const hero = run.heroes[id], pose = hero.attackPose;
      tickHeroDamage(run, hero, dt);
      tickStatuses(hero, dt);
      if (!pose) continue;
      pose.t += dt;
      if (hero.alive && pose.spell && !pose.released && pose.t + 1e-9 >= C().skills[pose.spell].castTime) {
        pose.released = true;
        releasePriestCast(run, hero, pose);
      }
      if (pose.t >= pose.duration) hero.attackPose = null;
    }
    if (run.over) return;
    resolveAttacks(run, dt);
    if (run.over) return;
    advanceHeroProjectiles(run, dt);
    if (run.groundWaves.length) advanceGroundWaves(run, dt);
    if (run.over) return;
    tickFusion(run, dt);
    advanceWarrior(run, dt);
    const battle = inBattle(run);
    const warrior = run.heroes.warrior, priest = run.heroes.priest, ranger = run.heroes.ranger;

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
        if (run.autoSkills.has("righteousFury") && warrior.maxHp - warrior.hp >= righteousFuryHeal(run)) {
          useInstant(run, "righteousFury");
        }
        const tgt = warriorTarget(run, warrior);
        if (!controlled(warrior) && !warrior.walking && !warrior.attackPose && warrior.atkT <= 0 &&
            vulnerable(tgt) && !warriorObstructed(run, tgt) && withinSwordRange(run, tgt)) {
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
        const tgt = rangedTarget(run, ranger.x);
        if (!controlled(ranger) && !ranger.attackPose && !rangerSpecialInFlight(run) && ranger.atkT <= 0 && tgt) {
          const precise = run.autoSkills.has("preciseShot") && castTargeted(run, "preciseShot", tgt);
          if (!precise && (!run.autoSkills.has("multishot") || !useMultishot(run, tgt))) {
            ranger.facing = Math.sign(tgt.x - ranger.x) || ranger.facing;
            const windup = startAttackPose(ranger, Math.min(ranger.interval, AUTO_MOTION.ranger), ARROW_RELEASE);
            queueAttack(run, ranger, tgt, "arrow", ranger.dmg, { windup, flight: 0.22, arc: 26, offsetX: -12 });
          }
          ranger.atkT = Math.max(ranger.interval, precise ? SKILL_SWING.preciseShot : 0);
        }
      }
    }
    if (priest.alive) castPriestAuto(run, priest, battle);

    // Тыловые враги разворачиваются к герою, который удерживает их сторону построения.
    for (const e of run.enemies) {
      if (!e.alive) continue;
      if (e.rift) { tickRiftEnemy(run, e, dt); continue; }
      if (controlled(e)) { e.walking = false; continue; }
      const target = enemyTarget(run, e);
      if (!target) break;
      if (e.def.furnace) tickFurnace(run, e, dt);
      if (e.appearT > 0) { e.appearT -= dt; continue; }
      if ((e.def.summon || e.def.raise) && tickRitual(run, e, dt)) continue;
      if (e.flanking || e.def.raise) e.facing = Math.sign(target.x - e.x) || e.facing;
      const wasWalking = e.walking;
      if (!e.def.ranged && !e.attack?.howling) {
        const gap = (target.x - e.x) * e.facing - (e.def.stopRange ?? 95) - e.lane;
        if (gap > 0) {
          const step = Math.min(gap, (e.def.speed ?? 170) * dt);
          e.x += e.facing * step;
          e.walkDistance += step;
          e.walking = true;
        } else e.walking = false;
      }
      enemyAttack(run, e, target, dt, wasWalking && !e.walking);
    }
  }

  // --- Активные действия ---
  function rangerSpecialInFlight(run) {
    return run.attacks.some(shot => !shot.resolved && (shot.kind === "multi" || shot.kind === "precise"));
  }

  function skillStatus(run, skillId) {
    const s = C().skills[skillId], h = run.heroes[s.owner];
    const cost = Math.max(1, s.cost - (run.stats[skillId + "Cost"] || 0));
    const left = s.type === "auto" ? Math.max(0, h.atkT) : (run.skillCooldowns.get(skillId) || 0);
    const cooldown = skillId === "heal" ? C().heroes.priest.healCD : s.cooldown;
    const duration = s.type === "auto" ? h.interval : Math.max(1, cooldown - (run.stats[skillId + "Haste"] || 0));
    const frozen = h.effects.has("frozen"), stunned = h.effects.has("stunned"), impaled = h.effects.has("riftImpaled");
    const casting = s.owner === "priest" && Boolean(h.attackPose) ||
      run.attacks.some(shot => shot.skillId === skillId && shot.startX === null && !shot.cancelled);
    const volley = skillId === "preciseShot" && rangerSpecialInFlight(run);
    return { cost, left, duration, frozen, stunned, impaled, casting, volley,
      ready: run.equipped.has(skillId) && h.alive && !controlled(h) && !casting && !volley && left === 0 && h[s.res] >= cost };
  }

  function startSkillCooldown(run, skillId, duration = skillStatus(run, skillId).duration) {
    run.skillCooldowns.set(skillId, duration);
  }

  function spendSkill(run, skillId, hero, resource, { deferCooldown = false } = {}) {
    const state = skillStatus(run, skillId);
    if (!state.ready) return false;
    hero[resource] -= state.cost;
    if (!deferCooldown && C().skills[skillId].type !== "auto") startSkillCooldown(run, skillId, state.duration);
    return true;
  }

  function useTargeted(run, skillId, enemyUid) {
    if (run.over || !inBattle(run)) return false;
    const e = run.enemies.find(x => x.uid === enemyUid && vulnerable(x));
    const s = C().skills[skillId];
    if (!e || s?.type !== "targeted" || (s.manualWhileAuto === false && run.autoSkills.has(skillId))) return false;
    return castTargeted(run, skillId, e);
  }

  function castTargeted(run, skillId, e) {
    const s = C().skills[skillId];
    const h = run.heroes[s.owner];
    if (s.owner === "warrior" && !canWarriorTarget(run, e)) return false;
    if (!spendSkill(run, skillId, h, s.res, { deferCooldown: true })) return false;
    h.facing = Math.sign(e.x - h.x) || h.facing;
    if (skillId === "fireball") {
      soundCue(run, "castFire", h.x);
      const windup = startAttackPose(h, AUTO_MOTION.priest, s.release);
      queueAttack(run, h, e, "fire", s.dmg + (run.stats.fireDmg || 0),
        { windup, flight: s.flight, offsetX: -12, skillId });
      return true;
    }
    const duration = SKILL_SWING[skillId];
    h.atkT = Math.max(h.atkT, duration);
    if (skillId === "powerStrike") {
      interruptAutoAttack(run, h, "sword");
      const windup = startAttackPose(h, duration, C().battle.warriorContact, skillId);
      // Умение остаётся прицельным на любой дистанции. Вдали видна летящая дуга удара.
      const distant = Math.abs(e.x - h.x) >= meleeRange(e, SWORD_RANGE);
      queueAttack(run, h, e, distant ? "slash" : "powerStrike", s.dmg + (run.stats.wStrike || 0),
        { windup, flight: distant ? 0.24 : 0, skillId });
    } else { // preciseShot
      interruptAutoAttack(run, h, "arrow");
      const windup = startAttackPose(h, duration, ARROW_RELEASE, skillId);
      const precise = (s.dmg + (run.stats.rPrecision || 0)) * (1 + (e.boss ? run.stats.preciseBoss || 0 : 0));
      queueAttack(run, h, e, "precise", precise, { windup, flight: 0.20, arc: 5, skillId });
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
    const healthFraction = target.hp / target.maxHp;
    const urgent = healthFraction <= 0.35 ? (run.stats.healOverflow || 0) : 0;
    restoreHealth(run, target, priest.heal + urgent, { critical: rollCritical(priest), caster: priest, skill: "heal" });
    applyStatus(target, "healWard", run.stats.healWard);
    if (healthFraction < 0.35 && run.stats.healBarrier > 0) {
      grantStatus(run, target, "healBarrier", priest.id);
      target.effects.get("healBarrier").capacity = run.stats.healBarrier;
    }
    return true;
  }

  function chooseDebuff(hero) {
    let best, priority = 0;
    for (const status of hero.effects.values()) {
      const weight = C().effects[status.id]?.dispelPriority || 0;
      if (weight > priority || (weight && weight === priority && status.left > best.left)) {
        best = status;
        priority = weight;
      }
    }
    return best;
  }

  function dispelTarget(run) {
    let best, bestEffect;
    for (const id of run.heroOrder) {
      const hero = run.heroes[id];
      const effect = hero.alive && chooseDebuff(hero);
      if (!effect) continue;
      const priority = C().effects[effect.id].dispelPriority;
      const bestPriority = bestEffect ? C().effects[bestEffect.id].dispelPriority : 0;
      if (priority > bestPriority || (priority === bestPriority && effect.left > bestEffect.left)) {
        best = hero;
        bestEffect = effect;
      }
    }
    return best;
  }

  function canDispelEnemy(enemy) {
    if (!targetable(enemy)) return false;
    return (enemy.attack?.riftMove === "petrify" && !enemy.attack.hit) ||
      [...enemy.effects.keys()].some(id => C().effects[id]?.dispelBuff);
  }

  function removeEnemySpell(run, enemy) {
    if (!canDispelEnemy(enemy)) return;
    if (enemy.effects.has("riftStone")) endStone(enemy);
    else if (enemy.effects.has("riftCloak")) enemy.effects.delete("riftCloak");
    else {
      cancelRiftCast(enemy);
      run.fx.push({ type: "castInterrupted", unit: enemy });
    }
    run.fx.push({ type: "dispel", unit: enemy });
  }

  function beginPriestCast(run, skillId, target) {
    const priest = run.heroes.priest;
    if (run.over || !spendSkill(run, skillId, priest, "mana", { deferCooldown: true })) return false;
    const spec = C().skills[skillId];
    const name = skillId === "fireTornado" ? "attack" : "heal";
    if (skillId === "fireTornado") priest.facing = 1;
    priest.attackPose = { name, duration: spec.castTime + spec.recovery, t: 0, spell: skillId, target };
    soundCue(run, skillId === "fireTornado" ? "castFire" : "castLight", priest.x);
    return true;
  }

  function releasePriestCast(run, priest, pose) {
    startSkillCooldown(run, pose.spell);
    const spec = C().skills[pose.spell];
    if (pose.spell === "dispel") {
      if (typeof pose.target === "number") {
        removeEnemySpell(run, run.enemies.find(enemy => enemy.uid === pose.target));
        return;
      }
      const hero = run.heroes[pose.target];
      const effect = hero.alive && chooseDebuff(hero);
      if (!effect) return;
      if (effect.id === "frozen") thawHero(run, hero);
      else hero.effects.delete(effect.id);
      run.fx.push({ type: "dispel", unit: hero });
    } else if (pose.spell === "massHeal") {
      for (const hero of Object.values(run.heroes)) {
        if (!hero.alive) continue;
        restoreHealth(run, hero, spec.heal + (run.stats.massHealPower || 0), {
          critical: rollCritical(priest), massHeal: true, caster: priest, skill: pose.spell
        });
        run.fx.push({ type: "massHeal", unit: hero });
      }
    } else {
      const damage = attackDamage(priest, spec.dmg + (run.stats.fireTornadoDamage || 0));
      run.tornadoes.push({ caster: priest, origin: priest.x, x: priest.x, speed: spec.speed, damage, hit: new Set() });
      soundCue(run, "tornado", priest.x);
    }
  }

  function useDispel(run, id) {
    if (typeof id === "number") {
      if (run.over || !canDispelEnemy(run.enemies.find(enemy => enemy.uid === id))) return false;
      return beginPriestCast(run, "dispel", id);
    }
    const target = run.heroes[id];
    if (run.over || !target?.alive) return false;
    if (!chooseDebuff(target)) return "clean";
    return beginPriestCast(run, "dispel", id);
  }

  function bombCharges(run, id) {
    return run[bombChargeKey(id)];
  }

  function canThrowBomb(run, id = "bomb") {
    const ranger = run.heroes.ranger;
    return bombCharges(run, id) > 0 && ranger.alive && !controlled(ranger);
  }

  function bombRadius(run, id = "bomb") {
    return C().skills[id].radius + (run.stats[id + "Radius"] || 0);
  }

  function canLaunchTornado(run, include = () => true) {
    return run.enemies.some(enemy => vulnerable(enemy) && enemy.x >= run.heroes.priest.x && include(enemy));
  }

  function useGround(run, skillId, x) {
    if (run.over || !inBattle(run) || !Number.isFinite(x) || x < 0 || x > C().canvas.w) return false;
    if (skillId === "fireTornado") {
      if (!canLaunchTornado(run)) return false;
      return beginPriestCast(run, skillId);
    }
    const spec = C().skills[skillId];
    if (spec?.type !== "ground" || !spec.stock || !canThrowBomb(run, skillId)) return false;
    const ranger = run.heroes.ranger;
    run[bombChargeKey(skillId)]--;
    if (!ranger.attackPose) startAttackPose(ranger, 0.38, 0, "bomb");
    soundCue(run, "bombThrow", ranger.x);
    const damage = spec.dmg ? attackDamage(ranger, spec.dmg + (run.stats.bombDamage || 0)) : 0;
    run.bombThrows.push({ id: skillId, caster: ranger, origin: ranger.x + 30, y: torsoY(ranger), x, t: 0,
      flight: spec.flight, radius: bombRadius(run, skillId), damage, stun: (spec.stun || 0) + (run.stats.noiseBombStun || 0) });
    return true;
  }

  function righteousFuryHeal(run) {
    return run.heroes.warrior.maxHp * (C().skills.righteousFury.healFraction + (run.stats.righteousFuryHeal || 0));
  }

  function useInstant(run, skillId) {
    if (run.over) return false;
    if (skillId === "massHeal") {
      if (!Object.values(run.heroes).some(hero => hero.alive && hero.hp < hero.maxHp)) return "full";
      return beginPriestCast(run, skillId);
    }
    if (!inBattle(run)) return false;
    const s = C().skills[skillId];
    if (s?.type !== "instant") return false;
    const h = run.heroes[s.owner];
    if (skillId === "righteousFury" && h.hp >= h.maxHp) return "full";
    if (skillId === "sacrifice" && !run.heroOrder.some(id => id !== h.id && run.heroes[id].alive)) return false;
    if (!spendSkill(run, skillId, h, s.res)) return false;
    if (skillId === "righteousFury") {
      restoreHealth(run, h, righteousFuryHeal(run), { caster: h, skill: skillId });
      run.fx.push({ type: "righteousFury", unit: h });
      return true;
    }
    if (skillId === "sacrifice") {
      applyStatus(h, skillId, s.durSec + (run.stats.sacrificeDuration || 0));
      run.fx.push({ type: "status", unit: h, id: skillId });
      return true;
    }
    h.blockT = s.durSec + run.stats.blockDur;
    h.blockDuration = h.blockT;
    soundCue(run, "guard", h.x);
    restoreHealth(run, h, run.stats.blockHeal || 0, { caster: h, skill: skillId });
    return true;
  }

  function useMultishot(run, first) {
    const id = "multishot", s = C().skills[id], ranger = run.heroes.ranger;
    if (!spendSkill(run, id, ranger, s.res)) return false;
    const others = run.enemies.filter(enemy => vulnerable(enemy) && enemy !== first)
      .sort((a, b) => Math.abs(a.x - ranger.x) - Math.abs(b.x - ranger.x));
    const targets = [first, ...others].slice(0, s.targets);
    ranger.facing = Math.sign(first.x - ranger.x) || ranger.facing;
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

  return { createRun, spawnRoom, tick, useTargeted, useInstant, useHeal, useDispel, useGround, canThrowBomb, bombRadius, bombCharges, setAuto,
           specialAttackKey, targetable, canDispelEnemy, spikeElevation,
           usePotion, inBattle, frontHero, nearestEnemy, canWarriorTarget, skillStatus, activeStatuses, applyStatus, hasHeroDamageEffect };
})();
