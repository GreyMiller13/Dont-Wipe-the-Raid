// DWR :: state.js — сохранение/загрузка прогресса (localStorage), покупка узлов, панель.
"use strict";
window.DWR = window.DWR || {};

DWR.State = (function () {
  const KEY = () => DWR.CONFIG.saveKey;
  const startingPanel = ["heal", "taunt"];
  const defaultSkillHotkeys = () => Array.from({ length: DWR.CONFIG.skillBar.maxSlots }, (_, i) => {
    const digit = String((i + 1) % 10);
    return { code: "Digit" + digit, label: digit };
  });
  const nodes = new Map(Object.values(DWR.CONFIG.trees).flatMap(tree =>
    tree.branches.flatMap(branch => branch.nodes.map(node => [node.id, node]))));
  // Цены для расчёта возврата в сохранениях без журнала покупок.
  const legacySkillPrices = {
    wDmg: [12, 1.25], wTempo: [29, 1.31], wCrit: [48, 1.5], wStride: [22, 1.3], wStrike: [34, 1.35],
    powerStrikeHaste: [31, 1.35], powerStrikeRefund: [43, 1.35], blockDur: [25, 1.3], blockHaste: [34, 1.4],
    blockHeal: [38, 1.4], sacrificeDuration: [150, 1.75], sacrificeHaste: [220, 1.65],
    righteousFuryHeal: [280, 1.85], wHp: [10, 1.25], wArmor: [28, 1.35], wRageKill: [24, 1.3],
    wRageRegen: [35, 1.35], healPow: [10, 1.25], healHaste: [32, 1.36], pCrit: [48, 1.5],
    healWard: [43, 1.4], healOverflow: [32, 1.35], massHealHaste: [220, 1.7], fireDmg: [34, 1.32],
    fireballHaste: [29, 1.35], fireballBlast: [48, 1.4], fireTornadoDamage: [180, 1.65],
    fireTornadoHaste: [185, 1.7], dispelHaste: [95, 1.6], fireballUnlock: [230, 1.3], manaPool: [130, 1.85],
    manaRegen: [25, 1.3], manaOnKill: [32, 1.4], manaOnRoom: [30, 1.35], potionStock: [15, 1.4],
    potionLuck: [15, 1.3], potionStr: [30, 1.3], pHp: [24, 1.3], potionSquadHeal: [35, 1.4],
    rDmg: [12, 1.25], rCrit: [55, 1.5], rSpeed: [18, 1.25], rHp: [27, 1.3], rFan: [32, 1.36],
    multishotHaste: [32, 1.35], multishotCost: [95, 2.1], rExtraArrow: [46, 1.4], rPrecision: [30, 1.33],
    preciseShotHaste: [36, 1.35], preciseBoss: [44, 1.4], rFocusKill: [25, 1.3], rFocusRegen: [35, 1.35],
    bombStock: [85, 1.65], bombDamage: [105, 1.6], bombRadius: [85, 1.55], noiseBombStock: [95, 1.6],
    noiseBombRadius: [90, 1.55], noiseBombStun: [140, 1.6], raidCoins: [16, 1.38], bossCoins: [30, 1.35],
    chestCoins: [26, 1.35], roomCoins: [22, 1.35], raidVictoryCoins: [45, 1.4], lootReach: [20, 1.38],
    autoCoins: [110, 1.3],
  };
  const legacyReductionPrices = [500, 4000, 4000];
  const legacyReductions = new Set([
    "powerStrikeCost", "blockCost", "righteousFuryCost", "healCost", "massHealCost",
    "fireballCost", "fireTornadoCost", "dispelCost", "preciseShotCost"
  ]);

  function fresh() {
    return {
      started: false,          // true после «Новой игры»
      coins: 0,
      runes: DWR.CONFIG.startingRunes,
      upgrades: {},            // { nodeId: куплено раз }
      upgradeSpent: null,      // фактически вложенные монеты и руны
      skillResets: 0,
      autoSkills: {},
      panel: Array.from({ length: DWR.CONFIG.skillBar.baseSlots }, (_, i) => startingPanel[i] ?? null),
      location1Done: false,
      cryptDone: false,
      wildsDone: false,
      forgeDone: false,
      riftDone: false,
      dragonCityDone: false,
      bestiary: {},            // { id локации: виды встреченных противников }
      treasuresOpened: {},     // { id локации: открыт ли сундук за первое убийство }
      raidStats: { seconds: 0, coins: 0, runes: 0, starts: 0, win: 0, retreat: 0, wipe: 0,
        locations: {}, active: null, partial: false },
      settings: { music: 0.7, sound: 0.8, skillHotkeys: defaultSkillHotkeys() }
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
        for (const key of ["music", "sound"]) {
          const value = saved.settings?.[key];
          if (Number.isFinite(value)) settings[key] = Math.min(1, Math.max(0, value));
        }
        const hotkeys = saved.settings?.skillHotkeys;
        if (Array.isArray(hotkeys) && hotkeys.length === settings.skillHotkeys.length &&
            hotkeys.every(key => typeof key?.code === "string" && key.code &&
              typeof key.label === "string" && key.label) &&
            new Set(hotkeys.map(key => key.code)).size === hotkeys.length) {
          settings.skillHotkeys = hotkeys;
        }
        const raidStats = { ...defaults.raidStats, ...saved.raidStats };
        if (saved.started && !saved.raidStats) raidStats.partial = true;
        data = Object.assign(defaults, saved, { settings, raidStats });
        data.bestiary = loadBestiary(saved);
        resizePanel();
        if (data.started && !Object.hasOwn(saved, "runes")) {
          // Сохраняем доступ к прежнему фаерболу и учитываем уже открытые сундуки.
          data.upgradeSpent = treeInvestment();
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
        if (data.raidStats.active) finishRaid(data.raidStats.active.wiped ? "wipe" : null);
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

  function setSkillHotkey(slot, key) {
    const hotkeys = data.settings.skillHotkeys;
    const previousSlot = hotkeys.findIndex(binding => binding.code === key.code);
    const switched = previousSlot !== -1 && previousSlot !== slot;
    if (switched) hotkeys[previousSlot] = hotkeys[slot];
    hotkeys[slot] = key;
    save();
    return switched ? previousSlot : -1;
  }

  function resetSkillHotkeys() {
    data.settings.skillHotkeys = defaultSkillHotkeys();
    save();
  }

  function raidLocation(id) {
    return data.raidStats.locations[id] ??= { attempts: 0, bossReached: 0, bossVictories: 0,
      firstVictory: null, bestBossSeconds: null, retreat: 0, wipe: 0 };
  }

  function beginRaid(location, treasureOnly) {
    const stats = data.raidStats;
    if (!treasureOnly) {
      stats.starts++;
      raidLocation(location).attempts++;
    }
    stats.active = { location, treasureOnly, seconds: 0, bossStartedAt: null, bossDefeated: false, wiped: false };
    save();
  }

  function advanceRaidTime(seconds) {
    const raid = data.raidStats.active;
    if (!raid) return;
    const checkpoint = Math.floor(raid.seconds / 5);
    raid.seconds += seconds;
    // Контрольная запись нужна на случай, если закрытие вкладки не успеет сохранить время.
    if (Math.floor(raid.seconds / 5) !== checkpoint) save();
  }

  function reachRaidBoss() {
    const raid = data.raidStats.active;
    if (!raid || raid.treasureOnly || raid.bossStartedAt !== null) return;
    raid.bossStartedAt = raid.seconds;
    raidLocation(raid.location).bossReached++;
    save();
  }

  function markRaidWipe() {
    const raid = data.raidStats.active;
    if (!raid || raid.wiped) return;
    raid.wiped = true;
    save();
  }

  function finishRaid(reason, coins = 0) {
    const stats = data.raidStats, raid = stats.active;
    if (!raid) return;
    stats.seconds += raid.seconds;
    stats.coins += coins;
    data.coins += coins;
    if (!raid.treasureOnly && reason !== null) {
      stats[reason]++;
      if (reason === "retreat" || reason === "wipe") raidLocation(raid.location)[reason]++;
    }
    stats.active = null;
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
  function locationEnemies(id) {
    const kinds = DWR.CONFIG.locations[id].rooms.flatMap(index => {
      const { enemies, fusion } = DWR.CONFIG.rooms[index];
      return fusion ? [...enemies, fusion] : enemies;
    });
    return [...new Set(kinds)];
  }
  function loadBestiary(saved) {
    if (!Object.hasOwn(saved, "bestiary")) {
      // Историю отдельных встреч старые сохранения не содержат.
      return Object.fromEntries(Object.keys(DWR.CONFIG.locations)
        .filter(locationCleared)
        .map(id => [id, locationEnemies(id)]));
    }
    const valid = Object.entries(saved.bestiary ?? {}).filter(([id, kinds]) =>
      Object.hasOwn(DWR.CONFIG.locations, id) && Array.isArray(kinds));
    return Object.fromEntries(valid.map(([id, kinds]) =>
      [id, [...new Set(kinds.filter(kind => typeof kind === "string"))]]));
  }
  function recordEncounters(id, kinds) {
    const seen = new Set(data.bestiary[id]);
    const count = seen.size;
    for (const kind of kinds) seen.add(kind);
    if (seen.size === count) return;
    data.bestiary[id] = [...seen];
    save();
  }
  function completeLocation(id) {
    const first = !locationCleared(id);
    const raid = data.raidStats.active;
    const victorious = raid?.location === id && raid.bossStartedAt !== null && !raid.bossDefeated;
    if (victorious) {
      const stats = raidLocation(id);
      const seconds = raid.seconds - raid.bossStartedAt;
      raid.bossDefeated = true;
      stats.bossVictories++;
      if (first) stats.firstVictory = stats.attempts;
      if (stats.bestBossSeconds === null || seconds < stats.bestBossSeconds) stats.bestBossSeconds = seconds;
    }
    if (first) {
      data.treasuresOpened[id] = false;
      data[DWR.CONFIG.locations[id].progress] = true;
    }
    if (first || victorious) save();
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
    data.raidStats.runes++;
    save();
    return true;
  }

  // --- Узлы дерева ---
  function nodeDef(id) { return nodes.get(id) ?? null; }
  function nodeCount(id) {
    const node = nodeDef(id);
    if (!node) return 0;
    const innate = DWR.CONFIG.skills[DWR.nodeHeroSkill(node)]?.innate;
    return innate ? 1 : Math.min(node.max, data.upgrades[id] ?? 0);
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

  function treeInvestment() {
    if (data.upgradeSpent) return data.upgradeSpent;
    // В старых сохранениях известны ранги, но нет истории платежей.
    const invested = { coins: 0, runes: 0 };
    for (const node of nodes.values()) {
      const count = nodeCount(node.id);
      if (!count) continue;
      const [base, mul] = legacySkillPrices[node.id] ?? [node.base, node.mul];
      const prices = legacyReductions.has(node.id) ? legacyReductionPrices : node.prices;
      const pricedNode = { ...node, base, mul, prices };
      for (let rank = 1; rank <= count; rank++) {
        invested[DWR.skillRankCurrency(pricedNode, rank)] += DWR.skillRankPrice(pricedNode, rank);
      }
    }
    return invested;
  }

  function skillResetInfo() {
    const cost = Math.ceil(100 * 1.25 ** data.skillResets);
    const hasPurchases = [...nodes.values()].some(node => data.upgrades[node.id] > 0 &&
      !DWR.CONFIG.skills[DWR.nodeHeroSkill(node)]?.innate);
    return { cost, invested: treeInvestment(), hasPurchases, affordable: data.coins >= cost };
  }

  function resetSkills() {
    const { cost, invested, hasPurchases, affordable } = skillResetInfo();
    if (!hasPurchases || !affordable) return false;
    data.coins += invested.coins - cost;
    data.runes += invested.runes;
    data.upgrades = {};
    data.upgradeSpent = { coins: 0, runes: 0 };
    data.skillResets++;
    data.panel = fresh().panel;
    const { heal } = data.autoSkills;
    data.autoSkills = heal === undefined ? {} : { heal };
    save();
    return true;
  }

  function buyNode(id) {
    if (!nodeBuyable(id)) return false;
    const { stat, unlockSkill } = nodeDef(id).effect;
    const alreadyUnlocked = unlockSkill && hasSkill(unlockSkill);
    const currency = nodeCurrency(id), price = nodePrice(id);
    data.upgradeSpent = treeInvestment();
    data[currency] -= price;
    data.upgradeSpent[currency] += price;
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

  function bombStock(st = stats(), id = "bomb") {
    return hasSkill(id) ? DWR.CONFIG.skills[id].stock + (st[id + "Stock"] || 0) : 0;
  }

  function resizePanel() {
    const { baseSlots, maxSlots } = DWR.CONFIG.skillBar;
    const length = Math.min(maxSlots, baseSlots + Math.max(0, Math.floor(stats().panelSlots || 0)));
    const previous = Array.isArray(data.panel) ? data.panel : fresh().panel;
    data.panel = Array.from({ length }, (_, i) => previous[i] ?? null);
  }

  return {
    get data() { return data; },
    load, save, reset, setSkillHotkey, resetSkillHotkeys, locationCleared, locationUnlocked, completeLocation, bombStock,
    locationEnemies, recordEncounters,
    beginRaid, advanceRaidTime, reachRaidBoss, markRaidWipe, finishRaid,
    treasureUnopened, treasureAvailable, openTreasure,
    nodeDef, nodeCount, nodePrice, nodeCurrency, nodeUnlocked, nodeBuyable, buyNode, hasSkill, autoEnabled, setAuto,
    skillResetInfo, resetSkills,
    stats
  };
})();
