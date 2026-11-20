// DWR :: upgrade.js — карта прокачки, камера и покупка узлов.
"use strict";
window.DWR = window.DWR || {};

DWR.Upgrade = (function () {
  const S = DWR.State;
  const NODE_SIZE = 74, STEP_X = 226, STEP_Y = 83, GROUP_GAP = 11;
  const COLORS = {
    warrior: { color: "#f1a58b", line: "#ac6c61" },
    priest: { color: "#dbc2ff", line: "#8e76b3" },
    ranger: { color: "#a3d6a4", line: "#689977" },
    raid: { color: "#efcb86", line: "#ac8857" }
  };
  const GROUP_ICONS = {
    sword: "crossblades", strike: "sweep", guard: "shield", resolve: "armor",
    light: "glow", flame: "flame", mana: "drop", alchemy: "flask",
    shoot: "bow", volley: "spread", aim: "target", focus: "eye",
    bounty: "pouch", contract: "trophy", pickup: "hand"
  };
  const SKILL_ICONS = {
    wDmg: "blade", wTempo: "swift", wStride: "boot", wStrike: "sweep", powerStrikeHaste: "hourglass",
    powerStrikeCost: "efficiency", powerStrikeRefund: "burst", blockDur: "shield", blockHaste: "hourglass",
    blockCost: "efficiency", blockHeal: "heart", wHp: "heart", wArmor: "armor", wRageKill: "flame", wRageRegen: "cycle",
    healPow: "heal", healHaste: "hourglass", healCost: "efficiency", healWard: "shield", healOverflow: "heart",
    fireDmg: "fireball", fireballHaste: "hourglass", fireballCost: "spark", fireballBlast: "burst",
    fireballUnlock: "vessel", manaPool: "drop", manaRegen: "cycle", manaOnKill: "spark", manaOnRoom: "door",
    potionLuck: "vessel", potionStr: "flask", pHp: "heart", potionSquadHeal: "squad",
    rDmg: "arrow", rSpeed: "swift", rHp: "boot", rFan: "fan", multishotHaste: "hourglass",
    multishotCost: "efficiency", rExtraArrow: "spread", rPrecision: "arrow", preciseShotHaste: "hourglass",
    preciseShotCost: "efficiency", preciseBoss: "skull", rFocusKill: "target", rFocusRegen: "cycle",
    raidCoins: "coin", bossCoins: "skull", chestCoins: "chest", roomCoins: "scroll", raidVictoryCoins: "trophy",
    lootReach: "hand", autoCoins: "magnet"
  };
  const ICON_PATHS = {
    squad: "M3 18v-3l3-2m12 0 3 2v3M8 20v-3l4-3 4 3v3zM14 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM8 7a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM20 7a2 2 0 1 1-4 0 2 2 0 1 1 4 0z",
    blade: "M5 19l4-4m-4-3 7 7m-5-5 9-11h5v5L10 17M4 20l-1 1",
    crossblades: "M3 3h4l13 16m-5 1 6-5M21 3h-4L4 19m5 1-6-5M3 3v4l4 3m14-7v4l-4 3",
    powerStrike: "M4 20l6-6m-4-3 7 7m-5-5 7-9 6-1-1 6-9 7m-7-9 3-3m4 0 2-2m3 16 2-2m-1 5 4-4",
    swift: "M13 2 5 13h6l-1 9 9-12h-7z",
    boot: "M9 3h8v10l4 3v4H3v-5l6-2zM4 17h16M9 8h4m-4 3h4",
    sweep: "M3 16q10 3 18-11-1 13-15 15zm7-7 2-5m-6 9-3-1",
    hourglass: "M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4M9 18h6",
    efficiency: "M12 3v14m-5-5 5 5 5-5M5 21h14M4 6h3m10 0h3",
    burst: "M12 2l2 6 6-4-3 7 5 2-6 2 3 5-6-3-2 5-2-6-6 3 4-6-5-2 6-2-3-5 6 4z",
    shield: "M12 3l8 3v5q0 7-8 10-8-3-8-10V6zM12 7v9m-4-4h8",
    block: "M12 2l8 3v6q0 7-8 11-8-4-8-11V5zM12 6l4 2v3q0 4-4 7-4-3-4-7V8z",
    heart: "M12 20 4 12c-5-6 3-12 8-6 5-6 13 0 8 6zM6 11h3l2-2 2 4h3",
    glow: "M10 6h4v4h4v4h-4v4h-4v-4H6v-4h4zM12 2v1m9 9h1m-10 9v1M2 12h1M5 5l1 1m12 12 1 1m0-14-1 1M6 18l-1 1",
    heal: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z",
    armor: "M9 3 3 6v7h4v8h10v-8h4V6l-6-3-3 4zM9 12h6",
    flame: "M12 2c-3 7 0 10-4 10l-2-3c-6 8-1 13 6 13 8 0 10-6 7-11l-2 4c1-5-3-5-5-13z",
    fireball: "M21 8q1 5-3 9-5 5-9 1-4-4 1-9 4-4 9-3zM9 18l-5 3m2-7-4 2m8-8-4 2m9-2-2 4 2 3 3-3z",
    cycle: "M19 8A8 8 0 0 0 5 7l-2 3m0-5v5h5M5 16a8 8 0 0 0 14 1l2-3m0 5v-5h-5",
    drop: "M12 2c-2 4-7 9-7 13a7 7 0 0 0 14 0c0-4-5-9-7-13zM8 15q0 3 3 4",
    vessel: "M8 3h8m-7 0v6l-5 5v6h16v-6l-5-5V3M4 15h16M10 18h4",
    flask: "M8 3h8m-6 0v7l-6 8 1 3h14l1-3-6-8V3m-7 13h10m-6 2h2",
    potion: "M9 3h6v5l4 5q2 2 1 4l-3 4H7l-3-4q-1-2 1-4l4-5zM9 6h6m-3 7v5m-2.5-2.5h5",
    spark: "M12 3q0 7 7 9-7 0-7 7-2-7-9-7 7-2 9-9zM19 3v4m-2-2h4M4 18v3m-1-1h3",
    door: "M4 21h16m-14 0V5l12-2v18M9 14h2",
    bow: "M4 4q15-1 15 16M4 4l15 16M8 16l11-11m-5 0h5v5",
    arrow: "M3 21 20 4m-8 1 8-1-1 8M4 14h6v6",
    fan: "M3 20 20 4m-6 0h6v6M4 15l1-11m-3 3 3-3 3 3M9 20l11-1m-3-3 3 3-3 3",
    multishot: "M3 19 20 4m-5 0h5v5M3 13l8-9M7 4h4v4M10 20l10-9m-5 0h5v5",
    spread: "M3 12h18m-4-4 4 4-4 4M8 12l7-8m-4 0h4v4M8 12l7 8m-4 0h4v-4",
    target: "M12 3v4m0 10v4M3 12h4m10 0h4M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0zM14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0z",
    preciseShot: "M3 21 20 4m-6 0h6v6M20 13a8 8 0 1 1-7-9M17 14a5 5 0 1 1-7-7",
    eye: "M2 12q10-12 20 0-10 12-20 0zM15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0z",
    skull: "M7 21v-4l-3-2V8l3-4h10l3 4v7l-3 2v4zM7 11h2m6 0h2m-6 4h2m-3 3v3m4-3v3",
    scroll: "M6 4h13v13m-13-13H3v4h3m0-4v16h13l2-3h-9l-2 3m-1-9h7m-7 3h5",
    coin: "M16 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 1 1 13 0zM18 8a6.5 6.5 0 1 1-7 11M9.5 7v6m-2-3h4",
    chest: "M3 11q0-6 5-6h8q5 0 5 6v8H3zM3 11h18m-11 0v4h4v-4M7 6v5m10-5v5",
    trophy: "M7 3h10v8l-2 4H9l-2-4zm0 3H3v4l4 3m10-7h4v4l-4 3m-5 2v5m-5 1h10",
    pouch: "M8 8 6 4h12l-2 4M8 8c-3 3-5 6-5 9q0 4 9 4t9-4c0-3-2-6-5-9zM11 13h2l1 1-1 2h-2l-1-1z",
    hand: "M5 21v-5l-3-4 2-2 4 3V5h3v6-8h3v8-6h3v7-4h3v9l-4 4z",
    magnet: "M4 4h5v10a3 3 0 0 0 6 0V4h5v10a8 8 0 0 1-16 0zM4 8h5m6 0h5"
  };
  const glyphs = new Map();
  const camera = { x: 0, y: 0, scale: 1, initialized: false };
  let selectedId = null;

  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function layoutWorld() {
    const skills = new Map(), vertices = [];
    function vertex(kind, name, owner, children = []) {
      const node = { kind, name, owner, children };
      vertices.push(node);
      return node;
    }

    const root = vertex("root", "Отряд");
    const branches = Object.fromEntries(Object.entries(DWR.CONFIG.trees).map(([owner, tree]) => {
      const branch = vertex("branch", tree.name, owner);
      root.children.push(branch);
      for (const group of tree.branches) {
        const heading = vertex("group", group.name, owner);
        heading.icon = GROUP_ICONS[group.id];
        branch.children.push(heading);
        for (const def of group.nodes) {
          const skill = vertex("skill", def.name, owner);
          skill.id = def.id;
          skill.group = group.name;
          skills.set(def.id, skill);
        }
        for (const def of group.nodes) {
          const parent = skills.get(def.parent) || heading;
          parent.children.push(skills.get(def.id));
        }
      }
      return [owner, branch];
    }));

    // Листья занимают отдельные строки, а каждый родитель центрируется между своими детьми.
    let row = 0;
    function place(node, depth, direction) {
      node.x = (STEP_X * depth + 72) * direction;
      if (node.children.length) {
        node.children.forEach(child => place(child, depth + 1, direction));
        node.y = (node.children[0].y + node.children.at(-1).y) / 2;
      } else {
        node.y = row;
        row += STEP_Y;
      }
      if (node.kind === "group") row += GROUP_GAP;
    }

    const middleGap = 58;
    for (const [top, bottom, direction] of [["warrior", "ranger", -1], ["priest", "raid", 1]]) {
      row = 0;
      place(branches[top], 1, direction);
      const topHeight = row + middleGap / 2;
      function offset(node) {
        node.y -= topHeight;
        node.children.forEach(offset);
      }
      offset(branches[top]);
      row = middleGap / 2;
      place(branches[bottom], 1, direction);
    }
    root.x = root.y = 0;

    const margin = 28 + NODE_SIZE / 2;
    const minX = Math.min(...vertices.map(node => node.x)) - margin;
    const minY = Math.min(...vertices.map(node => node.y)) - margin;
    const width = Math.ceil(Math.max(...vertices.map(node => node.x)) + margin - minX);
    const height = Math.ceil(Math.max(...vertices.map(node => node.y)) + margin - minY);
    for (const node of vertices) {
      node.x -= minX;
      node.y -= minY;
    }
    return { root, branches, vertices, skills, width, height };
  }

  const world = layoutWorld();

  function nodeIcon(name) {
    if (!glyphs.has(name)) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 48;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.65;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(new Path2D(ICON_PATHS[name]));
      glyphs.set(name, canvas.toDataURL());
    }
    return `<span class="up-node-icon up-glyph" style="--glyph:url(${glyphs.get(name)})" aria-hidden="true"></span>`;
  }

  function drawLinks(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    for (const parent of world.vertices) for (const child of parent.children) {
      const fromX = parent.x;
      const fromY = parent.y + (parent === world.root ? Math.sign(child.y - parent.y) * 13 : 0);
      const toX = child.x;
      const middle = (fromX + toX) / 2;
      const unlocked = child.kind !== "skill" || S.nodeUnlocked(child.id);
      ctx.strokeStyle = COLORS[child.owner].line;
      ctx.globalAlpha = unlocked ? 0.95 : 0.66;
      ctx.lineWidth = child.kind === "branch" ? 5 : unlocked ? 3.3 : 2.5;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.bezierCurveTo(middle, fromY, middle, child.y, toX, child.y);
      ctx.stroke();
    }
  }

  function renderWorld() {
    return world.vertices.map(vertex => {
      const { owner, kind, x, y, id } = vertex;
      const name = escapeHtml(vertex.name);
      const position = `left:${x - NODE_SIZE / 2}px;top:${y - NODE_SIZE / 2}px`;
      if (kind === "root") {
        return `<div class="up-vertex up-root" style="${position}">${nodeIcon("squad")}<span class="up-node-label">${name}</span></div>`;
      }
      const theme = COLORS[owner];
      const style = `${position};--branch:${theme.color};--branch-line:${theme.line}`;
      if (kind === "group") return `<div class="up-vertex up-group" style="${style}" title="${name}" role="img" aria-label="${name}">${nodeIcon(vertex.icon)}</div>`;
      if (kind === "branch") {
        const image = owner === "raid" ? '<img class="up-node-icon" src="assets/out/coin.png" alt="" draggable="false">'
          : `<span class="scr-portrait"><img src="assets/out/${owner}.png" alt="" draggable="false"></span>`;
        return `<div class="up-vertex up-branch" style="${style}">${image}<h3 class="up-node-label">${name}</h3></div>`;
      }
      const node = S.nodeDef(id), count = S.nodeCount(id), locked = !S.nodeUnlocked(id);
      const label = locked ? "Закрыто" : count >= node.max && node.max === 1 ? "Изучено" : count + " / " + node.max;
      const state = locked ? "locked" : count >= node.max ? "full" : count > 0 ? "learned"
        : S.nodeBuyable(id) ? "buyable" : "open";
      const icon = nodeIcon(node.effect.unlockSkill || SKILL_ICONS[id]);
      return `<button class="up-vertex up-socket up-socket-${state}" data-node="${id}" style="${style}"
          title="${name} · ${label}" aria-label="${name} · ${label}" aria-pressed="${id === selectedId}">
          ${icon}${count > 0 ? `<small aria-hidden="true">${count}/${node.max}</small>` : ""}</button>`;
    }).join("");
  }

  function renderDetails() {
    if (!selectedId) return '<p class="up-detail-empty">Выберите навык, чтобы узнать его эффект и стоимость.</p>';
    const node = S.nodeDef(selectedId);
    const { owner, group } = world.skills.get(selectedId);
    const theme = COLORS[owner];
    const count = S.nodeCount(node.id);
    let action;
    if (!S.nodeUnlocked(node.id)) {
      const parent = S.nodeDef(node.parent);
      action = `<div class="up-requirement">Нужно изучить «${escapeHtml(parent.name)}» до уровня ${node.requiresLevel}.</div>`;
    } else if (count >= node.max) {
      action = '<div class="up-requirement up-complete">✓ Изучено полностью</div>';
    } else {
      const price = S.nodePrice(node.id), buyable = S.nodeBuyable(node.id);
      action = `<button class="btn btn-gold up-buy"${buyable ? "" : " disabled"}>${buyable ? "Купить" : "Не хватает монет"}
        <span><img src="assets/out/coin.png" alt="">${price}</span></button>`;
    }
    return `<section class="up-detail" style="--branch:${theme.color};--branch-line:${theme.line}">
      <div class="up-detail-name"><p class="up-detail-path">${escapeHtml(world.branches[owner].name)} · ${escapeHtml(group)}</p>
        <h3>${nodeIcon(node.effect.unlockSkill || SKILL_ICONS[node.id])}${escapeHtml(node.name)}</h3></div>
      <p class="up-detail-description">${escapeHtml(node.desc)}</p>
      <div class="up-detail-rank">
        <label for="up-rank">Уровень <strong>${count} / ${node.max}</strong></label>
        <progress id="up-rank" max="${node.max}" value="${count}"></progress>
      </div>${action}</section>`;
  }

  function bindCamera(screen) {
    const map = screen.querySelector(".up-map"), canvas = map.querySelector(".up-world");
    const zoom = screen.querySelector(".up-zoom");
    let press = null, ignoreClick = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const fitScale = () => Math.min(1, (map.clientWidth - 24) / world.width, (map.clientHeight - 24) / world.height);

    function paint() {
      camera.x = clamp(camera.x, 72 - world.width * camera.scale, map.clientWidth - 72);
      camera.y = clamp(camera.y, 72 - world.height * camera.scale, map.clientHeight - 72);
      canvas.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
      zoom.textContent = Math.round(camera.scale * 100) + "%";
    }
    function fitWorld() {
      camera.scale = fitScale();
      camera.x = (map.clientWidth - world.width * camera.scale) / 2;
      camera.y = (map.clientHeight - world.height * camera.scale) / 2;
      camera.initialized = true;
      paint();
    }
    function zoomAt(factor, x, y) {
      const next = clamp(camera.scale * factor, fitScale(), 1.85);
      camera.x = x - (x - camera.x) * next / camera.scale;
      camera.y = y - (y - camera.y) * next / camera.scale;
      camera.scale = next;
      paint();
    }
    function pointer(e) {
      const bounds = map.getBoundingClientRect();
      const scale = bounds.width / map.offsetWidth;
      return { x: (e.clientX - bounds.left) / scale - map.clientLeft,
        y: (e.clientY - bounds.top) / scale - map.clientTop };
    }
    map.addEventListener("wheel", e => {
      e.preventDefault();
      const { x, y } = pointer(e);
      const factor = Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -220, 220) * 0.0025);
      zoomAt(factor, x, y);
    }, { passive: false });

    map.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const { x, y } = pointer(e);
      press = { pointerId: e.pointerId, x, y, cameraX: camera.x, cameraY: camera.y, moving: false };
      ignoreClick = false;
    });
    map.addEventListener("pointermove", e => {
      if (!press || press.pointerId !== e.pointerId) return;
      const cursor = pointer(e), dx = cursor.x - press.x, dy = cursor.y - press.y;
      if (!press.moving) {
        if (Math.hypot(dx, dy) < 5) return;
        press.moving = true;
        ignoreClick = true;
        map.setPointerCapture(e.pointerId);
        map.classList.add("up-map-panning");
      }
      camera.x = press.cameraX + dx;
      camera.y = press.cameraY + dy;
      paint();
    });
    const release = () => {
      press = null;
      map.classList.remove("up-map-panning");
    };
    map.addEventListener("pointerup", release);
    map.addEventListener("pointercancel", release);
    map.addEventListener("pointerleave", () => { if (!press?.moving) release(); });
    map.addEventListener("dragstart", e => e.preventDefault());
    map.addEventListener("click", e => {
      if (ignoreClick && e.detail > 0) {
        ignoreClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    map.addEventListener("keydown", e => {
      const offsets = { ArrowLeft: [90, 0], ArrowRight: [-90, 0], ArrowUp: [0, 90], ArrowDown: [0, -90] };
      if (offsets[e.key]) {
        e.preventDefault();
        const [dx, dy] = offsets[e.key];
        camera.x += dx;
        camera.y += dy;
        paint();
      } else if (e.key === "+" || e.key === "=" || e.key === "-") {
        e.preventDefault();
        zoomAt(e.key === "-" ? 0.83 : 1.2, map.clientWidth / 2, map.clientHeight / 2);
      }
    });
    map.addEventListener("focusin", e => {
      if (!e.target.matches("[data-node]:focus-visible")) return;
      const area = map.getBoundingClientRect(), node = e.target.getBoundingClientRect();
      const scale = area.width / map.offsetWidth;
      const dx = node.left < area.left ? area.left - node.left + 12 :
        node.right > area.right ? area.right - node.right - 12 : 0;
      const dy = node.top < area.top ? area.top - node.top + 12 :
        node.bottom > area.bottom ? area.bottom - node.bottom - 12 : 0;
      if (dx || dy) { camera.x += dx / scale; camera.y += dy / scale; paint(); }
    });
    screen.querySelector(".up-fit").addEventListener("click", fitWorld);
    if (camera.initialized) paint();
    else fitWorld();
  }

  function bindHelp(page) {
    const button = page.querySelector(".up-help-button"), toast = page.querySelector(".up-help-toast");
    let timeout;
    function show(visible) {
      clearTimeout(timeout);
      toast.hidden = !visible;
      button.setAttribute("aria-expanded", String(visible));
      if (visible) timeout = setTimeout(() => show(false), 8000);
    }
    button.addEventListener("click", () => show(toast.hidden));
    page.addEventListener("keydown", event => {
      if (event.key === "Escape" && !toast.hidden) show(false);
    });
  }

  function redraw() {
    const el = document.getElementById("screen-upgrade");
    el.innerHTML = `
      <main class="up-page up-tree-page">
        <header class="up-header">
          <h2 class="scr-h2">Дерево навыков</h2>
          <div class="up-header-right">
            <div class="up-map-controls" aria-label="Управление картой">
              <div class="up-help">
                <button class="btn up-help-button" aria-label="Как управлять картой" aria-controls="up-help-toast" aria-expanded="false">i</button>
                <div class="up-help-toast" id="up-help-toast" role="status" hidden>
                  <p>Колесо мыши приближает и отдаляет карту.</p>
                  <p>Зажмите ЛКМ и потяните, чтобы переместиться.</p>
                </div>
              </div>
              <output class="up-zoom" aria-label="Масштаб"></output>
              <button class="btn up-fit">Вся карта</button>
            </div>
            <span class="up-balance"><img src="assets/out/coin.png" alt=""> <b>${S.data.coins}</b> монет</span>
            <button class="btn up-back">Назад</button>
          </div>
        </header>
        <div class="up-map" tabindex="0" role="region" aria-label="Карта навыков">
          <div class="up-world" style="width:${world.width}px;height:${world.height}px;--node-size:${NODE_SIZE}px">
            <canvas class="up-links" aria-hidden="true" width="${world.width * 2}" height="${world.height * 2}"></canvas>${renderWorld()}
          </div>
        </div>
        <div class="up-details">${renderDetails()}</div>
      </main>`;
    drawLinks(el.querySelector(".up-links"));
    bindCamera(el);
    bindHelp(el.querySelector(".up-tree-page"));
    el.querySelector(".up-back").addEventListener("click", () => DWR.showScreen("location"));
    const details = el.querySelector(".up-details");
    el.querySelector(".up-world").addEventListener("click", event => {
      const socket = event.target.closest("[data-node]");
      if (!socket || selectedId === socket.dataset.node) return;
      el.querySelector('[data-node][aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
      selectedId = socket.dataset.node;
      socket.setAttribute("aria-pressed", "true");
      details.innerHTML = renderDetails();
    });
    details.addEventListener("click", event => {
      if (!event.target.closest(".up-buy") || !S.buyNode(selectedId)) return;
      redraw();
      (el.querySelector(".up-buy:not(:disabled)") || el.querySelector('[data-node][aria-pressed="true"]')).focus({ preventScroll: true });
    });
  }

  return { redraw };
})();
