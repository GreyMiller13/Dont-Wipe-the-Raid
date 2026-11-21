// DWR :: config.js — ВЕСЬ баланс и данные прототипа (docs/specs/mvp-slice.md).
// Числа стартовые: правятся здесь, без изменения логики.
"use strict";
window.DWR = window.DWR || {};

// rank — номер покупаемого ранга, начиная с первого.
DWR.nodeHeroSkill = node => {
  const id = node.effect?.unlockSkill;
  return DWR.CONFIG.skills[id]?.owner ? id : null;
};
DWR.skillRankCurrency = (node, rank) => {
  const skill = DWR.CONFIG.skills[DWR.nodeHeroSkill(node)];
  return skill && !skill.innate && rank === (node.effect.unlockAt ?? node.max) ? "runes" : "coins";
};
DWR.skillRankPrice = (node, rank) => {
  if (DWR.skillRankCurrency(node, rank) === "runes") return 1;
  if (rank === 1 && DWR.CONFIG.skills[DWR.nodeHeroSkill(node)]?.innate) return 0;
  return node.prices?.[rank - 1] ?? Math.round(node.base * node.mul ** (rank - 1) * (1 + Math.max(0, rank - 2) * 0.10));
};
const forgeEnemy = stats => ({ ...stats, hp: stats.hp * 1.2, dmg: stats.dmg * 1.2 });

DWR.CONFIG = {
  canvas: { w: 1280, h: 720 },

  // --- Локации и комнаты ---
  fadeSec: 0.7,
  locations: {
    dungeon: { name: "Мрачное подземелье", rooms: [0, 1, 2, 3, 4, 5], treasure: 6, progress: "location1Done" },
    crypt: { name: "Крипта кладбища", rooms: [7, 8, 9, 11, 12, 13, 10], treasure: 14, progress: "cryptDone", unlockAfter: "dungeon" },
    wilds: { name: "Дремучий лес", rooms: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24], treasure: 25,
      progress: "wildsDone", unlockAfter: "crypt", loadOnSelect: true, loot: { normal: 7, boss: 70, chest: 90 } },
    forge: { name: "Кузня Чёрного Горна", rooms: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37], treasure: 38,
      progress: "forgeDone", unlockAfter: "wilds", loadOnSelect: true, loot: { normal: 8, boss: 95, chest: 110 } },
    demoPreview: { name: "Привал", rooms: [], unlockAfter: "forge", previewArt: "assets/backgrounds/demo-camp.webp" }
  },
  rooms: [
    { id: 1, enemies: ["goblinW", "goblinW"] },
    { id: 2, enemies: ["goblinW", "goblinA"] },
    { id: 3, enemies: ["goblinW", "goblinW", "goblinA"] },
    { id: 4, enemies: ["goblinA", "goblinW", "goblinA"] },
    { id: 5, enemies: ["goblinW", "goblinA", "goblinA", "goblinW"] },
    { id: 6, boss: true, enemies: ["goblinKing"] },      // комната босса
    { id: 7, chest: true, enemies: [] },                  // комната сундука (только первое прохождение)
    { id: 8, tier: 0, enemies: ["skeletonW", "skeletonW"] },
    { id: 9, tier: 1, enemies: ["skeletonW", "skeletonA"] },
    { id: 10, tier: 2, enemies: ["skeletonW", "skeletonW", "skeletonA"] },
    { id: 11, boss: true, enemies: ["lich"] },
    { id: 12, tier: 3, enemies: ["skeletonW", "skeletonA", "skeletonM"] },
    { id: 13, tier: 4, art: 9, enemies: ["skeletonW", "skeletonW", "skeletonM"] },
    { id: 14, tier: 5, art: 10, enemies: ["skeletonW", "skeletonA", "skeletonA", "skeletonM"] },
    { id: 15, art: 12, chest: true, enemies: [] },
    { id: 16, art: 16, tier: 0, enemies: ["wolfhound", "wolfhound"] },
    { id: 17, art: 16, tier: 1, enemies: ["wolfhound", "wolfhound", "wolfhound"] },
    { id: 18, art: 17, tier: 2, enemies: ["wolfhound", "werewolf"] },
    { id: 19, art: 17, tier: 2, enemies: ["wolfhound", "wolfhound", "werewolf"] },
    { id: 20, art: 16, tier: 3, enemies: ["wolfhound", "wolfhound", "wolfhound", "werewolf"] },
    { id: 21, art: 18, tier: 3, enemies: ["werewolf", "werewolf"] },
    { id: 22, art: 18, tier: 4, enemies: ["wolfhound", "werewolf", "werewolf"] },
    { id: 23, art: 19, tier: 4, enemies: ["wolfhound", "wolfhound", "werewolf", "werewolf"] },
    { id: 24, art: 19, tier: 5, enemies: ["wolfhound", "werewolf", "werewolf"] },
    { id: 25, art: 19, boss: true, enemies: ["lycan"] },
    { id: 26, art: 19, chest: true, enemies: [] },
    { id: 27, art: "forge-mine", tier: 0, enemies: ["orc-shield", "orc-shield"] },
    { id: 28, art: "forge-mine", tier: 0, enemies: ["orc-shield", "orc-firebolt"] },
    { id: 29, art: "forge-mine", tier: 1, enemies: ["orc-shield", "orc-axe"] },
    { id: 30, art: "forge-workshop", tier: 1, enemies: ["orc-shield", "orc-firebolt", "orc-firebolt"] },
    { id: 31, art: "forge-workshop", tier: 2, enemies: ["orc-shield", "orc-axe", "orc-firebolt"] },
    { id: 32, art: "forge-workshop", tier: 2, enemies: ["orc-shield", "orc-shield", "orc-axe"] },
    { id: 33, art: "forge-armory", tier: 3, enemies: ["orc-shield", "orc-shield", "orc-firebolt"] },
    { id: 34, art: "forge-armory", tier: 3, enemies: ["orc-shield", "orc-axe", "orc-firebolt", "orc-firebolt"] },
    { id: 35, art: "forge-battle-hall", tier: 4, enemies: ["orc-shield", "orc-axe", "orc-axe"] },
    { id: 36, art: "forge-battle-hall", tier: 5, enemies: ["orc-shield", "orc-axe", "orc-axe", "orc-firebolt"] },
    { id: 37, art: "forge-foundry", tier: 6, enemies: ["orc-shield", "orc-shield", "orc-axe", "orc-firebolt"] },
    { id: 38, art: "forge-foundry", boss: true, enemies: ["krag"] },
    { id: 39, art: "forge-armory", chest: true, enemies: [] }
  ],
  enemyGrowthPerRoom: 0.15, // m = 1 + 0.15*(боевая комната - 1)

  // --- Герои (позиции — доли ширины канваса; порядок в партии: лучник → жрица → воин) ---
  heroes: {
    ranger: { name: "Лучник", x: 0.15, hp: 70, dmg: 6, interval: 1.2, critChance: 0.10, critStat: "rCrit" },
    priest: { name: "Жрица", x: 0.25, hp: 80, heal: 25, healCD: 8, critChance: 0.05, critStat: "pCrit" },
    warrior: { name: "Воин", x: 0.35, hp: 120, dmg: 8, interval: 1.5, critChance: 0.05, critStat: "wCrit" }
  },
  heroOrder: ["warrior", "priest", "ranger"], // порядок получения урона: воин → жрица → лучник
  critical: { maxChance: 0.25, multiplier: 1.5 },

  // --- Монстры ---
  enemies: {
    goblinW:    { name: "Гоблин-воин",  hp: 30, dmg: 6, interval: 1.8, ranged: false, sizeMul: 1.0,
                  attack: { windup: 0.42, recovery: 0.33 } },
    goblinA:    { name: "Гоблин-лучник", hp: 20, dmg: 5, interval: 2.0, ranged: true,  sizeMul: 1.0,
                  attack: { windup: 0.55, recovery: 0.32 } },
    goblinKing: { name: "Гоблин-король", hp: 350, dmg: 18, interval: 2.2, ranged: false, sizeMul: 1.8, boss: true,
                  attack: { windup: 0.52, recovery: 0.42 },
                  smash: { everySec: 7.5, dmgMul: 2, windup: 1.12, recovery: 0.62, speed: 760, stun: 3,
                    contactOffset: 0.30, contactReach: 32 }, death: { duration: 1.85, land: 0.70, tint: "#e7bb92" } },
    skeletonW: { name: "Скелет-мечник", hp: 52, dmg: 9, interval: 1.65, ranged: false, sizeMul: 0.92,
                  attack: { windup: 0.43, recovery: 0.34 } },
    skeletonA: { name: "Скелет-лучник", hp: 38, dmg: 7, interval: 1.9, ranged: true, sizeMul: 0.88,
                  attack: { windup: 0.56, recovery: 0.34 } },
    skeletonM: { name: "Скелет-маг", hp: 43, dmg: 9, interval: 2.35, ranged: true, sizeMul: 0.91,
                  attack: { windup: 0.7, recovery: 0.44, projectile: "necroticOrb" },
                  buff: { id: "boneFury", targets: ["skeletonW", "skeletonA"], initial: 0.55, cooldown: 8.2,
                    windup: 0.82, recovery: 0.40 } },
    lich: { name: "Лич-маг", hp: 490, dmg: 24, interval: 2.9, ranged: true, sizeMul: 1.86, boss: true,
            attack: { windup: 1.08, recovery: 0.46, beam: true },
            freeze: { initial: 5.5, cooldown: 13, windup: 1.25, recovery: 0.48, flight: 0.62 },
            summon: { seconds: 0.95, minions: ["skeletonW", "skeletonA", "skeletonM"] },
            death: { duration: 2.1, land: 0.78, tint: "#c6b5ff" } },
    wolfhound: { name: "Волкодав", hp: 58, dmg: 9, interval: 1.7, ranged: false, sizeMul: 0.8, spritePoses: true,
      speed: 510, stopRange: 93, formationGap: 12, attack: { windup: 0.34, recovery: 0.33, impact: "bite" },
      fall: { duration: 0.62, shapes: [[157, 88], [141, 83], [140, 76], [144, 66], [149, 56], [156, 56]] } },
    werewolf: { name: "Волколак", hp: 96, dmg: 14, interval: 2.55, ranged: false, sizeMul: 1.24, spritePoses: true,
      speed: 154, stopRange: 108, formationGap: 14, attack: { windup: 0.66, recovery: 0.43, impact: "claw", wave: { range: 350, speed: 960 } },
      fall: { duration: 0.72, shapes: [[51, 88], [52, 75], [67, 63], [73, 48], [79, 40], [100, 35]] } },
    lycan: { name: "Ликантроп", hp: 680, dmg: 15, interval: 3.15, ranged: false, sizeMul: 1.82, spritePoses: true, boss: true,
      speed: 148, stopRange: 124, attack: { windup: 0.82, recovery: 0.52, impact: "claw", party: true },
      howl: { initial: 3.4, cooldown: 16, windup: 1.18, recovery: 0.52, status: "stunned" },
      death: { duration: 1.9, land: 0.76, tint: "#d8d1bb" },
      regen: { threshold: 0.5, interval: 1, healthFraction: 0.05, status: "lycanRegen" } },
    "orc-shield": forgeEnemy({ name: "Орк-щитоносец", hp: 115, dmg: 13, interval: 2.35, sizeMul: 1.08,
      motion: ["orc-shield"], speed: 156, stopRange: 98, formationGap: 16, fall: { duration: 1.08 },
      attack: { windup: 0.52, recovery: 0.40, impact: "enemy" },
      guard: { initial: 2.8, cooldown: 10, windup: 0.68, recovery: 0.34, status: "orcGuard" } }),
    "orc-firebolt": forgeEnemy({ name: "Орк-поджигатель", hp: 76, dmg: 8, interval: 3.15, ranged: true, sizeMul: 0.98,
      motion: ["orc-firebolt"], fall: { duration: 1.08 },
      attack: { windup: 0.68, recovery: 0.40, projectile: "firebolt", aimRear: true } }),
    "orc-axe": forgeEnemy({ name: "Орк с топором", hp: 108, dmg: 16, interval: 2.55, sizeMul: 1.16,
      motion: ["orc-axe"], speed: 174, stopRange: 104, formationGap: 16, fall: { duration: 1.14 },
      attack: { windup: 0.63, recovery: 0.41, impact: "claw" },
      bleed: { chance: 0.25, status: "bleeding" },
      buff: { id: "orcWarCry", targets: ["orc-shield", "orc-firebolt", "orc-axe"], initial: 3.6,
        cooldown: 12, windup: 0.94, recovery: 0.42 } }),
    krag: forgeEnemy({ name: "Краг, хранитель горна", hp: 940, armor: 360, dmg: 18, interval: 2.8, sizeMul: 1.67, boss: true,
      motion: ["krag-armored", "krag-enraged"], speed: 150, stopRange: 119,
      attack: { windup: 0.68, recovery: 0.51, impact: "smash" },
      stunStrike: { initial: 7, cooldown: 11, windup: 1.05, recovery: 0.54, stun: 2.5, impact: "smash" },
      furnace: { interval: 15, duration: 5, interruptDamage: 300, speed: 840, status: "burning" },
      death: { duration: 1.62, land: 0.78, tint: "#ffb275", forward: true } })
  },
  effects: {
    healWard: { name: "Покров света", damageTakenMultiplier: 0.86, icon: "icon-heal.png" },
    boneFury: { name: "Некротическое усиление", duration: 5, damageMultiplier: 1.25, icon: "status-bone-fury.png" },
    stunned: { name: "Оглушение", duration: 4, dispelPriority: 4, color: "#ffd98d" },
    frozen: { name: "Заморозка", duration: 10, tickSec: 1, healthFraction: 0.05, dispelPriority: 5, color: "#bceaff" },
    lycanRegen: { name: "Регенерация", color: "#85d9a2" },
    orcGuard: { name: "Защита щитом", duration: 3, damageTakenMultiplier: 0.4, after: "orcExposed", color: "#a8cce7" },
    orcExposed: { name: "Открытая стойка", duration: 2, damageTakenMultiplier: 1.2, color: "#ffe496" },
    orcWarCry: { name: "Боевой клич", duration: 6, damageMultiplier: 1.25, attackSpeedMultiplier: 1.25, color: "#ffa55c" },
    bleeding: { name: "Кровотечение", duration: 7, tickSec: 1, healthFraction: 0.03, dispelPriority: 2, color: "#ff7781" },
    ember: { name: "Ожог от болта", duration: 3, tickSec: 1, healthFraction: 0.025, dispelPriority: 1, color: "#ffc07f" },
    burning: { name: "Горение", duration: 5, tickSec: 1, healthFraction: 0.05, dispelPriority: 3, color: "#ff9b60" },
    sacrifice: { name: "Жертвенность", color: "#f7cc86" },
    kragRage: { name: "Ярость Крага", duration: Infinity, damageMultiplier: 2, attackSpeedMultiplier: 2, color: "#ff856b" }
  },

  // --- Ресурсы (обнуляются на старте забега; реген — ТОЛЬКО пока идёт бой) ---
  resources: {
    rage:  { max: 100, perKill: 25, regenPerSec: 2 },   // воин
    focus: { max: 100, perKill: 25, regenPerSec: 2 },   // лучник
    mana:  { max: 20, regenPerTick: 1, tickSec: 2 }
  },
  // --- Активные навыки (появляются на панели после покупки узла) ---
  startingRunes: 1,
  skillBar: { baseSlots: 5, maxSlots: 10 },
  skills: {
    powerStrike: { name: "Мощный удар", owner: "warrior", type: "targeted", cost: 50, res: "rage", dmg: 40, cooldown: 6.5,
      auto: true, manualWhileAuto: false },
    block: { name: "Глухая оборона", owner: "warrior", type: "instant", cost: 40, res: "rage", dmgReduce: 0.75, durSec: 3, cooldown: 9 },
    sacrifice: { name: "Жертвенность", owner: "warrior", type: "instant", cost: 45, res: "rage", durSec: 4, cooldown: 36 },
    heal: { name: "Лечение", owner: "priest", type: "ally", res: "mana", cost: 4, innate: true, auto: true, defaultAuto: true, animation: 1.1 },
    dispel: { name: "Рассеять негативное заклинание", owner: "priest", type: "ally", res: "mana", cost: 10,
      auto: true, cooldown: 12, castTime: 0.28, recovery: 0.52 },
    massHeal: { name: "Массовое восстановление", owner: "priest", type: "instant", res: "mana", cost: 18,
      heal: 50, cooldown: 24, castTime: 1.05, recovery: 0.5 },
    fireball: { name: "Фаербол", owner: "priest", type: "targeted", res: "mana", cost: 3, auto: true, dmg: 20, cooldown: 4.2, release: 0.54, flight: 0.38 },
    fireTornado: { name: "Огненный смерч", owner: "priest", type: "ground", res: "mana", cost: 20, auto: true,
      dmg: 48, cooldown: 22, castTime: 2.8, recovery: 0.48, speed: 610 },
    multishot: { name: "Мультивыстрел", owner: "ranger", type: "auto", cost: 10, res: "focus", auto: true, arrowDamage: 0.60, targets: 3,
      focusRegenMultiplier: 0.5, focusOnKillMultiplier: 0.2 },
    preciseShot: { name: "Меткий выстрел", owner: "ranger", type: "targeted", cost: 60, res: "focus", dmg: 50, cooldown: 8,
      auto: true, manualWhileAuto: false },
    bomb: { name: "Бомба", owner: "ranger", type: "ground", stock: 1, dmg: 38, radius: 118, flight: 0.58 },
    potion: { name: "Зелье лечения", owner: null, type: "potion" }
  },

  trees: DWR.SKILL_TREES ?? require('./skill-tree-data.js'),

  // --- Лут и экономика ---
  loot: {
    coinPerGoblin: 4, coinPerBoss: 40, coinPerChest: 60,
    potionChanceBase: 0.10,        // +5% за уровень potionLuck (до 25%)
    potionHealBase: 40             // +20 за уровень potionStr
  },

  // --- Прочее ---
  battle: {
    castReleaseFlash: 0.13,
    enemyXFrom: 0.65, enemyXTo: 0.95,   // зона появления врагов (доли ширины)
    warriorAdvanceSpeed: 210,
    warriorStopRange: 106,
    warriorContact: 0.48
  },
  saveKey: "dwr_save_v1"
};
