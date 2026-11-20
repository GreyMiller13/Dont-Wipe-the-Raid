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
      upgrades: {},            // { nodeId: куплено раз }
      panel: ["fireball", null, null, null, null], // 'fireball' — переключатель жрицы
      location1Done: false,
      cryptDone: false,
      treasuresOpened: {},     // { id локации: открыт ли сундук за первое убийство }
      settings: { music: 0.7, sound: 0.8 }
    };
  }

  let data = fresh();

  function load() {
    try {
      const raw = localStorage.getItem(KEY());
      if (raw) data = Object.assign(fresh(), JSON.parse(raw));
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
    save();
    return true;
  }

  // --- Узлы дерева ---
  function nodeDef(id) { return nodes.get(id) ?? null; }
  function nodeCount(id) { return data.upgrades[id] || 0; }
  function nodePrice(id) {
    const def = nodeDef(id);
    return Math.round(def.base * Math.pow(def.mul, nodeCount(id)));
  }
  function nodeUnlocked(id) {
    const node = nodeDef(id);
    // Ранее купленные узлы остаются доступными при перестройке связей.
    return !!node && (nodeCount(id) > 0 || !node.parent || nodeCount(node.parent) >= node.requiresLevel);
  }
  function nodeBuyable(id) {
    const def = nodeDef(id);
    return def && nodeUnlocked(id) && nodeCount(id) < def.max && data.coins >= nodePrice(id);
  }
  function buyNode(id) {
    if (!nodeBuyable(id)) return false;
    data.coins -= nodePrice(id);
    data.upgrades[id] = nodeCount(id) + 1;
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

  // --- Производные статы героев от купленных узлов ---
  function stats() {
    const s = {
      potionLuck: DWR.CONFIG.loot.potionChanceBase
    };
    for (const { effect } of nodes.values()) if (effect.stat) s[effect.stat] ??= 0;
    for (const [id, cnt] of Object.entries(data.upgrades)) {
      const def = nodeDef(id);
      if (!def || !def.effect || !def.effect.stat) continue;
      s[def.effect.stat] += def.effect.add * cnt;
    }
    return s;
  }

  return {
    get data() { return data; },
    load, save, reset, locationCleared, locationUnlocked, completeLocation,
    treasureUnopened, treasureAvailable, openTreasure,
    nodeDef, nodeCount, nodePrice, nodeUnlocked, nodeBuyable, buyNode, hasSkill,
    stats
  };
})();
