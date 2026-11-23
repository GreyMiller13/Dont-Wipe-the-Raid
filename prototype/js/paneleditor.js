// DWR :: paneleditor.js — редактор панели навыков. Контракт: DWR.PanelEditor.redraw().
"use strict";
window.DWR = window.DWR || {};

DWR.PanelEditor = (function () {
  const RESOURCES = { rage: "ярости", focus: "фокуса", mana: "маны" };
  let toastTimer = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function savePanel() { DWR.State.save(); redraw(); }

  // Клик по занятому слоту возвращает элемент в список доступных.
  function _remove(i) {
    DWR.State.data.panel[i] = null;
    savePanel();
  }

  // По клику заполняем первый свободный слот. Перетаскивание задаёт слот явно.
  function _place(id, slot) {
    const S = DWR.State;
    const panel = S.data.panel;
    if (!S.hasSkill(id) || panel.includes(id)) return;
    const i = slot ?? panel.indexOf(null);
    if (i < 0) { showToast("Нет свободных слотов"); return; }
    panel[i] = id;
    savePanel();
  }

  function _clear() {
    DWR.State.data.panel.fill(null);
    savePanel();
  }

  // Inline-подсказка на 2 секунды
  function showToast(msg) {
    const el = document.getElementById("pe-toast");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = "none"; }, 2000);
  }

  function bindSkillDrag(page) {
    let drag = null, highlight = null;

    function showTarget(target) {
      if (highlight === target) return;
      highlight?.classList.remove("pe-drop-active");
      highlight = target;
      highlight?.classList.add("pe-drop-active");
    }
    function endDrag() {
      drag?.element.classList.remove("pe-dragging");
      drag = null;
      showTarget(null);
    }
    function dropTarget(element) {
      if (!drag) return null;
      const slot = element.closest("[data-slot]");
      if (slot) return Number(slot.dataset.slot) === drag.slot ? null : slot;
      return drag.slot === null ? null : element.closest(".pe-available");
    }

    page.addEventListener("dragstart", e => {
      const element = e.target.closest("[data-drag-skill]");
      if (!element) return;
      endDrag();
      drag = { element, id: element.dataset.dragSkill, slot: element.hasAttribute("data-slot") ? Number(element.dataset.slot) : null };
      e.dataTransfer.setData("text/plain", drag.id);
      e.dataTransfer.effectAllowed = "move";
      element.classList.add("pe-dragging");
    });
    page.addEventListener("dragover", e => {
      const target = dropTarget(e.target);
      showTarget(target);
      if (!target) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    page.addEventListener("dragleave", e => {
      if (highlight && (!e.relatedTarget || !highlight.contains(e.relatedTarget))) showTarget(null);
    });
    page.addEventListener("drop", e => {
      const target = dropTarget(e.target);
      if (!target) return;
      e.preventDefault();
      const { id, slot } = drag;
      endDrag();
      if (!target.hasAttribute("data-slot")) {
        _remove(slot);
        return;
      }
      const destination = Number(target.dataset.slot);
      if (slot === null) _place(id, destination);
      else {
        const panel = DWR.State.data.panel;
        [panel[slot], panel[destination]] = [panel[destination], panel[slot]];
        savePanel();
      }
    });
    page.addEventListener("dragend", endDrag);
  }

  function redraw() {
    const S = DWR.State;
    const data = S.data;
    const stats = S.stats();
    const filledCount = data.panel.filter(Boolean).length;
    const stocks = { potion: stats.potionStock, bomb: S.bombStock(stats), noiseBomb: S.bombStock(stats, "noiseBomb") };
    const icon = id => `<img class="pe-skill-icon" src="${DWR.Assets.iconUrl(id)}" alt="" draggable="false">`;

    const slots = data.panel.map((item, i) => {
      if (item === null) {
        return `<div class="pe-slot pe-slot-empty" data-slot="${i}">Свободно</div>`;
      }
      const sk = DWR.CONFIG.skills[item];
      return `<button class="pe-slot pe-slot-filled" draggable="true" data-slot="${i}" data-drag-skill="${item}"
        onclick="DWR.PanelEditor._remove(${i})" aria-label="Убрать: ${esc(sk.name)}">
        ${icon(item)}
        <span class="pe-slot-name">${esc(sk.name)}</span>
        ${Object.hasOwn(stocks, item) ? (stocks[item] ? `<span class="pe-slot-badge">×${stocks[item]}</span>` : '<span class="pe-slot-owner">Подбирается в бою</span>')
          : `<span class="pe-slot-owner">${DWR.CONFIG.heroes[sk.owner].name}</span>`}
      </button>`;
    }).join("");

    const available = Object.keys(DWR.CONFIG.skills)
      .filter(id => S.hasSkill(id) && !data.panel.includes(id))
      .map(id => {
        const sk = DWR.CONFIG.skills[id];
        const action = DWR.Panel.actionHint(sk);
        const detail = Object.hasOwn(stocks, id)
          ? `${stocks[id] ? `На старте ×${stocks[id]}` : "Подбирается в бою"} · ${action}`
          : `${sk.cost} ${RESOURCES[sk.res]} · ${action}`;
        return `<button class="pe-option" draggable="true" data-drag-skill="${id}" onclick="DWR.PanelEditor._place('${id}')">
          ${icon(id)} <span><strong>${esc(sk.name)}</strong><small>${detail}</small></span>
          <span class="pe-add" aria-hidden="true">+</span>
        </button>`;
      });

    const el = document.getElementById("screen-panel");
    const scrollTop = el.querySelector(".pe-available")?.scrollTop ?? 0;
    el.innerHTML = `
      <main class="up-page pe-page">
        <header class="up-header">
          <h2 class="scr-h2">Панель навыков</h2>
          <button class="btn" onclick="DWR.showScreen('location')">Назад</button>
        </header>
        <div class="pe-layout">
          <section class="pe-loadout" aria-labelledby="pe-slots-title">
            <div class="pe-section-head">
              <h3 id="pe-slots-title">Слоты панели <small aria-label="Занято ${filledCount} из ${data.panel.length}">${filledCount} / ${data.panel.length}</small></h3>
              <button class="btn pe-clear" onclick="DWR.PanelEditor._clear()"${filledCount ? "" : " disabled"}>Очистить панель</button>
            </div>
            <div class="pe-slots" style="--slot-count:${data.panel.length}">${slots}</div>
            <p class="pe-hint">Перетащите карточку, чтобы поменять её место. Нажмите на занятый слот, чтобы освободить его.</p>
          </section>
          <section class="pe-available" aria-labelledby="pe-available-title">
            <div class="pe-section-head">
              <h3 id="pe-available-title">Доступные навыки и предметы</h3>
              ${available.length ? '<p class="pe-hint">Нажмите на карточку или перетащите её в нужный слот.</p>' : ""}
            </div>
            ${available.length ? `<div class="pe-options">${available.join("")}</div>`
              : '<p class="pe-hint pe-empty">Все доступные навыки и предметы уже на панели.</p>'}
          </section>
        </div>
        <div class="pe-toast" id="pe-toast" role="status"></div>
      </main>`;
    el.querySelector(".pe-available").scrollTop = scrollTop;
    bindSkillDrag(el.querySelector(".pe-page"));
  }

  return { redraw, _remove, _place, _clear };
})();
