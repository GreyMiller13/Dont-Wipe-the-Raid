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
    summon: ["Призыв скелетов", "#d1b0fb", "M7 20v-4l-3-2V8l3-4h10l3 4v6l-3 2v4zM8 10h2m4 0h2m-6 6v4m4-4v4"]
  };
  for (const art of Object.values(CAST_ART)) if (art[2]) art[2] = new Path2D(art[2]);
  const MELEE_ART = {
    sword: { tint: "#ffbb72", core: "#fff1ce", duration: 0.24, scale: 1 },
    power: { tint: "#ffa052", core: "#fff1bc", duration: 0.32, scale: 1.35 },
    enemy: { tint: "#f27769", core: "#ffe1cb", duration: 0.24, scale: 1 },
    bite: { tint: "#e8b17a", core: "#ffe9c5", duration: 0.23, scale: 0.83 },
    claw: { tint: "#ce84cf", core: "#ffdef3", duration: 0.32, scale: 1.10 },
    smash: { tint: "#ff8d59", core: "#fff2ba", duration: 0.42, scale: 1.45 },
    guard: { tint: "#80baff", core: "#e3f4ff", duration: 0.26, scale: 1 }
  };
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
      items: [], floaters: [], auras: [], explosions: [], beams: [], meleeImpacts: [], deaths: new Map(), bossLoot: new Set(),
      runCoins: 0, runRunes: 0, coinBonusCarry: 0, tempPanel,
      chestOpened: false, chestRect: { x: 532, y: FLOOR - 132, w: 170, h: 132 },
      menu: null,                           // null | {confirm:false} — открытое бургер-меню (пауза)
      drag: null,                           // {kind:'skill'|'potion'|'floorPotion', id?, item?}
      hoverTarget: null, potionHover: null, time: 0, flash: new Map()
    };
    loadRoom(0);
  }

  function curRoom() { return DWR.CONFIG.rooms[R.seq[R.roomIdx]]; }
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

  function canAdvance() {
    return R.phase === "room" && !DWR.Sim.inBattle(R.sim) && !R.sim.over && !R.sim.groundWaves.length &&
      !hasFrozenHero() && !hasFallingBoss() &&
      !R.sim.attacks.some(attack => attack.target.id && attack.target.alive && !attack.resolved) &&
      (!curRoom().chest || R.chestOpened);
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
    R.bossLoot.clear();
    R.flash.clear();
    R.floaters = []; R.auras = []; R.beams = []; R.meleeImpacts = [];
    R.potionHover = null;
    R.chestOpened = false;
    DWR.Sim.spawnRoom(R.sim, R.seq[i]);
  }

  // --- Завершение забега ---
  function finalize(reason) {
    const st = DWR.State.data;
    if (reason === "win" && !R.treasureOnly) R.runCoins += R.sim.stats.raidVictoryCoins;
    st.coins += R.runCoins;
    DWR.State.save();
    const currentCleared = curRoom().chest ? R.chestOpened : !DWR.Sim.inBattle(R.sim);
    DWR.showResults({
      reason, coins: R.runCoins, runes: R.runRunes,
      roomsCleared: R.roomIdx + Number(currentCleared), roomsTotal: R.seq.length,
      roomId: curRoom().id, location: R.location, treasureOnly: R.treasureOnly,
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
      if (R.phaseT >= DWR.CONFIG.fadeSec) R.phase = "room";
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
        if (R.roomIdx + 1 >= R.seq.length) { finalize("win"); return; }
        loadRoom(R.roomIdx + 1);
      }
      return;
    }
    // phase === room: бой (если враги)
    const sim = R.sim;
    if (sim.over === "wipe") {
      R.phase = "wipeDelay"; R.phaseT = 0;
      cancelDrag(DWR.Input.x, DWR.Input.y);
      return;
    }
    const wasInBattle = DWR.Sim.inBattle(sim);
    DWR.Sim.tick(sim, dt);
    if (wasInBattle && !sim.over && !curRoom().boss && !DWR.Sim.inBattle(sim) && sim.stats.roomCoins > 0) {
      R.runCoins += sim.stats.roomCoins;
      floater(CV().w / 2, FLOOR - 170, "Зачистка +" + sim.stats.roomCoins, "#ffd092");
    }
    collectHoveredLoot();

    // события симуляции → дроп и визуал
    for (const ev of sim.events) {
      if (ev.type === "kill") {
        R.deaths.set(ev.unit, R.time);
        if (ev.boss && ev.unit.def.death) R.bossLoot.add(ev.unit);
        else dropLoot(ev.unit);
        if (ev.boss) DWR.State.completeLocation(R.location);
      }
      if (ev.type === "heroDead") {
        R.deaths.set(ev.hero, R.time);
        floater(ev.hero.x, FLOOR - 230, "Герой пал", "#d06a5a");
      }
    }
    sim.events.length = 0;
    for (const boss of R.bossLoot) {
      if (deathProgress(boss) < boss.def.death.land) continue;
      R.bossLoot.delete(boss);
      dropLoot(boss);
    }

    // Визуальные эффекты удара возникают только после расчёта попадания.
    for (const f of sim.fx) {
      if (f.type === "fireImpact") R.explosions.push({ x: f.x, y: FLOOR + f.y, t: 0 });
      else if (f.type === "meleeImpact") R.meleeImpacts.push({ ...f, t: 0, art: MELEE_ART[f.blocked ? "guard" : f.kind] });
      else if (f.type === "necroticImpact") R.auras.push({ x: f.x, y: FLOOR + f.y, t: 0.35, necrotic: true });
      else if (f.type === "status") R.auras.push({ unit: f.unit, t: 0.55, status: f.id });
      else if (f.type === "necroticBeam") R.beams.push({ ...f, t: 0 });
      else if (f.type === "howl") R.auras.push({ x: f.x, y: FLOOR + f.y, t: 0.82, howl: true });
      else if (f.type === "groundSmash") R.auras.push({ x: f.x, t: GROUND_IMPACT, groundSmash: true });
      else if (f.type === "freeze" || f.type === "thaw") {
        const { x, h } = f.unit;
        R.auras.push({ x, h, t: f.type === "freeze" ? ICE_IMPACT : ICE_THAW, ice: f.type });
      }
      else if (f.type === "summon") floater(f.minions[1].x, FLOOR - 220, "Призыв скелетов", "#c8a4ff");
      else if (f.type === "hurt") {
        R.flash.set(f.unit, 0.18);
        const frost = f.kind === "frost";
        const amount = frost ? f.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : f.amount;
        floater(f.unit.x, FLOOR - f.unit.h - 8, (f.critical ? "Крит " : "") + "−" + amount,
          frost ? DWR.CONFIG.effects.frozen.color : f.critical ? "#ffd092" : "#e88");
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
    if (R.drag?.origin && Math.hypot(x - R.drag.origin.x, y - R.drag.origin.y) > 5) R.drag.moved = true;
    updateCursor(x, y);
    if (R.phase === "room" && !R.menu) collectHoveredLoot();
  }

  const nearLoot = (p, it) => Math.hypot(it.x - p.x, it.y - p.y) <= LOOT_ART[it.type].reach + R.sim.stats.lootReach;

  function collectHoveredLoot() {
    const p = !R.drag && worldPoint(DWR.Input.x, DWR.Input.y);
    const item = p && R.items.find(it => it.grounded && nearLoot(p, it));
    if (!item || item.type === "coin") {
      R.potionHover = null;
      if (item) pickUp(item);
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
    if (R.drag) {
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
    floater(it.x, it.y - 20, it.type === "coin" ? "+" + it.value : "Зелье", LOOT_ART[it.type].color);
  }

  // Цель под курсором: враг для прицельного скилла, герой для зелья
  function dropTargetAt(x, y) {
    if (!R) return null;
    const p = worldPoint(x, y);
    if (R.drag && ["heal", "potion", "floorPotion"].includes(R.drag.kind)) {
      for (const [i, id] of R.sim.heroOrder.entries()) {
        const h = R.sim.heroes[id];
        if (h.alive && (inRect(x, y, partyCard(i)) || (p && isUnitTarget(p, h)))) return h;
      }
      return null;
    }
    return p ? R.sim.enemies.find(e => e.alive && isUnitTarget(p, e)) || null : null;
  }

  function isUnitTarget(p, unit) {
    return Math.abs(p.x - unit.x) < 55 && p.y > FLOOR - unit.h - 10 && p.y < FLOOR + 10;
  }

  function onClick(x, y) {
    if (!R || R.phase !== "room") return;
    if (R.menu) { menuClick(x, y); return; }
    if (inRect(x, y, BURGER)) { R.menu = { confirm: false }; return; }
    if (canAdvance() && nextTargetAt(x, y)) { goNextRoom(); return; }
    const p = worldPoint(x, y);
    if (p && curRoom().chest && !R.chestOpened && inRect(p.x, p.y, R.chestRect)) { openChest(); return; }
    // тап по слоту: мгновенные и переключатели
    const i = DWR.Panel.slotAt(R, x, y);
    if (i >= 0) {
      const id = R.tempPanel[i];
      if (!id) return;
      const s = id !== "potion" ? DWR.CONFIG.skills[id] : null;
      if (s?.auto) {
        const enabled = !R.sim.autoSkills.has(id);
        DWR.Sim.setAuto(R.sim, id, enabled);
        DWR.State.setAuto(id, enabled);
      }
      else if (s && s.type === "instant") {
        if (!DWR.Sim.useInstant(R.sim, id)) skillNotice(id);
      }
      // прицельные и зелья — через drag (onDown), тап без drag игнорируем
    }
  }

  function onDown(x, y) {
    if (!R || R.phase !== "room" || R.menu) return;
    const i = DWR.Panel.slotAt(R, x, y);
    if (i >= 0) {
      const id = R.tempPanel[i];
      if (!id) return;
      const s = id !== "potion" ? DWR.CONFIG.skills[id] : null;
      const canAim = s && (s.manualWhileAuto !== false || !R.sim.autoSkills.has(id));
      if (canAim && (s.type === "targeted" || s.type === "ally")) {
        R.drag = { kind: s.type === "ally" ? "heal" : "skill", id, slot: i, origin: s.auto ? { x, y } : null };
      }
      else if (id === "potion" && R.sim.potionsLeft > 0) R.drag = { kind: "potion" };
    } else {
      const p = worldPoint(x, y);
      const item = p && R.items.find(it => it.type === "potion" && it.grounded && nearLoot(p, it));
      if (item) R.drag = { kind: "floorPotion", item };
    }
    if (R.drag) {
      R.potionHover = null;
      updateCursor(x, y);
    }
  }

  function cancelDrag(x, y) {
    if (!R?.drag) return false;
    R.drag = null;
    R.hoverTarget = null;
    updateCursor(x, y);
    return true;
  }

  function onUp(x, y) {
    if (!R?.drag) return false;
    const tgt = R.phase === "room" && !R.menu ? dropTargetAt(x, y) : null;
    const drag = R.drag;
    cancelDrag(x, y);
    if (drag.origin && !drag.moved && DWR.Panel.slotAt(R, x, y) === drag.slot) return false;
    if (!tgt) return true; // промах — без траты
    if (drag.kind === "skill") {
      if (!DWR.Sim.useTargeted(R.sim, drag.id, tgt.uid)) skillNotice(drag.id);
    } else if (drag.kind === "heal") {
      const result = DWR.Sim.useHeal(R.sim, tgt.id);
      if (result === "full") toast("Здоровье уже полное");
      else if (!result) skillNotice("heal");
    } else {
      const fromFloor = drag.kind === "floorPotion";
      const index = fromFloor ? R.items.indexOf(drag.item) : -1;
      if (fromFloor && index < 0) return true;
      const result = DWR.Sim.usePotion(R.sim, tgt.id, { fromFloor });
      if (result === "full") toast("Здоровье уже полное");
      else if (result && fromFloor) R.items.splice(index, 1);
    }
    return true;
  }

  function goNextRoom() {
    R.sim.attacks.length = 0;
    // перед уходом: неподнятое остаётся лежать (пропадёт с комнатой)
    R.phase = "fadeout"; R.phaseT = 0;
    updateCursor(DWR.Input.x, DWR.Input.y);
  }
  function openChest() {
    if (R.chestOpened || !DWR.State.openTreasure(R.location)) return;
    R.chestOpened = true;
    R.runRunes++;
    const L = DWR.CONFIG.loot;
    const x = R.chestRect.x + R.chestRect.w / 2;
    R.runeDrop = { x, y: R.chestRect.y + 29, since: R.time };
    floater(x, R.chestRect.y - 4, "+1 руна навыка", "#ddd3ff");
    const coins = (locationLoot()?.chest ?? L.coinPerChest) + R.sim.stats.chestCoins;
    for (let left = coins; left > 0; left -= 6) spawnItem("coin", x, Math.min(6, left));
  }
  function skillNotice(id) {
    const status = DWR.Sim.skillStatus(R.sim, id);
    toast(status.frozen ? "Герой заморожен" : status.left > 0 ? "Навык перезаряжается" : "Навык недоступен");
  }
  function menuClick(x, y) {
    if (R.menu.confirm) {
      if (inRect(x, y, PAUSE.yes)) finalize("retreat");
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
    R.hoverTarget = R.drag ? dropTargetAt(DWR.Input.x, DWR.Input.y) : null;
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
    drawUnits(ctx);
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
      const status = R.phase === "fadeout" ? "Переход между комнатами" : curRoom().chest ? "Откройте сундук"
        : !DWR.Sim.inBattle(R.sim) && hasFrozenHero() ? "Герой оттаивает"
        : !DWR.Sim.inBattle(R.sim) && hasFallingBoss() ? "Босс повержен" : "Бой в комнате";
      text(ctx, status, 1221, 593, "14px", "#b0aaba", "right");
    }
    drawDragHint(ctx);
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
    const img = DWR.Assets.img[R.chestOpened ? "chest-open" : "chest-closed"];
    if (img?.naturalWidth) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    if (!R.chestOpened) {
      ctx.font = "15px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd092";
      ctx.fillText("Открыть сундук", x, r.y + 11);
    }
  }

  function unitPose(u) {
    if (!u.alive) return { pose: "dead", poseT: deathProgress(u) };
    if (u.effects.has("frozen")) return { pose: "frozen", poseT: 0 };
    if (u.attackPose) return { pose: u.attackPose.name, poseT: u.attackPose.t / u.attackPose.duration };
    if (u.walking) return { pose: "walk", poseT: DWR.Chars.walkProgress(u) };
    return { pose: "idle", poseT: 0 };
  }

  // Тень-эллипс под ногами — привязывает фигуру к полу
  function shadow(ctx, x, w) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, FLOOR + 6, w, 10, 0, 0, 7); ctx.fill();
  }

  function drawUnits(ctx) {
    const sim = R.sim;
    // враги
    for (const e of sim.enemies) {
      const p = unitPose(e);
      if (e.alive) shadow(ctx, e.x, e.h * 0.22);
      const drawUnit = R.hoverTarget === e ? DWR.Chars.drawOutlined : DWR.Chars.draw;
      const attack = e.ritual ? { ritual: true, t: e.ritual.t, windup: e.ritual.duration } : e.attack;
      ctx.save();
      if (e.appearT > 0) ctx.globalAlpha = 1 - e.appearT / 0.4;
      drawUnit(ctx, { kind: e.kind, x: e.x, y: FLOOR, h: e.h, facing: e.facing, attack, ...p,
        fallForward: e.x + e.h > CV().w, flash: (R.flash.get(e) || 0) / 0.18 }, R.time);
      ctx.restore();
      if (e.alive) {
        bar(ctx, e.x, FLOOR - e.h - 12, 74, 8, e.hp / e.maxHp, "#b8563e");
        const showName = e.boss && e.def.spritePoses;
        if (showName) text(ctx, e.def.name, e.x, FLOOR - e.h - 22, "600 18px", "#f6ddcf", "center");
        drawStatusBadges(ctx, e, showName ? 23 : 0);
      } else if (e.def.death && p.poseT < 1) drawBossDeathFx(ctx, e, p.poseT);
    }
    // герои
    for (const id of sim.heroOrder) {
      const h = sim.heroes[id];
      if (!h.alive && !R.deaths.has(h)) continue;
      const p = unitPose(h);
      if (h.alive) shadow(ctx, h.x, 52);
      const castReleased = id === "priest" && sim.attacks.some(shot => shot.kind === "fire" && shot.startX !== null);
      const drawUnit = R.hoverTarget === h ? DWR.Chars.drawOutlined : DWR.Chars.draw;
      drawUnit(ctx, { kind: id, x: h.x, y: FLOOR, h: h.h, facing: 1, ...p,
        castReleased, flash: (R.flash.get(h) || 0) / 0.18 }, R.time);
      if (h.alive) {
        if (h.blockT > 0) drawBlockBubble(ctx, h);
        const ice = h.effects.get("frozen");
        if (ice) drawIceBlock(ctx, h.x, h.h, Math.min(1, (ice.duration - ice.left) / ICE_GROW));
        drawStatusBadges(ctx, h);
      }
    }
  }

  function drawCastBars(ctx) {
    const rows = [], w = 142, h = 21, iconSize = 25, total = w + iconSize + 5;
    for (const e of R.sim.enemies) {
      const attack = e.attack;
      const finished = attack?.hit && attack.t > attack.windup + DWR.CONFIG.battle.castReleaseFlash;
      if (!e.alive || (!e.ritual && (!attack || finished))) continue;
      const key = e.ritual ? "summon" : attack.freezing ? "frost" : attack.howling ? "howl"
        : attack.heavy ? "smash" : attack.buffing ? "buff" : null;
      if (!key) continue;
      const progress = Math.min(1, e.ritual ? e.ritual.t / e.ritual.duration : attack.t / attack.windup);
      const x = Math.max(8, Math.min(e.x - total / 2, CV().w - total - 8));
      const aboveName = e.boss && e.def.spritePoses ? 23 : 0;
      let y = Math.max(6, FLOOR - e.h - (e.effects.size ? 77 : 47) - aboveName);
      while (y > 6 && rows.some(row => Math.abs(row.y - y) < iconSize + 4 && Math.abs(row.x - x) < total + 4)) {
        y = Math.max(6, y - iconSize - 4);
      }
      rows.push({ x, y });
      drawCastBar(ctx, x, y, iconSize, w, h, CAST_ART[key], progress);
    }
  }

  function drawCastBar(ctx, x, y, iconSize, w, h, [name, color, icon], progress) {
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
    ctx.fillText(name, left + 7, top + 15, w - 13);
    ctx.restore();
  }

  function drawBossDeathFx(ctx, boss, progress) {
    const { x, h, kind, facing, def } = boss;
    const { land, tint } = def.death;
    const spectral = kind === "lich";
    if (spectral && progress < land) drawLichDeathGlow(ctx, boss, progress / land, tint);
    const age = (progress - land) / (1 - land);
    if (age < 0) return;
    const fallsForward = kind === "lycan" || (spectral && x + h > CV().w);
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
      ctx.fillRect(Math.round(px), Math.round(py), size, spectral ? size * 1.6 : size);
    }
    ctx.restore();
  }

  function drawLichDeathGlow(ctx, boss, age, tint) {
    const x = boss.x + boss.facing * boss.h * 0.25;
    const y = FLOOR - boss.h * 0.78;
    ctx.save();
    const brightness = Math.min(1, age * 7) * (1 - age);
    ctx.globalAlpha = brightness;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 72);
    glow.addColorStop(0, "#e4d7ff"); glow.addColorStop(0.46, "#ab8fed8f"); glow.addColorStop(1, "#7654c700");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 72, y - 72, 144, 144);
    for (let i = 0; i < 17; i++) {
      const spread = Math.sin(i * 2.4) * (13 + age * 78);
      ctx.fillStyle = i % 2 ? tint : "#ecdcff";
      ctx.fillRect(Math.round(x + spread), Math.round(y + (i % 5) * 14 - age * (35 + (i % 4) * 38)),
        3 + i % 3, 6 + i % 4);
    }
    ctx.restore();
  }

  function drawStatusBadges(ctx, unit, offset = 0) {
    const statuses = DWR.Sim.activeStatuses(unit);
    const size = 27, advance = size + 5;
    const y = FLOOR - unit.h - 46 - offset;
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
    }
    ctx.restore();
  }

  function drawThreats(ctx) {
    for (const e of R.sim.enemies) {
      if (!e.alive) continue;
      if (e.appearT > 0) drawSummonCircle(ctx, e);
      if ((e.ritual && !e.ritual.hit) || ((e.attack?.beam || e.attack?.freezing) && !e.attack.hit)) drawLichCharge(ctx, e);
      if (e.attack?.howling && !e.attack.hit) {
        const phase = Math.min(1, e.attack.t / e.attack.windup);
        drawHowlWave(ctx, e.x, FLOOR - e.h * 0.84, phase, true);
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

  function drawLichCharge(ctx, enemy) {
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

  function drawLoot(ctx) {
    const coinImg = DWR.Assets.img.coin;
    const p = !R.drag && worldPoint(DWR.Input.x, DWR.Input.y);
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
    const { caster, kind } = attack;
    let grip;
    if (kind === "fire") grip = DWR.Chars.fireRelease(caster);
    else if (kind === "enemyArrow") grip = DWR.Chars.enemyBowRelease(caster);
    else if (kind === "necroticOrb" || kind === "frost") {
      grip = DWR.Chars.staffPoint(caster, { t: 1, windup: 1, freezing: kind === "frost" });
    }
    else if (kind !== "slash") {
      const pose = kind === "multi" ? "multishot" : kind === "precise" ? "preciseShot" : undefined;
      grip = DWR.Chars.bowRelease(caster, pose);
    }
    return {
      x: attack.startX + (grip ? grip.x - caster.x : 30 * caster.facing),
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
    if (kind === "fire") {
      if (!drawFireFrame(ctx, "fireball-flight", k, x, y, 70, 18, angle)) {
        ctx.fillStyle = "#ff9b49";
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      }
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

  function drawFx(ctx) {
    drawNecroticBeams(ctx);
    for (const shot of R.sim.attacks) {
      if (shot.flight > 0 && shot.startX !== null) drawProjectile(ctx, shot);
    }
    for (const wave of R.sim.groundWaves) {
      if (wave.kind === "smash") drawSmashWave(ctx, wave);
      else drawClawWave(ctx, wave);
    }
    for (const { x, y, t } of R.explosions)
      drawFireFrame(ctx, "fireball-impact", t / EXPLOSION_SECONDS, x, y, 45, 41);
    for (const hit of R.meleeImpacts) drawMeleeImpact(ctx, hit);
    for (const a of R.auras) {
      // лечение — мягкое свечение вокруг героя (не глухая плашка поверх спрайта)
      if (a.howl) {
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
      const border = (R.flash.get(h) || 0) > 0 ? "#bf7473" : "#353542";
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
        const auto = ["heal", "fireball"].filter(skill => R.sim.autoSkills.has(skill))
          .map(skill => DWR.CONFIG.skills[skill].name.toLowerCase()).join(" и ");
        text(ctx, "Авто", 104, cy + 67, "12px", "#b0aaba");
        text(ctx, auto || "выкл.", 251, cy + 67, "600 12px", "#a9dfc2", "right");
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

  function drawDragHint(ctx) {
    let label = R.notice?.until > R.time ? R.notice.text : "";
    if (R.drag) label = R.drag.kind === "skill" ? "Отпустите над врагом" : "Отпустите над героем или его карточкой";
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
  function frame(dt) {
    if (!R) return;
    if (!DWR.Run._frameCtx)
      DWR.Run._frameCtx = document.getElementById("game-canvas").getContext("2d");
    const ctx = DWR.Run._frameCtx;
    update(dt);
    if (R) draw(ctx);
  }

  return {
    start, frame,
    get state() { return R; },
    onMouseMove, onDown, onUp, onClick, cancelDrag, dropTargetAt,
    _frameCtx: null
  };
})();
