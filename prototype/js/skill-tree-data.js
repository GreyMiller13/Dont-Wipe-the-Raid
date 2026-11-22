// DWR :: skill-tree-data.js — данные дерева навыков и зависимости между узлами.
"use strict";
window.DWR = window.DWR || {};

(function () {
// Для коротких серий цена растёт быстрее. Отдельные множители используются для дорогих специализаций.
const growthByRanks = { 1: 1, 2: 2.26, 3: 1.84, 4: 1.64, 5: 1.44, 10: 1.23 };
const upgradeNode = (id, name, desc, price, max, effect, parent = null, requiresLevel = 1) => {
  const [base, mul] = Array.isArray(price) ? price : [price, growthByRanks[max]];
  return { id, name, desc, base, mul, max, effect, parent, requiresLevel };
};
const upgradeStat = (stat, add) => ({ stat, add });
const masteryNode = (id, name, desc, price, effect, parent, requiredRank) =>
  ({ ...upgradeNode(id, name, desc, price, 3, effect, parent, requiredRank), tier: 2 });
const activeNode = (id, name, desc, parent = null, requiresLevel = 1) =>
  upgradeNode(id, name, desc, 0, 1, { unlockSkill: id, unlockAt: 1 }, parent, requiresLevel);
const costReduction = (id, name, desc, add, parent, max = 2) => ({
  ...upgradeNode(id, name, desc, [500, 8], max, upgradeStat(id, add), parent),
  prices: Array.from({ length: max }, (_, index) => index === 0 ? 500 : Math.round(4000 * 1.75 ** (index - 1)))
});

// Внутри ветки parent задаёт связь, requiresLevel — порог покупки дочернего узла.
DWR.SKILL_TREES = {
  warrior: { name: "Воин", branches: [
    { id: "sword", name: "Меч и темп", nodes: [
      upgradeNode("wDmg", "Урон меча", "+2 урона автоатаки", 16, 10, upgradeStat("wDmg", 2)),
      masteryNode("wDmgMastery", "Кованая сталь", "+4 к урону автоатаки воина за ранг", 800, upgradeStat("wDmg", 4), "wDmg", 10),
      upgradeNode("wTempo", "Темп боя", "−6% от базового интервала автоатаки", 80, 5, upgradeStat("wTempo", 0.06), "wDmg", 3),
      upgradeNode("wCrit", "Слабое место", "+3 п. п. к шансу крита мечом и «Мощным ударом». Крит наносит 150% урона. Базовый шанс 5%, после прокачки 20%", 85, 5, upgradeStat("wCrit", 0.03), "wDmg", 2),
      upgradeNode("wStride", "Решительный шаг", "+20 к скорости сближения", 55, 3, upgradeStat("wStride", 20), "wDmg")
    ] },
    { id: "strike", name: "Мощный удар", nodes: [
      activeNode("powerStrike", "Мощный удар", "40 урона за 50 ярости. Перезарядка 6,5 с"),
      upgradeNode("wStrike", "Рассекающий удар", "+8 к урону «Мощного удара»", 75, 3, upgradeStat("wStrike", 8), "powerStrike"),
      upgradeNode("powerStrikeHaste", "Быстрый замах", "−0,8 с к перезарядке «Мощного удара»", 65, 4, upgradeStat("powerStrikeHaste", 0.8), "powerStrike"),
      costReduction("powerStrikeCost", "Отточенный удар", "−4 ярости к цене «Мощного удара»", 4, "powerStrike", 3),
      upgradeNode("powerStrikeRefund", "Решающий удар", "+7 ярости при убийстве «Мощным ударом»", 90, 3, upgradeStat("powerStrikeRefund", 7), "wStrike", 2)
    ] },
    { id: "guard", name: "Глухая оборона", nodes: [
      activeNode("block", "Глухая оборона", "Щит на 3 с за 40 ярости. Снижает урон на 75%. Перезарядка 9 с"),
      upgradeNode("blockDur", "Стойкость блока", "+1 с к длительности щита", 70, 3, upgradeStat("blockDur", 1), "block"),
      upgradeNode("blockHaste", "Быстрая защита", "−0,6 с к перезарядке щита", 75, 4, upgradeStat("blockHaste", 0.6), "block"),
      costReduction("blockCost", "Экономный блок", "−4 ярости к цене щита", 4, "block", 3),
      upgradeNode("blockHeal", "Второе дыхание", "+8 HP воину при активации щита", 85, 3, upgradeStat("blockHeal", 8), "blockDur", 2),
      activeNode("sacrifice", "Жертвенность", "На 4 с перенаправляет воину весь урон по союзникам. 45 ярости, перезарядка 36 с", "block"),
      upgradeNode("sacrificeDuration", "Долг защитника", "+1 с к длительности «Жертвенности»", [150, 1.84], 3, upgradeStat("sacrificeDuration", 1), "sacrifice"),
      upgradeNode("sacrificeHaste", "Несокрушимая клятва", "−2,5 с к перезарядке «Жертвенности»", [220, 1.84], 3, upgradeStat("sacrificeHaste", 2.5), "sacrifice"),
      activeNode("righteousFury", "Праведная ярость", "Восстанавливает 3% максимального здоровья воина за 20 ярости. Перезарядка 5 с. Можно включить авто", "block"),
      upgradeNode("righteousFuryHeal", "Стойкость духа", "+1 п. п. к доле здоровья, восстанавливаемого «Праведной яростью»", [280, 1.9], 4, upgradeStat("righteousFuryHeal", 0.01), "righteousFury"),
      costReduction("righteousFuryCost", "Сдержанная ярость", "−2 ярости к стоимости «Праведной ярости» за ранг", 2, "righteousFury", 3)
    ] },
    { id: "resolve", name: "Стойкость и ярость", nodes: [
      upgradeNode("wHp", "Здоровье", "+15 к максимуму HP воина", 15, 10, upgradeStat("wHp", 15)),
      upgradeNode("wArmor", "Закалённая броня", "−4% к получаемому воином урону", 90, 4, upgradeStat("wArmor", 0.04), "wHp", 3),
      masteryNode("wBossGuard", "Стойкость ветерана", "Снижает урон от специальных атак боссов по воину на 5% за ранг, до 15%", 850, upgradeStat("wBossGuard", 0.05), "wArmor", 4),
      upgradeNode("wRageKill", "Жажда боя", "+4 ярости за убийство врага отрядом", 68, 4, upgradeStat("wRageKill", 4), "wHp"),
      upgradeNode("wRageRegen", "Боевой пыл", "+1 ярости в секунду в бою", 110, 3, upgradeStat("wRageRegen", 1), "wRageKill", 2)
    ] }
  ] },
  priest: { name: "Жрица", branches: [
    { id: "light", name: "Лечение", nodes: [
      activeNode("heal", "Лечение", "Доступно с начала игры. Восстанавливает 25 ОЗ за 4 маны. ЛКМ включает авто, перетаскивание выбирает цель"),
      upgradeNode("healPow", "Сила света", "+8 к лечению", 17, 10, upgradeStat("healPow", 8), "heal"),
      masteryNode("healBarrier", "Последний свет", "«Лечение» цели с ОЗ ниже 35% даёт ей щит на 3 с. Щит поглощает 8 ОЗ урона за ранг, до 24. Щиты не складываются", 900, upgradeStat("healBarrier", 8), "healPow", 10),
      upgradeNode("healHaste", "Быстрая молитва", "−0,65 с к перезарядке лечения", 75, 4, upgradeStat("healHaste", 0.65), "healPow", 3),
      costReduction("healCost", "Тихая молитва", "−1 маны к стоимости лечения", 1, "healPow"),
      upgradeNode("pCrit", "Благодать", "+3 п. п. к шансу крита лечения и фаербола. Крит усиливает заклинание до 150%. Базовый шанс 5%, после прокачки 20%", 85, 5, upgradeStat("pCrit", 0.03), "healPow", 2),
      upgradeNode("healWard", "Покров света", "Лечение даёт −14% входящего урона на 1,25 с за уровень", 85, 4, upgradeStat("healWard", 1.25), "healHaste"),
      upgradeNode("healOverflow", "Экстренная помощь", "+8 к лечению цели с 35% HP или меньше", 65, 4, upgradeStat("healOverflow", 8), "healPow", 2),
      activeNode("massHeal", "Массовое восстановление", "Лечит каждого живого героя на 50 ОЗ. 18 маны, перезарядка 24 с. Авто срабатывает, когда двое или больше героев суммарно потеряли от 50 ОЗ", "healPow", 3),
      { ...upgradeNode("massHealPower", "Изобилие света", "+10 ОЗ каждому герою от «Массового восстановления»", [800, 3], 3, upgradeStat("massHealPower", 10), "massHeal"), prices: [800, 2400, 5800] },
      costReduction("massHealCost", "Милость света", "−3 маны к стоимости «Массового восстановления»", 3, "massHeal"),
      upgradeNode("massHealHaste", "Ясная молитва", "−2,5 с к перезарядке «Массового восстановления»", [220, 1.84], 3, upgradeStat("massHealHaste", 2.5), "massHeal")
    ] },
    { id: "flame", name: "Фаербол", nodes: [
      activeNode("fireball", "Фаербол", "20 урона за 3 маны. Перезарядка 4,2 с"),
      upgradeNode("fireDmg", "Раскалённое ядро", "+4 к урону фаербола", 65, 5, upgradeStat("fireDmg", 4), "fireball"),
      masteryNode("fireDmgMastery", "Белое пламя", "+8 к урону фаербола по основной цели за ранг", 800, upgradeStat("fireDmg", 8), "fireDmg", 5),
      upgradeNode("fireballHaste", "Беглое пламя", "−0,3 с к перезарядке фаербола", 70, 4, upgradeStat("fireballHaste", 0.30), "fireDmg"),
      costReduction("fireballCost", "Малая искра", "−1 маны к стоимости фаербола", 1, "fireDmg"),
      upgradeNode("fireballBlast", "Огненная волна", "+3 урона соседним врагам при попадании фаербола", 90, 4, upgradeStat("fireballBlast", 3), "fireDmg", 2),
      activeNode("fireTornado", "Огненный смерч", "После каста 2,8 с движется в сторону выбранной цели до края комнаты и наносит 100 урона каждому врагу на пути. 20 маны, перезарядка 22 с", "fireDmg", 2),
      upgradeNode("fireTornadoDamage", "Пылающий вихрь", "+8 урона «Огненному смерчу»", [180, 1.66], 4, upgradeStat("fireTornadoDamage", 8), "fireTornado"),
      costReduction("fireTornadoCost", "Тлеющий поток", "−2 маны к стоимости «Огненного смерча»", 2, "fireTornado"),
      upgradeNode("fireTornadoHaste", "Цикл пламени", "−2 с к перезарядке «Огненного смерча»", [185, 1.84], 3, upgradeStat("fireTornadoHaste", 2), "fireTornado")
    ] },
    { id: "purification", name: "Очищение", nodes: [
      activeNode("dispel", "Рассеять негативное заклинание", "Снимает один негативный эффект с героя. С противника снимает каменную форму или огненный плащ и прерывает окаменение. В автоиспользовании в приоритете герои. 10 маны, перезарядка 12 с"),
      costReduction("dispelCost", "Экономное очищение", "−2 маны к стоимости рассеивания", 2, "dispel"),
      upgradeNode("dispelHaste", "Быстрое очищение", "−1,5 с к перезарядке рассеивания", 110, 3, upgradeStat("dispelHaste", 1.5), "dispel")
    ] },
    { id: "mana", name: "Мана", nodes: [
      upgradeNode("fireballUnlock", "Глубокий резерв", "+20 к запасу маны жрицы", 230, 1, upgradeStat("manaPool", 20)),
      upgradeNode("manaPool", "Резерв маны", "+10 к максимуму маны", [145, 1.85], 5, upgradeStat("manaPool", 10), "fireballUnlock"),
      upgradeNode("manaRegen", "Поток маны", "−0,5 с к интервалу восстановления маны", 190, 3, upgradeStat("manaRegen", -0.5), "manaPool", 2),
      upgradeNode("manaOnKill", "Сбор искр", "+1 маны жрице за убийство врага отрядом", 110, 3, upgradeStat("manaOnKill", 1), "fireballUnlock"),
      upgradeNode("manaOnRoom", "Глоток эфира", "+2 маны при входе в комнату", 85, 4, upgradeStat("manaOnRoom", 2), "manaOnKill")
    ] },
    { id: "alchemy", name: "Зелья", nodes: [
      upgradeNode("potionStock", "Зелье лечения", "+1 зелье на старте рейда за уровень при экипировке", [60, 1.65], 5, { unlockSkill: "potion", unlockAt: 1, ...upgradeStat("potionStock", 1) }),
      upgradeNode("potionLuck", "Зельеварение", "+2 п. п. к шансу выпадения зелий с обычных врагов за ранг. Базовый шанс — 4%, максимум — 10%", 105, 3, upgradeStat("potionLuck", 0.02), "potionStock"),
      upgradeNode("potionStr", "Крепкие зелья", "+20 HP к лечению зельем", 120, 3, upgradeStat("potionStr", 20), "potionLuck", 2),
      upgradeNode("pHp", "Живая вода", "+12 к максимуму HP жрицы", 80, 4, upgradeStat("pHp", 12), "potionStock"),
      upgradeNode("potionSquadHeal", "Целебные пары", "Зелье восстанавливает ещё по 5 HP другим живым героям", 150, 3, upgradeStat("potionSquadHeal", 5), "potionStr")
    ] }
  ] },
  ranger: { name: "Лучник", branches: [
    { id: "shoot", name: "Стрельба", nodes: [
      upgradeNode("rDmg", "Урон стрел", "+1,5 к урону автоатаки", 17, 10, upgradeStat("rDmg", 1.5)),
      upgradeNode("rCrit", "Острый глаз", "+3 п. п. к шансу крита всеми стрелами. Крит наносит 150% урона. Базовый шанс 10%, после прокачки 25%", 95, 5, upgradeStat("rCrit", 0.03), "rDmg", 2),
      upgradeNode("rSpeed", "Скорость атаки", "−5% от базового интервала автоатаки", 48, 10, upgradeStat("rSpeed", -0.05)),
      upgradeNode("rHp", "Сноровка разведчика", "+12 к максимуму HP лучника", 58, 4, upgradeStat("rHp", 12), "rSpeed", 2),
      masteryNode("rAreaGuard", "Полевое укрытие", "Лучник получает на 5% меньше урона от волн и других атак по области за ранг, до 15%", 700, upgradeStat("rAreaGuard", 0.05), "rHp", 4)
    ] },
    { id: "volley", name: "Мультивыстрел", nodes: [
      activeNode("multishot", "Мультивыстрел", "В авто заменяет обычный выстрел тремя стрелами по 60% урона за 10 фокуса. В этом режиме регенерация фокуса вдвое медленнее, за убийства начисляется 20% фокуса"),
      upgradeNode("rFan", "Усиленный залп", "+2 п. п. урона каждой стрелы залпа от урона автоатаки", 65, 4, upgradeStat("rFan", 1), "multishot"),
      upgradeNode("multishotHaste", "Мерный залп", "+0,2 фокуса в секунду при включённом «Мультивыстреле»", 85, 4, upgradeStat("multishotHaste", 0.2), "multishot"),
      upgradeNode("multishotCost", "Отточенный залп", "+1 фокус за убийство врага отрядом при включённом «Мультивыстреле»", [125, 2.1], 3, upgradeStat("multishotKillFocus", 1), "multishot"),
      upgradeNode("rExtraArrow", "Плотный залп", "+3 п. п. урона стрелам залпа от урона автоатаки, если они летят в одну и ту же цель", 74, 2, upgradeStat("rExtraArrow", 1), "rFan", 2)
    ] },
    { id: "aim", name: "Меткий выстрел", nodes: [
      activeNode("preciseShot", "Меткий выстрел", "50 урона за 60 фокуса. Перезарядка 8 с. В авто стреляет по ближайшему врагу и имеет приоритет над «Мультивыстрелом»"),
      upgradeNode("rPrecision", "Пробивная стрела", "+10 к урону «Меткого выстрела»", 72, 4, upgradeStat("rPrecision", 10), "preciseShot"),
      masteryNode("rPrecisionMastery", "Стрела возмездия", "+15 к базовому урону «Меткого выстрела» за ранг", 750, upgradeStat("rPrecision", 15), "rPrecision", 4),
      upgradeNode("preciseShotHaste", "Мгновенный прицел", "−0,8 с к перезарядке «Меткого выстрела»", 85, 4, upgradeStat("preciseShotHaste", 0.8), "preciseShot"),
      costReduction("preciseShotCost", "Выверенный бросок", "−5 фокуса к стоимости «Меткого выстрела»", 5, "preciseShot", 3),
      upgradeNode("preciseBoss", "Охотник на великанов", "+15% урона «Меткого выстрела» по боссам", 95, 4, upgradeStat("preciseBoss", 0.15), "rPrecision", 2)
    ] },
    { id: "focus", name: "Фокус", nodes: [
      upgradeNode("rFocusKill", "Добыча охотника", "+4 фокуса за убийство врага отрядом", 70, 4, upgradeStat("rFocusKill", 4)),
      upgradeNode("rFocusRegen", "Сосредоточение", "+1 фокуса в секунду в бою", 110, 3, upgradeStat("rFocusRegen", 1), "rFocusKill", 2)
    ] },
    { id: "traps", name: "Мастер ловушек", nodes: [
      activeNode("bomb", "Бомба", "Одна бомба на старте забега при экипировке. Перетащите на поле. Базовый урон — 38, радиус — 118"),
      upgradeNode("bombStock", "Запас бомб", "+1 бомба на старте рейда за ранг", 95, 4, upgradeStat("bombStock", 1), "bomb"),
      upgradeNode("bombDamage", "Мощный заряд", "+8 к урону бомбы за ранг", 110, 4, upgradeStat("bombDamage", 8), "bomb"),
      upgradeNode("bombRadius", "Широкий взрыв", "+18 к радиусу взрыва за ранг", 90, 4, upgradeStat("bombRadius", 18), "bomb"),
      activeNode("noiseBomb", "Шумовая бомба", "Одна бомба на старте рейда при экипировке. В радиусе 118 прерывает касты и оглушает обычных врагов на 3 с без урона. Краг невосприимчив", "bomb"),
      upgradeNode("noiseBombStock", "Запас шумовых бомб", "+1 шумовая бомба на старте рейда за ранг", 95, 3, upgradeStat("noiseBombStock", 1), "noiseBomb"),
      upgradeNode("noiseBombRadius", "Звуковая волна", "+18 к радиусу шумовой бомбы за ранг", 90, 3, upgradeStat("noiseBombRadius", 18), "noiseBomb"),
      upgradeNode("noiseBombStun", "Оглушительный хлопок", "+1 с к оглушению за ранг, до 5 с", 140, 2, upgradeStat("noiseBombStun", 1), "noiseBomb")
    ] }
  ] },
  raid: { name: "Рейд", branches: [
    { id: "bounty", name: "Трофеи", nodes: [
      upgradeNode("raidCoins", "Горсть монет", "+8% к базовой награде с обычных врагов. Доли монет суммируются за рейд", 70, 5, upgradeStat("raidCoins", 8)),
      upgradeNode("bossCoins", "Награда за босса", "+3 монеты из босса", 35, 4, upgradeStat("bossCoins", 3), "raidCoins", 2),
      upgradeNode("chestCoins", "Находка в сундуке", "+6 монет в сундуке за первую победу", 18, 3, upgradeStat("chestCoins", 6), "raidCoins")
    ] },
    { id: "contract", name: "Оплата за рейд", nodes: [
      upgradeNode("roomCoins", "Плата за зачистку", "+1 монета сразу после зачистки обычной боевой комнаты", 62, 4, upgradeStat("roomCoins", 1)),
      upgradeNode("raidVictoryCoins", "Премия за победу", "+5 монет за завершённый победой рейд", 55, 4, upgradeStat("raidVictoryCoins", 5), "roomCoins", 2)
    ] },
    { id: "pickup", name: "Подбор", nodes: [
      upgradeNode("lootReach", "Длинные руки", "+12 к радиусу подбора монет и зелий. Радиус подбора зелий действует и после открытия автоподбора монет", 35, 4, upgradeStat("lootReach", 12)),
      upgradeNode("autoCoins", "Автоподбор монет", "Осевшие на пол монеты автоматически идут в добычу рейда", 180, 1, upgradeStat("autoCoins", 1), "lootReach", 4)
    ] },
    { id: "loadout", name: "Снаряжение", nodes: [
      upgradeNode("panelSlots", "Дополнительный слот", "+1 ячейка на панели навыков за ранг. Максимум — 10 ячеек", [120, 1.55], 5, upgradeStat("panelSlots", 1))
    ] }
  ] }
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DWR.SKILL_TREES;
