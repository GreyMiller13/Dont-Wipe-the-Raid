// DWR :: локальный черновик дерева и экспорт данных игры.
"use strict";

(function () {
  const source = DWR.CONFIG.trees;
  const owners = Object.keys(source);
  const accents = ["#f0a78f", "#d7b9fa", "#a7d6aa", "#f0cb87"];
  const key = "dwr_skill_designer_v1";
  const sourceNodes = new Map(Object.values(source).flatMap(tree =>
    tree.branches.flatMap(branch => branch.nodes.map(node => [node.id, node]))));
  const stats = new Map([...sourceNodes.values()].filter(node => node.effect.stat)
    .map(node => [node.effect.stat, node.name]));
  const unlocks = Object.entries(DWR.CONFIG.skills);
  const el = id => document.getElementById(id);
  const copy = value => structuredClone(value);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,
    char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const format = new Intl.NumberFormat("ru");
  const count = value => Number.isSafeInteger(value) && value >= 0 ? format.format(value) : "—";
  const balance = () => ({ coins: 0, runes: 0 });
  const priceLabel = ({ coins, runes }) => [coins && `${count(coins)} мон.`, runes && `${count(runes)} рун.`].filter(Boolean).join(" + ") || "Бесплатно";
  function total(nodes) {
    const costs = balance();
    for (const node of nodes) {
      for (let rank = 1; rank <= node.max; rank++) costs[DWR.skillRankCurrency(node, rank)] += DWR.skillRankPrice(node, rank);
    }
    return costs;
  }
  const rankLabel = (node, rank) => priceLabel({ [DWR.skillRankCurrency(node, rank)]: DWR.skillRankPrice(node, rank) });
  const nodeCount = tree => tree.branches.reduce((sum, branch) => sum + branch.nodes.length, 0);
  const validId = value => typeof value === "string" && /^[a-z][A-Za-z0-9_-]*$/.test(value) && !Object.hasOwn(Object.prototype, value);
  const validRank = value => Number.isSafeInteger(value) && value >= 1 && value <= 1000;
  const validCoin = value => Number.isSafeInteger(value) && value >= 0;
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const named = value => typeof value === "string" && value.trim().length > 0;
  let trees = copy(source), owner = owners[0], selected, dirty = false;

  function notice(message, isError = false) {
    el("notice").textContent = message;
    el("notice").dataset.error = String(isError);
  }

  function validate(data, allowMissingMasteries = false) {
    if (!object(data) || Object.keys(data).length !== owners.length) throw Error("Нужны разделы воина, жрицы, лучника и рейда.");
    const ids = new Set();
    for (const ownerId of owners) {
      const tree = data[ownerId];
      if (!object(tree) || !named(tree.name) || !Array.isArray(tree.branches)) throw Error(`Некорректный раздел ${ownerId}.`);
      const branches = new Set();
      for (const branch of tree.branches) {
        if (!object(branch) || !validId(branch.id) || !named(branch.name) || !Array.isArray(branch.nodes)) throw Error("Проверьте название и идентификатор ветки.");
        if (branches.has(branch.id)) throw Error(`Повторяется идентификатор ветки «${branch.id}».`);
        branches.add(branch.id);
        const siblings = new Map();
        for (const node of branch.nodes) {
          if (!object(node) || !validId(node.id) || !named(node.name) || typeof node.desc !== "string") throw Error("Проверьте название и идентификатор навыка.");
          if (ids.has(node.id)) throw Error(`Идентификатор «${node.id}» уже используется.`);
          ids.add(node.id);
          siblings.set(node.id, node);
          if (!validRank(node.max) || node.max < (sourceNodes.get(node.id)?.max ?? 1)) throw Error(`Проверьте число рангов навыка «${node.name}».`);
          if (!validCoin(node.base) || !Number.isFinite(node.mul) || node.mul <= 0) throw Error(`Проверьте формулу цены навыка «${node.name}».`);
          if (node.prices != null && (!Array.isArray(node.prices) || node.prices.length > node.max || node.prices.some(p => p != null && !validCoin(p)))) {
            throw Error(`Ручные цены навыка «${node.name}» должны быть целыми неотрицательными числами.`);
          }
          const effect = node.effect;
          if (!object(effect) || (effect.stat && (!stats.has(effect.stat) || !Number.isFinite(effect.add)))) throw Error(`Проверьте эффект навыка «${node.name}».`);
          if (effect.unlockSkill && (!unlocks.some(([id]) => id === effect.unlockSkill) ||
            !validRank(effect.unlockAt ?? node.max) || (effect.unlockAt ?? node.max) > node.max)) throw Error(`Проверьте ранг открытия навыка «${node.name}».`);
          if (DWR.nodeHeroSkill(node) && (node.max !== 1 || effect.stat)) {
            throw Error(`Активный навык «${node.name}» имеет один ранг. Его характеристики прокачиваются в дочерних узлах.`);
          }
          if (!Object.values(total([node])).every(validCoin)) throw Error(`Общая стоимость навыка «${node.name}» слишком велика.`);
        }
        for (const node of branch.nodes) {
          let child = node;
          const visited = new Set([node.id]);
          while (child.parent) {
            const parent = siblings.get(child.parent);
            if (!parent || !validRank(child.requiresLevel) || child.requiresLevel > parent.max || visited.has(parent.id)) {
              throw Error(`Некорректная зависимость навыка «${node.name}».`);
            }
            visited.add(parent.id);
            child = parent;
          }
        }
      }
    }
    if ([...sourceNodes.values()].some(node => !ids.has(node.id) && !(allowMissingMasteries && node.tier === 2))) {
      throw Error("В файле отсутствуют навыки текущей версии игры.");
    }
  }

  function load(text) {
    const file = JSON.parse(text);
    if (!object(file) || file.version !== 1) throw Error("Ожидается JSON-файл доски версии 1.");
    validate(file.trees, true);
    const branches = new Map(Object.values(file.trees).flatMap(tree =>
      tree.branches.flatMap(branch => branch.nodes.map(node => [node.id, branch]))));
    for (const node of sourceNodes.values()) {
      if (node.tier === 2 && !branches.has(node.id)) branches.get(node.parent).nodes.push(copy(node));
    }
    return file.trees;
  }

  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, trees }));
      notice("Черновик сохранён в этом браузере.");
    } catch {
      notice("Браузер не сохранил черновик. Скачайте JSON перед закрытием страницы.", true);
    }
  }

  function hasUnsaved() {
    return dirty && !window.confirm("Отменить несохранённые изменения формы?");
  }

  function chooseDefault() {
    const branch = trees[owner].branches.find(item => item.nodes.length) ?? trees[owner].branches[0];
    selected = branch?.nodes.length ? { kind: "node", branch: branch.id, id: branch.nodes[0].id }
      : branch ? { kind: "branch", branch: branch.id } : { kind: "newBranch" };
  }

  function renderTree() {
    const tree = trees[owner];
    const accent = accents[owners.indexOf(owner)];
    el("categories").innerHTML = owners.map((id, index) => `<button class="category" type="button" data-owner="${id}"
      style="--accent:${accents[index]}" aria-pressed="${id === owner}">${esc(trees[id].name)} <small>${nodeCount(trees[id])} узл.</small></button>`).join("");
    el("tree-title").textContent = tree.name;
    el("tree-total").textContent = `${priceLabel(total(tree.branches.flatMap(b => b.nodes)))} за все ранги`;
    el("tree-list").style.setProperty("--accent", accent);
    el("tree-list").innerHTML = `<div class="tree-caption"><span>Узел</span><span>Ранги</span><span>Первый</span><span>Последний</span><span>Всего</span></div>` +
      tree.branches.map(branch => {
        const children = new Map();
        for (const node of branch.nodes) {
          const parent = node.parent || null;
          if (!children.has(parent)) children.set(parent, []);
          children.get(parent).push(node);
        }
        function rows(parent, depth) {
          return (children.get(parent) || []).map(node => `<button type="button" class="node-row" data-branch="${branch.id}" data-node="${node.id}"
              aria-pressed="${selected.kind === "node" && selected.id === node.id}" style="--depth:${depth}">
              <span class="node-name">${esc(node.name)}${node.tier === 2 ? " · Тир II" : ""}</span><span>${node.max}</span><span>${rankLabel(node, 1)}</span>
              <span>${rankLabel(node, node.max)}</span><span>${priceLabel(total([node]))}</span></button>` + rows(node.id, depth + 1)).join("");
        }
        return `<section class="branch"><div class="branch-header">
          <button type="button" class="branch-name" data-branch="${branch.id}" aria-pressed="${selected.kind === "branch" && selected.branch === branch.id}">${esc(branch.name)}</button>
          <button type="button" class="branch-add" data-add-node="${branch.id}" aria-label="Добавить навык в ветку ${esc(branch.name)}">Добавить навык</button></div>
          ${branch.nodes.length ? rows(null, 0) : '<p class="empty-branch secondary">В этой ветке пока нет навыков.</p>'}</section>`;
      }).join("");
  }

  function commit(form, mutate, newSelection) {
    const next = copy(trees);
    const error = form.querySelector(".form-error");
    try {
      mutate(next[owner]);
      validate(next);
    } catch (e) {
      error.textContent = e.message;
      return;
    }
    trees = next;
    selected = newSelection;
    persist();
    render();
  }

  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
  const field = (label, control, wide = false) => `<label class="field${wide ? " wide" : ""}">${label}${control}</label>`;
  const input = (name, value, attrs = "") => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
  const formError = '<p class="form-error" role="alert"></p>';
  const editorHeader = (section, title, action) => `<header class="inspector-header">
    <div><p class="secondary">${esc(section)}</p><h2 id="inspector-title">${esc(title)}</h2></div>
    <button class="primary" type="submit" form="board-editor">${action}</button></header>`;

  function renderBranchEditor(branch) {
    const existing = !!branch;
    const panel = el("inspector");
    panel.innerHTML = `${editorHeader(trees[owner].name, branch?.name ?? "Новая ветка", existing ? "Сохранить ветку" : "Создать ветку")}
      <form class="editor" id="board-editor"><div class="fields">
        ${field("Название ветки", input("name", branch?.name, "required"))}
        ${field("Идентификатор", input("id", branch?.id, existing ? "readonly" : 'required placeholder="soloDefense"'))}
      </div>${formError}</form>`;
    const form = panel.querySelector("form");
    form.addEventListener("submit", event => {
      event.preventDefault();
      const id = form.elements.namedItem("id").value.trim();
      const name = form.elements.namedItem("name").value.trim();
      commit(form, tree => {
        if (existing) tree.branches.find(item => item.id === id).name = name;
        else tree.branches.push({ id, name, nodes: [] });
      }, { kind: "branch", branch: id });
    });
  }

  function renderNodeEditor(branch, current) {
    const node = current ?? { id: "", name: "", desc: "", max: 1, base: 15, mul: 1.25, parent: null, requiresLevel: 1, effect: {} };
    const minimum = sourceNodes.get(node.id)?.max ?? 1;
    const panel = el("inspector");
    const parents = branch.nodes.filter(item => item.id !== node.id);
    const branchName = `${trees[owner].name} / ${branch.name}`;
    panel.innerHTML = `${editorHeader(branchName, current ? node.name : "Новый навык", current ? "Сохранить навык" : "Создать навык")}
      <form class="editor" id="board-editor"><div class="fields">
        ${field("Название навыка", input("name", node.name, "required"))}
        ${field("Идентификатор", input("id", node.id, current ? "readonly" : 'required placeholder="steadyGuard"'))}
        ${field("Описание эффекта", `<textarea name="desc" rows="2">${esc(node.desc)}</textarea>`, true)}
        ${field("Родительский навык", `<select name="parent">${option("", "Без условия", node.parent ?? "")}${parents.map(p => option(p.id, p.name, node.parent)).join("")}</select>`)}
        ${field("Ранг родителя", input("requiresLevel", node.requiresLevel, 'type="number" min="1" step="1" required'))}
        ${field("Число рангов", input("max", node.max, `type="number" min="${minimum}" max="1000" step="1" required`))}
        ${field("Базовая цена", input("base", node.base, 'type="number" min="0" step="1" required'))}
        ${field("Множитель цены", input("mul", node.mul, 'type="number" min="0.000001" step="any" required'))}
      </div>
      <details class="effect-fields"><summary>Игровой эффект</summary><div class="fields">
        ${field("Характеристика", `<select name="stat">${option("", "Без изменения", node.effect.stat ?? "")}${[...stats].map(([id, name]) => option(id, `${name} (${id})`, node.effect.stat)).join("")}</select>`)}
        ${field("Изменение за ранг", input("add", node.effect.add ?? 0, 'type="number" step="any" required'))}
        ${field("Открывает навык", `<select name="unlockSkill">${option("", "Без открытия", node.effect.unlockSkill ?? "")}${unlocks.map(([id, skill]) => option(id, skill.name, node.effect.unlockSkill)).join("")}</select>`)}
        ${field("Ранг открытия", input("unlockAt", node.effect.unlockAt ?? node.max, 'type="number" min="1" step="1" required'))}
      </div></details>
      <section class="pricing"><h3>Цены по рангам <span data-total></span></h3>
        <div class="rank-scroller"><table class="rank-table"><thead><tr><th scope="col">Ранг</th><th scope="col">По формуле</th>
        <th scope="col">Своя цена</th><th scope="col">Накоплено</th></tr></thead><tbody></tbody></table></div></section>
      ${formError}</form>`;
    const form = panel.querySelector("form");
    const value = name => form.elements.namedItem(name).value;
    const rankBody = form.querySelector("tbody");
    const overrides = (node.prices ?? []).map(price => price == null ? "" : String(price));

    function updatePricing() {
      const unlockSkill = value("unlockSkill");
      const active = Boolean(DWR.CONFIG.skills[unlockSkill]?.owner);
      const maxRank = form.elements.namedItem("max");
      const unlockAt = form.elements.namedItem("unlockAt");
      const stat = form.elements.namedItem("stat");
      maxRank.readOnly = active;
      stat.disabled = active;
      unlockAt.disabled = !unlockSkill || active;
      if (active) {
        maxRank.value = unlockAt.value = "1";
        stat.value = "";
      }
      form.elements.namedItem("base").disabled = active;
      form.elements.namedItem("mul").disabled = active;
      const max = +value("max");
      const rows = validRank(max) ? max : 0;
      if (rankBody.rows.length !== rows) {
        rankBody.innerHTML = Array.from({ length: rows }, (_, i) => `<tr><th scope="row">${i + 1}</th><td></td><td>
          <input type="number" min="0" step="1" data-rank="${i}" aria-label="Своя цена ранга ${i + 1}" value="${esc(overrides[i])}"></td><td></td></tr>`).join("");
      }
      const costs = balance();
      const draft = { base: +value("base"), mul: +value("mul"), max,
        effect: { unlockSkill: value("unlockSkill"), unlockAt: +value("unlockAt") } };
      for (const [i, row] of [...rankBody.rows].entries()) {
        const rank = i + 1;
        const currency = DWR.skillRankCurrency(draft, rank);
        const price = DWR.skillRankPrice(draft, rank);
        const fixed = currency === "runes" || (rank === 1 && DWR.CONFIG.skills[DWR.nodeHeroSkill(draft)]?.innate);
        const manual = overrides[i];
        costs[currency] += fixed || manual === "" || manual == null ? price : Number(manual);
        row.cells[1].textContent = rankLabel(draft, rank);
        row.cells[2].firstElementChild.disabled = fixed;
        row.cells[2].firstElementChild.placeholder = fixed ? "Фикс." : count(price);
        row.cells[3].textContent = priceLabel(costs);
      }
      form.querySelector("[data-total]").textContent = rows ? priceLabel(costs) : "—";
      const parent = parents.find(item => item.id === value("parent"));
      const gate = form.elements.namedItem("requiresLevel");
      gate.disabled = !parent;
      gate.max = parent?.max ?? 1;
      form.elements.namedItem("add").disabled = !value("stat");
      unlockAt.max = rows;
    }

    form.addEventListener("input", event => {
      if (event.target.hasAttribute("data-rank")) overrides[+event.target.dataset.rank] = event.target.value;
      if (event.target.name === "parent") form.elements.namedItem("requiresLevel").value = "1";
      updatePricing();
    });
    updatePricing();
    form.addEventListener("submit", event => {
      event.preventDefault();
      const parent = value("parent") || null;
      const effect = {};
      if (value("stat")) Object.assign(effect, { stat: value("stat"), add: +value("add") });
      if (value("unlockSkill")) Object.assign(effect, { unlockSkill: value("unlockSkill"), unlockAt: +value("unlockAt") });
      const max = +value("max");
      const record = { id: value("id").trim(), name: value("name").trim(), desc: value("desc").trim(), base: +value("base"), mul: +value("mul"), max,
        effect, parent, requiresLevel: parent ? +value("requiresLevel") : 1 };
      if (node.tier === 2) record.tier = 2;
      const prices = Array.from({ length: max }, (_, i) => overrides[i] ? +overrides[i] : null);
      while (prices.at(-1) === null) prices.pop();
      if (prices.length) record.prices = prices;
      commit(form, tree => {
        const target = tree.branches.find(item => item.id === branch.id);
        if (current) target.nodes[target.nodes.findIndex(item => item.id === current.id)] = record;
        else target.nodes.push(record);
      }, { kind: "node", branch: branch.id, id: record.id });
    });
  }

  function render() {
    dirty = false;
    const scroll = el("tree-list").scrollTop;
    renderTree();
    el("tree-list").scrollTop = scroll;
    const branch = trees[owner].branches.find(item => item.id === selected.branch);
    if (selected.kind === "node" || selected.kind === "newNode") renderNodeEditor(branch, branch.nodes.find(item => item.id === selected.id));
    else renderBranchEditor(branch);
  }

  el("inspector").addEventListener("input", () => { dirty = true; });
  el("categories").addEventListener("click", event => {
    const button = event.target.closest("[data-owner]");
    if (!button || button.dataset.owner === owner || hasUnsaved()) return;
    owner = button.dataset.owner;
    chooseDefault();
    el("tree-list").scrollTop = 0;
    render();
  });
  el("tree-list").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.getAttribute("aria-pressed") === "true" || hasUnsaved()) return;
    const { addNode, branch, node } = button.dataset;
    selected = addNode ? { kind: "newNode", branch: addNode } : { kind: node ? "node" : "branch", branch, id: node };
    render();
  });
  el("add-branch").addEventListener("click", () => {
    if (hasUnsaved()) return;
    selected = { kind: "newBranch" };
    render();
  });

  el("import-button").addEventListener("click", () => { if (!hasUnsaved()) el("import-input").click(); });
  el("import-input").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      trees = load(await file.text());
      chooseDefault();
      persist();
      render();
    } catch (e) {
      notice(e.message, true);
    } finally {
      event.target.value = "";
    }
  });

  function download(asGame) {
    if (dirty) { notice("Сохраните текущую форму перед скачиванием.", true); return; }
    const data = JSON.stringify(trees, (name, value) => name === "__proto__" ? undefined : value, 2);
    const content = asGame ? `// DWR :: данные дерева навыков, экспорт с доски.\n"use strict";\nwindow.DWR = window.DWR || {};\n\nDWR.SKILL_TREES = ${data};\n\nif (typeof module !== "undefined" && module.exports) module.exports = DWR.SKILL_TREES;\n`
      : JSON.stringify({ version: 1, trees }, null, 2) + "\n";
    const uri = URL.createObjectURL(new Blob([content], { type: asGame ? "text/javascript" : "application/json" }));
    const link = document.createElement("a");
    link.href = uri;
    link.download = asGame ? "skill-tree-data.js" : "skill-tree-draft.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(uri), 1000);
  }

  el("export-json").addEventListener("click", () => download(false));
  el("export-game").addEventListener("click", () => download(true));
  window.addEventListener("beforeunload", event => {
    if (dirty) { event.preventDefault(); event.returnValue = true; }
  });

  notice("Открыто актуальное дерево из игры.");
  try {
    const saved = localStorage.getItem(key);
    if (saved) { trees = load(saved); notice("Открыт сохранённый черновик."); }
  } catch (e) {
    notice(`Черновик не загрузился. Открыто дерево из игры. ${e.message}`, true);
  }
  chooseDefault();
  render();
})();
