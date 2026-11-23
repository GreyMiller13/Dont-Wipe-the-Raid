// DWR :: input.js — мышь: преобразование координат canvas (масштаб CSS) и делегирование в Run.
"use strict";
window.DWR = window.DWR || {};

DWR.Input = (function () {
  const api = { x: -1, y: -1 };
  function init() {
    const cv = document.getElementById("game-canvas");
    let suppressClick = false;
    const inGame = () => DWR.currentScreen() === "game" && DWR.Run;
    const toCanvas = (e) => {
      const r = cv.getBoundingClientRect();
      api.x = (e.clientX - r.left) * (cv.width / r.width);
      api.y = (e.clientY - r.top) * (cv.height / r.height);
    };
    cv.addEventListener("mousemove", e => {
      toCanvas(e);
      if (inGame()) DWR.Run.onMouseMove(api.x, api.y);
    });
    cv.addEventListener("mouseleave", () => {
      api.x = api.y = -1;
      if (inGame()) DWR.Run.onMouseMove(api.x, api.y);
    });
    cv.addEventListener("mousedown", e => {
      if (e.button !== 0 || !inGame()) return;
      suppressClick = false;
      toCanvas(e);
      DWR.Run.onDown(api.x, api.y);
    });
    window.addEventListener("mouseup", e => {
      if (e.button !== 0 || !inGame()) return;
      toCanvas(e);
      suppressClick = DWR.Run.onUp(api.x, api.y) || suppressClick;
    });
    cv.addEventListener("click", e => {
      if (!inGame()) return;
      if (suppressClick) { suppressClick = false; return; }
      toCanvas(e);
      DWR.Run.onClick(api.x, api.y);
    });
    cv.addEventListener("contextmenu", e => {
      toCanvas(e);
      if (inGame() && DWR.Run.onContextMenu(api.x, api.y)) e.preventDefault();
    });
    window.addEventListener("blur", () => {
      api.x = api.y = -1;
      if (inGame() && DWR.Run.cancelAim(api.x, api.y)) suppressClick = true;
    });
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && inGame() && DWR.Run.cancelAim(api.x, api.y)) {
        suppressClick = true;
        e.preventDefault();
      }
    });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  return api;
})();
