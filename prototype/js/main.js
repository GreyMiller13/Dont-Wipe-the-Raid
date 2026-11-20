// DWR :: main.js — точка входа: переключение экранов, игровой цикл, масштаб сцены.
"use strict";
window.DWR = window.DWR || {};

(function () {
  let current = null;      // активный экран: 'menu' | 'location' | 'upgrade' | 'panel' | 'game' | 'results'
  let lastTs = 0;

  // Показ экрана: скрывает все .screen, включает нужный; 'game' — все скрыты, виден canvas.
  DWR.showScreen = function (id) {
    current = id;
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
    if (id !== "game") {
      const el = document.getElementById("screen-" + id);
      if (el) el.classList.add("active");
      // Экраны сами перерисовывают содержимое при показе (хук redraw, если есть)
      const mod = { menu: "Screens", location: "Screens",
                    upgrade: "Upgrade", panel: "PanelEditor", results: "Screens" }[id];
      if (mod && DWR[mod] && typeof DWR[mod].redraw === "function") DWR[mod].redraw();
    } else if (DWR.Run && DWR.Run.onEnter) DWR.Run.onEnter();
  };
  DWR.currentScreen = () => current;

  // Старт забега (кнопка «В бой»); ждём готовности ассетов, реальную логику даёт run.js
  DWR.startRun = function (location = "dungeon", treasureOnly = false) {
    if (!DWR.State.locationUnlocked(location)) return;
    if (treasureOnly && !DWR.State.treasureAvailable(location)) return;
    const go = () => {
      DWR.Run.start(location, treasureOnly);
      DWR.showScreen("game");
    };
    if (DWR.Assets && !DWR.Assets.ready) { DWR.Assets.onReady(go); return; }
    go();
  };

  // Завершение забега — экран итогов (вызывает run.js)
  DWR.showResults = function (result) {
    if (DWR.Screens && DWR.Screens.showResults) DWR.Screens.showResults(result);
    DWR.showScreen("results");
  };

  // Масштаб сцены под окно
  function fit() {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    document.getElementById("stage").style.setProperty("--stage-scale", k);
  }
  addEventListener("resize", fit);

  // Игровой цикл
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (current === "game" && DWR.Run && DWR.Run.frame) DWR.Run.frame(dt);
    requestAnimationFrame(loop);
  }

  // Инициализация
  DWR.State.load();
  fit();
  DWR.showScreen("menu");
  requestAnimationFrame(loop);

  const cover = new Image();
  cover.fetchPriority = "high";
  cover.src = document.getElementById("menu-cover-preload").href;
  cover.decode().then(DWR.Assets.preload, DWR.Assets.preload);
})();
