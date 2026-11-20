// DWR :: paneleditor.js — редактор панели навыков. Контракт: DWR.PanelEditor.redraw().
"use strict";
window.DWR = window.DWR || {};

DWR.PanelEditor = (function () {
  const ACTIONS = { targeted: "Перетащить на врага", instant: "Нажать", cycle: "ЛКМ меняет режим",
    potion: "Перетащить на героя" };
  const RESOURCES = { rage: "ярость", focus: "фокус" };
  let toastTimer = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function savePanel() { DWR.State.save(); redraw(); }

  // Клик по занятому слоту — снять элемент (в библиотеку)
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
    DWR.State.data.panel = [null, null, null, null, null];
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
      return drag.slot === null ? null : element.closest(".pe-library");
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
    const potionStock = S.stats().potionStock;
    const icon = id => `<img class="pe-slot-icon" src="${DWR.Assets.iconUrl(id === "fireball" ? "heal" : id)}" alt="" draggable="false">`;

    // Ряд из 5 слотов
    const slots = data.panel.map((item, i) => {
      if (item === null) {
        return `<div class="pe-slot pe-slot-empty" data-slot="${i}" aria-label="Пустой слот">—</div>`;
      }
      const sk = DWR.CONFIG.skills[item];
      return `<button class="pe-slot pe-slot-filled" draggable="true" data-slot="${i}" data-drag-skill="${item}"
        onclick="DWR.PanelEditor._remove(${i})" aria-label="Убрать: ${esc(sk.name)}">
        ${icon(item)}
        <span class="pe-slot-name">${esc(sk.name)}</span>
        ${item === "potion" ? (potionStock ? `<span class="pe-slot-badge">×${potionStock}</span>` : '<span class="pe-slot-owner">Не изучено</span>')
          : `<span class="pe-slot-owner">${DWR.CONFIG.heroes[sk.owner].name}</span>`}
      </button>`;
    }).join("");

    // Библиотека содержит изученные навыки, которые ещё не добавлены на панель.
    const lib = Object.keys(DWR.CONFIG.skills)
      .filter(id => S.hasSkill(id) && !data.panel.includes(id))
      .map(id => {
        const sk = DWR.CONFIG.skills[id];
        const detail = id === "potion" ? `${ACTIONS.potion} · На старте ×${potionStock}`
          : sk.type === "cycle" ? ACTIONS.cycle : `${sk.cost} · ${RESOURCES[sk.res]} · ${ACTIONS[sk.type]}`;
        return `<button class="pe-lib-item" draggable="true" data-drag-skill="${id}" onclick="DWR.PanelEditor._place('${id}')">
          ${icon(id)} <span><strong>${esc(sk.name)}</strong><small>${detail}</small></span>
          <span class="pe-add" aria-hidden="true">+</span>
        </button>`;
      });

    const el = document.getElementById("screen-panel");
    el.innerHTML = `
      <main class="up-page pe-page">
        <header class="up-header">
          <h2 class="scr-h2">Панель навыков</h2>
          <div class="up-header-right">
            <button class="btn" onclick="DWR.showScreen('location')">Назад</button>
          </div>
        </header>
        <div class="pe-layout">
          <section class="pe-loadout">
            <div class="pe-section-head">
              <h3>Снаряжение <small>${data.panel.filter(Boolean).length} / ${data.panel.length}</small></h3>
              <button class="btn pe-clear" onclick="DWR.PanelEditor._clear()"${data.panel.some(Boolean) ? "" : " disabled"}>Очистить панель</button>
            </div>
            <div class="pe-slots">${slots}</div>
            <p class="pe-hint">Перетащите навык в слот, на соседний навык или обратно в библиотеку.</p>
          </section>
          <section class="pe-library">
            <div class="pe-section-head"><h3>Библиотека</h3></div>
            ${lib.length ? `<div class="pe-lib">${lib.join("")}</div>` : '<p class="pe-hint">Все доступные навыки на панели.</p>'}
          </section>
        </div>
        <div class="pe-toast" id="pe-toast" role="status"></div>
      </main>`;
    bindSkillDrag(el.querySelector(".pe-page"));
  }

  return { redraw, _remove, _place, _clear };
})();
