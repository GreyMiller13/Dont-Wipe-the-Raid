// DWR :: screens.js — DOM-экраны: меню, вступление, журнал обновлений, настройки, выбор локации, итоги.
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
      ${id === "stats" || id === "news" ? `<span class="scr-menu-icon scr-menu-${id}-icon" aria-hidden="true"></span>`
        : `<img src="${DWR.Assets.assetUrl("menu-" + id + ".png")}" alt="">`}${label}
    </button>`;

  // ---------- Экран: главное меню ----------
  function renderMenu() {
    const el = document.getElementById("screen-menu");
    if (!el) return;
    const started = S.data.started === true;
    const hasPrologue = Boolean(document.getElementById("screen-prologue"));
    el.innerHTML = `
      <main class="scr-cover">
        <div class="scr-cover-copy">
          <h1 class="scr-title"><span>Don't Wipe</span> <span>the Raid</span></h1>
          <p class="scr-intro">Спустись во тьму. Сокруши тех, кто ждёт внизу.</p>
          <div class="scr-menu-buttons">
            ${started ? menuButton("continue", "Продолжить") : ""}
            ${menuButton("new", "Новая игра", started ? 'aria-haspopup="dialog"' : "")}
            ${started ? "" : menuButton("continue", "Продолжить", "disabled")}
            ${started ? menuButton("stats", "Статистика", 'aria-haspopup="dialog" aria-controls="scr-raid-stats"') : ""}
            ${menuButton("settings", "Настройки", 'aria-haspopup="dialog"')}
            ${menuButton("news", "Что нового", 'aria-controls="screen-news"')}
          </div>
        </div>
      </main>
      ${settingsDialog()}
      ${skillHotkeysDialog()}
      ${started ? newGameDialog() + raidStatsDialog() : ""}`;

    const continueGame = () => {
      if (hasPrologue && S.data.prologuePending) DWR.showScreen("prologue");
      else returnToCamp();
    };
    const startNew = () => {
      S.reset();
      S.data.started = true;
      S.data.prologuePending = hasPrologue;
      S.save();
      continueGame();
    };

    const newButton = el.querySelector("#scr-btn-new");
    if (started) {
      el.querySelector("#scr-btn-continue").addEventListener("click", continueGame);
      bindDialog(el.querySelector("#scr-btn-stats"), el.querySelector("#scr-raid-stats"));
      const confirm = el.querySelector("#scr-confirm-new");
      bindDialog(newButton, confirm);
      confirm.querySelector("#scr-btn-confirm-yes").addEventListener("click", () => {
        confirm.close();
        startNew();
      });
    } else newButton.addEventListener("click", startNew);
    el.querySelector("#scr-btn-news").addEventListener("click", () => DWR.showScreen("news"));
    bindSettings(el);
  }

  function renderPrologue() {
    const el = document.getElementById("screen-prologue");
    el.innerHTML = `
      <main class="scr-prologue" aria-label="Вступление" tabindex="-1">
        <img src="assets/backgrounds/guild-prologue.webp?v=5" width="2340" height="1572"
          alt="У доски заданий гильдии воин замечает объявление о награде за Лича. К нему подходят лучник и жрица. Трое отправляются мимо деревни к входу в Мрачное подземелье.">
        <button class="btn btn-gold" type="button">Начать приключение</button>
      </main>`;
    el.querySelector("button").addEventListener("click", () => {
      S.data.prologuePending = false;
      S.save();
      returnToCamp();
    });
    el.querySelector("main").focus();
  }

  const releaseDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" });

  function renderNews() {
    const el = document.getElementById("screen-news");
    const updates = [...DWR.RELEASE_NOTES].sort((a, b) => b.date.localeCompare(a.date));
    el.innerHTML = `
      <main class="scr-location scr-news">
        <header class="scr-statusbar">
          <h1 id="scr-news-title" class="scr-h2" tabindex="-1">Что нового</h1>
          <button type="button" id="scr-news-back" class="btn">Назад</button>
        </header>
        <ol class="scr-news-list" aria-labelledby="scr-news-title" tabindex="0">
          ${updates.map(({ date, title, changes }) => `
            <li class="scr-news-entry">
              <time datetime="${date}">${releaseDate.format(new Date(date))}</time>
              <div>
                <h2>${title}</h2>
                <ul>${changes.map(change => `<li>${change}</li>`).join("")}</ul>
              </div>
            </li>`).join("")}
        </ol>
      </main>`;
    const backToMenu = () => {
      DWR.showScreen("menu");
      document.getElementById("scr-btn-news").focus();
    };
    el.querySelector("#scr-news-back").addEventListener("click", backToMenu);
    el.querySelector(".scr-news").addEventListener("keydown", event => {
      if (event.key === "Escape") backToMenu();
    });
    el.querySelector("#scr-news-title").focus();
  }

  const raidNumbers = new Intl.NumberFormat("ru-RU");

  function raidDuration(seconds) {
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60;
    return `${hours ? `${raidNumbers.format(hours)} ч ` : ""}${hours || minutes ? `${minutes} мин ` : ""}${total % 60} с`;
  }

  function raidStatsDialog() {
    const stats = S.data.raidStats;
    const metric = (title, value, icon = "") => `
      <div><dt>${icon ? `<img src="assets/out/${icon}.png" alt="">` : ""}${title}</dt><dd>${value}</dd></div>`;
    const count = (title, value) => metric(title, raidNumbers.format(value));
    const locations = Object.entries(DWR.CONFIG.locations).filter(([id, location]) =>
      location.rooms.length && S.locationUnlocked(id));
    const rows = locations.map(([id, location]) => {
      const entry = stats.locations[id];
      const first = entry?.firstVictory != null ? `<strong>С ${raidNumbers.format(entry.firstVictory)}-й попытки</strong>`
        : S.locationCleared(id) ? 'Побеждён ранее<small>Число попыток неизвестно</small>' : 'Ещё не побеждён';
      const number = key => raidNumbers.format(entry?.[key] ?? 0);
      return `<tr>
        <th scope="row">${location.name}</th>
        <td>${number("attempts")}</td><td>${number("bossReached")}</td>
        <td class="scr-raid-first">${first}</td><td>${number("bossVictories")}</td>
        <td>${number("retreat")}</td><td>${number("wipe")}</td>
        <td>${entry?.bestBossSeconds != null ? raidDuration(entry.bestBossSeconds) : "—"}</td>
      </tr>`;
    }).join("");
    return `<dialog class="scr-dialog scr-raid-stats" id="scr-raid-stats" aria-labelledby="scr-raid-stats-title">
      <form method="dialog">
        <header class="scr-dialog-header">
          <h2 class="scr-h2" id="scr-raid-stats-title">Статистика</h2>
          <button class="btn scr-dialog-close" aria-label="Закрыть статистику" autofocus></button>
        </header>
        <dl class="scr-raid-totals">
          ${metric("Время в рейдах", raidDuration(stats.seconds))}
          ${metric("Заработано монет", raidNumbers.format(stats.coins), "coin")}
          ${metric("Заработано рун", raidNumbers.format(stats.runes), "rune")}
        </dl>
        <dl class="scr-raid-outcomes">
          ${count("Заходы", stats.starts)}${count("Завершено", stats.win)}${count("Отступления", stats.retreat)}
          ${count("Вайпы", stats.wipe)}
        </dl>
        <div class="scr-raid-table">
          <table>
            <caption>Прогресс по локациям</caption>
            <thead><tr>
              <th scope="col">Локация</th><th scope="col">Заходы</th><th scope="col">Дошли до босса</th>
              <th scope="col">Первая победа</th><th scope="col">Победы над боссом</th>
              <th scope="col">Отступления</th><th scope="col">Вайпы</th><th scope="col">Лучший бой</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${stats.partial ? '<p class="scr-raid-note">Счётчики включают рейды с момента появления статистики.</p>' : ""}
      </form>
    </dialog>`;
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
          <button class="btn scr-settings-hotkeys" id="scr-btn-skill-hotkeys" type="button"
            aria-haspopup="dialog" aria-controls="scr-skill-hotkeys">Горячие клавиши</button>
          <footer class="scr-dialog-footer scr-settings-footer">
            <span>Сохраняется автоматически</span>
            <a class="scr-settings-credit" href="assets/out/music/CREDITS.txt" target="_blank" rel="noopener">Авторы музыки</a>
            <button class="btn btn-gold">Готово</button>
          </footer>
        </form>
      </dialog>`;
  }

  function skillHotkeysDialog() {
    const slots = S.data.settings.skillHotkeys.map((_, i) => `
      <li class="scr-hotkey-slot">
        <span>Слот ${i + 1}</span>
        <button class="btn scr-hotkey-key" type="button" aria-pressed="false"></button>
      </li>`).join("");
    return `
      <dialog class="scr-dialog scr-hotkeys" id="scr-skill-hotkeys" aria-labelledby="scr-hotkeys-title"
        aria-describedby="scr-hotkeys-help">
        <form method="dialog">
          <header class="scr-dialog-header">
            <h2 class="scr-h2" id="scr-hotkeys-title">Горячие клавиши</h2>
            <button class="btn scr-dialog-close" aria-label="Закрыть горячие клавиши"></button>
          </header>
          <p class="scr-hotkeys-help" id="scr-hotkeys-help">Выберите слот и нажмите клавишу.</p>
          <ol class="scr-hotkey-list">${slots}</ol>
          <div class="scr-hotkey-capture">
            <p class="scr-hotkey-status" role="status"></p>
            <button class="btn scr-hotkey-cancel" type="button" hidden>Отменить</button>
          </div>
          <footer class="scr-dialog-footer">
            <button class="btn scr-hotkey-reset" type="button">Сбросить</button>
            <button class="btn btn-gold">Готово</button>
          </footer>
        </form>
      </dialog>`;
  }

  function bindDialog(trigger, dialog) {
    trigger.addEventListener("click", () => dialog.showModal());
    bindDialogBackdrop(dialog);
  }

  function bindDialogBackdrop(dialog) {
    let pressedBackdrop = false;
    dialog.addEventListener("pointerdown", e => { pressedBackdrop = e.target === dialog; });
    dialog.addEventListener("click", e => {
      if (pressedBackdrop && e.target === dialog) dialog.close();
    });
  }

  function bindSettings(menu) {
    const el = menu.querySelector("#scr-settings");
    bindDialog(menu.querySelector("#scr-btn-settings"), el);
    bindSkillHotkeys(el.querySelector("#scr-btn-skill-hotkeys"), menu.querySelector("#scr-skill-hotkeys"));
    for (const key of ["music", "sound"]) {
      const inp = el.querySelector("#scr-" + key);
      const output = el.querySelector("#scr-" + key + "-val");
      inp.addEventListener("input", () => {
        S.data.settings[key] = inp.valueAsNumber;
        const percent = Math.round(inp.valueAsNumber * 100) + "%";
        output.value = percent;
        inp.setAttribute("aria-valuetext", percent);
        DWR.Audio.setVolumes(S.data.settings);
        S.save();
      });
      if (key === "sound") inp.addEventListener("change", () => DWR.Audio.play("ui"));
    }
  }

  function bindSkillHotkeys(trigger, dialog) {
    const buttons = Array.from(dialog.querySelectorAll(".scr-hotkey-key"));
    const status = dialog.querySelector(".scr-hotkey-status");
    const cancel = dialog.querySelector(".scr-hotkey-cancel");
    let activeSlot = null;
    let capturedCode = null;

    function updateSlots(message = "") {
      const hotkeys = S.data.settings.skillHotkeys;
      buttons.forEach((button, i) => {
        const waiting = i === activeSlot;
        button.textContent = waiting ? "…" : hotkeys[i].label;
        button.setAttribute("aria-label", `Слот ${i + 1}. ${waiting ? "Нажмите клавишу" : hotkeys[i].label}`);
        button.setAttribute("aria-pressed", String(waiting));
      });
      cancel.hidden = activeSlot === null;
      status.textContent = message;
    }

    bindDialog(trigger, dialog);
    buttons.forEach((button, i) => button.addEventListener("click", () => {
      activeSlot = activeSlot === i ? null : i;
      updateSlots(activeSlot === null ? "" : `Новая клавиша для слота ${i + 1}`);
    }));
    cancel.addEventListener("click", () => {
      buttons[activeSlot].focus();
      activeSlot = null;
      updateSlots();
    });
    dialog.querySelector(".scr-hotkey-reset").addEventListener("click", () => {
      activeSlot = null;
      S.resetSkillHotkeys();
      updateSlots("Восстановлены клавиши по умолчанию.");
    });
    dialog.addEventListener("keydown", event => {
      if (activeSlot === null && (!event.repeat || !capturedCode)) return;
      const key = DWR.Input.readSkillKey(event);
      if (activeSlot === null && key?.code !== capturedCode) return;
      event.preventDefault();
      if (event.repeat || event.isComposing || !key) return;
      capturedCode = key.code;
      const slot = activeSlot;
      const swapped = S.setSkillHotkey(slot, key);
      activeSlot = null;
      updateSlots(swapped === -1 ? `Слот ${slot + 1} использует ${key.label}.`
        : `Слоты ${slot + 1} и ${swapped + 1} поменялись клавишами.`);
    });
    dialog.addEventListener("keyup", event => {
      if (capturedCode && DWR.Input.readSkillKey(event)?.code === capturedCode) capturedCode = null;
    });
    dialog.addEventListener("close", () => {
      activeSlot = capturedCode = null;
      updateSlots();
    });
    updateSlots();
  }

  // ---------- Экран: выбор локации ----------
  function returnToCamp() {
    selectedLocation = null;
    DWR.showScreen("location");
  }

  function demoDialog() {
    return `
      <dialog class="scr-dialog scr-demo-dialog" id="scr-demo-message" aria-labelledby="scr-demo-title" aria-describedby="scr-demo-description">
        <form method="dialog">
          <header class="scr-dialog-header">
            <h2 class="scr-h2" id="scr-demo-title">Спасибо, что сыграли в демо!</h2>
            <button class="btn scr-dialog-close" aria-label="Закрыть благодарность"></button>
          </header>
          <p id="scr-demo-description">Следующая локация скоро будет готова.</p>
        </form>
      </dialog>`;
  }

  function showDemoMessage(el) {
    const dialog = el.querySelector("#scr-demo-message");
    if (!dialog) return;
    el.querySelector(".scr-carousel-prev").focus();
    dialog.showModal();
  }

  function renderLocation(direction = 0) {
    const el = document.getElementById("screen-location");
    if (!el) return;
    const locations = DWR.CONFIG.locations;
    const ids = Object.keys(locations);
    const unlocked = ids.filter(S.locationUnlocked);
    const playable = unlocked.filter(id => locations[id].rooms.length);
    const id = unlocked.includes(selectedLocation) ? selectedLocation
      : playable.find(id => !S.locationCleared(id)) ?? playable.at(-1);
    selectedLocation = id;
    const location = locations[id];
    const index = ids.indexOf(id);
    const previous = ids[index - 1], next = ids[index + 1];
    const left = S.locationUnlocked(previous), right = S.locationUnlocked(next);
    const treasure = S.treasureAvailable(id);
    const room = DWR.CONFIG.rooms[location.rooms[0]];
    const isPreview = !!location.previewArt;
    const art = location.previewArt ?? DWR.Assets.roomUrl(room);
    const cleared = S.locationCleared(id);
    const stats = S.stats(), panel = S.data.panel;
    const potions = S.hasSkill("potion") && panel.includes("potion") ? stats.potionStock : 0;
    const bombs = panel.includes("bomb") ? S.bombStock(stats) : 0;
    const noiseBombs = panel.includes("noiseBomb") ? S.bombStock(stats, "noiseBomb") : 0;
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
            <span class="scr-camp-runes" title="Руны навыков"><img src="assets/out/rune.png" alt="">Руны <b>${S.data.runes}</b></span>
            ${potions > 0 ? `<span class="scr-camp-potions"><img src="${DWR.Assets.iconUrl("potion")}" alt="">Зелья <b>${potions}</b></span>` : ""}
            ${bombs > 0 ? `<span><img src="${DWR.Assets.iconUrl("bomb")}" alt="">Бомбы <b>${bombs}</b></span>` : ""}
            ${noiseBombs > 0 ? `<span><img src="${DWR.Assets.iconUrl("noiseBomb")}" alt="">Шумовые бомбы <b>${noiseBombs}</b></span>` : ""}
            <button id="scr-btn-menu" class="btn">Меню</button>
          </div>
        </header>
        <div class="scr-raid-grid">
          <section class="scr-carousel" aria-label="Выбор локации">
            <div class="scr-card-location${isPreview ? " scr-card-preview" : ""}">
              <img class="scr-carousel-art${direction ? " scr-art-enter" : ""}" src="${art}" alt="${isPreview ? "Герои на привале у костра" : ""}">
              <div class="scr-carousel-info">
                <h3>${location.name}</h3>
                <p class="scr-location-meta${cleared ? " scr-location-cleared" : ""}">${cleared ? "Пройдена" : "Не пройдена"}</p>
                ${isPreview ? "" : `<div class="scr-location-buttons">
                  <button class="btn btn-gold" id="scr-btn-fight">В бой</button>
                  ${treasure ? '<button class="btn" id="scr-btn-treasure">Сокровищница</button>' : ""}
                </div>`}
              </div>
              ${arrow("prev", "Предыдущая локация", left)}
              ${arrow("next", "Следующая локация", right)}
            </div>
          </section>
          <section class="scr-party" aria-label="Герои и подготовка">
            <div class="scr-party-roster">
              ${DWR.CONFIG.heroOrder.map(id => `
                <div class="scr-hero">
                  <div class="scr-portrait"><img src="assets/out/${id}.png" alt=""></div>
                  <div><strong>${DWR.CONFIG.heroes[id].name}</strong><span>${roles[id]}</span></div>
                </div>`).join("")}
            </div>
            <div class="scr-party-actions">
              ${menuButton("upgrade", "Прокачка")}
              ${menuButton("panel", "Панель навыков")}
              ${menuButton("bestiary", "Бестиарий")}
            </div>
          </section>
        </div>
      </main>
      ${isPreview ? demoDialog() : ""}`;

    el.querySelector("#scr-btn-menu").addEventListener("click", () => DWR.showScreen("menu"));
    if (isPreview) bindDialogBackdrop(el.querySelector("#scr-demo-message"));
    function select(step) {
      const target = ids[index + step];
      if (!S.locationUnlocked(target)) return;
      selectedLocation = target;
      renderLocation(step);
      const button = el.querySelector(step > 0 ? ".scr-carousel-next" : ".scr-carousel-prev");
      (button.disabled ? el.querySelector(step > 0 ? ".scr-carousel-prev" : ".scr-carousel-next") : button).focus();
      showDemoMessage(el);
    }
    el.querySelector(".scr-carousel-prev").addEventListener("click", () => select(-1));
    el.querySelector(".scr-carousel-next").addEventListener("click", () => select(1));
    el.querySelector(".scr-carousel").addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      select(e.key === "ArrowLeft" ? -1 : 1);
    });
    el.querySelector("#scr-btn-fight")?.addEventListener("click", () => DWR.startRun(id));
    el.querySelector("#scr-btn-treasure")?.addEventListener("click", () => DWR.startRun(id, true));
    el.querySelector("#scr-btn-upgrade").addEventListener("click", () => DWR.showScreen("upgrade"));
    el.querySelector("#scr-btn-panel").addEventListener("click", () => DWR.showScreen("panel"));
    el.querySelector("#scr-btn-bestiary").addEventListener("click", () => DWR.showScreen("bestiary"));
    DWR.Assets.preloadLocation(id);
  }

  // ---------- Экран: итоги забега ----------
  const combatNumbers = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const heroAttacks = { sword: "Автоатака мечом", arrow: "Автовыстрел из лука" };
  const enemyAttacks = {
    melee: "Удар в ближнем бою", enemy: "Удар в ближнем бою", enemyArrow: "Выстрел из лука",
    necroticOrb: "Шар некротической энергии", necroticBeam: "Некротический луч",
    firebolt: "Огненный болт", bite: "Укус", claw: "Удар когтями", clawWave: "Волна от удара когтями",
    axe: "Удар топором", smash: "Удар по земле", hammer: "Удар молотом", stunStrike: "Оглушающий удар молотом",
    riftBoulder: "Бросок валуна", riftFireball: "Огненный шар элементаля",
    dragonPaw: "Удар лапой", dragonBreath: "Огненное дыхание"
  };
  const skillName = id => DWR.CONFIG.skills[id]?.name ?? heroAttacks[id] ?? id;
  const combatNumber = value => combatNumbers.format(value);

  function combatHeroCard(id, reports, selected) {
    const damage = new Map(), healing = new Map();
    let given = 0, received = 0, potion = 0, death = null, alreadyFallen = false;
    for (const [index, report] of reports.entries()) {
      const hero = report.heroes[id];
      if (selected !== -1 && index !== selected) {
        if (index < selected && hero.death) alreadyFallen = true;
        continue;
      }
      for (const [skill, amount] of Object.entries(hero.damage)) {
        const total = damage.get(skill) ?? { health: 0, armor: 0 };
        total.health += amount.health;
        total.armor += amount.armor;
        damage.set(skill, total);
      }
      for (const [skill, amount] of Object.entries(hero.healing)) {
        given += amount;
        healing.set(skill, (healing.get(skill) ?? 0) + amount);
      }
      received += hero.healingReceived;
      potion += hero.potionHealing;
      if (hero.death) death = { ...hero.death, room: index + 1 };
    }

    const list = entries => entries.length ? `<dl class="scr-stats-list">${entries.join("")}</dl>`
      : '<p class="scr-stats-empty">—</p>';
    const row = (label, value, detail = false) => {
      const attr = detail ? ' class="scr-stats-detail"' : "";
      return `<dt${attr}>${label}</dt><dd${attr}>${value}</dd>`;
    };
    const damageRows = [...damage].sort((a, b) => (b[1].health + b[1].armor) - (a[1].health + a[1].armor))
      .map(([skill, amount]) => row(skillName(skill), `${combatNumber(amount.health)} ОЗ`) +
        (amount.armor ? row("По броне", `+ ${combatNumber(amount.armor)}`, true) : ""));
    const healingRows = [...healing]
      .map(([skill, amount]) => row(skillName(skill), `${combatNumber(amount)} ОЗ`));
    const attacker = DWR.CONFIG.enemies[death?.enemy]?.name ?? "Неизвестный источник";
    const cause = DWR.CONFIG.effects[death?.ability]?.name ?? enemyAttacks[death?.ability] ?? "Урон";
    const redirected = death?.redirectedFrom
      ? `<small>Урон перенаправлен с героя «${DWR.CONFIG.heroes[death.redirectedFrom].name}»</small>` : "";
    return `
      <section class="scr-stats-hero">
        <h3>${DWR.CONFIG.heroes[id].name}</h3>
        <h4>Нанесено урона</h4>
        ${list(damageRows)}
        <h4 class="scr-stats-summary"><span>Лечение отряда</span><b>${combatNumber(given)} ОЗ</b></h4>
        ${healingRows.length ? list(healingRows) : ""}
        <dl class="scr-stats-list scr-stats-received">
          ${row("Восстановлено герою", `<b>${combatNumber(received)} ОЗ</b>`)}
          ${potion ? row("Из зелий", `${combatNumber(potion)} ОЗ`, true) : ""}
        </dl>
        ${death
          ? `<p class="scr-stats-death"><strong>Убийца — ${attacker}</strong><small>${cause}${selected === -1 ? ` · Комната ${death.room}` : ""}</small>${redirected}</p>`
          : `<p class="scr-stats-survived">${alreadyFallen ? "Пал в предыдущей комнате" : "Остался в строю"}</p>`}
      </section>`;
  }

  function combatDialog(reports) {
    const options = reports.map(({ roomIndex }, index) => {
      const room = DWR.CONFIG.rooms[roomIndex];
      const name = room.chest ? "Сундук" : room.boss ? "Босс" : "";
      return `<option value="${index}">Комната ${index + 1}${name ? ` · ${name}` : ""}</option>`;
    }).join("");
    return `<dialog class="scr-dialog scr-stats-dialog" id="scr-combat-stats" aria-labelledby="scr-stats-title">
      <form method="dialog">
        <header class="scr-dialog-header">
          <h2 class="scr-h2" id="scr-stats-title">Статистика боя</h2>
          <button class="btn scr-dialog-close" aria-label="Закрыть статистику" autofocus></button>
        </header>
        ${reports.length > 1 ? `<label class="scr-stats-filter">Отчёт
          <select><option value="-1">Весь рейд</option>${options}</select>
        </label>` : ""}
        <div class="scr-stats-party"></div>
      </form>
    </dialog>`;
  }

  function bindCombatStats(page, reports) {
    const trigger = page.querySelector("#scr-btn-combat-stats");
    const dialog = page.querySelector("#scr-combat-stats");
    const select = dialog.querySelector("select");
    const roster = dialog.querySelector(".scr-stats-party");
    const draw = () => {
      const selected = Number(select?.value ?? -1);
      roster.innerHTML = DWR.CONFIG.heroOrder.map(id => combatHeroCard(id, reports, selected)).join("");
    };
    // Оставляем кнопку видимой под модальным окном. Второй клик по ней попадает на фон и закрывает отчёт.
    const position = () => {
      dialog.style.setProperty("--stats-bottom", (innerHeight - trigger.getBoundingClientRect().top + 10) + "px");
    };
    bindDialogBackdrop(dialog);
    trigger.addEventListener("click", () => {
      position();
      draw();
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
      addEventListener("resize", position);
    });
    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      removeEventListener("resize", position);
    });
    select?.addEventListener("change", draw);
  }

  function renderResults(result) {
    const el = document.getElementById("screen-results");
    if (!el) return;
    const titles = { win: "Победа!", wipe: "Отряд пал…", retreat: "Отступление", explored: "Отряд дошёл до зала награды" };
    const reason = result?.reason || "retreat";
    const title = result?.treasureOnly && reason === "win" ? "Награда получена" : titles[result?.reason] || "Забег завершён";
    const { coins = 0, runes = 0, victoryTrophies = 0, roomsCleared = 0, roomsTotal = 0, roomId = 1, location = "dungeon",
      party = [], combatReports = [] } = result || {};
    const locations = DWR.CONFIG.locations;
    const nextId = Object.keys(locations).find(id => locations[id].unlockAfter === location);
    const showNext = reason === "win" && locations[location].continueOnWin && S.locationUnlocked(nextId);
    const room = DWR.CONFIG.rooms.find(room => room.id === roomId) ?? { id: roomId };
    const roster = party.map(({ id, hp, maxHp, alive }) => `
      <div class="scr-result-hero${alive ? "" : " scr-result-fallen"}">
        <div class="scr-portrait"><img src="assets/out/${id}.png" alt=""></div>
        <div><strong>${DWR.CONFIG.heroes[id].name}</strong><span>${alive ? Math.ceil(hp) + " / " + maxHp + " ОЗ" : "Пал в бою"}</span></div>
      </div>`).join("");
    el.innerHTML = `
      <main class="scr-location scr-results-page">
        <header class="scr-statusbar"><h2 class="scr-h2">Итоги рейда</h2></header>
        <section class="scr-result-art">
          <img src="${DWR.Assets.roomUrl(room)}" alt="">
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
            <div><img src="assets/out/coin.png" alt=""><span><b>${coins}</b>Монеты</span></div>
            <div class="scr-result-runes"><img src="assets/out/rune.png" alt=""><span><b>${runes}</b>Руны</span></div>
            ${victoryTrophies > 0 ? `<small class="scr-result-trophies">«Трофеи победителя» +${raidNumbers.format(victoryTrophies)}</small>` : ""}
          </div>
          <div class="scr-result-roster" aria-label="Состояние отряда">${roster}</div>
          <div class="scr-result-actions">
            ${result ? '<button id="scr-btn-combat-stats" class="btn" aria-haspopup="dialog" aria-controls="scr-combat-stats" aria-expanded="false">Статистика боя</button>' : ""}
            <button id="scr-btn-to-location" class="btn btn-gold">${showNext ? "К следующей локации" : "К подготовке"}</button>
          </div>
        </footer>
      </main>
      ${result ? combatDialog(combatReports) : ""}`;
    if (result) bindCombatStats(el, combatReports);
    el.querySelector("#scr-btn-to-location").addEventListener("click", () => {
      if (!showNext) return returnToCamp();
      selectedLocation = nextId;
      DWR.showScreen("location");
      showDemoMessage(document.getElementById("screen-location"));
    });
  }

  // ---------- Публичный API ----------
  return {
    redraw() {
      if (DWR.currentScreen() === "prologue") {
        renderPrologue();
        return;
      }
      if (DWR.currentScreen() === "news") {
        renderNews();
        return;
      }
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
