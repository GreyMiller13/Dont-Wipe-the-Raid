// DWR :: panel.js — панель навыков на canvas (низ экрана боя).
// Слоты на забег: копия State.data.panel с доступными расходниками.
// Панель использует слоты из состояния забега, редактор использует те же иконки.
"use strict";
window.DWR = window.DWR || {};

DWR.Panel = (function () {
  const SLOT = 92, GAP = 11, SLOT_H = 77;
  const Y0 = () => 608;

  const RES_COLOR = { rage: "#eb9478", focus: "#91cd94", mana: "#a6b8ff" };
  const RES_NAME = { rage: "ярость", focus: "фокус", mana: "мана" };
  const LABEL = { powerStrike: "Удар", block: "Блок", multishot: "Мультивыстрел",
    preciseShot: "Меткий", heal: "Лечение", fireball: "Фаербол", potion: "Зелье" };

  function slotRect(run, i) {
    const width = run.tempPanel.length * (SLOT + GAP) - GAP;
    const left = (DWR.CONFIG.canvas.w - width) / 2;
    return { x: left + i * (SLOT + GAP), y: Y0(), w: SLOT, h: SLOT_H };
  }

  function slotAt(run, x, y) {
    for (let i = 0; i < run.tempPanel.length; i++) {
      const r = slotRect(run, i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  function equipRunSkill(run, id) {
    const p = run.tempPanel;
    if (p.includes(id)) return true;
    const i = p.indexOf(null);
    if (i === -1) return false;
    p[i] = id;
    return true;
  }

  // Доступен ли слот для активации с учётом ресурса и состояния владельца.
  function slotUsable(run, id) {
    if (id === "potion") return run.sim.potionsLeft > 0;
    return DWR.Sim.skillStatus(run.sim, id).ready;
  }

  function cooldownLabel(left) {
    return (Math.ceil(left * 10 - 1e-9) / 10).toFixed(1).replace(".", ",") + " с";
  }

  function drawIcon(ctx, id, left, top, size) {
    const image = DWR.Assets.icons[id];
    if (!image?.naturalWidth) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, left, top, size, size);
    ctx.restore();
  }

  function actionHint(skill, auto) {
    if (!skill) return "Нажмите или перетащите навык";
    if (skill.type === "auto") return "ЛКМ включает или отключает авто";
    if (auto && skill.manualWhileAuto === false) return "ЛКМ отключает авто · Удар по ближайшему врагу";
    const verb = skill.type === "instant" ? "ЛКМ применяет навык"
      : "Перетащите на " + (["ally", "potion"].includes(skill.type) ? "героя" : "врага");
    return skill.auto ? "ЛКМ переключает авто · " + verb : verb;
  }

  function draw(ctx, run) {
    ctx.beginPath(); ctx.roundRect(34, 568, 1212, 126, 12);
    ctx.fillStyle = "#191a23"; ctx.fill();
    ctx.strokeStyle = "#353542"; ctx.lineWidth = 1; ctx.stroke();

    const hoveredSlot = DWR.Input ? slotAt(run, DWR.Input.x, DWR.Input.y) : -1;
    const hoveredSkill = run.tempPanel[hoveredSlot];
    ctx.textAlign = "left"; ctx.font = "600 16px Segoe UI"; ctx.fillStyle = "#f5eee5";
    ctx.fillText("Панель навыков", 55, 593);
    ctx.font = "13px Segoe UI"; ctx.fillStyle = "#b0aaba";
    ctx.fillText(actionHint(DWR.CONFIG.skills[hoveredSkill], run.sim.autoSkills.has(hoveredSkill)), 218, 593);

    for (let i = 0; i < run.tempPanel.length; i++) {
      const r = slotRect(run, i), id = run.tempPanel[i];
      const enabled = id && slotUsable(run, id);
      const auto = run.sim.autoSkills.has(id);
      const hovering = id && hoveredSlot === i;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fillStyle = auto ? "#252d32" : id ? "#22232f" : "#15161e";
      ctx.fill();
      ctx.strokeStyle = hovering ? "#ffd092" : auto ? "#90bd9d" : id ? "#454451" : "#393a47";
      if (!id) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      const cx = r.x + r.w / 2;
      if (!id) {
        ctx.fillStyle = "#7f7b8c"; ctx.font = "21px Segoe UI";
        ctx.fillText("—", cx, r.y + 44);
        continue;
      }
      const skill = DWR.CONFIG.skills[id];
      const timing = id === "potion" ? null : DWR.Sim.skillStatus(run.sim, id);
      const color = id === "potion" ? "#ff938a" : RES_COLOR[skill.res];
      ctx.globalAlpha = enabled ? 1 : 0.52;
      drawIcon(ctx, id, cx - 17, r.y + 5, 34);
      ctx.globalAlpha = 1;
      if (timing?.left > 0 && (skill.type !== "auto" || auto)) {
        const readyPart = Math.max(0, 1 - timing.left / timing.duration);
        ctx.fillStyle = "rgba(12,9,20," + (1 - readyPart) * 0.65 + ")";
        ctx.fillRect(cx - 17, r.y + 5, 34, 34);
        ctx.fillStyle = "#ffd092"; ctx.fillRect(cx - 17, r.y + 40, 34 * readyPart, 2);
      }
      if (skill.auto) {
        ctx.font = "600 9px Segoe UI"; ctx.textAlign = "right"; ctx.fillStyle = auto ? "#aee3b6" : "#9f9caf";
        ctx.fillText(auto ? "АВТО" : skill.type === "auto" ? "ВЫКЛ" : "РУЧН.", r.x + r.w - 5, r.y + 14);
        ctx.textAlign = "center";
      }
      ctx.font = "600 12px Segoe UI"; ctx.fillStyle = enabled ? "#f5eee5" : "#aaa6b6";
      ctx.fillText(LABEL[id], cx, r.y + 54);
      ctx.font = "12px Segoe UI"; ctx.fillStyle = color;
      const detail = id === "potion" ? "×" + run.sim.potionsLeft
        : timing.frozen ? "Заморозка" : timing.stunned ? "Оглушение"
        : timing.left > 0 && skill.type !== "auto" ? cooldownLabel(timing.left) : timing.cost + " · " + RES_NAME[skill.res];
      ctx.fillText(detail, cx, r.y + 69);
    }
  }

  return { draw, drawIcon, slotAt, equipRunSkill, slotUsable, Y0 };
})();
