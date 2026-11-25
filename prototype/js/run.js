// DWR :: run.js — сцена забега: комнаты, fade-переходы, лут, сундук, легенда, бургер-меню, отрисовка.
// Симуляция — в sim.js; ввод — в input.js (вызывает Run.onMouse*); панель — panel.js.
"use strict";
window.DWR = window.DWR || {};

DWR.Run = (function () {
  const CV = () => DWR.CONFIG.canvas;
  const FLOOR = 540;                 // линия пола сцены (совпадает с полом фоновых слайдов, сборка build_sprites.py)
  const BOARD = { x: 286, y: 108, w: 960, h: 443, scale: 0.75 };
  const ARROW_SIZE = 72;
  const NEXT = { x: BOARD.x + BOARD.w - 24 - ARROW_SIZE, y: BOARD.y + (BOARD.h - ARROW_SIZE) / 2, w: ARROW_SIZE, h: ARROW_SIZE };
  const NEXT_RESULT = { x: NEXT.x - 8, y: NEXT.y + NEXT.h - 9, w: NEXT.w + 16, h: 21 };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const BURGER = { x: 1130, y: 37, w: 116, h: 42 };
  const PAUSE = {
    retreat: { x: 490, y: 329, w: 300, h: 50 },
    close: { x: 490, y: 390, w: 300, h: 50 },
    yes: { x: 444, y: 368, w: 188, h: 50 },
    no: { x: 648, y: 368, w: 188, h: 50 }
  };
  const PARTY = {
    warrior: ["Ярость", "rage", "#eb9478"],
    priest: ["Мана", "mana", "#a6b8ff"],
    ranger: ["Фокус", "focus", "#91cd94"]
  };
  const partyCard = i => ({ x: 34, y: 153 + i * 88 + (i > 1 ? 16 : 0), w: 230, h: i === 1 ? 93 : 77 });
  const LOOT_ART = {
    coin: { size: 40, reach: 43, color: "#ffd07b" },
    potion: { size: 52, reach: 49, color: "#ff938a" }
  };
  const POTION_PICKUP_DELAY = 0.24;
  const ICE_GROW = 0.42, ICE_THAW = 0.62, ICE_IMPACT = 0.4, GROUND_IMPACT = 0.46;
  const ICE_BLOCK = new Path2D("M-76 -8 -81 -86 -58 -167 -20 -217 23 -214 65 -173 82 -102 74 -14 51 2 -55 2Z");
  const ICE_FACETS = [
    [new Path2D("M-76 -8 -81 -86 -58 -167 -37 -148 -42 -54 -55 2Z"), "#5ab1ec8a"],
    [new Path2D("M-58 -167 -20 -217 23 -214 41 -184 -37 -148Z"), "#d0f5ffad"],
    [new Path2D("M41 -184 65 -173 82 -102 74 -14 51 2 51 -77Z"), "#4f9ee69c"],
    [new Path2D("M-37 -148 41 -184 51 -77 13 -52 -42 -54Z"), "#6ad3ef3d"],
    [new Path2D("M-55 2 -42 -54 13 -52 51 -77 51 2Z"), "#a0e1ff4e"]
  ];
  const CAST_ART = {
    smash: ["Удар по земле", "#ffd29a", "m5 4 5 1 9 10-4 4L5 9zM3 20h5m12-3 2 2m-11 0-2 3"],
    buff: ["Некротическое усиление", "#edc286", "M12 21V3l-6 6m6-6 6 6M4 19v-5m16 5v-5"],
    howl: ["Вой", "#ffe1a5", "M3 10h4l5-5v14l-5-5H3zm13-2q4 4 0 8m3-11q7 7 0 14"],
    frost: ["Заморозка", "#bceaff", null],
    orcWarCry: ["Боевой клич", "#ffa55c", "M3 10h4l5-5v14l-5-5H3zm13-2q4 4 0 8m3-11q7 7 0 14"],
    orcGuard: ["Поднять щит", "#a8cce7", "M12 3l8 3v6q0 6-8 9-8-3-8-9V6zM12 7v9m-3-5h6"],
    cityGuard: ["Заслон щитом", "#a8cce7", "M12 3l8 3v6q0 6-8 9-8-3-8-9V6zM12 7v9m-3-5h6"],
    cityTornado: ["Огненный вихрь", "#ffae62", "M3 5c0 5 18 5 18 0M6 11c0 5 12 5 12 0M9 17c0 4 6 4 6 0"],
    dragonBreath: ["Огненное дыхание", "#ffae62", "M20 11l-5 2-4-4-4 1-3-4m15 8-6 2-7-2-3 2m15 0-4 4H9"],
    dragonSummon: ["Призыв дракончиков", "#ffd092", "M3 7l4-2 5 4 5-4 4 2M4 13l4-2 4 4 4-4 4 2M6 19l3-2 3 3 3-3 3 2"],
    bloodlust: ["Жажда крови", "#fb7969", "M12 3c0 4 7 10 7 14a7 7 0 0 1-14 0c0-4 7-10 7-14zM8 17q0 3 3 4"],
    hammerStun: ["Оглушающий удар", "#ffcf7b", "M4 8l4-5 7 5-4 5zM13 11l7 8-2 2-7-8M3 16l3-1m1 5 2-2"],
    furnace: ["Выброс горна", "#ff9860", "M12 3c3 4 1 6 5 7l2-3c2 4 4 8 0 12-4 4-12 2-14-2-2-4 0-7 3-10 0 3 2 4 3 2 1-2 0-4 1-6z"],
    dispel: ["Рассеивание", "#a8f2f0", "M3 17 19 3m-4 0h4v4M5 7l2 3m10 4 3 2M8 19l1 2"],
    massHeal: ["Массовое восстановление", "#ffeab3", "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"],
    fireTornado: ["Огненный смерч", "#ffae62", "M3 5c0 5 18 5 18 0M6 11c0 5 12 5 12 0M9 17c0 4 6 4 6 0"],
    riftBoulder: ["Бросок валуна", "#e1ccaf", "M3 15l4-8 8-3 6 7-2 8-9 2zM7 7l4 7 8 5m-8-5 10-3"],
    riftPetrify: ["Окаменение", "#e1ccaf", "M3 20V9l7-6 8 2 3 7v8zM10 3l-1 9 5 8m-5-8 9-7"],
    riftBurrow: ["Уход под землю", "#ffb077", "M3 20h18M12 3v12m-5-5 5 5 5-5"],
    riftSpike: ["Земляной кол", "#dbc5a7", "M9 20l2-8 3-9 2 12 2 5zM3 20h18"],
    riftCloak: ["Огненный плащ", "#ff9860", "M5 20l2-7-1-4 4 3 3-9 4 9 2-2 1 10m-15 0h15"],
    summon: ["Призыв скелетов", "#d1b0fb", "M7 20v-4l-3-2V8l3-4h10l3 4v6l-3 2v4zM8 10h2m4 0h2m-6 6v4m4-4v4"],
    raise: ["Поднятие скелета", "#d1b0fb", "M4 20h16M7 14l5-5 5 5M7 8l5-5 5 5m-5 1v8"]
  };
  for (const art of Object.values(CAST_ART)) if (art[2]) art[2] = new Path2D(art[2]);
  const STATUS_PATH = {
    orcWarCry: CAST_ART.orcWarCry[2], orcGuard: CAST_ART.orcGuard[2],
    orcExposed: new Path2D("M5 5l6-2-1 6 3 2-3 4 2 6c-5-2-8-6-8-10zm9-2 6 2v6c0 4-2 7-5 9l-1-5 3-4-4-3z"),
    bleeding: new Path2D("M12 3c0 4 7 10 7 14a7 7 0 0 1-14 0c0-4 7-10 7-14zM8 17q0 3 3 4"),
    healBarrier: new Path2D("M12 3l8 3v5q0 7-8 10-8-3-8-10V6zM12 7v8m-4-4h8"),
    burning: CAST_ART.furnace[2], ember: CAST_ART.furnace[2], whelpBurn: CAST_ART.furnace[2],
    bloodlust: CAST_ART.bloodlust[2], kragRage: CAST_ART.hammerStun[2],
    riftBurn: CAST_ART.furnace[2], riftCloakBurn: CAST_ART.furnace[2],
    riftStone: CAST_ART.riftPetrify[2], riftImpaled: CAST_ART.riftSpike[2], riftCloak: CAST_ART.riftCloak[2],
    sacrifice: new Path2D("M12 3l8 3v6q0 6-8 9-8-3-8-9V6zm0 13-4-4q-3-4 1-4 2 0 3 2 1-2 3-2 4 0 1 4z")
  };
  const MELEE_ART = {
    sword: { tint: "#ffbb72", core: "#fff1ce", duration: 0.24, scale: 1 },
    power: { tint: "#ffa052", core: "#fff1bc", duration: 0.32, scale: 1.35 },
    enemy: { tint: "#f27769", core: "#ffe1cb", duration: 0.24, scale: 1 },
    bite: { tint: "#e8b17a", core: "#ffe9c5", duration: 0.23, scale: 0.83 },
    claw: { tint: "#ce84cf", core: "#ffdef3", duration: 0.32, scale: 1.10 },
    smash: { tint: "#ff8d59", core: "#fff2ba", duration: 0.42, scale: 1.45 },
    guard: { tint: "#80baff", core: "#e3f4ff", duration: 0.26, scale: 1 }
  };
  const FX_SOUNDS = {
    fireImpact: "fireImpact", necroticImpact: "necroticImpact", necroticBeam: "beam", groundSmash: "smash",
    howl: "howl", freeze: "freeze", thaw: "thaw", summon: "summon", raise: "summon", dispel: "dispel",
    massHeal: "massHeal", bombImpact: "bombImpact", noiseBombImpact: "noiseBombImpact",
    furnaceInterrupt: "guard", shieldBroken: "armorBreak"
  };
  const STATUS_SOUNDS = { orcWarCry: "warCry", orcGuard: "guard", kragRage: "armorBreak", sacrifice: "sacrifice" };
  let R = null;                      // состояние текущего забега

  function roomSeq(id, treasureOnly) {
    const location = DWR.CONFIG.locations[id];
    if (treasureOnly) return [location.treasure];
    const seq = location.rooms.slice();
    if (DWR.State.treasureUnopened(id)) seq.push(location.treasure);
    return seq;
  }

  function start(location = "dungeon", treasureOnly = false) {
    const sim = DWR.Sim.createRun();
    const tempPanel = DWR.State.data.panel.map(id => id === "potion" && sim.potionsLeft === 0 ? null : id);
    R = {
      sim,
      location, treasureOnly, seq: roomSeq(location, treasureOnly), roomIdx: 0,
      phase: "fadein", phaseT: 0,          // fadein | room | fadeout | wipeDelay
      items: [], floaters: [], auras: [], explosions: [], beams: [], meleeImpacts: [], deaths: new Map(), landingLoot: new Set(),
      runCoins: 0, runRunes: 0, coinBonusCarry: 0, tempPanel,
      chestOpened: false, chestRect: { x: 532, y: FLOOR - 132, w: 170, h: 132 },
      menu: null,                           // null | {confirm:false} — открытое бургер-меню (пауза)
      aim: null,                            // press задан, пока ЛКМ удерживается на пути от слота или зелья
      hoverTarget: null, potionHover: null, time: 0, flash: new Map()
    };
    DWR.State.beginRaid(location, treasureOnly);
    loadRoom(0);
  }

  function curRoom() { return DWR.CONFIG.rooms[R.seq[R.roomIdx]]; }
  function chestLocked() {
    return curRoom().chest && !R.chestOpened && !DWR.State.treasureAvailable(R.location);
  }
  function locationLoot() { return DWR.CONFIG.locations[R.location].loot; }
  function hasFrozenHero() {
    return R.sim.heroOrder.some(id => {
      const hero = R.sim.heroes[id];
      return hero.alive && hero.effects.has("frozen");
    });
  }

  function deathProgress(unit) {
    const since = R.deaths.get(unit);
    const duration = unit.def?.death?.duration ?? unit.def?.fall?.duration ?? (unit.id ? 0.26 : 0.43);
    return since === undefined ? 1 : Math.min(1, (R.time - since) / duration);
  }

  function hasFallingBoss() {
    return R.sim.enemies.some(unit => unit.boss && !unit.alive && deathProgress(unit) < 1);
  }

  const isCityCorpse = unit => !unit.alive && Boolean(unit.def?.city);
  function hasFallingCityEnemy() {
    return R.sim.enemies.some(unit => isCityCorpse(unit) && deathProgress(unit) < 1);
  }

  function hasEscapingBoss() {
    return R.sim.enemies.some(unit => unit.escape && !unit.escape.finished);
  }

  function hasExitHazard() {
    return hasFrozenHero() || R.sim.heroOrder.some(id => {
      const hero = R.sim.heroes[id];
      return hero.alive && hero.effects.has("riftImpaled");
    }) || (R.roomIdx === R.seq.length - 1 && DWR.Sim.hasHeroDamageEffect(R.sim));
  }

  function priestCasting() {
    const priest = R.sim.heroes.priest, cast = priest.attackPose;
    return priest.alive && cast?.spell && !cast.released;
  }

  function canAdvance() {
    return R.phase === "room" && !DWR.Sim.inBattle(R.sim) && !R.sim.over && !R.sim.groundWaves.length &&
      !(R.sim.heroes.warrior.alive && R.sim.heroes.warrior.returnToFormation) &&
      !hasExitHazard() && !hasFallingBoss() && !hasFallingCityEnemy() && !hasEscapingBoss() && !priestCasting() &&
      !R.sim.bombThrows.length &&
      !R.sim.attacks.some(attack => attack.target.id && (attack.target.alive || attack.kind === "riftFireball") && !attack.resolved) &&
      !R.sim.tornadoes.some(tornado => !tornado.caster.id) &&
      (!curRoom().chest || R.chestOpened || chestLocked());
  }

  function nextTargetAt(x, y) {
    return inRect(x, y, NEXT) || (R.roomIdx === R.seq.length - 1 && inRect(x, y, NEXT_RESULT));
  }

  function worldPoint(x, y) {
    if (!inRect(x, y, BOARD)) return null;
    return { x: (x - BOARD.x) / BOARD.scale, y: (y - BOARD.y) / BOARD.scale };
  }

  function loadRoom(i) {
    R.roomIdx = i;
    R.phase = "fadein"; R.phaseT = 0; R.items = []; R.explosions = [];
    R.deaths.clear();
    R.landingLoot.clear();
    R.flash.clear();
    R.floaters = []; R.auras = []; R.beams = []; R.meleeImpacts = [];
    R.potionHover = null;
    R.chestOpened = false;
    R.encounteredCount = 0;
    DWR.Sim.spawnRoom(R.sim, R.seq[i]);
  }

  function recordEncounters() {
    const enemies = R.sim.enemies;
    if (enemies.length === R.encounteredCount) return;
    DWR.State.recordEncounters(R.location, enemies.slice(R.encounteredCount).map(enemy => enemy.kind));
    R.encounteredCount = enemies.length;
  }

  // --- Завершение забега ---
  function finalize(reason) {
    if (reason === "win" && !R.treasureOnly) R.runCoins += R.sim.stats.raidVictoryCoins;
    DWR.State.finishRaid(reason === "explored" ? null : reason, R.runCoins);
    const currentCleared = curRoom().chest ? R.chestOpened : !DWR.Sim.inBattle(R.sim) && !hasEscapingBoss();
    DWR.showResults({
      reason, coins: R.runCoins, runes: R.runRunes,
      roomsCleared: R.roomIdx + Number(currentCleared), roomsTotal: R.seq.length,
      roomId: curRoom().id, location: R.location, treasureOnly: R.treasureOnly,
      combatReports: R.sim.combatReports,
      party: R.sim.heroOrder.map(id => {
        const { hp, maxHp, alive } = R.sim.heroes[id];
        return { id, hp, maxHp, alive };
      })
    });
    R = null;
  }

  // --- Дроп лута за убийство ---
  function dropLoot(e) {
    const loot = DWR.CONFIG.loot, stats = R.sim.stats;
    const local = locationLoot();
    const piles = e.boss ? 8 : 4;
    let value;
    if (e.boss) value = (local?.boss ?? loot.coinPerBoss) + stats.bossCoins;
    else {
      const base = local?.normal ?? loot.coinPerGoblin;
      // Остаток хранится в сотых долях монеты между комнатами одного рейда.
      const bonus = R.coinBonusCarry + base * stats.raidCoins;
      value = base + Math.floor(bonus / 100);
      R.coinBonusCarry = bonus % 100;
    }
    for (let i = 0; i < piles; i++) {
      spawnItem("coin", e.x, Math.floor((i + 1) * value / piles) - Math.floor(i * value / piles));
    }
    if (!e.boss && Math.random() < R.sim.stats.potionLuck) spawnItem("potion", e.x, 1);
  }
  function spawnItem(type, x, value) {
    R.items.push({
      type, value,
      x: x + (Math.random() * 60 - 30), y: FLOOR - 200 - Math.random() * 60,
      vx: Math.random() * 120 - 60, vy: -60 - Math.random() * 80,
      grounded: false
    });
  }

  // --- Обновление ---
  // Фазы применения заклинаний берём из симуляции.
  const EXPLOSION_SECONDS = 0.52;

  function update(dt) {
    if (R.menu) return;
    R.time += dt;
    // визуальные таймеры
    for (const [u, t] of R.flash) if (t > 0) R.flash.set(u, t - dt);
    for (const burst of R.explosions) burst.t += dt;
    R.explosions = R.explosions.filter(burst => burst.t < EXPLOSION_SECONDS);
    for (const beam of R.beams) beam.t += dt;
    R.beams = R.beams.filter(beam => beam.t < 0.34);
    for (const impact of R.meleeImpacts) impact.t += dt;
    R.meleeImpacts = R.meleeImpacts.filter(({ t, art }) => t < art.duration);
    for (const f of R.floaters) { f.t -= dt; f.y -= 34 * dt; }
    R.floaters = R.floaters.filter(f => f.t > 0);
    for (const a of R.auras) a.t -= dt;
    R.auras = R.auras.filter(a => a.t > 0);

    // падение лута
    for (const it of R.items) {
      if (it.grounded) continue;
      it.vy += 900 * dt;
      it.x += it.vx * dt; it.y += it.vy * dt;
      const groundY = FLOOR - LOOT_ART[it.type].size / 2 + 2;
      if (it.y >= groundY) { it.y = groundY; it.grounded = true; it.vx = 0; it.vy = 0; }
    }
    if (R.sim.stats.autoCoins) {
      for (let i = R.items.length - 1; i >= 0; i--) {
        const item = R.items[i];
        if (item.type === "coin" && item.grounded) pickUp(item);
      }
    }

    if (R.phase === "fadein") {
      R.phaseT += dt;
      if (R.phaseT >= DWR.CONFIG.fadeSec) {
        R.phase = "room";
        if (curRoom().boss && DWR.Sim.inBattle(R.sim)) DWR.State.reachRaidBoss();
        recordEncounters();
      }
      return;
    }
    if (R.phase === "wipeDelay") {
      R.phaseT += dt;
      if (R.phaseT >= 1.4) finalize("wipe");
      return;
    }
    if (R.phase === "fadeout") {
      R.phaseT += dt;
      if (R.phaseT >= DWR.CONFIG.fadeSec) {
        if (R.roomIdx + 1 >= R.seq.length) {
          finalize(DWR.State.locationCleared(R.location) ? "win" : "explored");
          return;
        }
        loadRoom(R.roomIdx + 1);
      }
      return;
    }
    // phase === room: бой (если враги)
    const sim = R.sim;
    if (sim.over === "wipe") {
      R.phase = "wipeDelay"; R.phaseT = 0;
      cancelAim(DWR.Input.x, DWR.Input.y);
      return;
    }
    const wasInBattle = DWR.Sim.inBattle(sim);
    DWR.Sim.tick(sim, dt);
    if (sim.over === "wipe") DWR.State.markRaidWipe();
    recordEncounters();
    if (wasInBattle && !sim.over && !curRoom().boss && !DWR.Sim.inBattle(sim) && sim.stats.roomCoins > 0) {
      R.runCoins += sim.stats.roomCoins;
      floater(CV().w / 2, FLOOR - 170, "Зачистка +" + sim.stats.roomCoins, "#ffd092");
    }
    collectHoveredLoot();

    // события симуляции → дроп и визуал
    for (const ev of sim.events) {
      if (ev.type === "kill") {
        const { unit } = ev;
        R.deaths.set(unit, R.time);
        const land = (unit.def.death ?? unit.def.fall)?.land;
        // У наземных драконидов добыча появляется после контакта с полом и не заслоняет падение.
        const groundCityEnemy = unit.def.city && !DWR.Sim.airLift(unit);
        if (land != null && (ev.boss || groundCityEnemy)) R.landingLoot.add(unit);
        else {
          if (!unit.noLoot) dropLoot(unit);
          DWR.Audio.play("down", unit.x);
        }
        if (ev.boss) DWR.State.completeLocation(R.location);
      }
      if (ev.type === "bossEscaped") {
        DWR.State.completeLocation(R.location);
        dropLoot(ev.unit);
        floater(ev.unit.x, FLOOR - ev.unit.h - 8, "Лич скрылся", ev.unit.def.escape.tint);
      }
      if (ev.type === "heroDead") {
        R.deaths.set(ev.hero, R.time);
        DWR.Audio.play("down", ev.hero.x);
        floater(ev.hero.x, FLOOR - 230, "Герой пал", "#d06a5a");
      }
    }
    sim.events.length = 0;
    for (const unit of R.landingLoot) {
      if (deathProgress(unit) < (unit.def.death ?? unit.def.fall).land) continue;
      R.landingLoot.delete(unit);
      if (!unit.noLoot) dropLoot(unit);
      DWR.Audio.play("down", unit.x);
    }

    // Визуальные эффекты удара возникают только после расчёта попадания.
    for (const f of sim.fx) {
      const cue = f.type === "sound" ? f.cue
        : f.type === "meleeImpact" ? (f.blocked ? "guard" : f.kind)
        : f.type === "status" ? STATUS_SOUNDS[f.id]
        : f.type === "heal" && !f.massHeal ? (f.potion ? "potion" : "heal") : FX_SOUNDS[f.type];
      if (cue) DWR.Audio.play(cue, f.x ?? f.unit?.x ?? f.caster?.x);
      if (f.type === "sound") continue;
      if (f.type === "fireImpact") R.explosions.push({ x: f.x, y: FLOOR + f.y, t: 0 });
      else if (f.type === "meleeImpact") R.meleeImpacts.push({ ...f, t: 0, art: MELEE_ART[f.blocked ? "guard" : f.kind] });
      else if (f.type === "necroticImpact") R.auras.push({ x: f.x, y: FLOOR + f.y, t: 0.35, necrotic: true });
      else if (f.type === "status") {
        R.auras.push({ unit: f.unit, t: 0.55, status: f.id });
        if (f.id === "kragRage") floater(f.unit.x, FLOOR - f.unit.h * 0.6, "Броня разбита", "#ffba83");
      }
      else if (f.type === "necroticBeam") R.beams.push({ ...f, t: 0 });
      else if (f.type === "howl") {
        const { x, y } = DWR.ForgeMotion.howlGeometry(f.unit);
        R.auras.push({ x, y: FLOOR + y, t: 0.82, howl: true });
      }
      else if (f.type === "groundSmash") R.auras.push({ x: f.x, t: GROUND_IMPACT, groundSmash: true });
      else if (f.type === "freeze" || f.type === "thaw") {
        const { x, h } = f.unit;
        R.auras.push({ x, h, t: f.type === "freeze" ? ICE_IMPACT : ICE_THAW, ice: f.type });
      }
      else if (f.type === "summon") {
        for (const unit of f.minions) {
          if (unit.flanking) floater(unit.x, FLOOR - unit.h - 16, "В тылу", "#e6ceff");
        }
        floater(f.caster.x, FLOOR - f.caster.h + 18, "Призыв скелетов", "#c8a4ff");
      }
      else if (f.type === "raise") {
        R.deaths.delete(f.corpse);
        floater(f.unit.x, FLOOR - f.unit.h - 16, f.unit.flanking ? "Поднят в тылу" : "Скелет поднят", "#c8a4ff");
      }
      else if (f.type === "furnaceInterrupt") floater(f.unit.x, FLOOR - f.unit.h * 0.42, "Выброс прерван", "#ffd092");
      else if (f.type === "shieldBroken") floater(f.unit.x, FLOOR - f.unit.h * 0.65, "Заслон разбит", "#a8cce7");
      else if (f.type === "castInterrupted") floater(f.unit.x, FLOOR - f.unit.h * 0.65, "Каст прерван", "#d4f8ff");
      else if (f.type === "taunt") floater(f.unit.x, FLOOR - f.unit.h - 22, "Провокация", "#ffd092");
      else if (f.type === "absorb") floater(f.unit.x, FLOOR - f.unit.h - 22,
        "Щит поглотил " + f.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 }), "#c9e9ff");
      else if (["dispel", "massHeal", "tornadoHit", "bombImpact", "noiseBombImpact", "righteousFury", "sacrificeRedirect"].includes(f.type)) {
        const duration = f.type === "massHeal" ? 0.86 : f.type === "dispel" ? 0.66 : 0.42;
        R.auras.push({ ...f, spellEffect: f.type, duration, t: duration });
      }
      else if (f.type === "hurt") {
        R.flash.set(f.unit, 0.18);
        const effect = DWR.CONFIG.effects[f.kind === "frost" ? "frozen" : f.kind];
        const amount = Number.isInteger(f.amount) ? f.amount : f.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
        floater(f.unit.x, FLOOR - f.unit.h - 8 - DWR.Sim.airLift(f.unit), (f.critical ? "Крит " : "") + "−" + amount,
          effect?.color ?? (f.kind === "armor" ? "#a8cce7" : f.critical ? "#ffd092" : "#e88"));
      }
      else if (f.type === "heal") {
        R.auras.push({ unit: f.unit, t: 0.9, potion: f.potion });
        floater(f.unit.x, FLOOR - f.unit.h - 8, (f.critical ? "Крит " : "") + "+" + Math.round(f.amount), f.critical ? "#dbf5a1" : "#8ed0a0");
      }
    }
    sim.fx.length = 0;
  }

  function floater(x, y, text, color) { R.floaters.push({ x, y, text, color, t: 1 }); }

  // --- Ввод (вызывает input.js) ---
  function onMouseMove(x, y) {
    if (!R) return;
    const press = R.aim?.press;
    if (press && Math.hypot(x - press.x, y - press.y) > 5) press.moved = true;
    updateCursor(x, y);
    if (R.phase === "room" && !R.menu) collectHoveredLoot();
  }

  const nearLoot = (p, it) => Math.hypot(it.x - p.x, it.y - p.y) <= LOOT_ART[it.type].reach + R.sim.stats.lootReach;

  function collectHoveredLoot() {
    const p = !R.aim && worldPoint(DWR.Input.x, DWR.Input.y);
    const coin = p && R.items.find(it => it.type === "coin" && it.grounded && nearLoot(p, it));
    const item = !coin && p && R.items.find(it => it.type === "potion" && it.grounded && nearLoot(p, it));
    if (!item) {
      R.potionHover = null;
      if (coin) pickUp(coin);
      return;
    }
    // При заполненной панели зелье можно перетащить с пола прямо на героя.
    if (!R.tempPanel.includes("potion") && !R.tempPanel.includes(null)) return;
    // Короткая задержка даёт возможность подхватить зелье с пола ЛКМ.
    if (R.potionHover?.item !== item) R.potionHover = { item, since: R.time };
    else if (R.time - R.potionHover.since >= POTION_PICKUP_DELAY) {
      pickUp(item);
      R.potionHover = null;
    }
  }

  function updateCursor(x, y) {
    const cv = document.getElementById("game-canvas");
    if (R.aim) {
      cv.style.cursor = `url("${DWR.Assets.assetUrl("cursor-target.png")}") 16 16, crosshair`;
      return;
    }
    const p = worldPoint(x, y);
    const pointer = R.phase === "room" && !R.menu && (
      inRect(x, y, BURGER) || (canAdvance() && nextTargetAt(x, y)) ||
      R.tempPanel[DWR.Panel.slotAt(R, x, y)] || (p && (
        (curRoom().chest && !R.chestOpened && inRect(p.x, p.y, R.chestRect)) ||
        R.items.some(it => it.grounded && nearLoot(p, it))
      ))
    );
    cv.style.cursor = pointer ? "pointer" : "default";
  }
  function pickUp(it) {
    if (it.type === "coin") R.runCoins += it.value;
    else {
      if (!DWR.Panel.equipRunSkill(R, "potion")) return;
      R.sim.potionsLeft++;
    }
    R.items.splice(R.items.indexOf(it), 1);
    DWR.Audio.play(it.type, it.x);
    floater(it.x, it.y - 20, it.type === "coin" ? "+" + it.value : "Зелье", LOOT_ART[it.type].color);
  }

  // Цель под курсором: враг для прицельного скилла, герой для зелья
  function dropTargetAt(x, y) {
    if (!R) return null;
    const p = worldPoint(x, y);
    if (R.aim?.kind === "ground") return p;
    if (R.aim && ["ally", "potion", "floorPotion"].includes(R.aim.kind)) {
      for (const [i, id] of R.sim.heroOrder.entries()) {
        const h = R.sim.heroes[id];
        if (h.alive && (inRect(x, y, partyCard(i)) || (p && isUnitTarget(p, h)))) return h;
      }
      return DWR.CONFIG.skills[R.aim.id]?.targetEnemies && p
        ? R.sim.enemies.find(e => DWR.Sim.canDispelEnemy(e) && isUnitTarget(p, e)) ?? null
        : null;
    }
    if (!p) return null;
    const warriorSkill = R.aim?.id === "powerStrike";
    const allowed = enemy => !warriorSkill || DWR.Sim.canWarriorTarget(R.sim, enemy);
    const underCursor = e => DWR.Sim.targetable(e) && isUnitTarget(p, e) && allowed(e);
    let target = R.sim.enemies.find(underCursor);
    if (target?.def.dragon) {
      // Летящего перед боссом дракончика можно выбрать поверх его широкой области.
      target = R.sim.enemies.find(e => !e.def.dragon && underCursor(e)) ?? target;
    }
    const owner = DWR.CONFIG.skills[R.aim?.id]?.owner;
    if (!target || !owner) return target ?? null;
    const redirected = DWR.Sim.redirectHeroAttack(R.sim, R.sim.heroes[owner], target);
    return allowed(redirected) ? redirected : null;
  }

  function isUnitTarget(p, unit) {
    const ground = FLOOR + DWR.Sim.bypassFloorOffset(unit) - DWR.Sim.spikeElevation(unit).lift - DWR.Sim.airLift(unit);
    if (unit.def?.dragon) {
      return p.x > unit.x - unit.h * 0.63 && p.x < unit.x + unit.h * 1.22 &&
        p.y > ground - unit.h - 10 && p.y < ground + 10;
    }
    const halfWidth = unit.def?.rift || unit.def?.city ? Math.max(55, unit.h * 0.37) : 55;
    const height = unit.effects.has("riftStone") ? unit.h * 0.72 : unit.h;
    return Math.abs(p.x - unit.x) < halfWidth && p.y > ground - height - 10 && p.y < ground + 10;
  }

  function onClick(x, y) {
    if (!R || R.phase !== "room") return;
    if (R.menu) { menuClick(x, y); return; }
    if (inRect(x, y, BURGER)) {
      R.menu = { confirm: false };
      cancelAim(x, y);
      DWR.Audio.play("ui");
      return;
    }
    const i = DWR.Panel.slotAt(R, x, y);
    if (i >= 0) {
      cancelAim(x, y);
      const id = R.tempPanel[i];
      const skill = DWR.CONFIG.skills[id];
      if (skill?.type === "instant") {
        const result = DWR.Sim.useInstant(R.sim, id);
        if (result === "full") toast("Здоровье отряда уже полное");
        else if (!result) skillNotice(id);
      }
      return;
    }
    if (R.aim) {
      const target = dropTargetAt(x, y);
      if (target) finishAim(x, y, target);
      return;
    }
    if (canAdvance() && nextTargetAt(x, y)) { goNextRoom(); return; }
    const p = worldPoint(x, y);
    if (p && curRoom().chest && !R.chestOpened && inRect(p.x, p.y, R.chestRect)) { openChest(); return; }
  }

  function onDown(x, y) {
    if (!R || R.phase !== "room" || R.menu) return;
    const i = DWR.Panel.slotAt(R, x, y);
    const press = { x, y, moved: false };
    if (i >= 0) {
      const id = R.tempPanel[i];
      const skill = DWR.CONFIG.skills[id];
      if (!skill || !["targeted", "ally", "ground", "potion"].includes(skill.type) ||
          (skill.manualWhileAuto === false && R.sim.autoSkills.has(id)) ||
          (skill.stock && !DWR.Sim.canThrowBomb(R.sim, id)) ||
          (id === "potion" && R.sim.potionsLeft === 0)) return;
      R.aim = { kind: skill.type, id, slot: i, press };
    } else {
      if (R.aim) return;
      const p = worldPoint(x, y);
      const item = p && R.items.find(it => it.type === "potion" && it.grounded && nearLoot(p, it));
      if (!item) return;
      R.aim = { kind: "floorPotion", item, press };
    }
    R.potionHover = null;
    updateCursor(x, y);
  }

  function toggleAuto(id) {
    const enabled = !R.sim.autoSkills.has(id);
    DWR.Sim.setAuto(R.sim, id, enabled);
    DWR.State.setAuto(id, enabled);
    return enabled;
  }

  function onContextMenu(x, y) {
    if (!R || R.phase !== "room" || R.menu) return false;
    const id = R.tempPanel[DWR.Panel.slotAt(R, x, y)];
    const skill = DWR.CONFIG.skills[id];
    if (!skill?.auto) return false;
    if (toggleAuto(id) && R.aim?.id === id && skill.manualWhileAuto === false) cancelAim(x, y);
    return true;
  }

  function cancelAim(x, y) {
    if (!R?.aim) return false;
    R.aim = null;
    R.hoverTarget = null;
    updateCursor(x, y);
    return true;
  }

  function onUp(x, y) {
    const aim = R?.aim;
    if (!aim?.press) return false;
    // Короткий клик по исходному слоту оставляет прицел активным до выбора цели.
    if (!aim.press.moved && DWR.Panel.slotAt(R, x, y) === aim.slot) {
      aim.press = null;
    } else {
      const target = R.phase === "room" && !R.menu ? dropTargetAt(x, y) : null;
      finishAim(x, y, target);
    }
    return true;
  }

  function finishAim(x, y, tgt) {
    const aim = R.aim;
    cancelAim(x, y);
    if (!tgt) return;
    if (aim.kind === "targeted") {
      if (tgt.effects.has("riftStone")) toast("Элементаль защищён каменной формой");
      else if (!DWR.Sim.useTargeted(R.sim, aim.id, tgt.uid)) skillNotice(aim.id);
    } else if (aim.kind === "ally") {
      const result = aim.id === "dispel" ? DWR.Sim.useDispel(R.sim, tgt.id ?? tgt.uid) : DWR.Sim.useHeal(R.sim, tgt.id);
      if (result === "full") toast("Здоровье уже полное");
      else if (result === "clean") toast("На герое нет негативных эффектов");
      else if (!result) skillNotice(aim.id);
    } else if (aim.kind === "ground") {
      if (!DWR.Sim.useGround(R.sim, aim.id, tgt.x)) {
        if (DWR.CONFIG.skills[aim.id].stock) toast("Бросок недоступен");
        else skillNotice(aim.id);
      }
    } else {
      const fromFloor = aim.kind === "floorPotion";
      const index = fromFloor ? R.items.indexOf(aim.item) : -1;
      if (fromFloor && index < 0) return;
      const result = DWR.Sim.usePotion(R.sim, tgt.id, { fromFloor });
      if (result === "full") toast("Здоровье уже полное");
      else if (result && fromFloor) R.items.splice(index, 1);
    }
  }

  function goNextRoom() {
    R.sim.attacks.length = 0;
    DWR.Audio.play("door");
    // перед уходом: неподнятое остаётся лежать (пропадёт с комнатой)
    R.phase = "fadeout"; R.phaseT = 0;
    updateCursor(DWR.Input.x, DWR.Input.y);
  }
  function openChest() {
    if (chestLocked()) { toast("Сундук откроется после победы над боссом"); return; }
    if (R.chestOpened || !DWR.State.openTreasure(R.location)) return;
    R.chestOpened = true;
    R.runRunes++;
    const L = DWR.CONFIG.loot;
    const x = R.chestRect.x + R.chestRect.w / 2;
    DWR.Audio.play("chest", x);
    R.runeDrop = { x, y: R.chestRect.y + 29, since: R.time };
    floater(x, R.chestRect.y - 4, "+1 руна навыка", "#ddd3ff");
    const coins = (locationLoot()?.chest ?? L.coinPerChest) + R.sim.stats.chestCoins;
    for (let left = coins; left > 0; left -= 6) spawnItem("coin", x, Math.min(6, left));
  }
  function skillNotice(id) {
    const status = DWR.Sim.skillStatus(R.sim, id);
    toast(status.frozen ? "Герой заморожен" : status.stunned ? "Герой оглушён"
      : status.impaled ? "Герой на земляном колу"
      : status.volley ? "Лучник завершает выстрел" : status.casting ? "Жрица уже произносит заклинание"
      : status.left > 0 ? "Навык перезаряжается" : "Навык недоступен");
  }
  function menuClick(x, y) {
    if (R.menu.confirm) {
      if (inRect(x, y, PAUSE.yes)) finalize(R.sim.over === "wipe" ? "wipe" : "retreat");
      else if (inRect(x, y, PAUSE.no)) R.menu.confirm = false;
    } else if (inRect(x, y, PAUSE.retreat)) {
      R.menu.confirm = true;
    } else if (inRect(x, y, PAUSE.close)) {
      R.menu = null;
    }
  }
  function toast(text) { R.notice = { text, until: R.time + 1.5 }; }
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  // --- Отрисовка ---
  function draw(ctx) {
    R.hoverTarget = R.aim ? dropTargetAt(DWR.Input.x, DWR.Input.y) : null;
    ctx.fillStyle = "#101118";
    ctx.fillRect(0, 0, CV().w, CV().h);
    ctx.save();
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12);
    ctx.clip();
    ctx.translate(BOARD.x, BOARD.y);
    ctx.scale(BOARD.scale, BOARD.scale);
    drawRoom(ctx);
    if (curRoom().chest) drawChest(ctx);
    drawThreats(ctx);
    for (const wave of R.sim.groundWaves) {
      if (wave.kind === "furnace") drawFurnaceWave(ctx, wave);
    }
    if (DWR.CONFIG.skills[R.aim?.id]?.stock && R.hoverTarget) {
      drawBombArea(ctx, R.hoverTarget.x, DWR.Sim.bombRadius(R.sim, R.aim.id), R.aim.id === "noiseBomb");
    }
    drawSacrifice(ctx);
    drawUnits(ctx);
    for (const enemy of R.sim.enemies) {
      if (enemy.def.dragon) DWR.CityMotion.drawDragonFire(ctx, DWR.Assets.img, enemy, FLOOR);
    }
    for (const tornado of R.sim.tornadoes) drawFireTornado(ctx, tornado);
    drawCastBars(ctx);
    drawLoot(ctx);
    drawFx(ctx);
    drawFade(ctx);
    ctx.restore();

    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12);
    ctx.strokeStyle = "#45404c"; ctx.lineWidth = 1; ctx.stroke();
    drawHeader(ctx);
    drawParty(ctx);
    drawButton(ctx, BURGER, "Пауза");
    DWR.Panel.draw(ctx, R);
    if (canAdvance()) {
      if (!R.menu) drawNextArrow(ctx);
    }
    else {
      const battle = DWR.Sim.inBattle(R.sim);
      const warrior = R.sim.heroes.warrior;
      const status = R.phase === "fadeout" ? "Переход между комнатами"
        : hasEscapingBoss() ? "Лич открывает портал"
        : R.sim.fusion?.delay > 0 || R.sim.enemies.some(enemy => enemy.rift?.motion?.name === "merge") ? "Слияние стихий"
        : !battle && hasFrozenHero() ? "Герой оттаивает"
        : !battle && hasExitHazard() ? "Эффекты ещё действуют"
        : !battle && priestCasting() ? "Жрица произносит заклинание"
        : !battle && hasFallingBoss() ? "Босс повержен"
        : !battle && hasFallingCityEnemy() ? "Завершение боя"
        : !battle && warrior.alive && warrior.returnToFormation ? "Отряд перестраивается"
        : R.sim.tornadoes.some(tornado => !tornado.caster.id) && !battle ? "Огненный вихрь ещё действует"
        : curRoom().chest ? (chestLocked() ? "Сундук заперт" : "Откройте сундук") : "Бой в комнате";
      text(ctx, status, 1221, 593, "14px", "#b0aaba", "right");
    }
    drawAimHint(ctx);
    drawMenu(ctx);
  }

  function drawFade(ctx) {
    let a = 0;
    if (R.phase === "fadein") a = 1 - R.phaseT / DWR.CONFIG.fadeSec;
    else if (R.phase === "fadeout") a = Math.min(1, R.phaseT / DWR.CONFIG.fadeSec);
    else if (R.phase === "wipeDelay") a = Math.min(0.85, R.phaseT / 1.2);
    if (a > 0) { ctx.fillStyle = "rgba(8,6,4," + a + ")"; ctx.fillRect(0, 0, CV().w, CV().h); }
    if (R.phase === "wipeDelay" && R.phaseT > 0.5) {
      ctx.fillStyle = "#d06a5a"; ctx.font = "44px Segoe UI"; ctx.textAlign = "center";
      ctx.fillText("Отряд пал…", CV().w / 2, 320);
    }
  }

  function drawRoom(ctx) {
    // фон комнаты — слайд пользователя (assets/out/roomN.jpg, пол на FLOOR)
    const room = curRoom();
    const bg = DWR.Assets.img["room" + (room.art ?? room.id)];
    if (bg && bg.width) ctx.drawImage(bg, 0, 0, CV().w, CV().h);
    else { ctx.fillStyle = "#26211a"; ctx.fillRect(0, 0, CV().w, CV().h); }
  }

  function drawChest(ctx) {
    const r = R.chestRect, x = r.x + r.w / 2;
    shadow(ctx, x, r.w * 0.37);
    const img = DWR.Assets.img["chest-v2"];
    if (img?.naturalWidth) {
      // Обе позы имеют общую опору на нижней границе кадра.
      const frame = img.naturalWidth / 2, height = img.naturalHeight * r.w / frame;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, R.chestOpened ? frame : 0, 0, frame, img.naturalHeight,
        r.x, FLOOR - height, r.w, height);
      ctx.restore();
    }
    if (!R.chestOpened) {
      ctx.font = "15px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd092";
      ctx.fillText(chestLocked() ? "Сундук заперт" : "Открыть сундук", x, r.y + 11);
    }
  }

  function unitPose(u) {
    if (!u.alive) return { pose: "dead", poseT: deathProgress(u) };
    if (u.effects.has("frozen")) return { pose: "frozen", poseT: 0 };
    if (u.attackPose) return { pose: u.attackPose.name, poseT: u.attackPose.t / u.attackPose.duration };
    if (u.walking) return { pose: "walk", poseT: DWR.Chars.walkProgress(u) };
    return { pose: "idle", poseT: 0 };
  }

  function riftPose(enemy) {
    if (!enemy.alive) return unitPose(enemy);
    const { motion } = enemy.rift;
    if (motion) {
      const { name, elapsed, duration, originX, exitX, sources } = motion;
      const remnant = part => ({ x: part.x, y: FLOOR, h: part.h });
      return { pose: name, poseT: Math.min(1, elapsed / duration), x: originX ?? enemy.x, exitX,
        sources: sources ? { earth: remnant(sources.earth), fire: remnant(sources.fire) } : undefined };
    }
    if (enemy.effects.has("riftStone")) return { pose: "stone", poseT: 0 };
    const attack = enemy.attack;
    if (!attack) {
      const pose = unitPose(enemy);
      if (pose.pose === "idle") pose.poseT = (R.time / 1.7) % 1;
      return pose;
    }
    const move = attack.riftMove;
    const pose = move === "petrify" || move === "burrow" || move === "cloak" ? "charge" : move;
    const clip = DWR.RiftMotion.clips[pose];
    const contact = clip?.release ?? clip?.contact ?? 0.5;
    const aimed = attack.lockedTarget;
    const target = !attack.hit && aimed?.alive ? { x: aimed.x, y: FLOOR, h: aimed.h } : null;
    return { pose, target, poseT: attack.hit
      ? contact + (1 - contact) * Math.min(1, (attack.t - attack.windup) / attack.recovery)
      : contact * attack.t / attack.windup };
  }

  // Тень-эллипс под ногами — привязывает фигуру к полу
  function shadow(ctx, x, w) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, FLOOR + 6, w, 10, 0, 0, 7); ctx.fill();
  }

  const showsBossName = e => e.boss && (e.def.spritePoses || e.def.motion || e.def.rift || e.def.dragon);

  function drawUnits(ctx) {
    const sim = R.sim;
    const floorOffset = DWR.Sim.bypassFloorOffset;
    const units = [...sim.enemies, ...sim.heroOrder.map(id => sim.heroes[id])];
    units.sort((a, b) => floorOffset(a) - floorOffset(b) || Number(isCityCorpse(b)) - Number(isCityCorpse(a)));
    for (const unit of units) {
      ctx.save();
      ctx.translate(0, floorOffset(unit));
      if (unit.id) drawHeroUnit(ctx, unit);
      else drawEnemyUnit(ctx, unit);
      ctx.restore();
    }
  }

  function drawEnemyUnit(ctx, e) {
    if (e.raised || e.merged) return;
    if (e.escape) {
      if (!e.escape.finished) drawBossEscape(ctx, e);
      return;
    }
    const p = e.rift ? riftPose(e) : unitPose(e);
    const visible = DWR.Sim.targetable(e);
    const airLift = DWR.Sim.airLift(e);
    if (e.def.dragon) {
      const landed = p.pose === "dead" && p.poseT >= e.def.fall.land;
      shadow(ctx, e.x + e.h * (landed ? 0.17 : 0.30), e.h * (landed ? 0.68 : 0.53));
    } else if (visible || isCityCorpse(e)) shadow(ctx, e.x, e.h * 0.22);
    const drawUnit = R.hoverTarget === e ? DWR.Chars.drawOutlined : DWR.Chars.draw;
    const attack = e.ritual ? { ritual: true, t: e.ritual.t, windup: e.ritual.duration } : e.attack;
    ctx.save();
    if (e.appearT > 0) ctx.globalAlpha = 1 - e.appearT / 0.4;
    const cloak = e.effects.get("riftCloak");
    drawUnit(ctx, { kind: e.kind, x: e.x, y: FLOOR - airLift, airLift, h: e.h, facing: e.facing, attack, ...p, externalEffects: true,
      shieldRaised: e.def.guard?.armor && e.armor > 0, shieldLowering: e.shieldLowerT > 0,
      cloakT: cloak && e.alive ? (cloak.duration - cloak.left) / DWR.RiftMotion.clips.burning.duration : undefined,
      enraged: e.kind === "krag" && e.armor === 0, fallForward: e.x + e.h > CV().w,
      flash: (R.flash.get(e) || 0) / 0.18 }, R.time);
    ctx.restore();
    if (visible || p.pose === "burrow") {
      const height = (p.pose === "stone" ? e.h * 0.72 : DWR.ForgeMotion.howlGeometry(e).height) + airLift;
      const barY = FLOOR - height - (e.maxArmor ? 20 : 12), width = e.def.dragon ? 150 : e.maxArmor ? 116 : 74;
      ctx.save();
      // Во время перемещения сохраняем видимым остаток здоровья того же элементаля.
      if (!visible) ctx.globalAlpha *= 0.55;
      bar(ctx, e.x, barY, width, 8, e.hp / e.maxHp, e.taunted ? "#e1a05e" : "#b8563e");
      if (e.armor > 0) bar(ctx, e.x, barY + 10, width, 6, e.armor / e.maxArmor, "#a8cce7");
      const showName = showsBossName(e);
      if (showName) text(ctx, e.def.name, e.x, barY - 10, "600 18px", "#f6ddcf", "center");
      if (visible) drawStatusBadges(ctx, e, showName ? 23 : 0, height);
      ctx.restore();
    } else if (e.def.death && p.poseT < 1) drawBossDeathFx(ctx, e, p.poseT);
  }

  function drawHeroUnit(ctx, h) {
    if (!h.alive && !R.deaths.has(h)) return;
    const { id } = h;
    const p = unitPose(h);
    if (h.alive) shadow(ctx, h.x, 52);
    const spike = DWR.Sim.spikeElevation(h);
    if (spike.height > 0) DWR.RiftMotion.drawSpike(ctx, h.x, FLOOR, spike.sourceHeight, spike.height);
    const cast = h.attackPose?.spell && h.attackPose;
    if (cast && h.alive) {
      const { castTime, recovery } = DWR.CONFIG.skills[cast.spell];
      p.poseT = cast.released ? 0.60 + 0.40 * (cast.t - castTime) / recovery : 0.60 * cast.t / castTime;
      if (!cast.released) drawSpellCharge(ctx, h, cast.spell, cast.t / castTime);
    }
    const castReleased = cast?.released || id === "priest" && R.sim.attacks.some(shot => shot.kind === "fire" && shot.startX !== null);
    const drawUnit = R.hoverTarget === h ? DWR.Chars.drawOutlined : DWR.Chars.draw;
    drawUnit(ctx, { kind: id, x: h.x, y: FLOOR - spike.lift, h: h.h, facing: h.facing, ...p,
      castReleased, flash: (R.flash.get(h) || 0) / 0.18 }, R.time);
    if (h.alive) {
      ctx.save();
      ctx.translate(0, -spike.lift);
      if (h.blockT > 0) drawBlockBubble(ctx, h);
      const barrier = h.effects.get("healBarrier");
      if (barrier) drawHealBarrier(ctx, h, barrier);
      const ice = h.effects.get("frozen");
      if (ice) drawIceBlock(ctx, h.x, h.h, Math.min(1, (ice.duration - ice.left) / ICE_GROW));
      if (h.effects.has("burning") || h.effects.has("ember") || h.effects.has("whelpBurn") || h.effects.has("riftBurn") ||
          h.effects.has("riftCloakBurn")) drawBurning(ctx, h);
      ctx.restore();
      drawStatusBadges(ctx, h, spike.lift);
    }
  }

  function drawCastBars(ctx) {
    const rows = [], w = 142, h = 21, iconSize = 25, total = w + iconSize + 5;
    for (const e of R.sim.enemies) {
      const attack = e.attack;
      const finished = attack?.hit && attack.t > attack.windup + DWR.CONFIG.battle.castReleaseFlash;
      if (!e.alive || (!e.furnaceCast && !e.ritual && (!attack || finished))) continue;
      const key = e.furnaceCast ? "furnace" : e.ritual ? e.ritual.kind : DWR.Sim.specialAttackKey(e);
      if (!key) continue;
      const progress = Math.min(1, e.furnaceCast ? e.furnaceCast.elapsed / e.def.furnace.duration
        : e.ritual ? e.ritual.t / e.ritual.duration : attack.t / attack.windup);
      const x = Math.max(8, Math.min(e.x - total / 2, CV().w - total - 8));
      const aboveName = showsBossName(e) ? 23 : 0;
      const height = DWR.ForgeMotion.howlGeometry(e).height;
      let y = Math.max(6, FLOOR - height - (e.effects.size ? 77 : 47) - aboveName);
      while (y > 6 && rows.some(row => Math.abs(row.y - y) < iconSize + 4 && Math.abs(row.x - x) < total + 4)) {
        y = Math.max(6, y - iconSize - 4);
      }
      rows.push({ x, y });
      const details = e.furnaceCast ? " · " + Math.ceil(e.furnaceCast.remaining) : "";
      drawCastBar(ctx, x, y, iconSize, w, h, CAST_ART[key], progress, details);
    }
    const priest = R.sim.heroes.priest, cast = priest.attackPose;
    if (priest.alive && cast?.spell && !cast.released) {
      const x = Math.max(8, Math.min(priest.x - total / 2, CV().w - total - 8));
      const hasStatus = priest.effects.size > 0;
      drawCastBar(ctx, x, FLOOR - priest.h - (hasStatus ? 78 : 46), iconSize, w, h, CAST_ART[cast.spell],
        Math.min(1, cast.t / DWR.CONFIG.skills[cast.spell].castTime), "");
    }
  }

  function drawCastBar(ctx, x, y, iconSize, w, h, [name, color, icon], progress, details) {
    ctx.save();
    box(ctx, x, y, iconSize, iconSize, "#181723", color, 5);
    if (icon) {
      ctx.save();
      ctx.translate(x + 3, y + 3);
      ctx.scale(0.79, 0.79);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.stroke(icon);
      ctx.restore();
    } else drawSnowflake(ctx, x + iconSize / 2, y + iconSize / 2, 8, color, 1.8);

    const left = x + iconSize + 5, top = y + (iconSize - h) / 2;
    box(ctx, left, top, w, h, "#181723", color, 5);
    ctx.save();
    roundRect(ctx, left + 1, top + 1, w - 2, h - 2, 4);
    ctx.clip();
    const filled = (w - 2) * progress;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.48;
    ctx.fillRect(left + 1, top + 1, filled, h - 2);
    if (filled > 2) {
      ctx.globalAlpha = 0.95;
      ctx.fillRect(left + filled - 1, top + 1, 2, h - 2);
    }
    ctx.restore();
    ctx.font = "600 12px Segoe UI"; ctx.textAlign = "left";
    ctx.fillStyle = "#fff5ea";
    ctx.fillText(name + details, left + 7, top + 15, w - 13);
    ctx.restore();
  }

  function drawBossDeathFx(ctx, boss, progress) {
    const { x, h, kind, facing, def } = boss;
    const { land, tint } = def.death;
    const age = (progress - land) / (1 - land);
    if (age < 0) return;
    const fallsForward = def.death.forward || kind === "lycan";
    const impactX = x + facing * (fallsForward ? 1 : -1) * h * 0.24;
    ctx.save();
    ctx.translate(impactX, FLOOR);
    const flash = 1 - age;
    const dust = ctx.createRadialGradient(0, 0, 2, 0, 0, h * (0.18 + age * 0.28));
    dust.addColorStop(0, tint + "ab"); dust.addColorStop(1, tint + "00");
    ctx.fillStyle = dust;
    ctx.globalAlpha = flash * 0.85;
    ctx.beginPath(); ctx.ellipse(0, 0, h * (0.18 + age * 0.28), 10 + age * 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1 + flash * 3;
    ctx.beginPath();
    ctx.ellipse(0, 2, h * (0.13 + age * 0.39), 6 + age * 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 21; i++) {
      const px = Math.sin(i * 2.37) * h * (0.09 + age * 0.43);
      const py = -4 - Math.sin(Math.PI * age) * (16 + (i % 6) * 12);
      const size = (4 + i % 5) * (1 - age * 0.65);
      ctx.fillStyle = i % 3 ? tint : "#fff1d6";
      ctx.globalAlpha = flash * (0.43 + (i % 3) * 0.22);
      ctx.fillRect(Math.round(px), Math.round(py), size, size);
    }
    ctx.restore();
  }

  function drawBossEscape(ctx, boss) {
    const { duration, tint } = boss.def.escape;
    const t = boss.escape.elapsed / duration;
    const ease = (start, end) => {
      const k = Math.max(0, Math.min(1, (t - start) / (end - start)));
      return k * k * (3 - 2 * k);
    };
    const open = ease(0.06, 0.44) * (1 - ease(0.75, 1));
    const transit = ease(0.30, 0.75);
    const motion = reducedMotion.matches ? 0 : transit;
    const x = Math.max(72, Math.min(CV().w - 72, boss.x - boss.facing * boss.h * 0.19));
    const y = FLOOR - boss.h * 0.48;
    const width = 2 + 57 * open, height = 6 + boss.h * 0.47 * open;

    ctx.save();
    if (open > 0) {
      const portal = ctx.createLinearGradient(x - width, y, x + width, y);
      portal.addColorStop(0, "#332451");
      portal.addColorStop(0.44, "#141125");
      portal.addColorStop(0.63, "#2b1b4e");
      portal.addColorStop(1, "#8f68cb");
      ctx.globalAlpha = Math.min(1, open * 2);
      ctx.beginPath(); ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
      ctx.fillStyle = portal; ctx.fill();
      ctx.strokeStyle = tint; ctx.lineWidth = 3;
      ctx.shadowColor = "#b68dff"; ctx.shadowBlur = 20; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.ellipse(x, FLOOR + 1, width * 1.58, width * 0.23, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#b393e8"; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const turn = i * Math.PI / 8 + (reducedMotion.matches ? 0 : t * 2.4);
        const px = x + Math.cos(turn) * (width + 9 + i % 3 * 6);
        const py = y + Math.sin(turn) * (height + 3);
        ctx.fillStyle = i % 3 ? tint : "#e8eaff";
        ctx.fillRect(Math.round(px), Math.round(py), 3 + i % 3, 3);
      }
    }
    ctx.restore();

    if (transit >= 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - ease(0.49, 0.75);
    ctx.translate(boss.x + (x - boss.x) * motion, FLOOR - 26 * motion);
    ctx.scale(1 - 0.72 * motion, 1 - 0.14 * motion);
    DWR.Chars.draw(ctx, {
      kind: boss.kind, x: 0, y: 0, h: boss.h, facing: boss.facing, pose: "escape", poseT: t, flash: 0
    }, R.time);
    ctx.restore();
  }

  function drawStatusBadges(ctx, unit, offset = 0, height = unit.h) {
    const statuses = DWR.Sim.activeStatuses(unit);
    const size = 27, advance = size + 5;
    const y = Math.max(3, FLOOR - height - 46 - offset);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const [i, status] of statuses.entries()) {
      const x = unit.x + (i - (statuses.length - 1) / 2) * advance - size / 2;
      const image = status.id === "block" ? DWR.Assets.icons.block : DWR.Assets.statusIcons[status.id];
      const border = DWR.CONFIG.effects[status.id]?.color ?? (status.id === "block" ? "#f1c887" : "#c5a3ec");
      box(ctx, x, y, size, size, "#292234", border, 5);
      if (image?.naturalWidth) ctx.drawImage(image, x + 3, y + 3, size - 6, size - 6);
      else {
        ctx.fillStyle = border;
        if (status.id === "stunned") {
          ctx.beginPath();
          ctx.moveTo(x + 15, y + 4); ctx.lineTo(x + 7, y + 15); ctx.lineTo(x + 13, y + 15);
          ctx.lineTo(x + 11, y + 23); ctx.lineTo(x + 20, y + 11); ctx.lineTo(x + 14, y + 11);
          ctx.closePath(); ctx.fill();
        } else if (status.id === "frozen") {
          drawSnowflake(ctx, x + size / 2, y + size / 2, 9, border, 2);
        } else if (STATUS_PATH[status.id]) {
          ctx.save();
          ctx.translate(x + 3, y + 3); ctx.scale(0.87, 0.87);
          ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.lineJoin = "round";
          ctx.stroke(STATUS_PATH[status.id]);
          ctx.restore();
        } else if (status.id === "lycanRegen") {
          ctx.fillRect(x + 11, y + 5, 5, 17);
          ctx.fillRect(x + 5, y + 11, 17, 5);
        }
      }
      if (Number.isFinite(status.duration)) {
        ctx.globalAlpha = Math.min(0.9, 0.9 * (1 - status.left / status.duration));
        ctx.beginPath(); ctx.roundRect(x, y, size, size, 5);
        ctx.fillStyle = "#0c0914"; ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (status.stacks) text(ctx, String(status.stacks), x + size - 3, y + size - 3, "600 12px", "#fff5de", "right");
    }
    ctx.restore();
  }

  function drawThreats(ctx) {
    for (const e of R.sim.enemies) {
      if (!e.alive) continue;
      if (e.appearT > 0) drawSummonCircle(ctx, e);
      if ((e.ritual && !e.ritual.hit) || ((e.attack?.beam || e.attack?.freezing) && !e.attack.hit)) drawNecroticCharge(ctx, e);
      if ((e.attack?.howling || e.attack?.buffing && e.def.buff.id === "orcWarCry") && !e.attack.hit) {
        const phase = Math.min(1, e.attack.t / e.attack.windup);
        const { x, y } = DWR.ForgeMotion.howlGeometry(e);
        drawHowlWave(ctx, x, FLOOR + y, phase, true);
      }
      const attack = e.attack, target = attack?.lockedTarget;
      if (target?.alive && !attack.hit && (attack.stunning || attack.projectile === "firebolt")) {
        const strength = Math.max(0, Math.min(1, attack.t / attack.windup));
        ctx.save();
        ctx.beginPath(); ctx.ellipse(target.x, FLOOR + 3, 42, 15, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#8d32174d"; ctx.fill();
        ctx.strokeStyle = "#ffac6d"; ctx.globalAlpha = 0.4 + strength * 0.6; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      }
      if (e.kind === "skeletonM" && e.attack && !e.attack.hit) {
        const staff = DWR.Chars.staffPoint(e);
        if (staff) drawMageOrb(ctx, staff.x, FLOOR + staff.y, e.attack.t / e.attack.windup, e.attack.buffing);
      }
    }
    for (const { alive, attack, x: enemyX, facing, def } of R.sim.enemies) {
      if (!alive || !attack || attack.hit || !(attack.heavy || attack.wave || attack.party)) continue;
      const k = attack.t / attack.windup;
      const direction = Math.sign(attack.targetX - enemyX) || facing;
      const range = attack.wave?.range ?? 0;
      const x = attack.heavy ? (attack.groundX + def.smash.contactReach) / 2
        : attack.party ? CV().w / 2 : attack.targetX + range * direction / 2;
      const radius = attack.heavy ? Math.max(4, x) : attack.party ? CV().w / 2 - 18 : range / 2 || 90;
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.65 * k;
      ctx.beginPath();
      ctx.ellipse(x, FLOOR + 2, radius, 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = attack.heavy ? "#c7523549" : "#ba529666"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = attack.heavy ? "#ff9569" : "#e78dc4"; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, FLOOR + 2, (radius - 1) * k, 21 * k, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffd092"; ctx.stroke();
      ctx.restore();
    }
  }

  function drawHowlWave(ctx, x, y, progress, charging = false) {
    const count = charging ? 2 : 3;
    ctx.save();
    ctx.strokeStyle = charging ? "#ffd98d" : "#ffe6ad";
    ctx.lineWidth = charging ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const k = charging ? (1 - progress) * 0.70 + i * 0.24 : progress - i * 0.14;
      if (k < 0) continue;
      ctx.globalAlpha = charging ? (0.35 + progress * 0.48) : Math.max(0, 0.82 * (1 - progress));
      ctx.beginPath();
      ctx.ellipse(x, y, 24 + k * (charging ? 84 : 560), 16 + k * (charging ? 50 : 160), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSummonCircle(ctx, unit) {
    const phase = 1 - unit.appearT / 0.4;
    ctx.save();
    ctx.globalAlpha = 1 - 0.8 * phase;
    ctx.beginPath();
    ctx.ellipse(unit.x, FLOOR + 1, 26 + phase * 29, 8 + phase * 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6a3fbc70"; ctx.fill();
    ctx.strokeStyle = "#d0a5ff"; ctx.lineWidth = 3; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = unit.x - 33 + i * 13;
      const y = FLOOR - 9 - phase * (42 + (i % 3) * 17);
      ctx.fillStyle = i % 2 ? "#b98bff" : "#9daeea";
      ctx.fillRect(x, y, 4, 5);
    }
    ctx.restore();
  }

  function drawSnowflake(ctx, x, y, radius, color, width, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      ctx.moveTo(0, 0); ctx.lineTo(radius, 0);
      ctx.moveTo(radius * 0.49, -radius * 0.26); ctx.lineTo(radius * 0.69, 0);
      ctx.lineTo(radius * 0.49, radius * 0.26);
      ctx.rotate(Math.PI / 3);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawNecroticCharge(ctx, enemy) {
    const attack = enemy.ritual ? { ritual: true, t: enemy.ritual.t, windup: enemy.ritual.duration } : enemy.attack;
    const staff = DWR.Chars.staffPoint(enemy, attack);
    if (!staff) return;
    const y = FLOOR + staff.y;
    const charge = attack.t / attack.windup;
    ctx.save();
    ctx.globalAlpha = 0.28 + charge * 0.62;
    ctx.beginPath(); ctx.arc(staff.x, y, 12 + charge * 14, 0, Math.PI * 2);
    ctx.strokeStyle = attack.ritual ? "#d0a1ff" : attack.freezing ? "#9fddff" : "#96ffe0";
    ctx.lineWidth = 3; ctx.stroke();
    const corpse = enemy.ritual?.corpse;
    if (corpse) {
      ctx.beginPath(); ctx.ellipse(corpse.x, FLOOR + 1, 33 + charge * 12, 9 + charge * 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#6a3fbc70"; ctx.fill(); ctx.stroke();
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -R.time * 40;
      ctx.beginPath(); ctx.moveTo(staff.x, y); ctx.quadraticCurveTo((staff.x + corpse.x) / 2, y - 30, corpse.x, FLOOR);
      ctx.lineWidth = 2; ctx.stroke();
    }
    if (!attack.ritual) {
      ctx.setLineDash([6, 9]);
      ctx.lineDashOffset = -R.time * 55;
      ctx.beginPath(); ctx.moveTo(staff.x, y); ctx.lineTo(attack.targetX, FLOOR + attack.targetY);
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (attack.freezing) {
      const glow = ctx.createRadialGradient(staff.x, y, 2, staff.x, y, 32 + charge * 12);
      glow.addColorStop(0, "#ccf9ffbc"); glow.addColorStop(1, "#479fff00");
      ctx.fillStyle = glow;
      ctx.fillRect(staff.x - 45, y - 45, 90, 90);
      ctx.setLineDash([]);
      drawSnowflake(ctx, staff.x, y, 11 + charge * 10, "#eafdff", 2.6, charge * Math.PI / 2);
      drawSnowflake(ctx, attack.targetX, FLOOR + attack.targetY, 12 + charge * 7, "#bceaff", 2.3);
    }
    ctx.restore();
  }

  function drawNecroticBeams(ctx) {
    for (const beam of R.beams) {
      const staff = DWR.Chars.staffPoint(beam.caster);
      if (!staff) continue;
      const startY = FLOOR + staff.y, endY = FLOOR + beam.y;
      const fade = Math.max(0, 1 - beam.t / 0.34);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(staff.x, startY);
      for (let i = 1; i < 10; i++) {
        const k = i / 10;
        const ripple = Math.sin(R.time * 55 + i * 1.9) * 8 * Math.sin(k * Math.PI);
        ctx.lineTo(staff.x + (beam.x - staff.x) * k, startY + (endY - startY) * k + ripple);
      }
      ctx.lineTo(beam.x, endY);
      ctx.strokeStyle = "#773bc8"; ctx.lineWidth = 27 * fade + 4; ctx.stroke();
      ctx.strokeStyle = "#68e2c6"; ctx.lineWidth = 12 * fade + 2; ctx.stroke();
      ctx.strokeStyle = "#f1fff1"; ctx.lineWidth = 4 * fade + 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(beam.x, endY, 10 + 34 * (1 - fade), 0, Math.PI * 2);
      ctx.strokeStyle = "#b29eef"; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
  }

  function drawMageOrb(ctx, x, y, strength, buffing = false, direction = 0) {
    const radius = 5 + 10 * strength;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(direction);
    ctx.beginPath(); ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = buffing ? "#efb56f42" : "#7162e863"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-radius * 2.2, 0); ctx.lineTo(-radius, -radius * 0.58);
    ctx.lineTo(-radius * 0.43, -radius); ctx.lineTo(radius * 0.60, -radius * 0.75);
    ctx.lineTo(radius, 0); ctx.lineTo(radius * 0.60, radius * 0.75);
    ctx.lineTo(-radius * 0.43, radius); ctx.lineTo(-radius, radius * 0.50); ctx.closePath();
    ctx.fillStyle = buffing ? "#d58855" : "#7041b5"; ctx.fill();
    ctx.beginPath(); ctx.arc(radius * 0.14, 0, radius * 0.66, 0, Math.PI * 2);
    ctx.fillStyle = buffing ? "#ffe4a2" : "#7be3d1"; ctx.fill();
    ctx.fillStyle = buffing ? "#fff3c9" : "#e0ffec";
    ctx.fillRect(0, -radius * 0.23, radius * 0.45, radius * 0.45);
    ctx.restore();
  }

  function drawNecroticBurst(ctx, x, y, progress, color) {
    const radius = 12 + 25 * progress;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = 4 * (1 - progress) + 1; ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + progress;
      ctx.fillRect(x + Math.cos(angle) * radius - 2, y + Math.sin(angle) * radius - 2, 4, 4);
    }
    ctx.restore();
  }

  function drawMeleeImpact(ctx, { x, y, kind, side, art, t }) {
    const age = t / art.duration;
    ctx.save();
    if (kind === "smash") {
      ctx.globalAlpha = 0.75 * (1 - age);
      ctx.strokeStyle = art.tint;
      ctx.lineWidth = 5 * (1 - age) + 1;
      ctx.beginPath();
      ctx.ellipse(x, FLOOR - 5, 26 + 122 * age, 9 + 20 * age, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(x, FLOOR + y);
    ctx.scale(side * art.scale, art.scale);
    ctx.fillStyle = art.tint;
    ctx.globalAlpha = Math.max(0, 1 - age * 1.6);
    ctx.strokeStyle = art.core;
    ctx.lineWidth = 2.5;
    for (const offset of kind === "claw" ? [-15, 0, 15] : [0]) {
      ctx.save();
      ctx.translate(offset * 0.8, offset);
      ctx.beginPath();
      ctx.moveTo(42, -43 + 16 * age);
      ctx.quadraticCurveTo(14, -40, -31, 33);
      ctx.quadraticCurveTo(kind === "claw" ? 3 : -3, -28, 42, -43 + 16 * age);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(26, -34);
      ctx.quadraticCurveTo(2, -19, -20, 16);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = (1 - age) ** 1.35;
    for (let i = 0; i < 9; i++) {
      const angle = -2.6 + i * 0.63;
      const travel = 10 + age * (40 + i % 4 * 14);
      const size = Math.max(2, (i % 3 + 3) * (1 - age));
      ctx.fillStyle = i % 3 ? art.tint : art.core;
      const dx = Math.cos(angle) * travel;
      const dy = Math.sin(angle) * travel + 16 * age ** 2;
      ctx.fillRect(Math.round(dx), Math.round(dy), size, size);
    }
    ctx.fillStyle = art.core;
    ctx.globalAlpha = Math.max(0, 1 - age * 4);
    ctx.fillRect(-3, -15, 6, 30);
    ctx.fillRect(-12, -3, 24, 6);
    ctx.restore();
  }

  function drawBlockBubble(ctx, hero) {
    const age = hero.blockDuration - hero.blockT;
    const grow = 1 - (1 - Math.min(1, age / 0.26)) ** 3;
    const fade = Math.min(1, hero.blockT / 0.34);
    const hit = Math.max(0, (R.flash.get(hero) || 0) / 0.18);
    const pulse = Math.sin(age * 6.5);
    const x = hero.x, y = FLOOR - hero.h * 0.51;
    const size = hero.h * (0.4 + 0.6 * grow) * (0.99 + 0.014 * pulse + 0.027 * hit);
    const rx = size * 0.52, ry = size * 0.56;

    ctx.save();
    ctx.globalAlpha *= Math.min(1, age / 0.08) * fade;
    ctx.translate(x, y);
    ctx.scale(rx, ry);

    const shell = ctx.createRadialGradient(-0.17, -0.13, 0.17, 0, 0, 1);
    shell.addColorStop(0, "#f4c2510b");
    shell.addColorStop(0.68, "#ed9c311a");
    shell.addColorStop(0.91, "#f3ac4858");
    shell.addColorStop(1, "#ffe09ca8");
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hit > 0.45 ? "#fff9d9" : "#ffd27f";
    ctx.shadowColor = "#ffb745";
    ctx.shadowBlur = 9 + 9 * hit;
    ctx.lineWidth = 2.2 / rx;
    ctx.stroke();

    ctx.lineCap = "round";
    ctx.lineWidth = (2.2 + 1.6 * hit) / rx;
    ctx.strokeStyle = "#fff0bd";
    for (let i = 0; i < 2; i++) {
      const phase = age * 1.45 + i * Math.PI - 2.45;
      ctx.beginPath(); ctx.arc(0, 0, 0.98, phase, phase + 0.64); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe8a4";
    for (let i = 0; i < 8; i++) {
      const a = age * (1.5 + i % 2 * 0.16) + i * Math.PI / 4;
      const r = 1.02 + 0.075 * Math.sin(age * 4 + i);
      const spark = (2.4 + 1.1 * Math.sin(age * 7 + i * 2)) / rx;
      ctx.fillRect(Math.cos(a) * r - spark / 2, Math.sin(a) * r - spark / 2, spark, spark);
    }
    ctx.restore();
  }

  function bar(ctx, cx, y, w, hgt, frac, color) {
    ctx.fillStyle = "#141210"; ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, hgt + 2);
    ctx.fillStyle = color; ctx.fillRect(cx - w / 2, y, Math.max(0, w * Math.min(1, frac)), hgt);
  }

  function drawHealBarrier(ctx, hero, barrier) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, barrier.left / 0.40);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#c9e9ff";
    ctx.fillStyle = "#a4dcff22";
    ctx.shadowColor = "#7bbbf7";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(hero.x, FLOOR - hero.h * 0.5, hero.h * 0.33, hero.h * 0.53, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawLoot(ctx) {
    const coinImg = DWR.Assets.img.coin;
    const p = !R.aim && worldPoint(DWR.Input.x, DWR.Input.y);
    for (const it of R.items) {
      const { size, color } = LOOT_ART[it.type];
      if (p && it.grounded && nearLoot(p, it)) {
        ctx.fillStyle = color + "32";
        ctx.beginPath(); ctx.ellipse(it.x, FLOOR + 2, size * 0.54, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (it.type === "potion") DWR.Panel.drawIcon(ctx, "potion", it.x - size / 2, it.y - size / 2, size);
      else if (coinImg.naturalWidth) ctx.drawImage(coinImg, it.x - size / 2, it.y - size / 2, size, size);
    }
    const rune = DWR.Assets.img.rune;
    if (R.runeDrop && rune?.naturalWidth) {
      const { x, y, since } = R.runeDrop;
      const age = (R.time - since) / 1.1;
      if (age < 1) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, 4 * (1 - age));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(rune, x - 24, y - 66 * Math.sin(age * Math.PI / 2), 48, 48);
        ctx.restore();
      }
    }
  }

  const ARROW_ART = {
    arrow: ["arrow", 52],
    multi: ["arrow-multishot", 66],
    precise: ["arrow-precise", 108]
  };

  function drawArrow(ctx, kind, x, y, angle) {
    const [sprite, length] = ARROW_ART[kind] || ARROW_ART.arrow;
    const special = DWR.Assets.img[sprite];
    const img = special?.naturalWidth ? special : DWR.Assets.img.arrow;
    if (!img?.naturalWidth) return;
    const height = length * img.naturalHeight / img.naturalWidth;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -length / 2, -height / 2, length, height);
    ctx.restore();
  }

  function drawFireFrame(ctx, name, progress, x, y, anchorX, anchorY, angle = 0) {
    const clip = DWR.Assets.frames[name];
    const image = clip?.[Math.min(clip.length - 1, Math.floor(progress * clip.length))];
    if (!image?.naturalWidth) return false;
    const scale = 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, -anchorX * scale, -anchorY * scale, image.naturalWidth * scale, image.naturalHeight * scale);
    ctx.restore();
    return true;
  }

  function projectileOrigin(attack) {
    if (attack.origin) return attack.origin;
    const { caster, kind, facing } = attack;
    const source = { kind: caster.kind, h: caster.h, x: attack.startX, facing };
    if (kind === "riftFireball" || kind === "riftBoulder") {
      return DWR.RiftMotion.projectileOrigin({ ...source, y: 0 }, kind === "riftFireball" ? "fireball" : "boulder");
    }
    if (kind === "firebolt") return { x: source.x + facing * source.h * 0.47, y: -source.h * 0.75 };
    let grip;
    if (kind === "fire") grip = DWR.Chars.fireRelease(source);
    else if (kind === "enemyArrow") grip = DWR.Chars.enemyBowRelease(source);
    else if (kind === "necroticOrb" || kind === "frost") {
      grip = DWR.Chars.staffPoint(source, { t: 1, windup: 1, freezing: kind === "frost" });
    }
    else if (kind !== "slash") {
      const pose = kind === "multi" ? "multishot" : kind === "precise" ? "preciseShot" : undefined;
      grip = DWR.Chars.bowRelease(source, pose);
    }
    return {
      x: grip?.x ?? source.x + 30 * facing,
      y: grip?.y ?? -caster.h * 0.55
    };
  }

  function drawProjectile(ctx, shot) {
    const { kind, arc } = shot;
    const start = projectileOrigin(shot);
    const k = Math.min(1, (shot.t - shot.windup) / shot.flight);
    const dx = shot.x - start.x, dy = shot.y - start.y;
    const x = start.x + dx * k, y = FLOOR + start.y + dy * k - arc * 4 * k * (1 - k);
    const angle = Math.atan2(dy - arc * 4 * (1 - 2 * k), dx);
    if (kind === "riftFireball" || kind === "riftBoulder") {
      DWR.RiftMotion.drawProjectile(ctx, { x, y, h: shot.caster.h, facing: Math.sign(dx) || shot.facing,
        progress: k, fire: kind === "riftFireball" });
    } else if (kind === "fire" || kind === "cityFireball") {
      const emerge = kind === "cityFireball" ? 0.52 + 0.48 * Math.min(1, (shot.t - shot.windup) / 0.08) : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(emerge, emerge);
      if (!drawFireFrame(ctx, "fireball-flight", k, 0, 0, 70, 18, angle)) {
        ctx.fillStyle = "#ff9b49";
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (kind === "firebolt") {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(angle);
      ctx.shadowColor = "#ff7c42"; ctx.shadowBlur = 12;
      ctx.strokeStyle = "#ff924e"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(3, 0); ctx.stroke();
      ctx.fillStyle = "#fff5b7"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, 4); ctx.lineTo(-5, -4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (kind === "necroticOrb") {
      drawMageOrb(ctx, x, y, 0.91, false, angle);
    } else if (kind === "frost") {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(-55, 0); ctx.lineTo(-5, -13); ctx.lineTo(24, 0);
      ctx.lineTo(-5, 13); ctx.closePath();
      ctx.fillStyle = "#69c5fb80"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-3, -9); ctx.lineTo(22, 0);
      ctx.lineTo(-3, 9); ctx.closePath();
      ctx.fillStyle = "#dcfbff"; ctx.fill();
      ctx.restore();
      drawSnowflake(ctx, x, y, 13, "#d3f2ff", 2, k * Math.PI);
    } else if (kind === "slash") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-15, -28); ctx.quadraticCurveTo(35, 0, -15, 28);
      ctx.quadraticCurveTo(14, 0, -15, -28);
      ctx.fillStyle = "#ffd092"; ctx.fill();
      ctx.restore();
    } else {
      drawArrow(ctx, kind, x, y, angle);
    }
  }

  function drawClawWave(ctx, wave) {
    const x = wave.origin + wave.direction * wave.distance;
    const fade = Math.min(1, (wave.range - wave.distance) / 42);
    ctx.save();
    ctx.translate(x, FLOOR - 8);
    ctx.scale(wave.direction, 1);
    ctx.globalAlpha = fade;

    const ground = ctx.createRadialGradient(-12, 0, 2, -12, 0, 52);
    ground.addColorStop(0, "#d57cca9e");
    ground.addColorStop(1, "#a24d9100");
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(-12, 0, 54, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 2; i >= 0; i--) {
      const tail = -i * 15, height = 100 - i * 15;
      ctx.globalAlpha = fade * (1 - i * 0.23);
      ctx.fillStyle = "#d98ace";
      ctx.beginPath();
      ctx.moveTo(tail - 20, -height);
      ctx.quadraticCurveTo(tail + 18, -height * 0.67, tail, -8);
      ctx.quadraticCurveTo(tail - 3, -height * 0.55, tail - 20, -height);
      ctx.fill();
      ctx.strokeStyle = "#ffe2f4";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(tail - 16, -height + 5);
      ctx.quadraticCurveTo(tail + 12, -height * 0.69, tail, -16);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSmashWave(ctx, wave) {
    const x = wave.origin + wave.direction * wave.distance;
    ctx.save();
    ctx.translate(x, FLOOR - 1);
    ctx.scale(wave.direction, 1);
    ctx.globalAlpha = Math.min(1, 0.15 + (wave.range - wave.distance) / 65);
    const glow = ctx.createLinearGradient(0, -82, 0, 13);
    glow.addColorStop(0, "#ffbd5c09"); glow.addColorStop(0.72, "#ed794a77"); glow.addColorStop(1, "#ffe1a1dc");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.moveTo(-105, 4); ctx.lineTo(-77, -21); ctx.lineTo(-55, -19);
    ctx.lineTo(-38, -50); ctx.lineTo(-22, -39); ctx.lineTo(-15, -78); ctx.lineTo(4, -49);
    ctx.lineTo(17, -26); ctx.lineTo(24, 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#ffd18c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-95, 3); ctx.lineTo(-65, -3); ctx.lineTo(-43, 5); ctx.lineTo(-22, -4);
    ctx.lineTo(-5, 3); ctx.lineTo(22, 0); ctx.lineTo(7, -29); ctx.lineTo(-9, -48); ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const age = (wave.distance / 94 + i * 0.37) % 1;
      ctx.fillStyle = i % 2 ? "#835039" : "#dfb180";
      ctx.fillRect(-16 - 65 * age + (i % 3) * 9, -4 - Math.sin(age * Math.PI) * (15 + i * 4), 4 + i % 4, 4 + i % 4);
    }
    ctx.restore();
  }

  function drawGroundSmash(ctx, x, progress) {
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = "#ffd18c";
    ctx.lineWidth = 6 - 4 * progress;
    ctx.beginPath(); ctx.ellipse(x, FLOOR, 16 + 108 * progress, 5 + 20 * progress, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff0b5";
    ctx.beginPath(); ctx.ellipse(x, FLOOR - 1, 39 * (1 - progress) + 2, 10 * (1 - progress) + 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawIceBlock(ctx, x, height, rise, opacity = 1) {
    const scale = height / 210;
    ctx.save();
    ctx.translate(x, FLOOR);
    ctx.scale(scale, scale);
    ctx.globalAlpha = opacity;
    const visible = 222 * rise * (2 - rise);
    ctx.beginPath(); ctx.rect(-90, -visible, 180, visible + 6); ctx.clip();
    const tint = ctx.createLinearGradient(-66, 0, 51, -202);
    tint.addColorStop(0, "#3873aa9b"); tint.addColorStop(0.54, "#509cd96e"); tint.addColorStop(1, "#b0edffb5");
    ctx.fillStyle = tint; ctx.fill(ICE_BLOCK);
    for (const [facet, color] of ICE_FACETS) {
      ctx.fillStyle = color; ctx.fill(facet);
    }
    ctx.strokeStyle = "#a2e8ffa8"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke(ICE_BLOCK);
    ctx.strokeStyle = "#e0f9ffb0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-55, -155); ctx.lineTo(-16, -205); ctx.lineTo(15, -204);
    ctx.moveTo(64, -148); ctx.lineTo(69, -98); ctx.lineTo(63, -61);
    ctx.moveTo(-40, -75); ctx.lineTo(-17, -97); ctx.lineTo(-3, -124); ctx.stroke();
    ctx.restore();
  }

  function drawIceParticles(ctx, { x, h }, progress, thawing) {
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    for (let i = 0; i < 14; i++) {
      const dx = Math.cos(i * 2.4) * (thawing ? 44 : 14) + Math.cos(i * 2.4) * progress * 48;
      const y = thawing ? -h * (0.16 + (i % 7) * 0.12) + 160 * progress ** 1.6
        : -h * 0.56 + Math.sin(i * 2.4) * (12 + progress * 85);
      const size = 3 + i % 4;
      ctx.fillStyle = i % 2 ? "#80c6f3" : "#dcfbff";
      ctx.beginPath(); ctx.moveTo(x + dx, FLOOR + y - size);
      ctx.lineTo(x + dx + size, FLOOR + y); ctx.lineTo(x + dx - 1, FLOOR + y + size * 1.5);
      ctx.lineTo(x + dx - size, FLOOR + y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawBurning(ctx, hero) {
    ctx.save();
    ctx.translate(hero.x, FLOOR);
    const fire = ctx.createLinearGradient(0, 2, 0, -58);
    fire.addColorStop(0, "#ffe09faa"); fire.addColorStop(0.42, "#ff7f427c"); fire.addColorStop(1, "#c1451900");
    ctx.fillStyle = fire;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 17;
      const tip = 36 + 21 * Math.sin(R.time * 16 + i * 2);
      ctx.beginPath(); ctx.moveTo(x - 10, 3); ctx.quadraticCurveTo(x - 5, -tip * 0.5, x + 3, -tip);
      ctx.quadraticCurveTo(x + 14, -tip * 0.55, x + 13, 3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFurnaceWave(ctx, wave) {
    const x = wave.origin + wave.distance * wave.direction;
    const time = R.time * (reducedMotion.matches ? 4 : 14);
    ctx.save();
    ctx.translate(x, FLOOR);
    ctx.scale(-wave.direction, 1);
    ctx.globalAlpha = Math.min(1, (wave.range - wave.distance) / 94);

    const floorHeat = ctx.createLinearGradient(0, 0, 350, 0);
    floorHeat.addColorStop(0, "#ffe2aacc");
    floorHeat.addColorStop(0.2, "#ff9147aa");
    floorHeat.addColorStop(1, "#f54d1900");
    ctx.fillStyle = floorHeat;
    ctx.beginPath(); ctx.ellipse(157, 3, 171, 20, 0, 0, Math.PI * 2); ctx.fill();

    const curtain = ctx.createLinearGradient(0, 7, 0, -242);
    curtain.addColorStop(0, "#ffce78");
    curtain.addColorStop(0.22, "#ff9a43f0");
    curtain.addColorStop(0.62, "#e44b1cdf");
    curtain.addColorStop(1, "#a2232088");
    ctx.fillStyle = curtain;
    ctx.beginPath(); ctx.moveTo(0, 8);
    for (let i = 0; i < 8; i++) {
      const foot = i * 41;
      const peak = (1 - i / 8) ** 0.65 * (202 + 22 * Math.sin(time + i * 2.4));
      ctx.bezierCurveTo(foot + 2, -peak * 0.42, foot - 4, -peak * 0.76, foot + 24, -peak);
      ctx.bezierCurveTo(foot + 16, -peak * 0.52, foot + 42, -peak * 0.30, foot + 41, 1);
    }
    ctx.lineTo(342, 10); ctx.closePath(); ctx.fill();

    const core = ctx.createLinearGradient(0, 8, 0, -145);
    core.addColorStop(0, "#fffcce");
    core.addColorStop(0.44, "#ffc564e8");
    core.addColorStop(1, "#ff723100");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.moveTo(0, 7);
    for (let i = 0; i < 7; i++) {
      const foot = i * 34 + 4;
      const peak = (1 - i / 7) * (116 + 19 * Math.sin(time * 1.18 + i * 1.7));
      ctx.quadraticCurveTo(foot + 2, -peak * 0.70, foot + 20, -peak);
      ctx.quadraticCurveTo(foot + 15, -peak * 0.38, foot + 34, 2);
    }
    ctx.lineTo(249, 9); ctx.closePath(); ctx.fill();

    for (let i = 0; i < 26; i++) {
      const life = (i * 0.179 + time * 0.05) % 1;
      const dx = (i * 47 % 230) + life * 74;
      const dy = -18 - life * (132 + i % 5 * 14);
      const size = (2 + i % 4) * (1 - life * 0.55);
      ctx.fillStyle = i % 3 ? "#ff9f54a8" : "#ffefb8d1";
      ctx.fillRect(Math.round(dx), Math.round(dy), size * 1.6, size);
    }
    ctx.restore();
  }

  function drawBombArea(ctx, x, radius, noise) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, FLOOR, radius, 24, 0, 0, Math.PI * 2);
    ctx.fillStyle = noise ? "#7fcfef33" : "#fa784333"; ctx.fill();
    ctx.setLineDash([7, 5]); ctx.strokeStyle = noise ? "#b9edff" : "#ffac70"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function drawSacrifice(ctx) {
    const { warrior, priest, ranger } = R.sim.heroes;
    if (!warrior.alive || !warrior.effects.has("sacrifice")) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const ally of [priest, ranger]) {
      if (!ally.alive) continue;
      const y = FLOOR - ally.h * 0.54, end = FLOOR - warrior.h * 0.58;
      ctx.beginPath(); ctx.moveTo(ally.x, y); ctx.quadraticCurveTo((ally.x + warrior.x) / 2, Math.min(y, end) - 47, warrior.x, end);
      ctx.lineWidth = 8; ctx.strokeStyle = "#f6be7744"; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#ffca80"; ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -R.time * 54; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawSpellCharge(ctx, hero, skill, progress) {
    const y = FLOOR - hero.h * 0.62;
    const [ , color] = CAST_ART[skill];
    ctx.save();
    ctx.translate(hero.x + hero.h * 0.10, y);
    ctx.globalAlpha = 0.26 + 0.58 * progress;
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(0.12);
      const radius = 15 + (1 - progress) * 22 + i * 8;
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * 0.53, 0, R.time * 4 + i, R.time * 4 + i + 4.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFireTornado(ctx, tornado) {
    const { launch } = tornado;
    const progress = launch ? Math.min(1, launch.elapsed / launch.duration) : 1;
    const airborne = progress < 1;
    const x = airborne ? launch.x + (launch.landingX - launch.x) * progress : tornado.x;
    const y = airborne ? FLOOR + launch.y * (1 - progress ** 1.48) : FLOOR;
    const scale = airborne ? 0.075 + 0.925 * progress ** 1.65 : 1;
    const edge = tornado.direction < 0 ? 0 : CV().w;
    const growth = Math.min(1, Math.abs(x - (launch?.x ?? tornado.origin)) / 95);
    const fade = Math.min(1, Math.abs(edge - x) / 95);
    const height = 244 + 70 * growth, time = R.time * (reducedMotion.matches ? 6 : 15);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(tornado.direction * scale, scale);
    ctx.globalAlpha = fade;

    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 87);
    glow.addColorStop(0, "#fff2b3eb"); glow.addColorStop(0.28, "#ff993f9e"); glow.addColorStop(1, "#fd541900");
    ctx.save(); ctx.scale(1, 0.26);
    ctx.fillStyle = glow; ctx.fillRect(-87, -87, 174, 174);
    ctx.restore();

    const funnel = ctx.createLinearGradient(0, 5, 0, -height);
    funnel.addColorStop(0, "#fff2b7ee"); funnel.addColorStop(0.25, "#ff9445c9");
    funnel.addColorStop(0.62, "#f86a26a8"); funnel.addColorStop(1, "#d8402119");
    ctx.fillStyle = funnel;
    ctx.beginPath(); ctx.moveTo(-22, 0);
    ctx.bezierCurveTo(-13, -height * 0.27, -88, -height * 0.58, -118, -height);
    ctx.bezierCurveTo(-57, -height * 1.05, 35, -height * 1.03, 79, -height * 0.97);
    ctx.bezierCurveTo(35, -height * 0.65, 43, -height * 0.28, 22, 0);
    ctx.closePath(); ctx.fill();

    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const rise = (i / 14 + time * 0.10) % 1;
      const phase = time + i * 2.25, radius = 20 + rise * 84;
      const cx = -28 * rise + Math.sin(phase * 0.7) * (4 + rise * 6);
      const cy = -rise * height;
      ctx.globalAlpha = fade * (0.92 - rise * 0.39);
      ctx.lineWidth = 4 + 6 * (1 - rise);
      ctx.strokeStyle = i % 3 ? "#ff8741" : "#ffcb72";
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, 7 + rise * 14, -0.09, phase, phase + 4.5); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff5bc";
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, 7 + rise * 14, -0.09, phase + 1.1, phase + 2.3); ctx.stroke();
    }

    for (let i = 0; i < 24; i++) {
      const rise = (i * 0.17 + time * 0.075) % 1;
      const orbit = time * 1.35 + i * 2.399;
      const x = Math.cos(orbit) * (29 + 92 * rise) - 35 * rise;
      const y = -rise * (height + 25) + Math.sin(orbit) * 12;
      ctx.globalAlpha = fade * (0.85 - rise * 0.48);
      ctx.fillStyle = i % 3 ? "#ffab5d" : "#fff6be";
      const size = 2 + i % 4;
      ctx.fillRect(Math.round(x), Math.round(y), size, size * 1.6);
    }
    ctx.restore();
  }

  function drawSpellProjectiles(ctx) {
    for (const bomb of R.sim.bombThrows) {
      const t = bomb.t / bomb.flight;
      const x = bomb.origin + (bomb.x - bomb.origin) * t;
      const y = FLOOR + bomb.y * (1 - t) - 356 * t * (1 - t);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * 5.2);
      DWR.Panel.drawIcon(ctx, bomb.id, -17, -17, 34);
      ctx.fillStyle = bomb.id === "noiseBomb" ? "#b9edff" : "#ffcf6b";
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.9 - i * 0.2;
        ctx.fillRect(5 + i * 6, -15 - i * 3 + Math.sin(R.time * 28 + i) * 4, 3, 3);
      }
      ctx.restore();
    }
  }

  function drawSpellImpact(ctx, effect) {
    const t = 1 - effect.t / effect.duration;
    if (effect.spellEffect === "sacrificeRedirect") {
      const x = effect.from.x + (effect.to.x - effect.from.x) * t;
      drawNecroticBurst(ctx, x, FLOOR - effect.to.h * 0.57, t * 0.8, "#f9ce8a");
      return;
    }
    if (effect.spellEffect === "bombImpact" || effect.spellEffect === "noiseBombImpact") {
      const noise = effect.spellEffect === "noiseBombImpact";
      if (!noise) drawFireFrame(ctx, "fireball-impact", t, effect.x, FLOOR - 36, 45, 41);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = noise ? "#b9edff" : "#ffaf69"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(effect.x, FLOOR, Math.max(3, effect.radius * t), 8 + 16 * t, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    const unit = effect.unit, x = unit.x, y = FLOOR - unit.h * 0.52 - DWR.Sim.airLift(unit);
    if (effect.spellEffect === "tornadoHit") {
      drawFireFrame(ctx, "fireball-impact", t, x, y, 45, 41);
      drawNecroticBurst(ctx, x, y, t, "#ff9d63");
      return;
    }
    const dispel = effect.spellEffect === "dispel";
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = Math.min(1, t * 6) * (1 - t);
    ctx.strokeStyle = dispel ? "#a3f5eb" : "#ffe8a1"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 45 - t * 88, 34 + t * 43, 15 + t * 10, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const dx = Math.cos(angle) * (20 + 50 * t), dy = Math.sin(angle) * 28 - 42 * t;
      const size = dispel ? 3 : 5;
      ctx.beginPath(); ctx.moveTo(dx - size, dy); ctx.lineTo(dx + size, dy);
      ctx.moveTo(dx, dy - size); ctx.lineTo(dx, dy + size); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFx(ctx) {
    drawNecroticBeams(ctx);
    drawSpellProjectiles(ctx);
    for (const shot of R.sim.attacks) {
      if (shot.flight > 0 && shot.startX !== null) drawProjectile(ctx, shot);
    }
    for (const wave of R.sim.groundWaves) {
      if (wave.kind === "smash") drawSmashWave(ctx, wave);
      else if (wave.kind === "claw") drawClawWave(ctx, wave);
    }
    for (const { x, y, t } of R.explosions)
      drawFireFrame(ctx, "fireball-impact", t / EXPLOSION_SECONDS, x, y, 45, 41);
    for (const hit of R.meleeImpacts) drawMeleeImpact(ctx, hit);
    for (const a of R.auras) {
      // лечение — мягкое свечение вокруг героя (не глухая плашка поверх спрайта)
      if (a.spellEffect) {
        drawSpellImpact(ctx, a);
      } else if (a.howl) {
        drawHowlWave(ctx, a.x, a.y, 1 - a.t / 0.82);
      } else if (a.groundSmash) {
        drawGroundSmash(ctx, a.x, 1 - a.t / GROUND_IMPACT);
      } else if (a.ice === "freeze") {
        drawIceParticles(ctx, a, 1 - a.t / ICE_IMPACT, false);
      } else if (a.ice === "thaw") {
        const remaining = a.t / ICE_THAW;
        drawIceBlock(ctx, a.x, a.h, remaining ** 1.6, remaining);
        drawIceParticles(ctx, a, 1 - remaining, true);
      } else if (a.necrotic) {
        drawNecroticBurst(ctx, a.x, a.y, 1 - a.t / 0.35, "#8ff3d2");
      } else if (a.status) {
        const color = DWR.CONFIG.effects[a.status]?.color ?? "#d8a2fc";
        drawNecroticBurst(ctx, a.unit.x, FLOOR - a.unit.h * 0.55, 1 - a.t / 0.55, color);
      } else if (a.unit) {
        const k = Math.min(1, a.t * 2.5);
        const r = (a.unit.h || 210) * 0.55;
        const g = ctx.createRadialGradient(a.unit.x, FLOOR - (a.unit.h || 210) * 0.45, r * 0.2,
                                           a.unit.x, FLOOR - (a.unit.h || 210) * 0.45, r);
        g.addColorStop(0, a.potion ? "rgba(142,208,160," + 0.45 * k + ")" : "rgba(232,240,208," + 0.40 * k + ")");
        g.addColorStop(1, "rgba(142,208,160,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(a.unit.x, FLOOR - (a.unit.h || 210) * 0.45, r, 0, 7); ctx.fill();
      }
    }
    ctx.font = "bold 20px Segoe UI"; ctx.textAlign = "center";
    for (const f of R.floaters) {
      ctx.globalAlpha = Math.min(1, f.t * 1.6);
      ctx.strokeStyle = "#121119"; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function text(ctx, label, x, y, font, color, align = "left") {
    ctx.font = font + " Segoe UI";
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(label, x, y);
  }

  function box(ctx, x, y, w, h, fill, border, radius = 8) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawButton(ctx, r, label, primary = false) {
    const hover = DWR.Input && inRect(DWR.Input.x, DWR.Input.y, r);
    box(ctx, r.x, r.y, r.w, r.h, primary ? (hover ? "#ffe3ba" : "#ffd092") : (hover ? "#30313e" : "#22232f"),
        primary || hover ? "#ffd092" : "#454451");
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 5, "600 15px", primary ? "#201713" : "#f5eee5", "center");
  }

  function drawNextArrow(ctx) {
    const x = NEXT.x + NEXT.w / 2, y = NEXT.y + NEXT.h / 2;
    const hover = nextTargetAt(DWR.Input.x, DWR.Input.y);
    const pulse = reducedMotion.matches ? 0 : (1 - Math.cos(R.time * 2 * Math.PI / 1.6)) / 2;
    const scale = 1 + pulse * 0.12 + (hover ? 0.05 : 0);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(-25, -8);
    ctx.lineTo(-1, -8);
    ctx.lineTo(-1, -20);
    ctx.lineTo(26, 0);
    ctx.lineTo(-1, 20);
    ctx.lineTo(-1, 8);
    ctx.lineTo(-25, 8);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.shadowColor = "#edaf6090";
    ctx.shadowBlur = 7 + pulse * 9;
    ctx.fillStyle = hover ? "#6b492d" : "#332523";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#19151d";
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = hover ? "#ffe4ab" : "#eec179";
    ctx.stroke();
    ctx.restore();

    if (R.roomIdx === R.seq.length - 1) {
      const { x: left, y: top, w, h } = NEXT_RESULT;
      box(ctx, left, top, w, h, "#19151dea", "#a27d4d", 5);
      text(ctx, "К итогам", x, top + 15, "600 12px", "#ffe4ab", "center");
    }
  }

  function drawHeader(ctx) {
    text(ctx, "DON’T WIPE THE RAID", 34, 37, "600 12px", "#ffd092");
    ctx.fillStyle = "#f5eee5"; ctx.font = "34px Georgia"; ctx.textAlign = "left";
    ctx.fillText(DWR.CONFIG.locations[R.location].name, 34, 76);
    const x0 = 1098 - (R.seq.length - 1) * 30;
    for (const [i, roomId] of R.seq.entries()) {
      const x = x0 + i * 30, y = BURGER.y + BURGER.h / 2;
      const active = i === R.roomIdx, passed = i < R.roomIdx;
      const step = DWR.CONFIG.rooms[roomId];
      if (i > 0) {
        ctx.fillStyle = passed || active ? "#a17c57" : "#353542";
        ctx.fillRect(x - 20, y - 0.5, 10, 1);
      }
      const icon = step.boss ? DWR.Assets.img["map-boss"] : step.chest ? DWR.Assets.img["map-chest"] : null;
      const fill = icon ? (step.boss ? "#37202a" : "#332922") : active ? "#ffd092" : "#20212a";
      box(ctx, x - 10, y - 10, 20, 20, fill, active ? "#ffd092" : passed ? "#a17c57" : "#454451", 5);
      if (icon?.naturalWidth) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = passed ? 0.75 : 1;
        ctx.drawImage(icon, x - 7, y - 7, 14, 14);
        ctx.restore();
      } else {
        text(ctx, passed ? "✓" : String(i + 1), x, y + 4, "600 11px",
          active ? "#201713" : passed ? "#ffd092" : "#b0aaba", "center");
      }
    }
  }

  function drawParty(ctx) {
    text(ctx, "Отряд", 34, 130, "600 18px", "#f5eee5");
    const alive = R.sim.heroOrder.filter(id => R.sim.heroes[id].alive).length;
    text(ctx, alive + " / " + R.sim.heroOrder.length, 262, 130, "13px", "#b0aaba", "right");
    for (const [i, id] of R.sim.heroOrder.entries()) {
      const h = R.sim.heroes[id];
      const r = partyCard(i), cy = r.y + 10;
      const [resource, key, color] = PARTY[id];
      const hp = h.hp / h.maxHp;
      const border = R.hoverTarget === h ? "#ffd092" : (R.flash.get(h) || 0) > 0 ? "#bf7473" : "#353542";
      box(ctx, r.x, r.y, r.w, r.h, "#191a23", border);
      box(ctx, 44, cy, 49, 56, "#262632", "#353542", 6);
      const img = DWR.Assets.img[id];
      if (img.naturalWidth) {
        ctx.save();
        roundRect(ctx, 44, cy, 49, 56, 6); ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = h.alive ? 1 : 0.35;
        ctx.drawImage(img, 76 - 19, 38, 38, 43, 44, cy, 49, 56);
        ctx.restore();
      }
      text(ctx, DWR.CONFIG.heroes[id].name, 104, cy + 13, "600 15px", "#f5eee5");
      if (!h.alive) {
        text(ctx, "Вне боя", 104, cy + 42, "13px", "#ff938a");
        continue;
      }
      text(ctx, Math.ceil(h.hp) + "/" + h.maxHp, 251, cy + 13, "12px", "#e1d7dd", "right");
      bar(ctx, 149, cy + 22, 90, 7, hp, hp > 0.35 ? "#86c89e" : "#ff867d");
      text(ctx, "Крит " + Math.round(h.critChance * 100) + "%", 251, cy + 30, "11px", "#ffd092", "right");
      const max = key === "mana" ? h.manaMax : DWR.CONFIG.resources[key].max;
      if (max > 0) {
        const value = key === "rage" ? resource : resource + " " + Math.floor(h[key]) + "/" + max;
        text(ctx, value, 104, cy + 47, "12px", "#b0aaba");
        bar(ctx, 217, cy + 40, 66, 6, h[key] / max, color);
      }
      if (id === "priest") {
        const labels = { heal: "леч.", dispel: "снятие", fireball: "шар", fireTornado: "смерч" };
        const auto = Object.keys(labels).filter(skill => R.sim.autoSkills.has(skill)).map(skill => labels[skill]).join(" · ");
        text(ctx, "Авто", 104, cy + 67, "12px", "#b0aaba");
        ctx.font = "600 12px Segoe UI"; ctx.fillStyle = "#a9dfc2"; ctx.textAlign = "right";
        ctx.fillText(auto || "выкл.", 251, cy + 67, 113);
      }
    }
    box(ctx, 34, 443, 230, 108, "#191a23", "#353542");
    text(ctx, "Добыча за рейд", 49, 465, "600 15px", "#f5eee5");
    text(ctx, R.runCoins + " монет", 49, 491, "600 16px", "#ffd092");
    text(ctx, "Руны " + R.runRunes, 249, 491, "600 15px", "#ddd3ff", "right");
    text(ctx, "Наведите курсор на добычу,", 49, 515, "13px", "#b0aaba");
    text(ctx, "чтобы её подобрать", 49, 533, "13px", "#b0aaba");
  }

  function drawMenu(ctx) {
    if (!R.menu) return;
    ctx.fillStyle = "#090910bb"; ctx.fillRect(0, 0, CV().w, CV().h);
    box(ctx, 410, 208, 460, 288, "#191a23", "#45404c", 14);
    ctx.fillStyle = "#f5eee5"; ctx.font = "35px Georgia"; ctx.textAlign = "center";
    ctx.fillText(R.menu.confirm ? "Отступить?" : "Пауза", 640, 276);
    text(ctx, "Подобранная добыча сохранится", 640, 304, "15px", "#b0aaba", "center");
    if (R.menu.confirm) {
      drawButton(ctx, PAUSE.yes, "Отступить", true);
      drawButton(ctx, PAUSE.no, "Отмена");
    } else {
      drawButton(ctx, PAUSE.retreat, "Отступить");
      drawButton(ctx, PAUSE.close, "Продолжить бой", true);
    }
  }

  function drawAimHint(ctx) {
    let label = R.notice?.until > R.time ? R.notice.text : "";
    if (R.aim) {
      const skill = DWR.CONFIG.skills[R.aim.id];
      const target = R.aim.kind === "targeted" ? "врага"
        : R.aim.kind === "ground" ? "точку на поле боя"
        : skill?.targetEnemies ? "героя, его карточку или врага" : "героя или его карточку";
      label = (R.aim.press ? "Перетащите на " : "ЛКМ — выбрать ") + target;
    }
    if (!label) return;
    const center = BOARD.x + BOARD.w / 2;
    const top = BOARD.y + 14;
    box(ctx, center - 175, top, 350, 32, "#1a1923", "#8a7060");
    text(ctx, label, center, top + 21, "600 14px", "#ffd092", "center");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // --- Кадр (вызывает main.js) ---
  function frame(dt, elapsed = dt) {
    if (!R) return;
    if (R.phase !== "wipeDelay" && !R.sim.over && !R.menu && !document.hidden) DWR.State.advanceRaidTime(elapsed);
    if (!DWR.Run._frameCtx)
      DWR.Run._frameCtx = document.getElementById("game-canvas").getContext("2d");
    const ctx = DWR.Run._frameCtx;
    update(dt);
    if (R) draw(ctx);
  }

  return {
    start, frame,
    get state() { return R; },
    onMouseMove, onDown, onUp, onClick, onContextMenu, cancelAim, dropTargetAt,
    _frameCtx: null
  };
})();
