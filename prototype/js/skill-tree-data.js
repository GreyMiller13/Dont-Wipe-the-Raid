// DWR :: skill-tree-data.js — данные дерева навыков и зависимости между узлами.
"use strict";
window.DWR = window.DWR || {};

(function () {
const upgradeNode = (id, name, desc, [base, mul], max, effect, parent = null, requiresLevel = 1) =>
  ({ id, name, desc, base, mul, max, effect, parent, requiresLevel });
const upgradeStat = (stat, add) => ({ stat, add });
const activeNode = (id, name, desc) =>
  upgradeNode(id, name, desc, [0, 1], 1, { unlockSkill: id, unlockAt: 1 });
const costReduction = (id, name, desc, add, parent, max = 2) => ({
  ...upgradeNode(id, name, desc, [500, 8], max, upgradeStat(id, add), parent),
  prices: Array.from({ length: max }, (_, index) => index === 0 ? 500 : 4000)
});

// Внутри ветки parent задаёт связь, requiresLevel — порог покупки дочернего узла.
DWR.SKILL_TREES = {
  warrior: { name: "Воин", branches: [
    { id: "sword", name: "Меч и темп", nodes: [
      upgradeNode("wDmg", "Урон меча", "+2 урона автоатаки", [12, 1.25], 10, upgradeStat("wDmg", 2)),
      upgradeNode("wTempo", "Темп боя", "−6% от базового интервала автоатаки", [29, 1.31], 5, upgradeStat("wTempo", 0.06), "wDmg", 3),
      upgradeNode("wCrit", "Слабое место", "+3 п. п. к шансу крита мечом и «Мощным ударом». Крит наносит 150% урона. Базовый шанс 5%, после прокачки 20%", [48, 1.5], 5, upgradeStat("wCrit", 0.03), "wDmg", 2),
      upgradeNode("wStride", "Решительный шаг", "+20 к скорости сближения", [22, 1.3], 3, upgradeStat("wStride", 20), "wDmg")
    ] },
    { id: "strike", name: "Мощный удар", nodes: [
      activeNode("powerStrike", "Мощный удар", "40 урона за 50 ярости. Перезарядка 6,5 с"),
      upgradeNode("wStrike", "Рассекающий удар", "+8 к урону «Мощного удара»", [34, 1.35], 3, upgradeStat("wStrike", 8), "powerStrike"),
      upgradeNode("powerStrikeHaste", "Быстрый замах", "−0,8 с к перезарядке «Мощного удара»", [31, 1.35], 4, upgradeStat("powerStrikeHaste", 0.8), "powerStrike"),
      costReduction("powerStrikeCost", "Отточенный удар", "−4 ярости к цене «Мощного удара»", 4, "powerStrike", 3),
      upgradeNode("powerStrikeRefund", "Решающий удар", "+7 ярости при убийстве «Мощным ударом»", [43, 1.35], 3, upgradeStat("powerStrikeRefund", 7), "wStrike", 2)
    ] },
    { id: "guard", name: "Глухая оборона", nodes: [
      activeNode("block", "Глухая оборона", "Щит на 3 с за 40 ярости. Снижает урон на 75%. Перезарядка 9 с"),
      upgradeNode("blockDur", "Стойкость блока", "+1 с к длительности щита", [25, 1.3], 3, upgradeStat("blockDur", 1), "block"),
      upgradeNode("blockHaste", "Быстрая защита", "−0,6 с к перезарядке щита", [34, 1.4], 4, upgradeStat("blockHaste", 0.6), "block"),
      costReduction("blockCost", "Экономный блок", "−4 ярости к цене щита", 4, "block", 3),
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
      activeNode("heal", "Лечение", "Доступно с начала игры. Восстанавливает 25 ОЗ за 4 маны. ЛКМ включает авто, перетаскивание выбирает цель"),
      upgradeNode("healPow", "Сила света", "+8 к лечению", [10, 1.25], 10, upgradeStat("healPow", 8), "heal"),
      upgradeNode("healHaste", "Быстрая молитва", "−0,65 с к перезарядке лечения", [32, 1.36], 4, upgradeStat("healHaste", 0.65), "healPow", 3),
      costReduction("healCost", "Тихая молитва", "−1 маны к стоимости лечения", 1, "healPow"),
      upgradeNode("pCrit", "Благодать", "+3 п. п. к шансу крита лечения и фаербола. Крит усиливает заклинание до 150%. Базовый шанс 5%, после прокачки 20%", [48, 1.5], 5, upgradeStat("pCrit", 0.03), "healPow", 2),
      upgradeNode("healWard", "Покров света", "Лечение даёт −14% входящего урона на 1,25 с за уровень", [43, 1.4], 4, upgradeStat("healWard", 1.25), "healHaste"),
      upgradeNode("healOverflow", "Экстренная помощь", "+8 к лечению цели с 35% HP или меньше", [32, 1.35], 4, upgradeStat("healOverflow", 8), "healPow", 2)
    ] },
    { id: "flame", name: "Фаербол", nodes: [
      activeNode("fireball", "Фаербол", "20 урона за 3 маны. Перезарядка 4,2 с"),
      upgradeNode("fireDmg", "Раскалённое ядро", "+4 к урону фаербола", [34, 1.32], 5, upgradeStat("fireDmg", 4), "fireball"),
      upgradeNode("fireballHaste", "Беглое пламя", "−0,3 с к перезарядке фаербола", [29, 1.35], 4, upgradeStat("fireballHaste", 0.30), "fireDmg"),
      costReduction("fireballCost", "Малая искра", "−1 маны к стоимости фаербола", 1, "fireDmg"),
      upgradeNode("fireballBlast", "Огненная волна", "+3 урона соседним врагам при попадании фаербола", [48, 1.4], 4, upgradeStat("fireballBlast", 3), "fireDmg", 2)
    ] },
    { id: "mana", name: "Мана", nodes: [
      upgradeNode("fireballUnlock", "Глубокий резерв", "+20 к запасу маны жрицы", [230, 1.3], 1, upgradeStat("manaPool", 20)),
      upgradeNode("manaPool", "Резерв маны", "+10 к максимуму маны", [130, 1.85], 5, upgradeStat("manaPool", 10), "fireballUnlock"),
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
      upgradeNode("rCrit", "Острый глаз", "+3 п. п. к шансу крита всеми стрелами. Крит наносит 150% урона. Базовый шанс 10%, после прокачки 25%", [55, 1.5], 5, upgradeStat("rCrit", 0.03), "rDmg", 2),
      upgradeNode("rSpeed", "Скорость атаки", "−5% от базового интервала автоатаки", [18, 1.25], 10, upgradeStat("rSpeed", -0.05)),
      upgradeNode("rHp", "Сноровка разведчика", "+12 к максимуму HP лучника", [27, 1.3], 4, upgradeStat("rHp", 12), "rSpeed", 2)
    ] },
    { id: "volley", name: "Мультивыстрел", nodes: [
      activeNode("multishot", "Мультивыстрел", "В авто заменяет обычный выстрел тремя стрелами по 60% урона за 10 фокуса. В этом режиме регенерация фокуса вдвое медленнее, за убийства начисляется 20% фокуса"),
      upgradeNode("rFan", "Усиленный залп", "+2 п. п. урона каждой стрелы залпа от урона автоатаки", [32, 1.36], 4, upgradeStat("rFan", 1), "multishot"),
      upgradeNode("multishotHaste", "Мерный залп", "+0,2 фокуса в секунду при включённом «Мультивыстреле»", [32, 1.35], 4, upgradeStat("multishotHaste", 0.2), "multishot"),
      upgradeNode("multishotCost", "Отточенный залп", "+1 фокус за убийство врага отрядом при включённом «Мультивыстреле»", [95, 2.1], 3, upgradeStat("multishotKillFocus", 1), "multishot"),
      upgradeNode("rExtraArrow", "Плотный залп", "+3 п. п. урона стрелам залпа от урона автоатаки, если они летят в одну и ту же цель", [46, 1.4], 2, upgradeStat("rExtraArrow", 1), "rFan", 2)
    ] },
    { id: "aim", name: "Меткий выстрел", nodes: [
      activeNode("preciseShot", "Меткий выстрел", "50 урона за 60 фокуса. Перезарядка 8 с"),
      upgradeNode("rPrecision", "Пробивная стрела", "+10 к урону «Меткого выстрела»", [30, 1.33], 4, upgradeStat("rPrecision", 10), "preciseShot"),
      upgradeNode("preciseShotHaste", "Мгновенный прицел", "−0,8 с к перезарядке «Меткого выстрела»", [36, 1.35], 4, upgradeStat("preciseShotHaste", 0.8), "preciseShot"),
      costReduction("preciseShotCost", "Выверенный бросок", "−5 фокуса к стоимости «Меткого выстрела»", 5, "preciseShot", 3),
      upgradeNode("preciseBoss", "Охотник на великанов", "+15% урона «Меткого выстрела» по боссам", [44, 1.4], 4, upgradeStat("preciseBoss", 0.15), "rPrecision", 2)
    ] },
    { id: "focus", name: "Фокус", nodes: [
      upgradeNode("rFocusKill", "Добыча охотника", "+4 фокуса за убийство врага отрядом", [25, 1.3], 4, upgradeStat("rFocusKill", 4)),
      upgradeNode("rFocusRegen", "Сосредоточение", "+1 фокуса в секунду в бою", [35, 1.35], 3, upgradeStat("rFocusRegen", 1), "rFocusKill", 2)
    ] }
  ] },
  raid: { name: "Рейд", branches: [
    { id: "bounty", name: "Трофеи", nodes: [
      upgradeNode("raidCoins", "Горсть монет", "+8% к базовой награде с обычных врагов. Доли монет суммируются за рейд", [16, 1.38], 5, upgradeStat("raidCoins", 8)),
      upgradeNode("bossCoins", "Награда за босса", "+3 монеты из босса", [30, 1.35], 4, upgradeStat("bossCoins", 3), "raidCoins", 2),
      upgradeNode("chestCoins", "Находка в сундуке", "+6 монет в сундуке за первую победу", [26, 1.35], 3, upgradeStat("chestCoins", 6), "raidCoins")
    ] },
    { id: "contract", name: "Оплата за рейд", nodes: [
      upgradeNode("roomCoins", "Плата за зачистку", "+1 монета сразу после зачистки обычной боевой комнаты", [22, 1.35], 4, upgradeStat("roomCoins", 1)),
      upgradeNode("raidVictoryCoins", "Премия за победу", "+5 монет за завершённый победой рейд", [45, 1.4], 4, upgradeStat("raidVictoryCoins", 5), "roomCoins", 2)
    ] },
    { id: "pickup", name: "Подбор", nodes: [
      upgradeNode("lootReach", "Длинные руки", "+12 к радиусу подбора монет и зелий. Радиус подбора зелий действует и после открытия автоподбора монет", [20, 1.38], 4, upgradeStat("lootReach", 12)),
      upgradeNode("autoCoins", "Автоподбор монет", "Осевшие на пол монеты автоматически идут в добычу рейда", [110, 1.3], 1, upgradeStat("autoCoins", 1), "lootReach", 4)
    ] },
    { id: "loadout", name: "Снаряжение", nodes: [
      upgradeNode("panelSlots", "Дополнительный слот", "+1 ячейка на панели навыков за ранг. Максимум — 10 ячеек", [120, 1.55], 5, upgradeStat("panelSlots", 1))
    ] }
  ] }
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DWR.SKILL_TREES;
