// DWR :: panel.js — панель навыков на canvas (низ экрана боя).
// Слоты на забег: копия State.data.panel с доступными расходниками и режимом жрицы.
// Панель использует слоты из состояния забега, редактор использует те же иконки.
"use strict";
window.DWR = window.DWR || {};

DWR.Panel = (function () {
  const SLOT = 92, GAP = 14, N = 5;
  const W = () => N * SLOT + (N - 1) * GAP;
  const X0 = () => (DWR.CONFIG.canvas.w - W()) / 2;
  const Y0 = () => 585;

  const RES_COLOR = { rage: "#eb9478", focus: "#91cd94" };
  const RES_NAME = { rage: "ярость", focus: "фокус" };
  const LABEL = { powerStrike: "Удар", block: "Блок", multishot: "Веер", preciseShot: "Меткий", potion: "Зелье" };

  function slotRect(i) { return { x: X0() + i * (SLOT + GAP), y: Y0(), w: SLOT, h: SLOT }; }

  function slotAt(run, x, y) {
    for (let i = 0; i < run.tempPanel.length; i++) {
      const r = slotRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  // Если места нет, временный слот справа сохраняет выбранную панель игрока.
  function equipRunSkill(run, id) {
    const p = run.tempPanel;
    if (p.includes(id)) return;
    const i = p.indexOf(null);
    p[i < 0 ? p.length : i] = id;
  }

  // Доступен ли слот для активации (жив владелец, хватает ресурса)
  function slotUsable(run, id) {
    if (id === "potion") return run.sim.potionsLeft > 0;
    if (id === "fireball") return run.sim.heroes.priest.alive;
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

  function drawPriestSpell(ctx, sim, id, x, y) {
    const state = DWR.Sim.priestSpellStatus(sim, id);
    const size = 29;
    const left = x - size / 2;
    const cooldown = state.left > 0;
    const progress = Math.min(1, state.left / state.duration);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(left, y, size, size, 4);
    ctx.fillStyle = "#15151e"; ctx.fill();
    ctx.strokeStyle = state.ready ? "#a9dfc2" : "#555165"; ctx.stroke();
    ctx.clip();
    ctx.globalAlpha = state.enabled ? 1 : 0.40;
    drawIcon(ctx, id, left + 3, y + 3, size - 6);
    ctx.globalAlpha = 1;
    if (cooldown) {
      ctx.fillStyle = "rgba(12,9,20," + (0.2 + progress * 0.65) + ")";
      ctx.fillRect(left, y, size, size);
      ctx.fillStyle = state.enabled ? "#ffd092" : "#938a9f";
      ctx.fillRect(left, y + size - 2, size * (1 - progress), 2);
    }
    ctx.restore();
    let label = "—", color = "#a39cac";
    if (cooldown) {
      label = cooldownLabel(state.left);
      if (state.enabled) color = "#ffd092";
    } else if (state.enabled) {
      label = state.ready ? "Готово" : state.hasMana ? "Резерв" : "Нет маны";
      color = state.ready ? "#a9dfc2" : "#ffb4a7";
    }
    ctx.fillStyle = color; ctx.font = "600 10px Segoe UI";
    ctx.fillText(label, x, y + 43);
  }

  function drawPriestMode(ctx, sim, x, y, mode) {
    const alive = sim.heroes.priest.alive;
    ctx.font = "600 13px Segoe UI"; ctx.fillStyle = alive ? mode.color : "#a39cac";
    ctx.fillText(alive ? mode.name : "Вне боя", x, y + 18);
    drawPriestSpell(ctx, sim, "heal", x - 21, y + 24);
    drawPriestSpell(ctx, sim, "fireball", x + 21, y + 24);
    if (alive) {
      ctx.fillStyle = "#b0aaba"; ctx.font = "10px Segoe UI";
      ctx.fillText("ЛКМ: сменить", x, y + 83);
    }
  }

  function draw(ctx, run) {
    ctx.beginPath(); ctx.roundRect(34, 568, 1212, 126, 12);
    ctx.fillStyle = "#191a23"; ctx.fill();
    ctx.strokeStyle = "#353542"; ctx.lineWidth = 1; ctx.stroke();

    const hoveredSlot = DWR.Input ? slotAt(run, DWR.Input.x, DWR.Input.y) : -1;
    const showPriestCosts = run.tempPanel[hoveredSlot] === "fireball";
    ctx.textAlign = "left"; ctx.font = "600 16px Segoe UI"; ctx.fillStyle = "#f5eee5";
    ctx.fillText("Панель навыков", 55, 619);
    ctx.font = "13px Segoe UI"; ctx.fillStyle = "#b0aaba";
    if (showPriestCosts) {
      const heal = DWR.Sim.priestSpellStatus(run.sim, "heal");
      const fireball = DWR.Sim.priestSpellStatus(run.sim, "fireball");
      ctx.fillText("Лечение: " + heal.cost + " маны · Фаербол: " + fireball.cost + " маны", 55, 641);
    } else ctx.fillText("Нажмите или перетащите навык", 55, 641);

    for (let i = 0; i < run.tempPanel.length; i++) {
      const r = slotRect(i), id = run.tempPanel[i];
      const enabled = id && slotUsable(run, id);
      const mode = id === "fireball" ? DWR.CONFIG.priestModes[run.sim.priestMode] : null;
      const hovering = id && hoveredSlot === i;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fillStyle = mode && enabled ? "#272739" : id ? "#22232f" : "#15161e";
      ctx.fill();
      ctx.strokeStyle = hovering ? "#ffd092" : mode && enabled ? mode.color : id ? "#454451" : "#393a47";
      if (!id) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      const cx = r.x + r.w / 2;
      if (!id) {
        ctx.fillStyle = "#7f7b8c"; ctx.font = "21px Segoe UI";
        ctx.fillText("—", cx, r.y + 53);
        continue;
      }
      if (mode) {
        drawPriestMode(ctx, run.sim, cx, r.y, mode);
        continue;
      }

      const skill = DWR.CONFIG.skills[id];
      const timing = id === "potion" ? null : DWR.Sim.skillStatus(run.sim, id);
      const color = id === "potion" ? "#ff938a" : RES_COLOR[skill.res];
      ctx.globalAlpha = enabled ? 1 : 0.52;
      drawIcon(ctx, id, cx - 20, r.y + 8, 40);
      ctx.globalAlpha = 1;
      if (timing?.left > 0) {
        const readyPart = 1 - timing.left / timing.duration;
        ctx.fillStyle = "rgba(12,9,20," + (1 - readyPart) * 0.65 + ")";
        ctx.fillRect(cx - 20, r.y + 8, 40, 40);
        ctx.fillStyle = "#ffd092"; ctx.fillRect(cx - 20, r.y + 49, 40 * readyPart, 2);
      }
      ctx.font = "600 14px Segoe UI"; ctx.fillStyle = enabled ? "#f5eee5" : "#a39cac";
      ctx.fillText(LABEL[id], cx, r.y + 62);
      ctx.font = "12px Segoe UI"; ctx.fillStyle = color;
      const detail = id === "potion" ? "×" + run.sim.potionsLeft
        : timing.left > 0 ? cooldownLabel(timing.left) : timing.cost + " · " + RES_NAME[skill.res];
      ctx.fillText(detail, cx, r.y + 80);
    }
  }

  return { draw, drawIcon, slotAt, slotRect, equipRunSkill, slotUsable, Y0 };
})();
