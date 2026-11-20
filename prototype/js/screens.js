// DWR :: screens.js — DOM-экраны: меню, настройки, выбор локации, итоги.
// Контракт: DWR.Screens.redraw(), DWR.Screens.showResults(r).
"use strict";
window.DWR = window.DWR || {};

DWR.Screens = (function () {

  let resultsFilled = false;   // showResults уже заполнил экран итогов — redraw не трогает
  let selectedLocation = null;

  const S = DWR.State;
  const roles = { warrior: "Защита", priest: "Лечение", ranger: "Дальний бой" };

  const menuButton = (id, label, attrs = "") => `
    <button id="scr-btn-${id}" class="btn" ${attrs}>
      <img src="${DWR.Assets.assetUrl("menu-" + id + ".png")}" alt="">${label}
    </button>`;

  // ---------- Экран: главное меню ----------
  function renderMenu() {
    const el = document.getElementById("screen-menu");
    if (!el) return;
    const started = S.data.started === true;
    el.innerHTML = `
      <main class="scr-cover">
        <div class="scr-cover-copy">
          <h1 class="scr-title"><span>Don't Wipe</span> <span>the Raid</span></h1>
          <p class="scr-intro">Спустись во тьму. Сокруши тех, кто ждёт внизу.</p>
          <div class="scr-menu-buttons">
            ${started ? menuButton("continue", "Продолжить") : ""}
            ${menuButton("new", "Новая игра", started ? 'aria-haspopup="dialog"' : "")}
            ${started ? "" : menuButton("continue", "Продолжить", "disabled")}
            ${menuButton("settings", "Настройки", 'aria-haspopup="dialog"')}
          </div>
        </div>
      </main>
      ${settingsDialog()}
      ${started ? newGameDialog() : ""}`;

    const startNew = () => {
      S.reset();
      S.data.started = true;
      S.save();
      returnToCamp();
    };

    const newButton = el.querySelector("#scr-btn-new");
    if (started) {
      el.querySelector("#scr-btn-continue").addEventListener("click", returnToCamp);
      const confirm = el.querySelector("#scr-confirm-new");
      bindDialog(newButton, confirm);
      confirm.querySelector("#scr-btn-confirm-yes").addEventListener("click", () => {
        confirm.close();
        startNew();
      });
    } else newButton.addEventListener("click", startNew);
    bindSettings(el);
  }

  function newGameDialog() {
    return `
      <dialog class="scr-dialog" id="scr-confirm-new" aria-labelledby="scr-confirm-title" aria-describedby="scr-confirm-description">
        <form method="dialog">
          <header class="scr-dialog-header">
            <h2 class="scr-h2" id="scr-confirm-title">Новая игра</h2>
            <button class="btn scr-dialog-close" aria-label="Закрыть подтверждение"></button>
          </header>
          <p class="scr-confirm-description" id="scr-confirm-description">Текущий прогресс будет перезаписан.</p>
          <footer class="scr-dialog-footer scr-confirm-actions">
            <button id="scr-btn-confirm-no" class="btn" autofocus>Отмена</button>
            <button id="scr-btn-confirm-yes" class="btn btn-gold" type="button">Начать заново</button>
          </footer>
        </form>
      </dialog>`;
  }

  function settingsDialog() {
    const slider = (id, label) => {
      const value = S.data.settings[id];
      const percent = Math.round(value * 100) + "%";
      return `<div class="scr-slider-row">
        <label for="scr-${id}">${label}</label>
        <output for="scr-${id}" id="scr-${id}-val">${percent}</output>
        <input id="scr-${id}" type="range" min="0" max="1" step="0.05" value="${value}" aria-valuetext="${percent}">
      </div>`;
    };
    return `
      <dialog class="scr-dialog" id="scr-settings" aria-labelledby="scr-settings-title">
        <form method="dialog">
          <header class="scr-dialog-header">
            <h2 class="scr-h2" id="scr-settings-title">Настройки</h2>
            <button class="btn scr-dialog-close" aria-label="Закрыть настройки" autofocus></button>
          </header>
          <fieldset class="scr-volume">
            <legend>Громкость</legend>
            ${slider("music", "Музыка")}
            ${slider("sound", "Звуковые эффекты")}
          </fieldset>
          <footer class="scr-dialog-footer scr-settings-footer">
            <span>Сохраняется автоматически</span>
            <button class="btn btn-gold">Готово</button>
          </footer>
        </form>
      </dialog>`;
  }

  function bindDialog(trigger, dialog) {
    trigger.addEventListener("click", () => dialog.showModal());
    let pressedBackdrop = false;
    dialog.addEventListener("pointerdown", e => { pressedBackdrop = e.target === dialog; });
    dialog.addEventListener("click", e => {
      if (pressedBackdrop && e.target === dialog) dialog.close();
    });
  }

  function bindSettings(menu) {
    const el = menu.querySelector("#scr-settings");
    bindDialog(menu.querySelector("#scr-btn-settings"), el);
    for (const key of ["music", "sound"]) {
      const inp = el.querySelector("#scr-" + key);
      const output = el.querySelector("#scr-" + key + "-val");
      inp.addEventListener("input", () => {
        S.data.settings[key] = inp.valueAsNumber;
        const percent = Math.round(inp.valueAsNumber * 100) + "%";
        output.value = percent;
        inp.setAttribute("aria-valuetext", percent);
        S.save();
      });
    }
  }

  // ---------- Экран: выбор локации ----------
  function returnToCamp() {
    selectedLocation = null;
    DWR.showScreen("location");
  }

  function renderLocation(direction = 0) {
    const el = document.getElementById("screen-location");
    if (!el) return;
    const locations = DWR.CONFIG.locations;
    const ids = Object.keys(locations);
    const unlocked = ids.filter(S.locationUnlocked);
    const id = unlocked.includes(selectedLocation) ? selectedLocation
      : unlocked.find(id => !S.locationCleared(id)) ?? unlocked.at(-1);
    selectedLocation = id;
    const index = ids.indexOf(id);
    const location = locations[id];
    const previous = ids[index - 1], next = ids[index + 1];
    const left = S.locationUnlocked(previous), right = S.locationUnlocked(next);
    const treasure = S.treasureAvailable(id);
    const room = DWR.CONFIG.rooms[location.rooms[0]];
    const cleared = S.locationCleared(id);
    const potions = S.hasSkill("potion") && S.data.panel.includes("potion") ? S.stats().potionStock : 0;
    const arrow = (side, label, enabled) => `
      <button class="btn scr-carousel-arrow scr-carousel-${side}" aria-label="${label}" ${enabled ? "" : "disabled"}>
        <span aria-hidden="true"></span>
      </button>`;
    el.innerHTML = `
      <main class="scr-location scr-camp">
        <header class="scr-statusbar">
          <h2 class="scr-h2">Подготовка к рейду</h2>
          <div class="scr-status-info">
            <span><img src="assets/out/coin.png" alt=""> <b>${S.data.coins}</b> монет</span>
            ${potions > 0 ? `<span class="scr-camp-potions"><img src="${DWR.Assets.iconUrl("potion")}" alt="">Зелья <b>${potions}</b></span>` : ""}
            <button id="scr-btn-menu" class="btn">Меню</button>
          </div>
        </header>
        <div class="scr-raid-grid">
          <section class="scr-carousel" aria-label="Выбор локации">
            <div class="scr-card-location">
              <img class="scr-carousel-art${direction ? " scr-art-enter" : ""}" src="${DWR.Assets.assetUrl("room" + (room.art ?? room.id) + ".jpg")}" alt="">
              <div class="scr-carousel-info">
                <h3>${location.name}</h3>
                <p class="scr-location-meta${cleared ? " scr-location-cleared" : ""}">${cleared ? "Пройдена" : "Не пройдена"}</p>
                <div class="scr-location-buttons">
                  <button class="btn btn-gold" id="scr-btn-fight">В бой</button>
                  ${treasure ? '<button class="btn" id="scr-btn-treasure">Сокровищница</button>' : ""}
                </div>
              </div>
              ${arrow("prev", "Предыдущая локация", left)}
              ${arrow("next", "Следующая локация", right)}
            </div>
          </section>
          <section class="scr-party">
            <h3>Отряд</h3>
            <div class="scr-party-roster">
              ${DWR.CONFIG.heroOrder.map(id => `
                <div class="scr-hero">
                  <div class="scr-portrait"><img src="assets/out/${id}.png" alt=""></div>
                  <div><strong>${DWR.CONFIG.heroes[id].name}</strong><span>${roles[id]}</span></div>
                </div>`).join("")}
            </div>
            <div class="scr-party-actions">
              <button id="scr-btn-upgrade" class="btn"><img src="${DWR.Assets.iconUrl("powerStrike")}" alt="">Прокачка</button>
              <button id="scr-btn-panel" class="btn"><img src="${DWR.Assets.iconUrl("multishot")}" alt="">Панель навыков</button>
            </div>
          </section>
        </div>
      </main>`;

    el.querySelector("#scr-btn-menu").addEventListener("click", () => DWR.showScreen("menu"));
    function select(step) {
      const target = ids[index + step];
      if (!S.locationUnlocked(target)) return;
      selectedLocation = target;
      renderLocation(step);
      const button = el.querySelector(step > 0 ? ".scr-carousel-next" : ".scr-carousel-prev");
      (button.disabled ? el.querySelector(step > 0 ? ".scr-carousel-prev" : ".scr-carousel-next") : button).focus();
    }
    el.querySelector(".scr-carousel-prev").addEventListener("click", () => select(-1));
    el.querySelector(".scr-carousel-next").addEventListener("click", () => select(1));
    el.querySelector(".scr-carousel").addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      select(e.key === "ArrowLeft" ? -1 : 1);
    });
    el.querySelector("#scr-btn-fight").addEventListener("click", () => DWR.startRun(id));
    el.querySelector("#scr-btn-treasure")?.addEventListener("click", () => DWR.startRun(id, true));
    el.querySelector("#scr-btn-upgrade").addEventListener("click", () => DWR.showScreen("upgrade"));
    el.querySelector("#scr-btn-panel").addEventListener("click", () => DWR.showScreen("panel"));
  }

  // ---------- Экран: итоги забега ----------
  function renderResults(result) {
    const el = document.getElementById("screen-results");
    if (!el) return;
    const titles = { win: "Победа!", wipe: "Отряд пал…", retreat: "Отступление" };
    const reason = result?.reason || "retreat";
    const title = result?.treasureOnly && reason === "win" ? "Награда получена" : titles[result?.reason] || "Забег завершён";
    const { coins = 0, roomsCleared = 0, roomsTotal = 0, roomId = 1, location = "dungeon", party = [] } = result || {};
    const roster = party.map(({ id, hp, maxHp, alive }) => `
      <div class="scr-result-hero${alive ? "" : " scr-result-fallen"}">
        <div class="scr-portrait"><img src="assets/out/${id}.png" alt=""></div>
        <div><strong>${DWR.CONFIG.heroes[id].name}</strong><span>${alive ? Math.ceil(hp) + " / " + maxHp + " ОЗ" : "Пал в бою"}</span></div>
      </div>`).join("");
    el.innerHTML = `
      <main class="scr-location scr-results-page">
        <header class="scr-statusbar"><h2 class="scr-h2">Итоги рейда</h2></header>
        <section class="scr-result-art">
          <img src="${DWR.Assets.assetUrl("room" + (DWR.CONFIG.rooms.find(room => room.id === roomId)?.art ?? roomId) + ".jpg")}" alt="">
          <div>
            <div class="scr-location-meta">${DWR.CONFIG.locations[location].name}</div>
            <h3 class="scr-results-title scr-results-${reason}">${title}</h3>
          </div>
        </section>
        <footer class="scr-report">
          ${roomsTotal > 0 ? `<div class="scr-report-progress">
            <label for="raid-progress">Пройдено комнат</label><strong>${roomsCleared} / ${roomsTotal}</strong>
            <progress id="raid-progress" value="${roomsCleared}" max="${roomsTotal}"></progress>
          </div>` : ""}
          <div class="scr-results-rewards">
            <img src="assets/out/coin.png" alt=""><span><b>${coins}</b>Монеты</span>
          </div>
          <div class="scr-result-roster" aria-label="Состояние отряда">${roster}</div>
          <button id="scr-btn-to-location" class="btn btn-gold">К подготовке</button>
        </footer>
      </main>`;
    el.querySelector("#scr-btn-to-location").addEventListener("click", returnToCamp);
  }

  // ---------- Публичный API ----------
  return {
    redraw() {
      renderMenu();
      renderLocation();
      if (!resultsFilled) renderResults(null);
    },
    showResults(result) {
      resultsFilled = true;
      renderResults(result);
    }
  };
})();
