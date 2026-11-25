// DWR :: assets.js — загрузка производственных ассетов из assets/out/ (сборка: scripts/build_sprites.py).
// Боевые ассеты подгружаются после заставки или по запросу при входе в бой.
"use strict";
window.DWR = window.DWR || {};

DWR.Assets = (function () {
  const DIR = "assets/out/";
  // Версии загрузчика и графики независимы, чтобы обновление кода не сбрасывало кэш спрайтов.
  const versions = new URL(document.currentScript.src).searchParams;
  const version = versions.get("art"), heroVersion = versions.get("hero");
  const menuVersion = versions.get("menu"), cityVersion = versions.get("city");
  // Ключи боевых спрайтов совпадают с kind юнита.
  const SPRITES = ["warrior", "priest", "priest-release", "ranger",
                   "warrior-body", "warrior-upper", "warrior-fore", "warrior-blade",
                   "map-boss", "map-chest",
                   "arrow", "arrow-multishot", "arrow-precise", "coin", "rune", "chest-v2"];
  const FRAMES = { warrior: 5, ranger: 6, priest: 6, "priest-cast": 6,
    "ranger-multishot": 6, "ranger-precise": 6, "fireball-flight": 3, "fireball-impact": 5 };

  const img = {}, frames = {}, enemyLayers = {}, icons = {}, statusIcons = {}, walk = {}, falls = {};
  const cbs = [];
  const common = { pending: 0, done };
  const locationLoads = new Map();
  let started = false, ready = false;

  function loadOne(src, group = common) {
    const im = new Image();
    im.fetchPriority = "low";
    group.pending++;
    const finish = () => { if (--group.pending === 0) group.done(); };
    im.onload = finish;
    im.onerror = () => { console.error("Ассет не загрузился:", src); finish(); };
    im.src = assetUrl(src);
    return im;
  }
  function assetUrl(src) {
    const revision = /^\.\.\/backgrounds\/dragon-city-\d{2}\.webp$/.test(src) ? cityVersion ?? version
      : src.startsWith("menu-") ? menuVersion ?? version
      : /^(warrior|ranger|priest)-/.test(src) ? heroVersion ?? version : version;
    return DIR + src + (revision ? "?v=" + encodeURIComponent(revision) : "");
  }
  const iconFile = id => "skills/" + id + ".webp";
  function done() { ready = true; cbs.splice(0).forEach(cb => cb()); }
  const artIds = rooms => new Set(rooms.map(room => room.art ?? room.id));
  const roomFile = art => typeof art === "string" ? "../backgrounds/" + art + ".webp" : "room" + art + ".jpg";
  const roomUrl = room => assetUrl(roomFile(room.art ?? room.id));

  function preloadEnemyMotion(enemy, group) {
    for (const model of enemy.motion ?? []) {
      if (!img[model]) img[model] = loadOne(DWR.ForgeMotion.atlasFile(model), group);
    }
  }

  function preloadLocation(id) {
    const config = DWR.CONFIG, location = config.locations[id];
    if (!location?.loadOnSelect) return null;
    if (!locationLoads.has(id)) {
      const promise = new Promise(resolve => {
        const group = { pending: 0, done: resolve };
        const rooms = [...location.rooms, location.treasure].map(index => config.rooms[index]).filter(Boolean);
        for (const art of artIds(rooms)) {
          if (!img["room" + art]) img["room" + art] = loadOne(roomFile(art), group);
        }
        const kinds = new Set(rooms.flatMap(room => room.fusion ? [...room.enemies, room.fusion] : room.enemies));
        for (const kind of [...kinds]) {
          const summon = config.enemies[kind].dragon?.summon;
          if (summon) kinds.add(summon.minion);
        }
        for (const kind of kinds) {
          const enemy = config.enemies[kind];
          if (enemy.rift && !img[kind]) img[kind] = loadOne(DWR.RiftMotion.atlasFile(kind), group);
          if (enemy.city) {
            for (const id of DWR.CityMotion.files(kind)) {
              if (!img[id]) img[id] = loadOne(DWR.CityMotion.file(id), group);
            }
          }
          preloadEnemyMotion(enemy, group);
          if (!enemy.spritePoses || img[kind]) continue;
          img[kind] = loadOne(kind + "-poses.png", group);
          if (enemy.fall) falls[kind] = loadOne(kind + "-fall.png", group);
        }
        if (group.pending === 0) resolve();
      });
      locationLoads.set(id, promise);
    }
    return locationLoads.get(id);
  }

  function preload() {
    if (started) return;
    started = true;
    for (const s of SPRITES) img[s] = loadOne(s + ".png");
    walk.warrior = loadOne("warrior-walk.png");
    for (const id of Object.keys(DWR.CONFIG.skills)) icons[id] = loadOne(iconFile(id));
    for (const [id, effect] of Object.entries(DWR.CONFIG.effects)) {
      if (effect.icon) statusIcons[id] = loadOne(effect.icon);
    }
    // Загружаем прицел заранее, чтобы первое перетаскивание сразу сменило курсор.
    loadOne("cursor-target.png");
    const deferredRooms = new Set(Object.values(DWR.CONFIG.locations).filter(location => location.loadOnSelect)
      .flatMap(location => [...location.rooms, location.treasure]));
    const rooms = DWR.CONFIG.rooms.filter((room, index) => !deferredRooms.has(index));
    const enemies = new Set(rooms.flatMap(room => room.enemies));
    for (const [kind, enemy] of Object.entries(DWR.CONFIG.enemies)) {
      if (enemies.has(kind)) preloadEnemyMotion(enemy);
      if (enemy.spritePoses || enemy.motion || enemy.rift || enemy.city) continue;
      img[kind] = loadOne(kind + ".png");
      enemyLayers[kind] = { body: loadOne(kind + "-body.png"), arm: loadOne(kind + "-arm.png") };
      if (!enemy.escape) falls[kind] = loadOne(kind + "-fall.png");
    }
    for (const id of artIds(rooms)) img["room" + id] = loadOne(roomFile(id));
    for (const k in FRAMES) {
      frames[k] = [];
      for (let i = 1; i <= FRAMES[k]; i++) frames[k].push(loadOne(k + "-f" + i + ".png"));
    }
  }

  return {
    img, frames, enemyLayers, icons, statusIcons, walk, falls, assetUrl, roomUrl, preload, preloadLocation,
    iconUrl: id => assetUrl(iconFile(id)),
    get ready() { return ready; },
    onReady(cb, location) {
      const extra = preloadLocation(location);
      const complete = extra ? () => extra.then(cb) : cb;
      if (ready) complete();
      else {
        cbs.push(complete);
        preload();
      }
    }
  };
})();
