// Headless smoke-тест симуляции боя (Node): грузит config/state/sim с моком window.
// Запуск из prototype: node test/sim-smoke.js
"use strict";
global.window = global;
require("../js/config.js");
require("../js/state.js");
require("../js/sim.js");

const S = DWR.Sim;
let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures++;
}

// --- 1. Комната 1 с нулевой прокачкой: зачистка без смертей ---
let run = S.createRun();
S.spawnRoom(run, 0);
let t = 0;
while (!run.over && S.inBattle(run) && t < 120) { S.tick(run, 0.016); t += 0.016; }
check("room1: враги мертвы", !S.inBattle(run));
check("room1: нет смертей героев", run.heroOrder.every(id => run.heroes[id].alive));
check("room1: время боя в разумных пределах (<20 c)", t < 20);
check("room1: ярость/фокус выросли за убийства", run.heroes.warrior.rage >= 50 && run.heroes.ranger.focus >= 50);

// --- 2. Ресурсы не растут вне боя ---
const rageBefore = run.heroes.warrior.rage;
for (let i = 0; i < 60; i++) S.tick(run, 0.016);
check("вне боя ярость не растёт", run.heroes.warrior.rage === rageBefore);

// --- 3. Полный автопрогон 5 боевых комнат подряд: без прокачки ожидаем вайп ---
run = S.createRun();
let wipeRoom = 0, cleared = 0;
for (let room = 0; room < 5 && !run.over; room++) {
  S.spawnRoom(run, room);
  let tt = 0;
  while (!run.over && S.inBattle(run) && tt < 120) { S.tick(run, 0.016); tt += 0.016; }
  if (run.over) wipeRoom = room + 1; else cleared++;
}
console.log("  автопрогон: зачищено комнат " + cleared + ", вайп на комнате " + (wipeRoom || "-"));
check("без прокачки случается вайп (стена есть)", run.over === "wipe");

// --- 4. Прокачанный отряд проходит все комнаты ---
DWR.State.data.panel[1] = "block";
DWR.State.data.panel[2] = "powerStrike";
Object.assign(DWR.State.data.upgrades, { block: 1, powerStrike: 1 });
run = S.createRun();
DWR.State.reset();
// имитируем купленные узлы: урон/HP воина, урон/скорость лучника, лечение, блок+мощный удар, фаербол+мана
run.stats = { wDmg: 20, wHp: 150, healPow: 56, manaPool: 20, manaRegen: -1.5,
  potionLuck: 0.25, potionStr: 60, rDmg: 15, rSpeed: -1.0, blockDur: 3 };
run.heroes.warrior.dmg += 20; run.heroes.warrior.maxHp += 150; run.heroes.warrior.hp += 150;
run.heroes.ranger.dmg += 15; run.heroes.ranger.interval = Math.max(0.35, 1.2 * 0);
run.heroes.priest.heal += 56;
run.heroes.priest.manaMax = 20; run.heroes.priest.mana = 20;
let allClear = true;
for (let room = 0; room < 6 && !run.over; room++) {
  S.spawnRoom(run, room);
  let tt = 0;
  while (!run.over && S.inBattle(run) && tt < 180) {
    S.tick(run, 0.016); tt += 0.016;
    // простое автоиспользование: блок и мощный удар по возможности
    if (S.inBattle(run) && run.heroes.warrior.rage >= 90) {
      S.useInstant(run, "block");
      const e = S.nearestEnemy(run, run.heroes.warrior.x);
      if (e) S.useTargeted(run, "powerStrike", e.uid);
    }
  }
  if (run.over) { allClear = false; console.log("  вайп на комнате " + (room + 1)); break; }
}
check("прокачанный отряд проходит 6 комнат включая босса", allClear && !run.over);

// --- 5. Зелья ---
run = S.createRun();
run.potionsLeft = 2;
check("зелье при полном HP запрещено", S.usePotion(run, "warrior") === "full");
run.heroes.warrior.hp = 10;
check("зелье лечит", S.usePotion(run, "warrior") === true && run.heroes.warrior.hp === 50);
check("запас уменьшился", run.potionsLeft === 1);

// --- 6. Самостоятельные навыки жрицы, мана и раздельная перезарядка ---
run = S.createRun();
S.spawnRoom(run, 0);
const { priest, ranger, warrior } = run.heroes;
const { heal, fireball } = DWR.CONFIG.skills;
// Выключаем прочий урон в комнате, чтобы проверять время и расход заклинаний.
for (const unit of [warrior, ranger, ...run.enemies]) unit.atkT = 100;
check("жрица начинает рейд с маной и автолечением", priest.mana === priest.manaMax && priest.mana > 0 && run.autoSkills.has("heal"));
check("лечение открыто с начала, фаербол закрыт", DWR.State.nodeCount("heal") === 1 && !DWR.State.hasSkill("fireball"));
warrior.hp -= 6;
ranger.hp -= 2;
S.tick(run, 0.05);
check("лечение выбирает меньшее текущее HP и тратит ману",
  ranger.hp === ranger.maxHp && warrior.hp === warrior.maxHp - 6 && priest.mana === priest.manaMax - heal.cost);
check("лечение уходит на перезарядку", S.skillStatus(run, "heal").left === DWR.CONFIG.heroes.priest.healCD);
check("руна открывает фаербол и ставит его в свободный слот", DWR.State.buyNode("fireball") &&
  DWR.State.data.runes === 0 && DWR.State.data.panel[1] === "fireball" && !DWR.State.nodeBuyable("fireball"));
run.equipped.add("fireball");
S.setAuto(run, "fireball", true);
S.tick(run, heal.animation);
check("автофаербол тратит ману", priest.mana === priest.manaMax - heal.cost - fireball.cost &&
  run.attacks.some(shot => shot.kind === "fire") && S.skillStatus(run, "fireball").left === fireball.cooldown);
S.setAuto(run, "fireball", false);
S.setAuto(run, "fireball", true);
S.tick(run, 1);
check("переключение авто не сбрасывает перезарядку", S.skillStatus(run, "fireball").left === fireball.cooldown - 1 &&
  S.skillStatus(run, "heal").left < DWR.CONFIG.heroes.priest.healCD && !run.attacks.some(shot => shot.kind === "fire"));
S.tick(run, S.skillStatus(run, "fireball").left + 0.05);
check("следующий фаербол только после истечения кулдауна", run.attacks.some(shot => shot.kind === "fire"));

run = S.createRun();
S.spawnRoom(run, 0);
S.setAuto(run, "fireball", true);
const balanced = run.heroes.priest;
balanced.mana = heal.cost + fireball.cost - 1;
S.tick(run, 0.05);
check("при двух автонавыках сохраняется резерв одного лечения", !run.attacks.some(shot => shot.kind === "fire") &&
  balanced.mana >= heal.cost);
balanced.mana++;
run.heroes.warrior.hp--;
S.tick(run, 0.05);
check("авто сначала лечит, если доступны оба заклинания", run.heroes.warrior.hp === run.heroes.warrior.maxHp &&
  balanced.mana === fireball.cost && !run.attacks.some(shot => shot.kind === "fire"));

run = S.createRun();
S.setAuto(run, "heal", false);
run.heroes.warrior.hp = 60;
check("ручное лечение выбирает указанного союзника", S.useHeal(run, "warrior") === true &&
  run.heroes.warrior.hp > 60 && run.heroes.priest.mana === run.heroes.priest.manaMax - heal.cost);

// --- 7. Мощный удар в ручном и автоматическом режиме ---
DWR.State.data.upgrades.powerStrike = 1;
DWR.State.data.panel[1] = "powerStrike";
run = S.createRun();
S.spawnRoom(run, 3);
const swordsman = run.heroes.warrior;
const [farEnemy, meleeEnemy, nearEnemy] = run.enemies;
const strike = DWR.CONFIG.skills.powerStrike;
// Ближайшая цель стоит после дальней. Остальные атаки и крит исключены из проверки.
meleeEnemy.alive = false;
farEnemy.x = swordsman.x + 132;
nearEnemy.x = swordsman.x + 106;
farEnemy.hp = nearEnemy.hp = 100;
for (const unit of [run.heroes.ranger, farEnemy, nearEnemy]) unit.atkT = 100;
swordsman.critChance = 0;
check("мощный удар по умолчанию ручной", !run.autoSkills.has("powerStrike"));
check("мощный удар без ярости не срабатывает", S.useTargeted(run, "powerStrike", nearEnemy.uid) === false);
S.setAuto(run, "powerStrike", true);
swordsman.atkT = 0;
S.tick(run, 0);
check("при нехватке ярости авто оставляет обычный удар", run.attacks.length === 1 && run.attacks[0].kind === "sword");
swordsman.rage = strike.cost;
check("в авторежиме ручное наведение отключено", !S.useTargeted(run, "powerStrike", farEnemy.uid));
S.tick(run, swordsman.interval);
check("авто заменяет обычный удар мощным по ближайшему и тратит ярость",
  run.attacks.length === 1 && run.attacks[0].kind === "powerStrike" && run.attacks[0].target === nearEnemy &&
  swordsman.rage === DWR.CONFIG.resources.rage.regenPerSec * swordsman.interval &&
  S.skillStatus(run, "powerStrike").left === strike.cooldown);
S.tick(run, swordsman.interval);
check("при перезарядке возвращается обычный удар",
  nearEnemy.hp === 100 - swordsman.dmg - strike.dmg && farEnemy.hp === 100 &&
  run.attacks.length === 1 && run.attacks[0].kind === "sword");
S.setAuto(run, "powerStrike", false);
run.skillCooldowns.delete("powerStrike");
swordsman.rage = strike.cost;
check("ручной удар по выбранному врагу заменяет текущий замах",
  S.useTargeted(run, "powerStrike", farEnemy.uid) && run.attacks.length === 1 && run.attacks[0].target === farEnemy);

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nПРОВАЛОВ: " + failures);
process.exit(failures === 0 ? 0 : 1);
