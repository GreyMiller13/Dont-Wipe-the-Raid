// DWR :: main.js — точка входа: переключение экранов, игровой цикл, масштаб сцены.
"use strict";
window.DWR = window.DWR || {};

(function () {
  let current = null;      // активный экран
  let pendingRun = null;
  let lastTs = 0;

  // Показ экрана: скрывает все .screen, включает нужный; 'game' — все скрыты, виден canvas.
  DWR.showScreen = function (id) {
    current = id;
    pendingRun = null;
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
    if (id !== "game") {
      const el = document.getElementById("screen-" + id);
      if (el) el.classList.add("active");
      // Экраны сами перерисовывают содержимое при показе (хук redraw, если есть)
      const mod = { menu: "Screens", location: "Screens", bestiary: "Bestiary",
                    upgrade: "Upgrade", panel: "PanelEditor", results: "Screens" }[id];
      if (mod && DWR[mod] && typeof DWR[mod].redraw === "function") DWR[mod].redraw();
    } else if (DWR.Run && DWR.Run.onEnter) DWR.Run.onEnter();
    DWR.Audio.setTheme(id === "game" ? DWR.Run?.state?.location : "menu");
  };
  DWR.currentScreen = () => current;

  // Старт забега (кнопка «В бой»); ждём готовности ассетов, реальную логику даёт run.js
  DWR.startRun = function (location = "dungeon", treasureOnly = false) {
    if (pendingRun || !DWR.CONFIG.locations[location]?.rooms.length || !DWR.State.locationUnlocked(location)) return;
    if (treasureOnly && !DWR.State.treasureAvailable(location)) return;
    const go = () => {
      if (pendingRun !== go) return;
      DWR.Run.start(location, treasureOnly);
      DWR.showScreen("game");
    };
    pendingRun = go;
    DWR.Assets.onReady(go, location);
  };

  // Завершение забега — экран итогов (вызывает run.js)
  DWR.showResults = function (result) {
    if (DWR.Screens && DWR.Screens.showResults) DWR.Screens.showResults(result);
    DWR.showScreen("results");
    if (result.reason === "win" || result.reason === "wipe") DWR.Audio.play(result.reason === "win" ? "victory" : "defeat");
  };

  // Масштаб сцены под окно
  function fit() {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    document.getElementById("stage").style.setProperty("--stage-scale", k);
  }
  addEventListener("resize", fit);
  function saveActiveRaid() {
    if (current === "game") DWR.State.save();
  }
  addEventListener("pagehide", saveActiveRaid);
  document.addEventListener("visibilitychange", () => {
    lastTs = 0;
    if (document.hidden) saveActiveRaid();
  });

  // Игровой цикл
  function loop(ts) {
    const elapsed = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    if (current === "game" && DWR.Run && DWR.Run.frame) DWR.Run.frame(Math.min(0.05, elapsed), elapsed);
    requestAnimationFrame(loop);
  }

  // Инициализация
  DWR.State.load();
  DWR.Audio.init(DWR.State.data.settings);
  fit();
  DWR.showScreen("menu");
  requestAnimationFrame(loop);

  const cover = new Image();
  cover.fetchPriority = "high";
  cover.src = document.getElementById("menu-cover-preload").href;
  function preloadAfterCover() {
    DWR.Upgrade.preloadBackground();
    DWR.Assets.preload();
  }
  cover.decode().then(preloadAfterCover, preloadAfterCover);
})();
