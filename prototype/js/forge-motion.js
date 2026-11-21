// DWR :: кадры орков и Крага. Прогресс атаки доходит до contact в момент попадания.
"use strict";
window.DWR = window.DWR || {};

DWR.ForgeMotion = (function () {
  const cell = { w: 200, h: 160, x: 108, feet: 155, columns: 5, body: 120 };
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

  function sample(kind, pose, progress) {
    const t = clamp(progress);
    if (pose === "walk") {
      const frame = steps[Math.floor(t * steps.length) % steps.length];
      return { frame, stretch: 1 + Math.sin(t * Math.PI * 4) * 0.017, offset: 0 };
    }
    if (pose === "attack") {
      const frame = t < 0.12 ? 0 : t < contact ? 4 : t < 0.75 ? 5 : t < 0.94 ? 6 : 0;
      const reach = t < contact ? ease(t / contact) : 1 - ease((t - contact) / (1 - contact));
      return { frame, stretch: 1, offset: (kind === "orc-firebolt" ? -0.022 : 0.055) * reach };
    }
    if (pose === "cast") {
      const frame = t < 0.16 ? 0 : t < 0.78 ? 4 : t < 0.94 ? 6 : 0;
      return { frame, stretch: 1, offset: 0 };
    }
    if (pose === "dead") {
      const heights = deathHeights[kind];
      const phase = ease(clamp(t / 0.85)) * (fall.length - 1);
      const start = Math.floor(phase), end = Math.min(start + 1, fall.length - 1);
      const index = Math.round(phase);
      const height = heights[start] + (heights[end] - heights[start]) * (phase - start);
      const stretch = Math.max(0.84, Math.min(1.18, height / heights[index]));
      return { frame: fall[index], stretch, offset: 0.16 * phase / (fall.length - 1) };
    }
    return { frame: 0, stretch: 1, offset: 0 };
  }

  function draw(ctx, atlas, { kind, x, y, h, facing = -1, pose = "idle", poseT = 0 }) {
    if (!atlas?.naturalWidth || !deathHeights[kind]) return;
    const { frame, stretch, offset } = sample(kind, pose, poseT);
    const sx = (frame % cell.columns) * cell.w, sy = Math.floor(frame / cell.columns) * cell.h;
    const scale = h / cell.body;
    ctx.save();
    ctx.translate(x + facing * offset * h, y);
    ctx.scale(-facing * scale, scale * stretch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, sx, sy, cell.w, cell.h, -cell.x, -cell.feet, cell.w, cell.h);
    ctx.restore();
  }

  return { draw, contact, atlasFile: kind => `forge-${kind}.webp` };
})();
