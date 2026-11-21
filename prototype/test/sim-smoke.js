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

// --- 8. Кузня — броня, независимый каст, волна и эффекты ---
const forge = DWR.CONFIG.locations.forge;
const bossRoom = forge.rooms.at(-1);
const spec = DWR.CONFIG.enemies.krag;
const near = (left, right) => Math.abs(left - right) < 1e-7;
function stepFor(run, duration) {
  for (let remaining = duration; remaining > 1e-9;) {
    const dt = Math.min(0.025, remaining);
    S.tick(run, dt);
    remaining -= dt;
  }
}
function prepareForge(room) {
  const run = S.createRun();
  S.spawnRoom(run, room);
  run.autoSkills.clear();
  for (const hero of Object.values(run.heroes)) { hero.atkT = 1e6; hero.critChance = 0; }
  for (const enemy of run.enemies) {
    enemy.x = run.heroes.warrior.x + (enemy.def.stopRange ?? 400) + enemy.lane;
    enemy.atkT = 1e6;
    enemy.walking = false;
  }
  return run;
}
function strikeFor(run, target, damage) {
  run.heroes.warrior.rage = strike.cost;
  run.stats.wStrike = damage - strike.dmg;
  run.skillCooldowns.delete("powerStrike");
  return S.useTargeted(run, "powerStrike", target.uid);
}
check("кузня содержит 12 боевых комнат и отдельную сокровищницу",
  forge.rooms.length === 12 && DWR.CONFIG.rooms[bossRoom].boss && DWR.CONFIG.rooms[forge.treasure].chest);

run = prepareForge(bossRoom);
let krag = run.enemies[0];
stepFor(run, 14.95);
check("Краг не кастует горн до 15-й секунды", !krag.furnaceCast);
stepFor(run, 0.05);
check("на 15-й секунде начинается каст с порогом в 300 урона", krag.furnaceCast?.remaining === 300);
const tankAtForge = run.heroes.warrior;
krag.atkT = 0;
stepFor(run, 0.075);
check("Краг продолжает обычную атаку во время каста",
  krag.furnaceCast && tankAtForge.hp === tankAtForge.maxHp - Math.round(krag.dmg) && !krag.attack.stunning);
krag.atkT = 1e6;
strikeFor(run, krag, 299);
stepFor(run, 0.75);
check("299 урона по броне оставляют единицу до прерывания",
  krag.furnaceCast?.remaining === 1 && krag.hp === spec.hp && krag.armor === spec.armor - 299);
strikeFor(run, krag, 1);
stepFor(run, 0.75);
check("300 урона срывают каст без выпуска волны", !krag.furnaceCast && !run.groundWaves.length);
strikeFor(run, krag, 100);
stepFor(run, 0.75);
check("броня поглощает разбивший её удар и включает ярость",
  krag.armor === 0 && krag.hp === spec.hp && krag.effects.has("kragRage"));
strikeFor(run, krag, 40);
stepFor(run, 0.75);
check("последующие удары снимают здоровье Крага", krag.hp === spec.hp - 40);
krag.atkT = 1.4;
krag.stunStrikeT = 1e6;
const healthBeforeHammer = tankAtForge.hp;
stepFor(run, 0.725);
check("в ярости интервал и обычный урон отличаются в два раза",
  tankAtForge.hp === healthBeforeHammer - Math.round(krag.dmg * 2) && krag.atkT > 2.65);

run = prepareForge(bossRoom);
krag = run.enemies[0];
stepFor(run, 19.975);
check("выброс не выпускает волну до завершения пяти секунд", krag.furnaceCast && !run.groundWaves.length);
stepFor(run, 0.025);
check("по окончании каста возникает огненная волна", !krag.furnaceCast && run.groundWaves[0]?.kind === "furnace");
stepFor(run, 1.55);
check("огненная волна поджигает всех живых героев", run.heroOrder.every(id => run.heroes[id].effects.has("burning")));
stepFor(run, 5);
check("горение снимает ровно 25% максимального здоровья за пять тиков",
  run.heroOrder.every(id => near(run.heroes[id].hp, run.heroes[id].maxHp * 0.75)) && !S.hasHeroDamageEffect(run));
const frozenPriest = run.heroes.priest;
krag.furnaceT = 1e6;
S.applyStatus(frozenPriest, "frozen");
stepFor(run, 10);
check("заморозка лича сохраняет десять тиков по 5%", near(frozenPriest.hp, frozenPriest.maxHp * 0.25) &&
  !frozenPriest.effects.has("frozen") && run.fx.some(fx => fx.type === "thaw"));

const beforeRandom = Math.random;
try {
  Math.random = () => 0.99;
  run = prepareForge(bossRoom);
  krag = run.enemies[0];
  krag.stunStrikeT = 0;
  krag.atkT = 0;
  stepFor(run, 0.025);
  check("оглушающий молот Крага может выбрать лучника", run.heroes.ranger.effects.has("stunned") &&
    run.heroes.warrior.hp === run.heroes.warrior.maxHp);

  const mixedRoom = forge.rooms.find(index => DWR.CONFIG.rooms[index].enemies.length === 3 &&
    DWR.CONFIG.rooms[index].enemies.includes("orc-axe") && DWR.CONFIG.rooms[index].enemies.includes("orc-firebolt"));
  run = prepareForge(mixedRoom);
  const [shield, axeman, shooter] = run.enemies;
  axeman.atkT = axeman.buffT = 0;
  stepFor(run, 0.025);
  check("клич усиливает всех живых орков, включая заклинателя", run.enemies.every(orc => orc.effects.has("orcWarCry")));
  const rear = run.heroes.ranger;
  shooter.atkT = 0;
  stepFor(run, 0.025);
  check("болт летит в тыл и накладывает ожог только при попадании",
    run.attacks.some(shot => shot.kind === "firebolt" && shot.target === rear) && !rear.effects.has("ember"));
  stepFor(run, 0.45);
  check("клич повышает урон болта, ожог появляется на выбранном герое",
    rear.effects.has("ember") && rear.hp === rear.maxHp - Math.round(shooter.dmg * 1.25));
  check("клич на 25% ускоряет цикл атаки", near(shooter.atkT, shooter.interval - 0.45 * 1.25));

  Math.random = () => 0;
  const target = run.heroes.warrior;
  axeman.atkT = 0;
  stepFor(run, 0.05);
  const afterAxe = target.hp;
  check("топор может наложить кровотечение при ударе", target.effects.has("bleeding"));
  for (const e of run.enemies) e.atkT = 1e6;
  stepFor(run, 7);
  check("кровотечение наносит семь тиков по 3% максимального здоровья",
    near(target.hp, afterAxe - target.maxHp * 0.21) && !target.effects.has("bleeding"));

  shield.guardT = shield.atkT = 0;
  stepFor(run, 0.025);
  const shieldHp = shield.hp;
  strikeFor(run, shield, 50);
  stepFor(run, 0.75);
  check("поднятый щит поглощает 60% урона", shield.effects.has("orcGuard") && near(shield.hp, shieldHp - 20));
  stepFor(run, 2.25);
  check("после опускания щита орк открывается для удара", shield.effects.has("orcExposed"));
} finally {
  Math.random = beforeRandom;
}

// --- 9. Новые навыки, запасы и порядок автоатак ---
const State = DWR.State, skills = DWR.CONFIG.skills;
State.reset();
State.data.coins = 20000;
State.data.runes = 9;
check("новые навыки зависят от своих веток", !State.nodeUnlocked("massHeal") && !State.nodeUnlocked("fireTornado") &&
  !State.nodeUnlocked("sacrifice") && !State.nodeUnlocked("bombStock"));
for (const id of ["healPow", "healPow", "healPow", "fireball", "fireDmg", "fireDmg", "block"]) State.buyNode(id);
const newSkills = ["dispel", "massHeal", "fireTornado", "sacrifice", "bomb"];
check("новые активные навыки открываются за руну одним рангом", newSkills.every(id => State.nodeCurrency(id) === "runes" &&
  State.nodePrice(id) === 1 && State.buyNode(id) && State.hasSkill(id) && !State.nodeBuyable(id)) && State.data.runes === 2);
check("усиление массового лечения дорогое и оплачивается монетами", State.nodeCurrency("massHealPower") === "coins" &&
  State.nodePrice("massHealPower") === 800);
State.buyNode("bombStock");
check("бомбы из библиотеки не берутся в рейд", !State.data.panel.includes("bomb") && S.createRun().bombsLeft === 0);
State.buyNode("preciseShot");
State.buyNode("multishot");
State.data.panel = [...newSkills, "preciseShot", "multishot"];
const rangedRoom = forge.rooms[3];

run = prepareForge(rangedRoom);
const caster = run.heroes.priest, chosen = run.heroes.ranger;
check("рассеивание не тратится на героя без дебаффов", S.useDispel(run, chosen.id) === "clean" && caster.mana === caster.manaMax);
S.applyStatus(chosen, "healWard", 10);
S.applyStatus(chosen, "burning");
S.applyStatus(chosen, "bleeding");
check("ручное рассеивание тратит 10 маны и начинает каст", S.useDispel(run, chosen.id) && caster.mana === caster.manaMax - 10 &&
  chosen.effects.has("burning"));
stepFor(run, skills.dispel.castTime + 0.01);
check("рассеивание снимает один дебафф выбранного героя и сохраняет бафф", !chosen.effects.has("burning") &&
  chosen.effects.has("bleeding") && chosen.effects.has("healWard"));
run = prepareForge(rangedRoom);
S.setAuto(run, "dispel", true);
S.applyStatus(run.heroes.warrior, "burning");
S.applyStatus(run.heroes.ranger, "frozen");
stepFor(run, 0.4);
check("авторассеивание сначала освобождает героя от контроля", !run.heroes.ranger.effects.has("frozen") &&
  run.heroes.warrior.effects.has("burning") && run.fx.some(fx => fx.type === "thaw"));

run = prepareForge(rangedRoom);
const party = Object.values(run.heroes);
party.forEach(hero => { hero.hp = 10; });
check("массовое лечение тратит 18 маны и лечит только после каста", S.useInstant(run, "massHeal") &&
  run.heroes.priest.mana === 2 && party.every(hero => hero.hp === 10));
stepFor(run, skills.massHeal.castTime + 0.01);
check("массовое лечение восстанавливает по 50 ОЗ, в том числе жрице", party.every(hero => hero.hp === 60) &&
  run.fx.filter(fx => fx.type === "massHeal").length === 3);

run = prepareForge(rangedRoom);
const [behind, closer, farther] = run.enemies;
behind.x = run.heroes.priest.x - 30;
closer.x = 800; farther.x = 1000;
const health = run.enemies.map(enemy => enemy.hp);
S.setAuto(run, "fireTornado", true);
stepFor(run, 2);
check("автосмерч долго кастуется и расходует большой запас маны", run.heroes.priest.attackPose?.spell === "fireTornado" &&
  run.heroes.priest.mana < 3 && !run.tornadoes.length && run.enemies.every((enemy, index) => enemy.hp === health[index]));
stepFor(run, 3);
check("смерч движется вправо и поражает каждого врага на пути один раз", near(behind.hp, health[0]) &&
  near(closer.hp, health[1] - skills.fireTornado.dmg) && near(farther.hp, health[2] - skills.fireTornado.dmg) && !run.tornadoes.length);

run = prepareForge(rangedRoom);
const guardWarrior = run.heroes.warrior, fireboltOrc = run.enemies[1];
guardWarrior.rage = 100;
check("Жертвенность даёт защитнику временный эффект и долгую перезарядку", S.useInstant(run, "sacrifice") &&
  guardWarrior.effects.get("sacrifice").duration === 4 && S.skillStatus(run, "sacrifice").left === 36);
fireboltOrc.atkT = 0;
S.tick(run, 0);
const bolt = run.attacks.find(attack => attack.kind === "firebolt");
stepFor(run, bolt.flight + 1.04);
check("Жертвенность переносит прямой и периодический урон, оставляя дебафф на цели", bolt.target.hp === bolt.target.maxHp &&
  bolt.target.effects.has("ember") && near(guardWarrior.hp, guardWarrior.maxHp - Math.round(bolt.damage) - bolt.target.maxHp * 0.025));

run = prepareForge(rangedRoom);
const bombCenter = 850;
run.enemies[1].x = bombCenter;
run.enemies[2].x = bombCenter + skills.bomb.radius - 1;
const beforeBomb = run.enemies.map(enemy => enemy.hp);
check("бросок бомбы расходует один заряд, урон ждёт попадания", run.bombsLeft === 2 && S.useGround(run, "bomb", bombCenter) &&
  run.bombsLeft === 1 && run.enemies.every((enemy, i) => enemy.hp === beforeBomb[i]));
stepFor(run, skills.bomb.flight + 0.01);
check("бомба наносит урон только внутри области взрыва", run.enemies[0].hp === beforeBomb[0] &&
  run.enemies.slice(1).every((enemy, i) => enemy.hp === beforeBomb[i + 1] - skills.bomb.dmg) && S.createRun().bombsLeft === 2);

run = prepareForge(rangedRoom);
const archer = run.heroes.ranger;
archer.focus = 100; archer.atkT = 0;
S.setAuto(run, "preciseShot", true);
S.setAuto(run, "multishot", true);
S.tick(run, 0);
check("два режима авто запускают только меткий выстрел в ближайшую цель", run.attacks.length === 1 &&
  run.attacks[0].kind === "precise" && run.attacks[0].target === S.nearestEnemy(run, archer.x) && archer.focus === 40);
stepFor(run, archer.interval + 0.025);
check("на перезарядке меткого идёт только мультивыстрел", run.attacks.length === 3 && run.attacks.every(attack => attack.kind === "multi"));
S.setAuto(run, "multishot", false);
archer.atkT = 100; archer.focus = 0;
stepFor(run, 0.25);
check("меткий выстрел сам по себе не даёт штрафа к восстановлению фокуса", near(archer.focus, 0.5));
check("здоровье и базовый урон всей кузни увеличены на 20%", spec.hp === 1128 && near(spec.dmg, 21.6) &&
  DWR.CONFIG.enemies["orc-shield"].hp === 138 && near(DWR.CONFIG.enemies["orc-axe"].dmg, 19.2) &&
  near(DWR.CONFIG.enemies["orc-firebolt"].hp, 91.2));

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nПРОВАЛОВ: " + failures);
process.exit(failures === 0 ? 0 : 1);
