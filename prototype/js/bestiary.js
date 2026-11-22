// DWR :: экран бестиария.
"use strict";
window.DWR = window.DWR || {};

DWR.Bestiary = (function () {
  const S = DWR.State;
  const portrait = kind => DWR.Assets.assetUrl(`bestiary/${kind}.webp`);

  function renderCard(location, kind, known) {
    if (!known) return `
      <li class="bestiary-card bestiary-unknown">
        <span class="bestiary-thumb" aria-hidden="true">?</span>
        <span>Неизвестный противник</span>
      </li>`;
    const enemy = DWR.CONFIG.enemies[kind];
    return `
      <li>
        <button type="button" class="bestiary-card" data-location="${location}" data-kind="${kind}" aria-pressed="false">
          <span class="bestiary-thumb"><img src="${portrait(kind)}" alt="" loading="lazy"></span>
          <span>${enemy.name}${enemy.boss ? "<small>Босс</small>" : ""}</span>
        </button>
      </li>`;
  }

  function renderGroup(id, location) {
    const known = new Set(S.data.bestiary[id]);
    const kinds = [...new Set([...S.locationEnemies(id), ...known])]
      .filter(kind => Object.hasOwn(DWR.CONFIG.enemies, kind));
    const knownCount = kinds.filter(kind => known.has(kind)).length;
    return `
      <section class="bestiary-group">
        <h3>${location.name}<span aria-label="Открыто ${knownCount} из ${kinds.length}">${knownCount} / ${kinds.length}</span></h3>
        <ul class="bestiary-cards">${kinds.map(kind => renderCard(id, kind, known.has(kind))).join("")}</ul>
      </section>`;
  }

  function renderChapter(location, chapter, showLocation) {
    const { attack, skills, advice, afterClear } = chapter;
    const heading = showLocation ? "h5" : "h4";
    return `
      <section class="bestiary-chapter">
        ${showLocation ? `<h4 class="bestiary-chapter-title">${DWR.CONFIG.locations[location].name}</h4>` : ""}
        ${attack ? `<div><${heading} class="bestiary-topic">Атаки</${heading}><p>${attack}</p></div>` : ""}
        ${skills?.length ? `
          <div><${heading} class="bestiary-topic">Особые навыки</${heading}>
            <dl>${skills.map(([name, description]) => `<dt>${name}</dt><dd>${description}</dd>`).join("")}</dl>
          </div>` : ""}
        ${advice ? `<div class="bestiary-advice"><${heading} class="bestiary-topic">Как противостоять</${heading}><p>${advice}</p></div>` : ""}
        ${afterClear && S.locationCleared(location) ? `<div><${heading} class="bestiary-topic">Итог встречи</${heading}><p>${afterClear}</p></div>` : ""}
      </section>`;
  }

  function renderEntry(location, kind) {
    const config = DWR.CONFIG;
    const enemy = config.enemies[kind];
    const home = config.locations[location];
    const rooms = home.rooms.map(index => config.rooms[index]);
    const room = rooms.find(({ enemies, fusion }) => enemies.includes(kind) || fusion === kind) ?? rooms[0];
    const entry = DWR.BESTIARY[kind] ?? {};
    const chapters = entry.encounters
      ? Object.entries(entry.encounters).filter(([id]) => S.data.bestiary[id]?.includes(kind))
      : [[location, entry]];
    return `
      <header class="bestiary-entry-header">
        <p>${home.name} · ${enemy.boss ? "Босс" : "Монстр"}</p>
        <h3>${enemy.name}</h3>
      </header>
      <div class="bestiary-entry-body">
        <figure class="bestiary-portrait">
          <img class="bestiary-habitat" src="${DWR.Assets.roomUrl(room)}" alt="">
          <img class="bestiary-figure" src="${portrait(kind)}" alt="">
        </figure>
        <div class="bestiary-notes">
          ${entry.bio ? `<p class="bestiary-bio">${entry.bio}</p>` : ""}
          ${chapters.map(([id, chapter]) => renderChapter(id, chapter, chapters.length > 1)).join("")}
        </div>
      </div>`;
  }

  function redraw() {
    const el = document.getElementById("screen-bestiary");
    const groups = Object.entries(DWR.CONFIG.locations)
      .filter(([id, location]) => location.rooms.length && (S.locationUnlocked(id) || S.data.bestiary[id]?.length));
    el.innerHTML = `
      <main class="scr-location bestiary-page">
        <header class="scr-statusbar">
          <h2 class="scr-h2">Бестиарий</h2>
          <button type="button" class="btn" id="bestiary-back">Назад</button>
        </header>
        <div class="bestiary-layout">
          <nav class="bestiary-index" aria-label="Противники по локациям">
            ${groups.map(([id, location]) => renderGroup(id, location)).join("")}
          </nav>
          <article class="bestiary-details" aria-label="Запись о противнике">
            <div class="bestiary-empty">
              <img src="${DWR.Assets.assetUrl("menu-bestiary.png")}" alt="">
              <h3>Записей пока нет</h3>
              <p>Информация появится после первой встречи с противником.</p>
            </div>
          </article>
        </div>
      </main>`;

    const index = el.querySelector(".bestiary-index");
    const details = el.querySelector(".bestiary-details");
    const back = el.querySelector("#bestiary-back");
    let selected = null;
    function select(button) {
      selected?.setAttribute("aria-pressed", "false");
      selected = button;
      selected.setAttribute("aria-pressed", "true");
      details.innerHTML = renderEntry(button.dataset.location, button.dataset.kind);
      details.scrollTop = 0;
    }
    function close() {
      DWR.showScreen("location");
      document.getElementById("scr-btn-bestiary").focus();
    }
    index.addEventListener("click", event => {
      const button = event.target.closest("[data-kind]");
      if (button && button !== selected) select(button);
    });
    back.addEventListener("click", close);
    el.querySelector(".bestiary-page").addEventListener("keydown", event => {
      if (event.key === "Escape") close();
    });
    const first = index.querySelector("[data-kind]");
    if (first) select(first);
    back.focus();
  }

  return { redraw };
})();
