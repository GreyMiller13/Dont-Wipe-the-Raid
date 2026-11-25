// DWR :: city-motion.js — атласы противников Города гномов.
"use strict";
window.DWR = window.DWR || {};

DWR.CityMotion = (function () {
  const atlases = {
    "black-dragon": { idle: "black-dragon-full-idle", paw: "black-dragon-paw",
      breath: "black-dragon-breath", fire: "black-dragon-fire", dead: "black-dragon-death" },
    "black-whelp": { fly: "black-whelp-flight", cast: "black-whelp-fireball", dead: "black-whelp-death" },
    "drakonid-warrior": { walk: "drakonid-warrior-walk", hammer: "drakonid-warrior-hammer",
      shield: "drakonid-warrior-shield", dead: "drakonid-warrior-death" },
    "drakonid-shaman": { walk: "drakonid-shaman-walk", cast: "drakonid-shaman-cast", dead: "drakonid-shaman-death" }
  };
  const files = kind => Object.values(atlases[kind]);
  const file = id => {
    const suffix = id === atlases["black-dragon"].idle ? "" : "-atlas";
    const extension = id.startsWith("black-dragon-") || id.endsWith("-death") ? "webp" : "png";
    return "../sprites/dragon-city/" + id + suffix + "." + extension;
  };

  function attackFrame(attack) {
    if (attack.hit) return Math.min(5, 3 + Math.floor(3 * (attack.t - attack.windup) / attack.recovery));
    return Math.min(2, Math.floor(3 * attack.t / attack.windup));
  }

  function deathFrame(progress, land) {
    if (progress < land) return progress < land * 0.19 ? 0 : progress < land * 0.56 ? 1 : 2;
    return Math.min(5, 3 + Math.floor(3 * (progress - land) / (1 - land)));
  }

  function pose(unit, time, fall) {
    const { attack, kind } = unit;
    if (unit.pose === "dead") return ["dead", deathFrame(unit.poseT, fall.land)];
    if (kind === "black-whelp") return attack
      ? ["cast", attackFrame(attack)] : ["fly", Math.floor(time * 7.5) % 6];
    if (kind === "drakonid-warrior") {
      if (unit.shieldRaised) return ["shield", 4];
      if (unit.shieldLowering) return ["shield", 5];
      // Кадры 3–4 показывают щит слишком фронтально для бокового ракурса.
      if (attack?.guarding) return ["shield", attack.t < attack.windup * 0.4 ? 0 : 1];
      if (attack) return ["hammer", attackFrame(attack)];
      return unit.pose === "walk" ? ["walk", Math.floor(unit.poseT * 6) % 6] : ["hammer", 0];
    }
    if (attack) return ["cast", attackFrame(attack)];
    return unit.pose === "walk" ? ["walk", Math.floor(unit.poseT * 6) % 6] : ["cast", 0];
  }

  function dragonPose(unit, dragon, fall) {
    if (unit.pose === "dead") {
      const t = unit.poseT;
      const frame = t < fall.land
        ? (t < fall.land * 0.44 ? 0 : 1)
        : (t < fall.land + (1 - fall.land) * 0.58 ? 2 : 3);
      return ["dead", frame];
    }
    const attack = unit.attack;
    const move = attack?.dragonMove;
    if (!move) return ["idle", 0];
    // Для призыва дракон поднимает голову и рычит. Струя рисуется только при выдохе.
    const clip = move === "summon" ? "breath" : move;
    if (!attack.hit) {
      const charge = attack.t / attack.windup;
      if (charge < 0.22) return ["idle", 0];
      return [clip, charge < 0.57 ? 0 : 1];
    }
    const elapsed = attack.t - attack.windup;
    const hold = move === "breath" ? dragon.breath.active : attack.recovery * 0.48;
    if (elapsed < hold) return [clip, 2];
    return elapsed < attack.recovery * 0.94 ? [clip, 3] : ["idle", 0];
  }

  function drawDragon(ctx, images, unit, time, spec, dragon, fall) {
    const [name, frame] = dragonPose(unit, dragon, fall);
    const ids = atlases["black-dragon"];
    const image = images[ids[name]]?.naturalWidth ? images[ids[name]] : images[ids.idle];
    if (!image?.naturalWidth) return;
    const grid = image === images[ids.idle] ? 1 : 2;
    const w = image.naturalWidth / grid, h = image.naturalHeight / grid;
    const scale = unit.h / spec.artHeight;
    const [anchorX, anchorY] = spec.anchor;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    if (name === "idle") ctx.scale(1, 1 + Math.sin(time * 2.6) * 0.005);
    ctx.imageSmoothingEnabled = true;
    const row = grid === 1 ? 0 : Math.floor(frame / grid);
    ctx.drawImage(image, frame % grid * w, row * h, w, h,
      -anchorX * scale, -anchorY * scale, w * scale, h * scale);
    ctx.restore();
  }

  function drawDragonFire(ctx, images, unit, floor) {
    const attack = unit.attack;
    if (!unit.alive || attack?.dragonMove !== "breath" || !attack.hit) return;
    const { expand, active, range } = unit.def.dragon.breath;
    const age = Math.max(0, attack.t - attack.windup);
    if (age >= active || age === 0) return;
    const image = images[atlases["black-dragon"].fire];
    if (!image?.naturalWidth) return;

    const growth = Math.min(1, age / expand);
    const ending = age > active - 0.14;
    const frame = ending ? 3 : age < 0.10 ? 0 : 1 + Math.floor((age - 0.10) / 0.105) % 2;
    const w = image.naturalWidth / 2, h = image.naturalHeight / 2;
    const tipX = 778, tipY = 240;
    // Во всех кадрах узкая часть совпадает с пастью. Длину струи задаёт дальность атаки.
    const extent = [437, 753, 750, 534][frame];
    const sx = range * growth / extent;
    const sy = (0.28 + 0.19 * growth) * (ending ? 0.75 : 1);
    const origin = DWR.Sim.cityReleasePoint(unit);
    ctx.save();
    ctx.translate(origin.x, floor + origin.y);
    ctx.transform(1, -0.20, 0, 1, 0, 0);
    ctx.globalAlpha *= Math.min(1, age / 0.045, (active - age) / 0.14);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, frame % 2 * w, Math.floor(frame / 2) * h, w, h,
      -tipX * sx, -tipY * sy, w * sx, h * sy);
    ctx.restore();
  }

  function draw(ctx, images, unit, time) {
    const { city: spec, fall, dragon } = DWR.CONFIG.enemies[unit.kind];
    if (dragon) {
      drawDragon(ctx, images, unit, time, spec, dragon, fall);
      return;
    }
    const [name, frame] = pose(unit, time, fall);
    const image = images[atlases[unit.kind][name]];
    if (!image?.naturalWidth) return;
    const w = image.naturalWidth / 2, h = image.naturalHeight / 3, scale = unit.h / spec.artHeight;
    let [anchorX, anchorY] = spec.anchor;
    if (unit.kind === "drakonid-warrior") {
      if (name === "shield") [anchorX, anchorY] = [385, 366];
      if (name === "walk") [anchorX, anchorY] = [350, 358];
    }
    // Дракончик набирает скорость падения и достигает линии пола в кадре первого контакта.
    const drop = name === "dead" ? (unit.airLift ?? spec.lift ?? 0) * Math.min(1, unit.poseT / fall.land) ** 2 : 0;
    ctx.save();
    ctx.translate(unit.x, unit.y + drop);
    ctx.scale(unit.facing === 1 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, frame % 2 * w, Math.floor(frame / 2) * h, w, h,
      -anchorX * scale, -anchorY * scale, w * scale, h * scale);
    ctx.restore();
  }

  return { files, file, draw, drawDragonFire };
})();
