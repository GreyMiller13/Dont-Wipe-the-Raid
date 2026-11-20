// DWR :: assets.js — загрузка производственных ассетов из assets/out/ (сборка: scripts/build_sprites.py).
// Боевые ассеты подгружаются после заставки или по запросу при входе в бой.
"use strict";
window.DWR = window.DWR || {};

DWR.Assets = (function () {
  const DIR = "assets/out/";
  // Версии загрузчика и графики независимы, чтобы обновление кода не сбрасывало кэш спрайтов.
  const version = new URL(document.currentScript.src).searchParams.get("art");
  // ключ = kind юнита в sim.js; файл goblinK.png грузится под kind "goblinKing"
  const SPRITES = ["warrior", "priest", "priest-release", "ranger",
                   "warrior-body", "warrior-upper", "warrior-fore", "warrior-blade",
                   "map-boss", "map-chest",
                   "arrow", "arrow-multishot", "arrow-precise", "coin", "rune", "chest-closed", "chest-open"];
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
  function assetUrl(src) { return DIR + src + (version ? "?v=" + encodeURIComponent(version) : ""); }
  const iconFile = id => "icon-" + id + ".png";
  function done() { ready = true; cbs.splice(0).forEach(cb => cb()); }
  const artIds = rooms => new Set(rooms.map(room => room.art ?? room.id));

  function preloadLocation(id) {
    const config = DWR.CONFIG, location = config.locations[id];
    if (!location?.loadOnSelect) return null;
    if (!locationLoads.has(id)) {
      const promise = new Promise(resolve => {
        const group = { pending: 0, done: resolve };
        const rooms = [...location.rooms, location.treasure].map(index => config.rooms[index]).filter(Boolean);
        for (const art of artIds(rooms)) {
          if (!img["room" + art]) img["room" + art] = loadOne("room" + art + ".jpg", group);
        }
        for (const kind of new Set(rooms.flatMap(room => room.enemies))) {
          const enemy = config.enemies[kind];
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
    for (const kind of ["warrior", "goblinW", "goblinKing", "skeletonW"]) walk[kind] = loadOne(kind + "-walk.png");
    for (const id of Object.keys(DWR.CONFIG.skills)) icons[id] = loadOne(iconFile(id));
    for (const [id, effect] of Object.entries(DWR.CONFIG.effects)) {
      if (effect.icon) statusIcons[id] = loadOne(effect.icon);
    }
    // Загружаем прицел заранее, чтобы первое перетаскивание сразу сменило курсор.
    loadOne("cursor-target.png");
    for (const [kind, enemy] of Object.entries(DWR.CONFIG.enemies)) {
      if (enemy.spritePoses) continue;
      const file = kind === "goblinKing" ? "goblinK" : kind;
      img[kind] = loadOne(file + ".png");
      enemyLayers[kind] = { body: loadOne(file + "-body.png"), arm: loadOne(file + "-arm.png") };
      if (kind !== "goblinKing") falls[kind] = loadOne(file + "-fall.png");
    }
    const deferredRooms = new Set(Object.values(DWR.CONFIG.locations).filter(location => location.loadOnSelect)
      .flatMap(location => [...location.rooms, location.treasure]));
    for (const id of artIds(DWR.CONFIG.rooms.filter((room, index) => !deferredRooms.has(index))))
      img["room" + id] = loadOne("room" + id + ".jpg");
    for (const k in FRAMES) {
      frames[k] = [];
      for (let i = 1; i <= FRAMES[k]; i++) frames[k].push(loadOne(k + "-f" + i + ".png"));
    }
  }

  return {
    img, frames, enemyLayers, icons, statusIcons, walk, falls, assetUrl, preload, preloadLocation,
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
