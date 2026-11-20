// DWR :: config.js — ВЕСЬ баланс и данные прототипа (docs/specs/mvp-slice.md).
// Числа стартовые: правятся здесь, без изменения логики.
"use strict";
window.DWR = window.DWR || {};

const upgradeNode = (id, name, desc, [base, mul], max, effect, parent = null, requiresLevel = 1) =>
  ({ id, name, desc, base, mul, max, effect, parent, requiresLevel });
const upgradeStat = (stat, add) => ({ stat, add });

DWR.CONFIG = {
  canvas: { w: 1280, h: 720 },

  // --- Локации и комнаты ---
  fadeSec: 0.7,
  locations: {
    dungeon: { name: "Мрачное подземелье", rooms: [0, 1, 2, 3, 4, 5], treasure: 6, progress: "location1Done" },
    crypt: { name: "Крипта кладбища", rooms: [7, 8, 9, 11, 12, 13, 10], treasure: 14, progress: "cryptDone", unlockAfter: "dungeon" }
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
    { id: 15, art: 12, chest: true, enemies: [] }
  ],
  enemyGrowthPerRoom: 0.15, // m = 1 + 0.15*(боевая комната - 1)

  // --- Герои (позиции — доли ширины канваса; порядок в партии: лучник → жрица → воин) ---
  heroes: {
    ranger: { name: "Лучник",        x: 0.15, hp: 70, dmg: 6,   interval: 1.2 },
    priest: { name: "Жрица",         x: 0.25, hp: 80, heal: 25, healCD: 8 },
    warrior:{ name: "Воин",          x: 0.35, hp: 120, dmg: 8,  interval: 1.5 }
  },
  heroOrder: ["warrior", "priest", "ranger"], // порядок получения урона: воин → жрица → лучник

  // --- Монстры ---
  enemies: {
    goblinW:    { name: "Гоблин-воин",  hp: 30, dmg: 6, interval: 1.8, ranged: false, sizeMul: 1.0,
                  attack: { windup: 0.42, recovery: 0.33 } },
    goblinA:    { name: "Гоблин-лучник", hp: 20, dmg: 5, interval: 2.0, ranged: true,  sizeMul: 1.0,
                  attack: { windup: 0.55, recovery: 0.32 } },
    goblinKing: { name: "Гоблин-король", hp: 350, dmg: 18, interval: 2.2, ranged: false, sizeMul: 1.8, boss: true,
                  attack: { windup: 0.52, recovery: 0.42 },
                  smash: { everySec: 12, dmgMul: 2, windup: 0.96, recovery: 0.60 } },
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
            summon: { seconds: 0.95, minions: ["skeletonW", "skeletonA", "skeletonM"] } }
  },
  effects: {
    healWard: { name: "Покров света", damageTakenMultiplier: 0.86, icon: "icon-heal.png" },
    boneFury: { name: "Некротическое усиление", duration: 5, damageMultiplier: 1.25, icon: "status-bone-fury.png" }
  },

  // --- Ресурсы (обнуляются на старте забега; реген — ТОЛЬКО пока идёт бой) ---
  resources: {
    rage:  { max: 100, perKill: 25, regenPerSec: 2 },   // воин
    focus: { max: 100, perKill: 25, regenPerSec: 2 },   // лучник
    mana:  { max: 20, regenPerTick: 1, tickSec: 2 }
  },
  priestModes: {
    heal: { name: "Лечение", color: "#a9dfc2" },
    attack: { name: "Атака", color: "#ffc08f" },
    balance: { name: "Баланс", color: "#d8bdff" }
  },
  priestSpells: {
    heal: { cost: 4, animation: 1.1 },
    fireball: { cost: 3, dmg: 20, cooldown: 4, release: 0.54, flight: 0.38 }
  },

  // --- Активные навыки (появляются на панели после покупки узла) ---
  skills: {
    powerStrike: { name: "Мощный удар",    owner: "warrior", type: "targeted", cost: 50, res: "rage",  dmg: 40, cooldown: 6.5 },
    block:       { name: "Глухая оборона", owner: "warrior", type: "instant",  cost: 40, res: "rage",  dmgReduce: 0.75, durSec: 3, cooldown: 9 },
    // Ключ fireball сохраняет размещение навыка в старых сохранениях.
    fireball:    { name: "Режим жрицы",    owner: "priest",  type: "cycle", innate: true },
    multishot:   { name: "Мультивыстрел",  owner: "ranger",  type: "instant",  cost: 40, res: "focus", dmg: 8, targets: 3, cooldown: 6 },
    preciseShot: { name: "Меткий выстрел", owner: "ranger",  type: "targeted", cost: 60, res: "focus", dmg: 50, cooldown: 8 },
    potion:      { name: "Зелье лечения",  owner: null,      type: "potion" }
  },

  // Внутри ветки parent задаёт связь, requiresLevel — порог для покупки дочернего узла.
  trees: {
    warrior: { name: "Воин", branches: [
      { id: "sword", name: "Меч и темп", nodes: [
        upgradeNode("wDmg", "Урон меча", "+2 урона автоатаки", [12, 1.25], 10, upgradeStat("wDmg", 2)),
        upgradeNode("wTempo", "Темп боя", "−6% от базового интервала автоатаки", [29, 1.31], 5, upgradeStat("wTempo", 0.06), "wDmg", 3),
        upgradeNode("wStride", "Решительный шаг", "+20 к скорости сближения", [22, 1.3], 3, upgradeStat("wStride", 20), "wDmg")
      ] },
      { id: "strike", name: "Мощный удар", nodes: [
        upgradeNode("powerStrike", "Мощный удар", "Открывает удар на 40 урона за 50 ярости. Перезарядка 6,5 с", [15, 1.3], 1, { unlockSkill: "powerStrike" }),
        upgradeNode("wStrike", "Рассекающий удар", "+8 к урону «Мощного удара»", [34, 1.35], 3, upgradeStat("wStrike", 8), "powerStrike"),
        upgradeNode("powerStrikeHaste", "Быстрый замах", "−0,8 с к перезарядке «Мощного удара»", [31, 1.35], 4, upgradeStat("powerStrikeHaste", 0.8), "powerStrike"),
        upgradeNode("powerStrikeCost", "Отточенный удар", "−4 ярости к цене «Мощного удара»", [25, 1.35], 3, upgradeStat("powerStrikeCost", 4), "powerStrike"),
        upgradeNode("powerStrikeRefund", "Решающий удар", "+7 ярости при убийстве «Мощным ударом»", [43, 1.35], 3, upgradeStat("powerStrikeRefund", 7), "wStrike", 2)
      ] },
      { id: "guard", name: "Глухая оборона", nodes: [
        upgradeNode("block", "Глухая оборона", "Открывает щит на 3 с за 40 ярости. Снижает урон на 75%. Перезарядка 9 с", [40, 1.3], 1, { unlockSkill: "block" }),
        upgradeNode("blockDur", "Стойкость блока", "+1 с к длительности щита", [25, 1.3], 3, upgradeStat("blockDur", 1), "block"),
        upgradeNode("blockHaste", "Быстрая защита", "−0,6 с к перезарядке щита", [34, 1.4], 4, upgradeStat("blockHaste", 0.6), "block"),
        upgradeNode("blockCost", "Экономный блок", "−4 ярости к цене щита", [27, 1.35], 3, upgradeStat("blockCost", 4), "block"),
        upgradeNode("blockHeal", "Второе дыхание", "+8 HP воину при активации щита", [38, 1.4], 3, upgradeStat("blockHeal", 8), "blockDur", 2)
      ] },
      { id: "resolve", name: "Стойкость и ярость", nodes: [
        upgradeNode("wHp", "Здоровье", "+15 к максимуму HP воина", [10, 1.25], 10, upgradeStat("wHp", 15)),
        upgradeNode("wArmor", "Закалённая броня", "−4% к получаемому воином урону", [28, 1.35], 4, upgradeStat("wArmor", 0.04), "wHp", 3),
        upgradeNode("wRageKill", "Жажда боя", "+4 ярости за убийство врага отрядом", [24, 1.3], 4, upgradeStat("wRageKill", 4), "wHp"),
        upgradeNode("wRageRegen", "Боевой пыл", "+1 ярости в секунду в бою", [35, 1.35], 3, upgradeStat("wRageRegen", 1), "wRageKill", 2)
      ] }
    ] },
    priest: { name: "Жрица", branches: [
      { id: "light", name: "Лечение", nodes: [
        upgradeNode("healPow", "Сила света", "+8 к лечению", [10, 1.25], 10, upgradeStat("healPow", 8)),
        upgradeNode("healHaste", "Быстрая молитва", "−0,65 с к перезарядке лечения", [32, 1.36], 4, upgradeStat("healHaste", 0.65), "healPow", 3),
        upgradeNode("healCost", "Тихая молитва", "−1 маны к стоимости лечения", [29, 1.4], 2, upgradeStat("healCost", 1), "healPow"),
        upgradeNode("healWard", "Покров света", "Лечение даёт −14% входящего урона на 1,25 с за уровень", [43, 1.4], 4, upgradeStat("healWard", 1.25), "healHaste"),
        upgradeNode("healOverflow", "Экстренная помощь", "+8 к лечению цели с 35% HP или меньше", [32, 1.35], 4, upgradeStat("healOverflow", 8), "healPow", 2)
      ] },
      { id: "flame", name: "Фаербол", nodes: [
        upgradeNode("fireDmg", "Раскалённое ядро", "+6 к урону фаербола", [34, 1.32], 5, upgradeStat("fireDmg", 6)),
        upgradeNode("fireballHaste", "Беглое пламя", "−0,45 с к перезарядке фаербола", [29, 1.35], 4, upgradeStat("fireballHaste", 0.45), "fireDmg"),
        upgradeNode("fireballCost", "Малая искра", "−1 маны к стоимости фаербола", [33, 1.4], 2, upgradeStat("fireballCost", 1), "fireDmg"),
        upgradeNode("fireballBlast", "Огненная волна", "+5 урона соседним врагам при попадании фаербола", [48, 1.4], 4, upgradeStat("fireballBlast", 5), "fireDmg", 2)
      ] },
      { id: "mana", name: "Мана", nodes: [
        upgradeNode("fireballUnlock", "Глубокий резерв", "+20 к запасу маны жрицы", [60, 1.3], 1, upgradeStat("manaPool", 20)),
        upgradeNode("manaPool", "Резерв маны", "+10 к максимуму маны", [20, 1.3], 5, upgradeStat("manaPool", 10), "fireballUnlock"),
        upgradeNode("manaRegen", "Поток маны", "−0,5 с к интервалу восстановления маны", [25, 1.3], 3, upgradeStat("manaRegen", -0.5), "manaPool", 2),
        upgradeNode("manaOnKill", "Сбор искр", "+1 маны жрице за убийство врага отрядом", [32, 1.4], 3, upgradeStat("manaOnKill", 1), "fireballUnlock"),
        upgradeNode("manaOnRoom", "Глоток эфира", "+2 маны при входе в комнату", [30, 1.35], 4, upgradeStat("manaOnRoom", 2), "manaOnKill")
      ] },
      { id: "alchemy", name: "Зелья", nodes: [
        upgradeNode("potionStock", "Зелье лечения", "+1 зелье на старте рейда за уровень при экипировке", [15, 1.4], 5, { unlockSkill: "potion", unlockAt: 1, ...upgradeStat("potionStock", 1) }),
        upgradeNode("potionLuck", "Зельеварение", "+5 п. п. к шансу выпадения зелий с обычных врагов", [15, 1.3], 3, upgradeStat("potionLuck", 0.05), "potionStock"),
        upgradeNode("potionStr", "Крепкие зелья", "+20 HP к лечению зельем", [30, 1.3], 3, upgradeStat("potionStr", 20), "potionLuck", 2),
        upgradeNode("pHp", "Живая вода", "+12 к максимуму HP жрицы", [24, 1.3], 4, upgradeStat("pHp", 12), "potionStock"),
        upgradeNode("potionSquadHeal", "Целебные пары", "Зелье восстанавливает ещё по 5 HP другим живым героям", [35, 1.4], 3, upgradeStat("potionSquadHeal", 5), "potionStr")
      ] }
    ] },
    ranger: { name: "Лучник", branches: [
      { id: "shoot", name: "Стрельба", nodes: [
        upgradeNode("rDmg", "Урон стрел", "+1,5 к урону автоатаки", [12, 1.25], 10, upgradeStat("rDmg", 1.5)),
        upgradeNode("rSpeed", "Скорость атаки", "−7% от базового интервала автоатаки", [18, 1.25], 10, upgradeStat("rSpeed", -0.07)),
        upgradeNode("rHp", "Сноровка разведчика", "+12 к максимуму HP лучника", [27, 1.3], 4, upgradeStat("rHp", 12), "rSpeed", 2)
      ] },
      { id: "volley", name: "Мультивыстрел", nodes: [
        upgradeNode("multishot", "Мультивыстрел", "Открывает выстрел тремя стрелами по 8 урона за 40 фокуса. Перезарядка 6 с", [50, 1.3], 1, { unlockSkill: "multishot" }),
        upgradeNode("rFan", "Усиленный залп", "+3 к урону каждой стрелы", [32, 1.36], 4, upgradeStat("rFan", 3), "multishot"),
        upgradeNode("multishotHaste", "Быстрый залп", "−0,65 с к перезарядке «Мультивыстрела»", [32, 1.35], 4, upgradeStat("multishotHaste", 0.65), "multishot"),
        upgradeNode("multishotCost", "Отточенный залп", "−4 фокуса к стоимости «Мультивыстрела»", [27, 1.35], 3, upgradeStat("multishotCost", 4), "multishot"),
        upgradeNode("rExtraArrow", "Широкий веер", "+1 стрела у «Мультивыстрела». Если целей не хватает, добавленная стрела наносит 50% урона уже выбранному врагу", [46, 1.4], 2, upgradeStat("rExtraArrow", 1), "rFan", 2)
      ] },
      { id: "aim", name: "Меткий выстрел", nodes: [
        upgradeNode("preciseShot", "Меткий выстрел", "Открывает выстрел на 50 урона за 60 фокуса. Перезарядка 8 с", [70, 1.3], 1, { unlockSkill: "preciseShot" }),
        upgradeNode("rPrecision", "Пробивная стрела", "+10 к урону «Меткого выстрела»", [30, 1.33], 4, upgradeStat("rPrecision", 10), "preciseShot"),
        upgradeNode("preciseShotHaste", "Мгновенный прицел", "−0,8 с к перезарядке «Меткого выстрела»", [36, 1.35], 4, upgradeStat("preciseShotHaste", 0.8), "preciseShot"),
        upgradeNode("preciseShotCost", "Выверенный бросок", "−5 фокуса к стоимости «Меткого выстрела»", [30, 1.35], 3, upgradeStat("preciseShotCost", 5), "preciseShot"),
        upgradeNode("preciseBoss", "Охотник на великанов", "+15% урона «Меткого выстрела» по боссам", [44, 1.4], 4, upgradeStat("preciseBoss", 0.15), "rPrecision", 2)
      ] },
      { id: "focus", name: "Фокус", nodes: [
        upgradeNode("rFocusKill", "Добыча охотника", "+4 фокуса за убийство врага отрядом", [25, 1.3], 4, upgradeStat("rFocusKill", 4)),
        upgradeNode("rFocusRegen", "Сосредоточение", "+1 фокуса в секунду в бою", [35, 1.35], 3, upgradeStat("rFocusRegen", 1), "rFocusKill", 2)
      ] }
    ] },
    raid: { name: "Рейд", branches: [
      { id: "bounty", name: "Трофеи", nodes: [
        upgradeNode("raidCoins", "Горсть монет", "+1 монета с обычного врага", [16, 1.38], 5, upgradeStat("raidCoins", 1)),
        upgradeNode("bossCoins", "Награда за босса", "+5 монет из босса", [30, 1.35], 4, upgradeStat("bossCoins", 5), "raidCoins", 2),
        upgradeNode("chestCoins", "Находка в сундуке", "+10 монет в сундуке за первую победу", [26, 1.35], 3, upgradeStat("chestCoins", 10), "raidCoins")
      ] },
      { id: "contract", name: "Оплата за рейд", nodes: [
        upgradeNode("roomCoins", "Плата за зачистку", "+2 монеты сразу после зачистки обычной боевой комнаты", [22, 1.35], 4, upgradeStat("roomCoins", 2)),
        upgradeNode("raidVictoryCoins", "Премия за победу", "+10 монет за завершённый победой рейд", [45, 1.4], 4, upgradeStat("raidVictoryCoins", 10), "roomCoins", 2)
      ] },
      { id: "pickup", name: "Подбор", nodes: [
        upgradeNode("lootReach", "Длинные руки", "+12 к радиусу подбора монет и зелий. Радиус подбора зелий действует и после открытия автоподбора монет", [20, 1.38], 4, upgradeStat("lootReach", 12)),
        upgradeNode("autoCoins", "Автоподбор монет", "Осевшие на пол монеты автоматически идут в добычу рейда", [110, 1.3], 1, upgradeStat("autoCoins", 1), "lootReach", 4)
      ] }
    ] }
  },

  // --- Лут и экономика ---
  loot: {
    coinPerGoblin: 4, coinPerBoss: 40, coinPerChest: 60,
    potionChanceBase: 0.10,        // +5% за уровень potionLuck (до 25%)
    potionHealBase: 40             // +20 за уровень potionStr
  },

  // --- Прочее ---
  battle: {
    enemyXFrom: 0.65, enemyXTo: 0.95,   // зона появления врагов (доли ширины)
    warriorAdvanceSpeed: 210,
    warriorStopRange: 106,
    warriorContact: 0.48
  },
  saveKey: "dwr_save_v1"
};
