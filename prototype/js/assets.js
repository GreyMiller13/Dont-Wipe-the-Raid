// DWR :: assets.js — загрузка производственных ассетов из assets/out/ (сборка: scripts/build_sprites.py).
// Ассеты грузятся сразу при открытии страницы; движок ждёт DWR.Assets.ready.
"use strict";
window.DWR = window.DWR || {};

DWR.Assets = (function () {
  const DIR = "assets/out/";
  const version = new URL(document.currentScript.src).search;
  // ключ = kind юнита в sim.js; файл goblinK.png грузится под kind "goblinKing"
  const SPRITES = ["warrior", "priest", "priest-release", "ranger",
                   "warrior-body", "warrior-upper", "warrior-fore", "warrior-blade",
                   "map-boss", "map-chest",
                   "arrow", "arrow-multishot", "arrow-precise", "coin", "chest-closed", "chest-open"];
  const FRAMES = { warrior: 5, ranger: 6, priest: 6, "priest-cast": 6,
    "ranger-multishot": 6, "ranger-precise": 6, "fireball-flight": 3, "fireball-impact": 5 };

  const img = {}, frames = {}, enemyLayers = {}, icons = {}, statusIcons = {}, walk = {}, falls = {};
  const cbs = [];
  let pending = 0, ready = false;

  function loadOne(src) {
    const im = new Image();
    pending++;
    im.onload = () => { if (--pending === 0) done(); };
    im.onerror = () => { console.error("Ассет не загрузился:", src); if (--pending === 0) done(); };
    im.src = assetUrl(src);
    return im;
  }
  function assetUrl(src) { return DIR + src + version; }
  const iconFile = id => "icon-" + id + ".png";
  function done() { ready = true; cbs.splice(0).forEach(cb => cb()); }

  for (const s of SPRITES) img[s] = loadOne(s + ".png");
  for (const kind of ["warrior", "goblinW", "goblinKing", "skeletonW"]) walk[kind] = loadOne(kind + "-walk.png");
  for (const id of Object.keys(DWR.CONFIG.skills)) icons[id] = loadOne(iconFile(id));
  icons.heal = loadOne(iconFile("heal"));
  for (const [id, effect] of Object.entries(DWR.CONFIG.effects)) statusIcons[id] = loadOne(effect.icon);
  // Загружаем прицел заранее, чтобы первый drag сразу сменил курсор.
  loadOne("cursor-target.png");
  for (const kind of Object.keys(DWR.CONFIG.enemies)) {
    const file = kind === "goblinKing" ? "goblinK" : kind;
    img[kind] = loadOne(file + ".png");
    enemyLayers[kind] = { body: loadOne(file + "-body.png"), arm: loadOne(file + "-arm.png") };
    if (kind !== "goblinKing") falls[kind] = loadOne(file + "-fall.png");
  }
  for (const id of new Set(DWR.CONFIG.rooms.map(room => room.art ?? room.id)))
    img["room" + id] = loadOne("room" + id + ".jpg");
  for (const k in FRAMES) {
    frames[k] = [];
    for (let i = 1; i <= FRAMES[k]; i++) frames[k].push(loadOne(k + "-f" + i + ".png"));
  }

  return {
    img, frames, enemyLayers, icons, statusIcons, walk, falls, assetUrl,
    iconUrl: id => assetUrl(iconFile(id)),
    get ready() { return ready; },
    onReady(cb) { ready ? cb() : cbs.push(cb); }
  };
})();
