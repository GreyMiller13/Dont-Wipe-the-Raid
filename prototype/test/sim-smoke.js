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
run = S.createRun();
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

// --- 6. Режимы жрицы, мана и раздельная перезарядка ---
run = S.createRun();
S.spawnRoom(run, 0);
const { priest, ranger, warrior } = run.heroes;
const { heal, fireball } = DWR.CONFIG.priestSpells;
// Выключаем прочий урон в комнате, чтобы проверять время и расход заклинаний.
for (const unit of [warrior, ranger, ...run.enemies]) unit.atkT = 100;
check("жрица начинает рейд с маной и режимом лечения", priest.mana === priest.manaMax && priest.mana > 0 && run.priestMode === "heal");
check("переключатель жрицы доступен без покупок", DWR.State.hasSkill("fireball"));
warrior.hp -= 6;
ranger.hp -= 2;
S.tick(run, 0.05);
check("лечение выбирает меньшее текущее HP и тратит ману",
  ranger.hp === ranger.maxHp && warrior.hp === warrior.maxHp - 6 && priest.mana === priest.manaMax - heal.cost);
check("лечение уходит на перезарядку", S.priestSpellStatus(run, "heal").left === priest.healCD);
check("Лечение → Атака", S.cyclePriestMode(run) && run.priestMode === "attack");
S.tick(run, heal.animation);
check("фаербол доступен в первом рейде и тратит ману", priest.mana === priest.manaMax - heal.cost - fireball.cost &&
  run.attacks.some(shot => shot.kind === "fire") && priest.fireballT === fireball.cooldown);
check("Атака → Баланс → Лечение → Атака", S.cyclePriestMode(run) && run.priestMode === "balance" &&
  S.cyclePriestMode(run) && run.priestMode === "heal" && S.cyclePriestMode(run) && run.priestMode === "attack");
S.tick(run, 1);
check("смена режима не сбрасывает кулдауны заклинаний", priest.fireballT === fireball.cooldown - 1 &&
  priest.healT < priest.healCD && !run.attacks.some(shot => shot.kind === "fire"));
S.tick(run, priest.fireballT + 0.05);
check("следующий фаербол только после истечения кулдауна", run.attacks.some(shot => shot.kind === "fire"));

run = S.createRun();
S.spawnRoom(run, 0);
S.cyclePriestMode(run);
S.cyclePriestMode(run);
const balanced = run.heroes.priest;
balanced.mana = heal.cost + fireball.cost - 1;
S.tick(run, 0.05);
check("Баланс сохраняет резерв одного лечения", !run.attacks.some(shot => shot.kind === "fire") &&
  balanced.mana >= heal.cost && !S.priestSpellStatus(run, "fireball").canPay);
balanced.mana++;
run.heroes.warrior.hp--;
S.tick(run, 0.05);
check("Баланс сначала лечит, если оба заклинания доступны", run.heroes.warrior.hp === run.heroes.warrior.maxHp &&
  balanced.mana === fireball.cost && !run.attacks.some(shot => shot.kind === "fire"));

// --- 7. Прицельный навык без ресурса ---
run = S.createRun();
S.spawnRoom(run, 0);
const e0 = S.nearestEnemy(run, run.heroes.warrior.x);
check("мощный удар без ярости не срабатывает", S.useTargeted(run, "powerStrike", e0.uid) === false);

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nПРОВАЛОВ: " + failures);
process.exit(failures === 0 ? 0 : 1);
