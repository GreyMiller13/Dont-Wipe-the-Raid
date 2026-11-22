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
const castFireball = run.attacks.find(shot => shot.kind === "fire");
check("автофаербол тратит ману, перезарядка до вылета не идёт", priest.mana === priest.manaMax - heal.cost - fireball.cost &&
  castFireball?.startX === null && S.skillStatus(run, "fireball").left === 0);
S.setAuto(run, "fireball", false);
S.setAuto(run, "fireball", true);
S.tick(run, castFireball.windup);
check("выпуск фаербола запускает полную перезарядку",
  castFireball.startX !== null && S.skillStatus(run, "fireball").left === fireball.cooldown);
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
  S.skillStatus(run, "powerStrike").left === 0 && !S.skillStatus(run, "powerStrike").ready);
S.tick(run, swordsman.interval);
check("при перезарядке возвращается обычный удар",
  nearEnemy.hp === 100 - swordsman.dmg - strike.dmg && farEnemy.hp === 100 &&
  run.attacks.length === 1 && run.attacks[0].kind === "sword" && S.skillStatus(run, "powerStrike").left === strike.cooldown);
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
check("Краг начинает бой с 720 брони", krag.armor === 720);
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
strikeFor(run, krag, spec.armor - 300 + 40);
stepFor(run, 0.75);
check("броня поглощает разбивший её удар и включает ярость",
  krag.armor === 0 && krag.hp === spec.hp && krag.effects.has("kragRage"));
strikeFor(run, krag, 40);
stepFor(run, 0.75);
check("последующие удары снимают здоровье Крага", krag.hp === spec.hp - 40);
const strikeReport = run.combatRoom.heroes.warrior.damage.powerStrike;
check("отчёт отделяет снятую броню от урона здоровью и отбрасывает лишний урон",
  strikeReport.armor === spec.armor && strikeReport.health === 40);
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
  !State.nodeUnlocked("sacrifice") && !["bombStock", "bombDamage", "bombRadius"].some(State.nodeUnlocked));
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
  run.heroes.priest.mana === 2 && party.every(hero => hero.hp === 10) && S.skillStatus(run, "massHeal").left === 0);
stepFor(run, skills.massHeal.castTime + 0.01);
check("массовое лечение восстанавливает по 50 ОЗ, в том числе жрице", party.every(hero => hero.hp === 60) &&
  run.fx.filter(fx => fx.type === "massHeal").length === 3);
check("отчёт записывает массовое лечение по источнику и всем получателям",
  run.combatRoom.heroes.priest.healing.massHeal === 150 &&
  run.heroOrder.every(id => run.combatRoom.heroes[id].healingReceived === 50));

run = prepareForge(rangedRoom);
const healingPriest = run.heroes.priest;
S.setAuto(run, "massHeal", true);
run.heroes.warrior.hp -= 40;
S.tick(run, 0);
check("автомассовое лечение ждёт ранения двух героев", !healingPriest.attackPose);
run.heroes.ranger.hp -= 10;
S.tick(run, 0);
check("автомассовое лечение начинает каст при суммарной потере 50 ОЗ", healingPriest.attackPose?.spell === "massHeal");
run.groundWaves.push({ origin: healingPriest.x, direction: -1, range: 1, distance: 0, speed: 1, stun: 1, hit: new Set() });
S.tick(run, 0);
check("оглушение прерывает массовое лечение без эффекта и перезарядки",
  !healingPriest.attackPose && healingPriest.effects.has("stunned") &&
  S.skillStatus(run, "massHeal").left === 0 && !run.fx.some(fx => fx.type === "massHeal"));

run = prepareForge(rangedRoom);
run.equipped.add("fireball");
const interruptedPriest = run.heroes.priest;
const interruptedFireball = S.useTargeted(run, "fireball", run.enemies[0].uid);
run.groundWaves.push({ origin: interruptedPriest.x, direction: -1, range: 1, distance: 0, speed: 1, stun: 1, hit: new Set() });
S.tick(run, 0);
stepFor(run, 1.05);
check("сбитый замах фаербола отменяет снаряд, перезарядка остаётся нулевой",
  interruptedFireball && !run.attacks.length && S.skillStatus(run, "fireball").ready &&
  !run.combatRoom.heroes.priest.damage.fireball);

run = prepareForge(rangedRoom);
const [behind, closer, farther] = run.enemies;
behind.x = 40;
closer.x = 560; farther.x = 1000;
closer.hp = closer.maxHp = farther.hp = farther.maxHp = 140;
const health = run.enemies.map(enemy => enemy.hp);
const castRight = S.useGround(run, "fireTornado", closer.x);
stepFor(run, 2);
check("смерч долго кастуется и расходует большой запас маны", castRight && run.heroes.priest.attackPose?.spell === "fireTornado" &&
  run.heroes.priest.mana < 3 && !run.tornadoes.length && run.enemies.every((enemy, index) => enemy.hp === health[index]));
stepFor(run, 3);
check("смерч движется вправо и наносит каждому врагу на пути 100 базового урона один раз", skills.fireTornado.dmg === 100 && near(behind.hp, health[0]) &&
  near(closer.hp, health[1] - skills.fireTornado.dmg) && near(farther.hp, health[2] - skills.fireTornado.dmg) && !run.tornadoes.length);

run = prepareForge(rangedRoom);
const rearTarget = run.enemies[0], frontTarget = run.enemies[1];
rearTarget.x = 95;
rearTarget.flanking = true;
rearTarget.hp = rearTarget.maxHp = 140;
const frontHealth = frontTarget.hp;
run.equipped.add("fireball");
S.setAuto(run, "fireball", true);
S.setAuto(run, "fireTornado", true);
run.skillCooldowns.set("fireball", skills.fireball.cooldown);
S.tick(run, 0);
check("жрица поворачивается к тыловой цели и начинает смерч, пока фаербол недоступен",
  run.heroes.priest.facing === -1 && run.heroes.priest.attackPose?.spell === "fireTornado");
stepFor(run, skills.fireTornado.castTime + 0.8);
check("смерч поражает тыловую цель и исчезает у левого края", rearTarget.hp === 40 &&
  frontTarget.hp === frontHealth && !run.tornadoes.length);

run = prepareForge(rangedRoom);
const [leftFoe, nearerFoe] = run.enemies;
leftFoe.x = 40;
nearerFoe.x = run.heroes.priest.x + 100;
const leftFoeHp = leftFoe.hp;
run.equipped.add("fireball");
S.setAuto(run, "fireball", true);
S.tick(run, 0);
check("автофаербол разворачивает жрицу к цели слева без отметки тыла, даже если враг справа ближе",
  !leftFoe.flanking && run.heroes.priest.facing === -1 &&
  run.attacks.some(shot => shot.kind === "fire" && shot.target === leftFoe && shot.facing === -1));
stepFor(run, 1);
check("фаербол поражает цель слева", leftFoe.hp < leftFoeHp);

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
guardWarrior.hp = 1;
S.spawnRoom(run, rangedRoom);
stepFor(run, 1.05);
const death = run.combatRoom.heroes.warrior.death;
check("отчёт сохраняет источник ожога между комнатами и исходную цель при Жертвенности",
  death?.enemy === "orc-firebolt" && death.ability === "ember" && death.redirectedFrom === bolt.target.id &&
  run.combatReports.length === 2 && !run.combatReports[0].heroes.warrior.death);

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

check("усиления бомбы доступны за монеты после открытия навыка",
  ["bombDamage", "bombRadius"].every(id => State.nodeCurrency(id) === "coins" && State.buyNode(id)));
run = prepareForge(rangedRoom);
const [, blastEdge, outsideBlast] = run.enemies;
const upgradedRadius = skills.bomb.radius + 18;
blastEdge.x = bombCenter + upgradedRadius;
outsideBlast.x = bombCenter + upgradedRadius + 1;
check("прокачанная бомба получает тот же радиус, что и прицел", S.bombRadius(run) === upgradedRadius &&
  S.useGround(run, "bomb", bombCenter) && run.bombThrows[0].radius === upgradedRadius);
stepFor(run, skills.bomb.flight + 0.01);
check("улучшения бомбы повышают урон и расширяют область поражения",
  blastEdge.hp === blastEdge.maxHp - skills.bomb.dmg - 8 && outsideBlast.hp === outsideBlast.maxHp &&
  run.fx.some(effect => effect.type === "bombImpact" && effect.radius === upgradedRadius));

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

// --- Крипта: ритуалы, тыловые цели и отмена каста ---
const crypt = DWR.CONFIG.locations.crypt;
const mageRoom = crypt.rooms.find(index => DWR.CONFIG.rooms[index].enemies.includes("skeletonM"));
const raiseSeconds = DWR.CONFIG.enemies.skeletonM.raise.seconds;
run = prepareForge(mageRoom);
const [corpse, secondCorpse, mage] = run.enemies;
for (const unit of [corpse, secondCorpse]) {
  unit.alive = false;
  unit.hp = 0;
}
const { warrior: cryptWarrior, ranger: cryptRanger, priest: cryptPriest } = run.heroes;
corpse.x = cryptRanger.x - 50;
run.equipped.add("powerStrike");
run.equipped.add("fireball");
S.tick(run, 0);
stepFor(run, raiseSeconds - 0.025);
check("скелет-маг готовит ритуал над одним трупом и не поднимает скелета досрочно",
  mage.ritual?.corpse === corpse && run.enemies.every(unit => !unit.reanimated));
stepFor(run, 0.025);
const raised = run.enemies.find(unit => unit.reanimated);
check("позади воина поднимается тот же тип скелета на месте гибели",
  raised?.kind === corpse.kind && raised.x === corpse.x && raised.hp === corpse.maxHp && raised.flanking && raised.noLoot);
if (raised) {
  cryptWarrior.rage = 100;
  cryptWarrior.atkT = 0;
  cryptRanger.atkT = 0;
  S.setAuto(run, "fireball", true);
  S.tick(run, 0);
  check("воин не атакует скелета в тылу, лучник и жрица разворачиваются к нему",
    !S.useTargeted(run, "powerStrike", raised.uid) && cryptWarrior.rage === 100 &&
    !run.attacks.some(attack => attack.caster === cryptWarrior && attack.target === raised) &&
    run.attacks.some(attack => attack.caster === cryptRanger && attack.target === raised && attack.facing === -1) &&
    run.attacks.some(attack => attack.caster === cryptPriest && attack.target === raised && attack.facing === -1));
  raised.appearT = 0;
  raised.atkT = 0;
  const tankHp = cryptWarrior.hp, rearHp = cryptRanger.hp;
  stepFor(run, 0.5);
  check("поднятый скелет в тылу бьёт ближайшего героя заднего ряда", cryptWarrior.hp === tankHp && cryptRanger.hp < rearHp);
}
stepFor(run, 4);
check("скелет-маг завершает не больше одного воскрешения за комнату",
  run.enemies.filter(unit => unit.reanimated).length === 1 && !secondCorpse.raised);

run = prepareForge(mageRoom);
const [cancelledCorpse, , dyingMage] = run.enemies;
cancelledCorpse.alive = false;
cancelledCorpse.hp = 0;
run.equipped.add("fireball");
dyingMage.hp = 1;
S.tick(run, 0);
const startedRaising = dyingMage.ritual?.kind === "raise";
S.useTargeted(run, "fireball", dyingMage.uid);
stepFor(run, raiseSeconds + 0.5);
check("гибель мага во время каста отменяет воскрешение", startedRaising && !dyingMage.alive &&
  !cancelledCorpse.raiseBy && run.enemies.every(unit => !unit.reanimated));

run = prepareForge(crypt.rooms.at(-1));
const lich = run.enemies[0], summon = lich.def.summon;
for (const hero of Object.values(run.heroes)) hero.hp = hero.maxHp = 1e4;
stepFor(run, summon.seconds + 0.1);
check("лич начинает бой обычным призывом мечника, лучника и мага перед отрядом",
  run.enemies.length === 4 && summon.minions.every((kind, i) => run.enemies[i + 1].kind === kind && !run.enemies[i + 1].flanking));
stepFor(run, summon.cooldown + summon.repeatSeconds + 0.1);
check("лич повторяет призыв, отправляя мечника и лучника за отряд",
  run.enemies.length === 7 && run.enemies.slice(4, 6).every(unit => unit.flanking && unit.noLoot &&
    unit.x < run.heroes.warrior.x) && run.enemies[6].kind === "skeletonM" && !run.enemies[6].flanking);
stepFor(run, summon.cooldown + summon.repeatSeconds);
check("повторные призывы ограничены числом живых скелетов", run.enemies.length === 7);
for (const unit of run.enemies.slice(1, 4)) unit.alive = false;
stepFor(run, raiseSeconds + summon.repeatSeconds + 0.75);
check("лич продолжает вызывать подкрепление после гибели предыдущих скелетов",
  run.enemies.filter(unit => unit.alive && unit.summonedBy === lich.uid).length === summon.maxActive);

run = prepareForge(crypt.rooms.at(-1));
const fleeingLich = run.enemies[0];
S.tick(run, 0);
run.equipped.add("powerStrike");
strikeFor(run, fleeingLich, fleeingLich.hp);
stepFor(run, 0.75);
check("после решающего удара лич отменяет призыв и телепортируется без события смерти",
  fleeingLich.escape && !fleeingLich.escape.finished && !fleeingLich.alive && !fleeingLich.ritual &&
  run.enemies.length === 1 && !run.events.some(event => event.type === "kill" || event.type === "bossEscaped"));
const timeToEscape = fleeingLich.def.escape.duration - (fleeingLich.escape?.elapsed ?? 0);
const frozenInCrypt = run.heroes.ranger;
S.applyStatus(frozenInCrypt, "frozen", undefined, "lich");
stepFor(run, timeToEscape - 0.025);
check("до исчезновения лича герой остаётся во льду и победа не засчитывается",
  frozenInCrypt.effects.has("frozen") && !run.events.some(event => event.type === "bossEscaped"));
stepFor(run, 0.5);
check("телепортация лича завершает бой и даёт одно событие победы",
  fleeingLich.escape?.finished && !S.inBattle(run) &&
  run.events.filter(event => event.type === "bossEscaped" && event.unit === fleeingLich).length === 1 &&
  !run.events.some(event => event.type === "kill"));
check("уход лича сразу снимает его заморозку", !frozenInCrypt.effects.has("frozen") &&
  run.fx.some(fx => fx.type === "thaw" && fx.unit === frozenInCrypt));

// --- Разворот воина, Праведная ярость и шумовые бомбы ---
run = prepareForge(0);
const turningWarrior = run.heroes.warrior, [rightTarget, leftTarget] = run.enemies;
rightTarget.x = turningWarrior.x + 190;
leftTarget.x = turningWarrior.x - 125;
leftTarget.flanking = true;
S.tick(run, 0.05);
check("воин движется вправо даже при более близком враге слева", turningWarrior.facing === 1 &&
  turningWarrior.x > DWR.CONFIG.heroes.warrior.x * DWR.CONFIG.canvas.w && !S.canWarriorTarget(run, leftTarget));
rightTarget.alive = false;
const turnX = turningWarrior.x;
turningWarrior.atkT = 0;
stepFor(run, 0.9);
check("когда справа никого нет, воин идёт влево и атакует тылового врага", turningWarrior.facing === -1 &&
  turningWarrior.x < turnX && leftTarget.hp < leftTarget.maxHp);

run = prepareForge(1);
const [unusedFoe, leftArcher] = run.enemies;
const loneWarrior = run.heroes.warrior;
unusedFoe.alive = run.heroes.priest.alive = run.heroes.ranger.alive = false;
leftArcher.x = 170.004;
loneWarrior.x = leftArcher.x + DWR.CONFIG.battle.warriorStopRange;
loneWarrior.atkT = 0;
stepFor(run, 0.8);
check("дробная координата слева не оставляет воина в ходьбе на месте",
  !loneWarrior.walking && loneWarrior.facing === -1 && leftArcher.hp < leftArcher.maxHp);

run = prepareForge(crypt.rooms.at(-1));
const frontBoss = run.enemies[0];
const { warrior: formationTank, priest: formationPriest, ranger: formationRanger } = run.heroes;
stepFor(run, frontBoss.def.summon.seconds + 0.1);
const flankingSkeleton = run.enemies[1];
frontBoss.summonT = 1e6;
for (const enemy of run.enemies.slice(2)) enemy.alive = false;
flankingSkeleton.x = formationRanger.x - 130;
flankingSkeleton.flanking = true;
flankingSkeleton.appearT = 0;
flankingSkeleton.atkT = 0;
formationTank.x = 690;
for (const hero of Object.values(run.heroes)) hero.hp = hero.maxHp = 1000;
stepFor(run, 0.8);
check("при живом боссе тыловой мечник останавливается у лучника",
  flankingSkeleton.x < formationRanger.x && formationRanger.hp < formationRanger.maxHp);

frontBoss.alive = false;
formationTank.atkT = 0;
const rearHpAfterBoss = formationRanger.hp;
stepFor(run, 2.5);
check("после босса мечник остаётся перед лучником, воин держит строй за жрицей",
  flankingSkeleton.x < formationRanger.x && formationRanger.hp < rearHpAfterBoss &&
  formationTank.hp === formationTank.maxHp && formationTank.facing === -1 &&
  near(formationTank.x, formationPriest.x + DWR.CONFIG.battle.warriorRearGap) && !formationTank.walking);
run.equipped.add("powerStrike");
formationTank.rage = 100;
check("союзники перекрывают воину цель даже при ручном выборе Мощного удара",
  !S.canWarriorTarget(run, flankingSkeleton) && !S.useTargeted(run, "powerStrike", flankingSkeleton.uid) &&
  formationTank.rage === 100 && flankingSkeleton.hp === flankingSkeleton.maxHp);

formationRanger.alive = false;
stepFor(run, 2.5);
check("при гибели лучника мечник подходит к жрице и останавливается перед ней",
  flankingSkeleton.x > formationRanger.x && flankingSkeleton.x < formationPriest.x &&
  formationPriest.hp < formationPriest.maxHp && formationTank.hp === formationTank.maxHp);
formationPriest.alive = false;
stepFor(run, 2);
check("когда задний ряд пал, воин подходит и бьёт оставшегося врага слева",
  formationTank.x < formationPriest.x + DWR.CONFIG.battle.warriorRearGap &&
  flankingSkeleton.hp < flankingSkeleton.maxHp);

State.reset();
State.data.coins = 20000;
State.data.runes = 4;
check("Праведная ярость и Шумовая бомба скрыты до открытия родительских навыков",
  !State.nodeUnlocked("righteousFury") && !State.nodeUnlocked("noiseBomb"));
for (const id of ["block", "righteousFury", "bomb", "noiseBomb"]) State.buyNode(id);
run = prepareForge(rangedRoom);
const furyWarrior = run.heroes.warrior;
furyWarrior.rage = 40;
check("Праведная ярость не тратит ресурс при полном здоровье", S.useInstant(run, "righteousFury") === "full" && furyWarrior.rage === 40);
furyWarrior.hp -= 20;
const furyBefore = furyWarrior.hp;
check("Праведная ярость лечит 3% максимального здоровья за 20 ярости",
  S.useInstant(run, "righteousFury") && near(furyWarrior.hp - furyBefore, furyWarrior.maxHp * 0.03) &&
  furyWarrior.rage === 20 && S.skillStatus(run, "righteousFury").left === 5);
check("Праведная ярость учитывается в статистике лечения",
  near(run.combatRoom.heroes.warrior.healing.righteousFury, furyWarrior.maxHp * 0.03));
State.buyNode("righteousFuryHeal");
State.buyNode("righteousFuryCost");
run = prepareForge(rangedRoom);
const autoFury = run.heroes.warrior;
autoFury.rage = 25;
autoFury.hp -= 20;
const autoFuryBefore = autoFury.hp;
S.setAuto(run, "righteousFury", true);
S.tick(run, 0);
check("автоярость учитывает улучшения стоимости и доли исцеления",
  near(autoFury.hp - autoFuryBefore, autoFury.maxHp * 0.04) && autoFury.rage === 7);

run = prepareForge(mageRoom);
const [noiseCorpse, , noisyMage] = run.enemies;
noiseCorpse.alive = false;
S.tick(run, 0);
const mageHp = noisyMage.hp, ordinaryBombs = run.bombsLeft;
check("шумовая бомба расходует собственный заряд", noisyMage.ritual?.kind === "raise" &&
  S.useGround(run, "noiseBomb", noisyMage.x) && run.noiseBombsLeft === 0 && run.bombsLeft === ordinaryBombs);
stepFor(run, skills.noiseBomb.flight);
check("шумовая бомба освобождает труп из сорванного ритуала и оглушает мага без урона",
  !noisyMage.ritual && !noiseCorpse.raiseBy && noisyMage.hp === mageHp && noisyMage.effects.get("stunned")?.left === 3 &&
  run.fx.some(effect => effect.type === "castInterrupted" && effect.unit === noisyMage));
stepFor(run, 2.9);
check("оглушённый маг не начинает новый каст до окончания стана", !noisyMage.ritual);

for (const id of ["noiseBombStock", "noiseBombRadius", "noiseBombStun", "noiseBombStun"]) State.buyNode(id);
run = prepareForge(rangedRoom);
const noiseEdge = run.enemies[1];
noiseEdge.x = bombCenter + skills.noiseBomb.radius + 18;
check("прокачанная шумовая бомба получает запас и собственный радиус", run.noiseBombsLeft === 2 &&
  S.bombRadius(run, "noiseBomb") === skills.noiseBomb.radius + 18 && S.useGround(run, "noiseBomb", bombCenter));
stepFor(run, skills.noiseBomb.flight);
check("шумовая бомба оглушает на 5 секунд на границе прокачанного радиуса",
  noiseEdge.effects.get("stunned")?.left === 5 && noiseEdge.hp === noiseEdge.maxHp);

run = prepareForge(crypt.rooms.at(-1));
const interruptedLich = run.enemies[0];
S.tick(run, 0);
S.useGround(run, "noiseBomb", interruptedLich.x);
stepFor(run, skills.noiseBomb.flight);
check("личу срывают призыв, но не оглушают", !interruptedLich.ritual && !interruptedLich.effects.has("stunned") &&
  run.enemies.length === 1 && run.fx.some(effect => effect.type === "castInterrupted" && effect.unit === interruptedLich));
interruptedLich.freezeT = 0;
interruptedLich.atkT = interruptedLich.def.freeze.windup;
S.tick(run, 0);
const freezing = interruptedLich.attack?.freezing;
S.useGround(run, "noiseBomb", interruptedLich.x);
stepFor(run, skills.noiseBomb.flight);
check("шумовая бомба прерывает заморозку и отправляет её на перезарядку",
  freezing && !interruptedLich.attack && interruptedLich.freezeT > 0 &&
  !run.attacks.some(attack => attack.kind === "frost"));
run = prepareForge(bossRoom);
const immuneKrag = run.enemies[0];
immuneKrag.furnaceT = 0;
S.tick(run, 0);
S.useGround(run, "noiseBomb", immuneKrag.x);
stepFor(run, skills.noiseBomb.flight);
check("Краг продолжает каст горна после шумовой бомбы", immuneKrag.furnaceCast?.remaining === 300 &&
  !immuneKrag.effects.has("stunned") && !run.fx.some(effect => effect.type === "castInterrupted"));

run = prepareForge(DWR.CONFIG.locations.wilds.rooms.at(-1));
const lycan = run.enemies[0], howl = lycan.def.howl;
lycan.howlT = 0;
lycan.atkT = howl.windup;
S.tick(run, 0);
stepFor(run, howl.windup + 0.001);
check("вой сохраняет оглушение и запускает сокращённую задержку до следующего удара",
  lycan.attack?.howling && lycan.attack.hit && near(lycan.atkT, howl.nextAttackDelay) &&
  run.heroOrder.every(id => run.heroes[id].effects.has("stunned")));
stepFor(run, howl.nextAttackDelay - 0.05);
check("ликантроп начинает замах после воя без второго удара в том же кадре",
  lycan.attack && !lycan.attack.howling && !lycan.attack.hit &&
  run.heroOrder.every(id => run.heroes[id].hp === run.heroes[id].maxHp));
stepFor(run, 0.051);
check("когти попадают примерно через 1,55 секунды после воя и сохраняют обычный интервал атак",
  lycan.attack?.hit && near(lycan.atkT, lycan.interval) &&
  run.heroOrder.every(id => run.heroes[id].hp === run.heroes[id].maxHp - lycan.dmg));

const state = DWR.State;
let savedRaidState;
global.localStorage = { getItem: () => savedRaidState, setItem: (_key, value) => { savedRaidState = value; } };
state.reset();
state.data.coins = 230;
state.completeLocation("dungeon");
state.buyNode("panelSlots");
state.buyNode("powerStrike");
check("сброс требует плату на балансе до возврата ресурсов", state.skillResetInfo().cost === 100 &&
  state.skillResetInfo().invested.coins === 120 && state.skillResetInfo().invested.runes === 1 &&
  state.data.coins === 110 && state.data.panel.length === 6);
state.data.coins = 99;
check("при нехватке монет сброс не меняет навыки или цену", !state.resetSkills() &&
  state.hasSkill("powerStrike") && state.skillResetInfo().cost === 100);
state.data.coins = 110;
check("сброс возвращает покупки за вычетом платы, сохраняя лечение и прогресс локаций", state.resetSkills() &&
  state.data.coins === 130 && state.data.runes === DWR.CONFIG.startingRunes && state.hasSkill("heal") &&
  !state.hasSkill("powerStrike") && state.data.panel.length === DWR.CONFIG.skillBar.baseSlots &&
  state.data.panel[0] === "heal" && state.locationCleared("dungeon"));
state.load();
check("цена следующего сброса сохраняется и возрастает на 25%", state.skillResetInfo().cost === 125 && !state.resetSkills());
savedRaidState = JSON.stringify({ started: true, coins: 200, runes: 0, upgrades: { powerStrike: 1, wDmg: 2 } });
state.load();
check("старое сохранение без истории покупок возвращает стоимость известных рангов",
  state.resetSkills() && state.data.coins === 200 - 100 + 12 + 15 && state.data.runes === 1);
savedRaidState = JSON.stringify({ started: true, coins: 1000, runes: 0, upgrades: { potionStock: 2, potionLuck: 2 } });
state.load();
check("старым рангам зелий возвращается прежняя цена, новым — фактически уплаченная",
  state.skillResetInfo().invested.coins === 71 && state.nodePrice("potionLuck") === 391 &&
  state.buyNode("potionLuck") && state.skillResetInfo().invested.coins === 462);
check("полное Зельеварение даёт 10% шанса, резерв зелий не теряет ранги",
  near(state.stats().potionLuck, 0.10) && state.stats().potionStock === 2);
state.reset();
state.data.coins = 1000;
const potionChances = [state.stats().potionLuck];
const startingPotionPrice = state.nodePrice("potionStock");
state.buyNode("potionStock");
for (let rank = 0; rank < 3; rank++) {
  state.buyNode("potionLuck");
  potionChances.push(state.stats().potionLuck);
}
check("запас зелий стоит от 60 монет, шанс выпадения растёт от 4% по 2 п. п.",
  startingPotionPrice === 60 && potionChances.every((chance, rank) => near(chance, 0.04 + 0.02 * rank)));

const pricedNodes = Object.values(DWR.CONFIG.trees).flatMap(tree => tree.branches.flatMap(branch => branch.nodes));
check("у всех многоранговых покупок цена строго растёт",
  pricedNodes.every(node => Array.from({ length: node.max - 1 }, (_, rank) =>
    DWR.skillRankPrice(node, rank + 2) > DWR.skillRankPrice(node, rank + 1)).every(Boolean)));
const priceStep = id => DWR.skillRankPrice(state.nodeDef(id), 2) / DWR.skillRankPrice(state.nodeDef(id), 1);
const normalPriceSteps = ["wDmg", "wTempo", "wArmor", "wStride", "rExtraArrow"].map(priceStep);
check("типовой процент роста выше у узлов с меньшим числом рангов",
  normalPriceSteps.every((step, i) => i === 0 || step > normalPriceSteps[i - 1]));
check("снижение стоимости навыка сохраняет дорогой второй ранг и повышает цену третьего",
  [1, 2, 3].every((rank, i) => DWR.skillRankPrice(state.nodeDef("blockCost"), rank) === [500, 4000, 7000][i]));

// --- Тир II: пороги открытия, урон и защита ---
const masteries = pricedNodes.filter(node => node.tier === 2);
state.reset();
state.data.coins = 50000;
check("шесть узлов второго тира требуют полный ранг родителя и стоят от 700 до 900 монет",
  masteries.length === 6 && masteries.every(node => {
    const parent = state.nodeDef(node.parent);
    state.data.upgrades[parent.id] = parent.max - 1;
    const hidden = !state.nodeUnlocked(node.id);
    state.data.upgrades[parent.id]++;
    const price = state.nodePrice(node.id);
    return hidden && state.nodeUnlocked(node.id) && node.max === 3 && price >= 700 && price <= 900 &&
      state.nodeCurrency(node.id) === "coins";
  }));
for (const node of masteries) {
  for (let rank = 0; rank < node.max; rank++) state.buyNode(node.id);
}
check("второй тир добавляет урон к исходным навыкам и не даёт купить четвёртый ранг",
  masteries.every(node => state.nodeCount(node.id) === 3 && !state.nodeBuyable(node.id)) &&
  state.stats().wDmg === 32 && state.stats().fireDmg === 44 && state.stats().rPrecision === 85);
run = prepareForge(rangedRoom);
run.equipped.add("fireball");
run.equipped.add("preciseShot");
run.heroes.ranger.focus = 100;
const masteryTarget = run.enemies[1];
masteryTarget.hp = masteryTarget.maxHp = 400;
S.useTargeted(run, "fireball", masteryTarget.uid);
S.useTargeted(run, "preciseShot", masteryTarget.uid);
stepFor(run, 1);
check("воин, фаербол и Меткий выстрел применяют урон второго тира в бою",
  run.heroes.warrior.dmg === 40 && masteryTarget.hp === 400 - 64 - 135 &&
  run.combatRoom.heroes.priest.damage.fireball?.health === 64 && run.combatRoom.heroes.ranger.damage.preciseShot?.health === 135);

run = prepareForge(bossRoom);
const protectedWarrior = run.heroes.warrior, shelteredRanger = run.heroes.ranger;
S.applyStatus(protectedWarrior, "burning", 1, "krag");
S.applyStatus(shelteredRanger, "burning", 1, "krag");
stepFor(run, 1);
check("Стойкость ветерана и Полевое укрытие снижают тики Выброса горна на 15%",
  [protectedWarrior, shelteredRanger].every(hero => near(hero.hp, hero.maxHp * (1 - 0.05 * 0.85))));
const rangerAfterWave = shelteredRanger.hp;
S.applyStatus(shelteredRanger, "frozen", 1, "lich");
stepFor(run, 1);
check("Полевое укрытие не снижает урон одиночной заморозки",
  near(shelteredRanger.hp, rangerAfterWave - shelteredRanger.maxHp * 0.05));

run = prepareForge(DWR.CONFIG.locations.wilds.rooms.at(-1));
const areaBoss = run.enemies[0];
areaBoss.atkT = 0;
areaBoss.howlT = 1e6;
S.tick(run, 0);
check("Полевое укрытие работает против когтей по всему отряду, обычная атака не получает скидку ветерана",
  run.heroes.warrior.hp === run.heroes.warrior.maxHp - Math.round(areaBoss.dmg * 0.84) &&
  run.heroes.ranger.hp === run.heroes.ranger.maxHp - Math.round(areaBoss.dmg * 0.85));

run = prepareForge(rangedRoom);
const barrierTarget = run.heroes.warrior;
barrierTarget.hp = barrierTarget.maxHp * 0.35;
check("Последний свет не срабатывает ровно на 35% здоровья",
  S.useHeal(run, "warrior") && !barrierTarget.effects.has("healBarrier"));
run.skillCooldowns.delete("heal");
run.heroes.priest.attackPose = null;
barrierTarget.hp = 1;
check("Последний свет даёт до 24 поглощения на 3 секунды",
  S.useHeal(run, "warrior") && barrierTarget.effects.get("healBarrier")?.capacity === 24 &&
  barrierTarget.effects.get("healBarrier")?.left === 3);
const barrierHp = barrierTarget.hp, recordedHeal = run.combatRoom.heroes.priest.healing.heal;
S.applyStatus(barrierTarget, "burning", 1, "krag");
stepFor(run, 1);
check("щит поглощает урон без потери здоровья и без записи поглощения как лечения",
  barrierTarget.hp === barrierHp && near(barrierTarget.effects.get("healBarrier")?.capacity, 24 - barrierTarget.maxHp * 0.05 * 0.85) &&
  recordedHeal === run.combatRoom.heroes.priest.healing.heal);
stepFor(run, 2);
check("неизрасходованный щит исчезает по окончании действия", !barrierTarget.effects.has("healBarrier"));

// --- Разлом под горой ---
state.reset();
const rift = DWR.CONFIG.locations.rift;
const moves = DWR.CONFIG.riftMoves;
const riftBossRoom = rift.rooms.at(-1);
check("Разлом открывается после Кузни и содержит 12 боевых комнат и сокровищницу",
  !state.locationUnlocked("rift") && rift.rooms.length === 12 && DWR.CONFIG.rooms[rift.treasure].chest);
state.completeLocation("forge");
check("Привал закрыт до победы в Разломе", state.locationUnlocked("rift") && !state.locationUnlocked("demoPreview"));

function forceRiftMove(run, enemy, move) {
  enemy.rift.cooldowns[move] = 0;
  enemy.atkT = 0;
  enemy.attack = null;
  S.tick(run, 0);
}

const riftRandom = Math.random;
try {
  Math.random = () => 0;
  run = prepareForge(rift.rooms[0]);
  const earth = run.enemies[0], tank = run.heroes.warrior;
  forceRiftMove(run, earth, "boulder");
  check("Валун имеет каст", S.specialAttackKey(earth) === "riftBoulder");
  stepFor(run, moves.boulder.windup + moves.boulder.flight - 0.025);
  check("Валун наносит урон только при попадании", tank.hp === tank.maxHp && run.attacks.length === 1);
  stepFor(run, 0.026);
  check("Попавший валун может оглушить на 3 секунды",
    tank.hp < tank.maxHp && tank.effects.get("stunned")?.duration === 3);

  run = prepareForge(rift.rooms[0]);
  const stone = run.enemies[0];
  stone.hp = stone.maxHp * 0.5 + 1;
  stone.rift.cooldowns.boulder = 1e6;
  stepFor(run, 9);
  stone.atkT = 0;
  S.tick(run, 0);
  check("Земляной элементаль выше половины ОЗ не начинает каменную форму по таймеру", stone.attack?.riftMove !== "petrify");
  stone.hp = stone.maxHp * 0.5;
  stone.atkT = 1e6;
  run.equipped.add("fireball");
  S.tick(run, 0);
  check("Ровно при 50% ОЗ элементаль начинает окаменение без ожидания общей задержки атаки",
    S.specialAttackKey(stone) === "riftPetrify" && !stone.effects.has("riftStone"));
  stepFor(run, moves.petrify.windup - 0.4);
  const fired = S.useTargeted(run, "fireball", stone.uid);
  stepFor(run, 0.96);
  stone.atkT = 1e6;
  check("Каменная форма блокирует уже выпущенный снаряд и не записывает урон",
    fired && stone.effects.has("riftStone") && near(stone.hp, stone.maxHp * 0.5) &&
    !run.combatRoom.heroes.priest.damage.fireball);
  stepFor(run, 5);
  check("Каменная форма даёт пять тиков по 5% и возвращает уязвимость",
    !stone.effects.has("riftStone") && near(stone.hp, stone.maxHp * 0.75));
  stepFor(run, DWR.CONFIG.riftMotion.unstone);
  stone.hp = stone.maxHp * 0.49;
  S.tick(run, 0);
  check("Повторное падение ниже 50% ОЗ не запускает каменную форму", stone.attack?.riftMove !== "petrify");
  S.applyStatus(stone, "riftStone");
  run.equipped.add("dispel");
  check("Ручное рассеивание можно направить на каменного элементаля", S.useDispel(run, stone.uid));
  stepFor(run, skills.dispel.castTime + 0.02);
  check("Рассеивание запускает выход из каменной формы",
    !stone.effects.has("riftStone") && stone.rift.motion?.name === "unstone");

  run = prepareForge(riftBossRoom);
  const castEarth = run.enemies[0];
  forceRiftMove(run, castEarth, "boulder");
  stepFor(run, moves.boulder.windup / 2);
  castEarth.hp = Math.floor(castEarth.maxHp * 0.5);
  S.tick(run, 0);
  check("На пороге 50% ОЗ колосс сохраняет начатый каст валуна",
    castEarth.attack?.riftMove === "boulder" && !castEarth.attack.hit);
  stepFor(run, moves.boulder.windup / 2);
  check("Колосс начинает окаменение в момент выпуска валуна, до восстановления после броска",
    castEarth.attack?.riftMove === "petrify" && castEarth.attack.t === 0 &&
    run.attacks.some(shot => shot.kind === "riftBoulder" && shot.caster === castEarth));
  run.equipped.add("dispel");
  S.useDispel(run, castEarth.uid);
  stepFor(run, skills.dispel.castTime + 0.05);
  check("Рассеивание прерывает окаменение на пороге без повторного каста",
    !castEarth.attack && !castEarth.effects.has("riftStone"));

  run = prepareForge(rift.rooms[1]);
  const fire = run.enemies[1], party = run.heroes;
  fire.x = party.warrior.x + 106;
  party.priest.x = party.warrior.x - 100;
  forceRiftMove(run, fire, "fireball");
  check("Обычный огненный шар не показывает полосу каста", !S.specialAttackKey(fire));
  stepFor(run, moves.fireball.windup + moves.fireball.flight + 0.03);
  check("Огненный шар задевает героев вокруг цели и накладывает одиночный ожог",
    party.warrior.hp < party.warrior.maxHp && party.priest.hp < party.priest.maxHp &&
    party.ranger.hp === party.ranger.maxHp && party.warrior.effects.has("riftBurn") && !party.warrior.effects.get("riftBurn").stacks);
  fire.rift.cooldowns.fireball = 1e6;
  const oldX = fire.x;
  const woundedHp = fire.hp = Math.floor(fire.maxHp * 0.45);
  forceRiftMove(run, fire, "burrow");
  stepFor(run, moves.burrow.windup + 0.55);
  check("Во время ухода под землю элементаль недоступен для атак", !S.targetable(fire) && fire.x === oldX);
  stepFor(run, 1);
  check("Огненный элементаль возвращается в другом месте, перезарядка 10 секунд",
    S.targetable(fire) && Math.abs(fire.x - oldX) > 180 && fire.x < party.ranger.x && moves.burrow.cooldown === 10);
  check("Уход под землю и появление в тылу сохраняют текущее здоровье элементаля", fire.hp === woundedHp);
  Math.random = () => 0.99;
  forceRiftMove(run, fire, "burrow");
  stepFor(run, moves.burrow.windup + DWR.CONFIG.riftMotion.burrow + 0.01);
  check("С тыла элементаль перемещается перед строем лучника и жрицы", S.targetable(fire) && fire.x > party.priest.x);
  check("При повторном перемещении здоровье элементаля сохраняется", fire.hp === woundedHp);
  Math.random = () => 0;

  run = prepareForge(rift.rooms[1]);
  const [groundThreat, immuneRear] = run.enemies;
  groundThreat.alive = false;
  immuneRear.x = run.heroes.priest.x - 100;
  run.equipped.add("fireball");
  S.setAuto(run, "fireball", true);
  S.tick(run, 0);
  check("Жрица разворачивается к огненному элементалю в тылу и сохраняет ману",
    run.heroes.priest.facing === -1 && run.heroes.priest.mana === run.heroes.priest.manaMax && !run.attacks.length);

  const fireTestRoom = DWR.CONFIG.rooms[rift.rooms[1]], originalEnemies = fireTestRoom.enemies;
  try {
    fireTestRoom.enemies = ["fire-elemental", "fused-colossus", "fire-colossus", "earth-elemental"];
    run = prepareForge(rift.rooms[1]);
  } finally {
    fireTestRoom.enemies = originalEnemies;
  }
  run.equipped.add("fireball");
  run.equipped.add("fireTornado");
  run.stats.fireballBlast = 10;
  const [immuneFire, resistant, immuneBoss, unresistant] = run.enemies;
  run.enemies.forEach((enemy, index) => { enemy.x = 820 + 30 * index; });
  check("можно направить фаербол так, чтобы взрыв задел соседей", S.useTargeted(run, "fireball", resistant.uid));
  stepFor(run, 1);
  check("фаербол наносит половину урона объединённому боссу, взрыв проходит только по уязвимой цели",
    immuneFire.hp === immuneFire.maxHp && immuneBoss.hp === immuneBoss.maxHp &&
    near(resistant.hp, resistant.maxHp - skills.fireball.dmg / 2) && near(unresistant.hp, unresistant.maxHp - 10));
  run.heroes.priest.mana = skills.fireTornado.cost;
  const tornadoStarted = S.useGround(run, "fireTornado", unresistant.x);
  stepFor(run, 4.5);
  check("смерч игнорирует обе огненные формы, наносит объединённому боссу 50% и земляному обычный урон",
    tornadoStarted && immuneFire.hp === immuneFire.maxHp && immuneBoss.hp === immuneBoss.maxHp &&
    near(resistant.hp, resistant.maxHp - (skills.fireball.dmg + skills.fireTornado.dmg) / 2) &&
    near(unresistant.hp, unresistant.maxHp - 10 - skills.fireTornado.dmg));

  run = prepareForge(riftBossRoom);
  const [earthBoss, fireBoss] = run.enemies;
  check("Колоссы первой фазы получают по 50% здоровья и урона",
    earthBoss.maxHp === Math.round(DWR.CONFIG.enemies["earth-elemental"].hp * 1.5) &&
    fireBoss.dmg === DWR.CONFIG.enemies["fire-elemental"].dmg * 1.5);
  run.equipped.add("powerStrike");
  for (const part of run.enemies) part.x = run.heroes.warrior.x + 109;
  strikeFor(run, earthBoss, earthBoss.maxHp + 1);
  stepFor(run, 0.8);
  strikeFor(run, fireBoss, fireBoss.maxHp + 1);
  stepFor(run, 0.8);
  check("Обе смерти первой фазы сохраняют бой и не выдают награду босса",
    !earthBoss.alive && !fireBoss.alive && S.inBattle(run) &&
    run.events.filter(ev => ev.type === "kill").length === 2 &&
    run.events.every(ev => !ev.boss) && [earthBoss, fireBoss].every(part => part.noLoot));
  stepFor(run, 2.05);
  const fused = run.enemies.at(-1);
  check("Во второй фазе один колосс, во время слияния он недоступен",
    fused.kind === "fused-colossus" && fused.rift.motion?.name === "merge" &&
    !S.targetable(fused) && earthBoss.merged && fireBoss.merged && !state.treasureAvailable("rift"));
  for (const hero of Object.values(run.heroes)) hero.hp = hero.maxHp = 500;
  fused.atkT = 1e6;
  stepFor(run, DWR.CONFIG.riftMotion.merge);
  check("После слияния босс становится доступен для боя", S.targetable(fused) && !fused.rift.motion);
  fused.x = run.heroes.warrior.x + 110;
  fused.rift.cooldowns.spike = fused.rift.cooldowns.cloak = 1e6;
  fused.atkT = 0;
  S.tick(run, 0);
  stepFor(run, fused.def.rift.melee.windup + fused.def.rift.melee.recovery);
  fused.atkT = 0;
  S.tick(run, 0);
  check("Обычные атаки второй фазы чередуются с огненным шаром", fused.attack?.riftMove === "fireball");
  const spikeHp = run.heroes.warrior.hp;
  forceRiftMove(run, fused, "spike");
  stepFor(run, moves.spike.windup);
  fused.atkT = 1e6;
  check("Кол обездвиживает выбранного героя на пять секунд",
    S.skillStatus(run, "powerStrike").impaled && run.heroes.warrior.effects.get("riftImpaled")?.left === 5);
  stepFor(run, 5);
  check("Земляной кол наносит ровно пять тиков по 7% максимального здоровья",
    near(run.heroes.warrior.hp, spikeHp - 175) && !run.heroes.warrior.effects.has("riftImpaled"));

  run.noiseBombsLeft = 1;
  forceRiftMove(run, fused, "cloak");
  S.useGround(run, "noiseBomb", fused.x);
  stepFor(run, skills.noiseBomb.flight + 0.02);
  check("Шумовая бомба прерывает плащ и не станит босса",
    !fused.attack && !fused.effects.has("riftCloak") && !fused.effects.has("stunned"));
  forceRiftMove(run, fused, "cloak");
  stepFor(run, moves.cloak.windup);
  fused.atkT = 1e6;
  check("Огненный плащ действует десять секунд", fused.effects.get("riftCloak")?.left === 10);
  for (let i = 0; i < 11; i++) {
    strikeFor(run, fused, 1);
    stepFor(run, 0.37);
  }
  check("Ближние удары накапливают до десяти стаков горения",
    run.heroes.warrior.effects.get("riftCloakBurn")?.stacks === 10);
  run.equipped.add("dispel");
  S.useDispel(run, fused.uid);
  stepFor(run, skills.dispel.castTime + 0.02);
  check("Рассеивание убирает плащ, уже полученное горение остаётся",
    !fused.effects.has("riftCloak") && run.heroes.warrior.effects.has("riftCloakBurn"));
  strikeFor(run, fused, fused.maxHp + 1);
  stepFor(run, 1);
  check("Только гибель объединённого босса завершает бой и даёт событие победы",
    !S.inBattle(run) && run.events.filter(ev => ev.boss).length === 1);
} finally {
  Math.random = riftRandom;
}

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nПРОВАЛОВ: " + failures);
process.exit(failures === 0 ? 0 : 1);
