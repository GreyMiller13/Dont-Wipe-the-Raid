// DWR :: input.js — мышь и клавиатура, преобразование координат canvas и передача ввода в Run.
"use strict";
window.DWR = window.DWR || {};

DWR.Input = (function () {
  const KEY_LABELS = {
    " ": "Space", Escape: "Esc", Control: "Ctrl", CapsLock: "Caps", NumLock: "Num Lock",
    ScrollLock: "ScrLk", Backspace: "Bksp", PageUp: "PgUp", PageDown: "PgDn",
    Insert: "Ins", Delete: "Del", PrintScreen: "PrtSc", ContextMenu: "Menu",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→"
  };
  const NUMPAD_LABELS = { Add: "+", Subtract: "−", Multiply: "*", Divide: "/", Decimal: ".", Comma: ",", Equal: "=" };
  const api = { x: -1, y: -1, readSkillKey };

  function skillKeyCode(event) {
    if (event.code && event.code !== "Unidentified") return event.code;
    if (event.key && event.key !== "Unidentified") return "key:" + event.key;
    return null;
  }

  function readSkillKey(event) {
    const code = skillKeyCode(event);
    if (!code) return null;
    const { key } = event;
    let label = Object.hasOwn(KEY_LABELS, key) ? KEY_LABELS[key] : key;
    if (code.startsWith("Numpad")) {
      const suffix = code.slice(6);
      label = "Num " + (Object.hasOwn(NUMPAD_LABELS, suffix) ? NUMPAD_LABELS[suffix] : suffix);
    } else {
      const modifier = /^(Control|Shift|Alt|Meta)(Left|Right)$/.exec(code);
      if (modifier) label = (KEY_LABELS[modifier[1]] ?? modifier[1]) + " " + (modifier[2] === "Left" ? "L" : "R");
      else if (!label || label === "Unidentified" || label === "Dead") label = code;
      else if (label.length === 1) label = label.toUpperCase();
    }
    return { code, label };
  }

  function isSingleKey(event) {
    if (event.key === "AltGraph") return !event.metaKey && !event.shiftKey;
    return (!event.ctrlKey || event.key === "Control") &&
      (!event.altKey || event.key === "Alt") &&
      (!event.metaKey || event.key === "Meta") &&
      (!event.shiftKey || event.key === "Shift");
  }

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
      if (!inGame() || e.defaultPrevented || e.isComposing) return;
      if (e.key === "Escape" && !e.repeat && DWR.Run.cancelAim(api.x, api.y)) {
        suppressClick = true;
        e.preventDefault();
        return;
      }
      if (!isSingleKey(e)) return;
      const code = skillKeyCode(e);
      if (!code) return;
      const slot = DWR.State.data.settings.skillHotkeys.findIndex(binding => binding.code === code);
      if (slot !== -1 && (e.repeat || DWR.Run.onSkillKey(slot, api.x, api.y))) {
        e.preventDefault();
      }
    });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  return api;
})();
