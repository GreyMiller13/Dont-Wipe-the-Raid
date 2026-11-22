// DWR :: общая отрисовка покадровых атласов противников.
"use strict";
window.DWR = window.DWR || {};

DWR.ForgeMotion = (function () {
  const forgeCell = { w: 200, h: 160, x: 108, feet: 155, columns: 5, body: 120 };
  const largeCell = { w: 352, h: 208, x: 187, feet: 198, columns: 5, body: 132 };
  const models = {
    goblinW: { file: "dungeon-goblin-warrior.webp", heights: [134, 119, 98, 57],
      bounds: [[107, 235], [115, 265], [100, 273], [84, 291]] },
    goblinA: { file: "dungeon-goblin-archer.webp", arrow: [125, 104], heights: [133, 118, 104, 68],
      bounds: [[131, 229], [127, 232], [120, 242], [96, 278]] },
    goblinKing: { file: "dungeon-goblin-king.webp", heights: [132, 138, 101, 63],
      bounds: [[111, 247], [112, 250], [96, 277], [88, 287]] },
    skeletonW: { file: "crypt-swordsman.webp", heights: [133, 96, 79, 44],
      bounds: [[122, 219], [126, 248], [115, 260], [97, 277]] },
    skeletonA: { file: "crypt-archer.webp", arrow: [139, 101], heights: [132, 104, 89, 51],
      bounds: [[144, 224], [136, 223], [121, 243], [109, 264]] },
    skeletonM: { file: "crypt-mage.webp", castFrame: 11,
      staff: { 0: [144, 101], 4: [123, 88], 5: [91, 113], 6: [144, 101], 11: [146, 59] },
      heights: [132, 104, 76, 46], bounds: [[136, 217], [118, 236], [89, 244], [109, 266]] },
    lich: { file: "crypt-lich.webp", castFrame: 11, escapeFrame: 12,
      staff: { 0: [147, 86], 4: [121, 73], 5: [158, 84], 6: [147, 86], 11: [135, 63] } }
  };
  const deathHeights = {
    "orc-shield": [120, 110, 98, 57],
    "orc-firebolt": [120, 103, 90, 47],
    "orc-axe": [120, 104, 83, 54],
    "krag-armored": [120, 103, 85, 51],
    "krag-enraged": [120, 100, 84, 51]
  };
  const steps = [1, 2, 3, 2], fall = [0, 7, 8, 9];
  const contact = 0.52;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => value * value * (3 - 2 * value);

  function attackPose(attack) {
    const pose = attack.heavy ? "smash" : attack.ritual || attack.buffing || attack.guarding ? "cast" : "attack";
    // В момент попадания показан тот же кадр, из которого стартует снаряд.
    const poseT = attack.hit
      ? contact + (1 - contact) * clamp((attack.t - attack.windup) / attack.recovery)
      : contact * clamp(attack.t / attack.windup);
    return { pose, poseT };
  }

  function sample(kind, pose, progress) {
    const model = models[kind];
    const t = clamp(progress);
    if (pose === "walk") {
      const frame = steps[Math.floor(t * steps.length) % steps.length];
      return { frame, stretch: 1 + Math.sin(t * Math.PI * 4) * 0.017, offset: 0 };
    }
    if (pose === "attack" || pose === "smash") {
      const smash = pose === "smash";
      const frame = t < 0.12 ? 0 : t < contact ? 4 : t < (smash ? 0.78 : 0.75) ? (smash ? 10 : 5) : t < 0.94 ? 6 : 0;
      const reach = t < contact ? ease(t / contact) : 1 - ease((t - contact) / (1 - contact));
      const lunge = kind === "orc-firebolt" || model?.arrow ? -0.022 : model ? 0.024 : 0.055;
      return { frame, stretch: 1, offset: smash ? 0 : lunge * reach };
    }
    if (pose === "cast") {
      const frame = t < 0.16 ? 0 : t < 0.78 ? model?.castFrame ?? 4 : t < 0.94 ? 6 : 0;
      return { frame, stretch: 1, offset: 0 };
    }
    if (pose === "escape") return { frame: t < 0.13 ? 0 : model?.escapeFrame ?? 0, stretch: 1, offset: 0 };
    if (pose === "dead") {
      const heights = model?.heights ?? deathHeights[kind];
      if (!heights) return { frame: 0, stretch: 1, offset: 0 };
      const phase = ease(clamp(t / (kind === "goblinKing" ? 0.94 : 0.85))) * (fall.length - 1);
      const start = Math.floor(phase), end = Math.min(start + 1, fall.length - 1);
      const index = Math.round(phase);
      const height = heights[start] + (heights[end] - heights[start]) * (phase - start);
      const stretch = Math.max(0.84, Math.min(1.18, height / heights[index]));
      const slide = kind === "goblinKing" ? -0.09 : model ? 0.06 : 0.16;
      return { frame: fall[index], stretch, offset: slide * phase / (fall.length - 1) };
    }
    return { frame: 0, stretch: 1, offset: 0 };
  }

  function draw(ctx, atlas, { kind, x, y, h, facing = -1, pose = "idle", poseT = 0 }) {
    const model = models[kind];
    if (!atlas?.naturalWidth || (!model && !deathHeights[kind])) return;
    const { frame, stretch, offset } = sample(kind, pose, poseT);
    const cell = model ? largeCell : forgeCell;
    const sx = (frame % cell.columns) * cell.w, sy = Math.floor(frame / cell.columns) * cell.h;
    const scale = h / cell.body;
    let origin = x + facing * offset * h;
    if (model?.bounds && pose === "dead") {
      const [left, right] = model.bounds[fall.indexOf(frame)];
      const a = (left - cell.x) * -facing * scale, b = (right - cell.x) * -facing * scale;
      origin = Math.max(3 - Math.min(a, b), Math.min(origin, DWR.CONFIG.canvas.w - 3 - Math.max(a, b)));
    }
    ctx.save();
    ctx.translate(origin, y);
    ctx.scale(-facing * scale, scale * stretch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, sx, sy, cell.w, cell.h, -cell.x, -cell.feet, cell.w, cell.h);
    ctx.restore();
  }

  function atlasPoint({ x, h, facing }, [originX, originY], { offset, stretch }) {
    const scale = h / largeCell.body;
    return { x: x + facing * (offset * h + (largeCell.x - originX) * scale),
      y: (originY - largeCell.feet) * scale * stretch };
  }

  function bowRelease(unit) {
    const arrow = models[unit.kind]?.arrow;
    return arrow ? atlasPoint(unit, arrow, sample(unit.kind, "attack", contact)) : null;
  }

  function staffPoint(unit, attack) {
    const staff = models[unit.kind]?.staff;
    if (!staff) return null;
    const { pose, poseT } = attack ? attackPose(attack) : { pose: "idle", poseT: 0 };
    const frame = sample(unit.kind, pose, poseT);
    return atlasPoint(unit, staff[frame.frame], frame);
  }

  return { draw, attackPose, bowRelease, staffPoint, atlasFile: kind => models[kind]?.file ?? `forge-${kind}.webp` };
})();
