// DWR :: state.js — сохранение/загрузка прогресса (localStorage), покупка узлов, панель.
"use strict";
window.DWR = window.DWR || {};

DWR.State = (function () {
  const KEY = () => DWR.CONFIG.saveKey;
  const nodes = new Map(Object.values(DWR.CONFIG.trees).flatMap(tree =>
    tree.branches.flatMap(branch => branch.nodes.map(node => [node.id, node]))));

  function fresh() {
    return {
      started: false,          // true после «Новой игры»
      coins: 0,
      runes: DWR.CONFIG.startingRunes,
      upgrades: {},            // { nodeId: куплено раз }
      autoSkills: {},
      panel: Array.from({ length: DWR.CONFIG.skillBar.baseSlots }, (_, i) => i === 0 ? "heal" : null),
      location1Done: false,
      cryptDone: false,
      wildsDone: false,
      forgeDone: false,
      treasuresOpened: {},     // { id локации: открыт ли сундук за первое убийство }
      settings: { music: 0.7, sound: 0.8 }
    };
  }

  let data = fresh();

  function load() {
    try {
      const raw = localStorage.getItem(KEY());
      if (raw) {
        const saved = JSON.parse(raw);
        const defaults = fresh();
        const settings = { ...defaults.settings };
        for (const key of Object.keys(settings)) {
          const value = saved.settings?.[key];
          if (Number.isFinite(value)) settings[key] = Math.min(1, Math.max(0, value));
        }
        data = Object.assign(defaults, saved, { settings });
        resizePanel();
        if (data.started && !Object.hasOwn(saved, "runes")) {
          // Сохраняем доступ к прежнему фаерболу и учитываем уже открытые сундуки.
          data.upgrades.fireball = 1;
          for (const id of Object.keys(DWR.CONFIG.locations)) {
            if (locationCleared(id) && !treasureUnopened(id)) data.runes++;
          }
          if (!data.panel.includes("heal")) {
            const shared = data.panel.indexOf("fireball");
            const free = data.panel.indexOf(null);
            if (shared !== -1) data.panel[shared] = "heal";
            else if (free !== -1) data.panel[free] = "heal";
          }
        }
      }
    } catch (e) { data = fresh(); }
    return data;
  }
  function save() {
    try { localStorage.setItem(KEY(), JSON.stringify(data)); } catch (e) { /* file:// без storage — молча */ }
  }
  function reset() {
    data = { ...fresh(), settings: data.settings };
    save();
  }
  function locationCleared(id) {
    const key = DWR.CONFIG.locations[id]?.progress;
    return !!(key && data[key]);
  }
  function locationUnlocked(id) {
    const location = DWR.CONFIG.locations[id];
    return !!location && (!location.unlockAfter || locationCleared(location.unlockAfter));
  }
  function completeLocation(id) {
    if (locationCleared(id)) return;
    data.treasuresOpened[id] = false;
    data[DWR.CONFIG.locations[id].progress] = true;
    save();
  }
  function treasureUnopened(id) {
    if (DWR.CONFIG.locations[id]?.treasure == null) return false;
    // В старых сохранениях отметка о победе уже закрывала сундук подземелья.
    return !(data.treasuresOpened[id] ?? (id === "dungeon" && data.location1Done));
  }
  function treasureAvailable(id) {
    return locationCleared(id) && treasureUnopened(id);
  }
  function openTreasure(id) {
    if (!treasureAvailable(id)) return false;
    data.treasuresOpened[id] = true;
    data.runes++;
    save();
    return true;
  }

  // --- Узлы дерева ---
  function nodeDef(id) { return nodes.get(id) ?? null; }
  function nodeCount(id) {
    return Math.min(nodeDef(id)?.max ?? 0, data.upgrades[id] ?? (id === "heal" ? 1 : 0));
  }
  function nodePrice(id) {
    const def = nodeDef(id);
    return DWR.skillRankPrice(def, nodeCount(id) + 1);
  }
  function nodeCurrency(id) { return DWR.skillRankCurrency(nodeDef(id), nodeCount(id) + 1); }
  function nodeUnlocked(id) {
    const node = nodeDef(id);
    // Ранее купленные узлы остаются доступными при перестройке связей.
    return !!node && (nodeCount(id) > 0 || !node.parent || nodeCount(node.parent) >= node.requiresLevel);
  }
  function nodeBuyable(id) {
    const def = nodeDef(id);
    return def && nodeUnlocked(id) && nodeCount(id) < def.max && data[nodeCurrency(id)] >= nodePrice(id);
  }
  function buyNode(id) {
    if (!nodeBuyable(id)) return false;
    const { stat, unlockSkill } = nodeDef(id).effect;
    const alreadyUnlocked = unlockSkill && hasSkill(unlockSkill);
    data[nodeCurrency(id)] -= nodePrice(id);
    data.upgrades[id] = nodeCount(id) + 1;
    if (stat === "panelSlots") resizePanel();
    if (unlockSkill && !alreadyUnlocked && hasSkill(unlockSkill) && !data.panel.includes(unlockSkill)) {
      const slot = data.panel.indexOf(null);
      if (slot !== -1) data.panel[slot] = unlockSkill;
    }
    save();
    return true;
  }
  function hasSkill(skillId) {
    if (DWR.CONFIG.skills[skillId]?.innate) return true;
    // Обычно навык открывается при полной прокачке узла, если не задан порог unlockAt.
    for (const node of nodes.values()) {
      if (node.effect.unlockSkill === skillId && nodeCount(node.id) >= (node.effect.unlockAt ?? node.max)) return true;
    }
    return false;
  }
  function autoEnabled(id) {
    return Boolean(DWR.CONFIG.skills[id]?.auto && (data.autoSkills[id] ?? DWR.CONFIG.skills[id].defaultAuto));
  }
  function setAuto(id, enabled) {
    data.autoSkills[id] = enabled;
    save();
  }

  // --- Производные статы героев от купленных узлов ---
  function stats() {
    const s = {
      potionLuck: DWR.CONFIG.loot.potionChanceBase
    };
    for (const { effect } of nodes.values()) if (effect.stat) s[effect.stat] ??= 0;
    for (const id of Object.keys(data.upgrades)) {
      const def = nodeDef(id);
      if (!def || !def.effect || !def.effect.stat) continue;
      s[def.effect.stat] += def.effect.add * nodeCount(id);
    }
    return s;
  }

  function bombStock(st = stats()) {
    return hasSkill("bomb") ? DWR.CONFIG.skills.bomb.stock + (st.bombStock || 0) : 0;
  }

  function resizePanel() {
    const { baseSlots, maxSlots } = DWR.CONFIG.skillBar;
    const length = Math.min(maxSlots, baseSlots + Math.max(0, Math.floor(stats().panelSlots || 0)));
    const previous = Array.isArray(data.panel) ? data.panel : fresh().panel;
    data.panel = Array.from({ length }, (_, i) => previous[i] ?? null);
  }

  return {
    get data() { return data; },
    load, save, reset, locationCleared, locationUnlocked, completeLocation, bombStock,
    treasureUnopened, treasureAvailable, openTreasure,
    nodeDef, nodeCount, nodePrice, nodeCurrency, nodeUnlocked, nodeBuyable, buyNode, hasSkill, autoEnabled, setAuto,
    stats
  };
})();
