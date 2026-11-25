// DWR :: chars.js — покадровые герои, составные спрайты врагов и контуры целей.
"use strict";
window.DWR = window.DWR || {};

DWR.Chars = (function () {
  const BODY_PX = 72, BOTTOM_PAD = 3;
  const WARRIOR_RIG_BODY_PX = 65; // От макушки до подошв в составном спрайте воина.
  const HERO_COMBAT_DENSITY = 2, WARRIOR_WALK_COLUMNS = 8;
  const WALK_FRAMES = 16, FALL_FRAMES = 12;
  // За цикл опорная стопа проходит две длины шага в координатах карты.
  const WALK_CYCLE = { warrior: 48 / WARRIOR_RIG_BODY_PX, goblinW: 36 / 64, goblinKing: 32 / 64, skeletonW: 40 / 74,
    wolfhound: 0.84, werewolf: 0.6, lycan: 0.45, "orc-shield": 0.56, "orc-axe": 0.59, krag: 0.46 };
  const RANGER_CLIPS = { multishot: "ranger-multishot", preciseShot: "ranger-precise" };
  const FALLEN_BOUNDS = { warrior: [64, 105, 113], priest: [54, 97, 114], ranger: [54, 103, 114] };
  // Внешний контур goblinK.png в пикселях позволяет опереть упавшего короля на спину.
  const KING_HULL = [
    [0, 61], [12, 23], [14, 17], [16, 14], [19, 11], [28, 5], [33, 2], [36, 1], [40, 0], [45, 0],
    [46, 1], [66, 27], [68, 30], [68, 36], [66, 39], [45, 63], [26, 64], [14, 64], [0, 63]
  ];
  const LYCAN_HULL = [[33, 10], [62, 0], [94, 22], [105, 60], [104, 87], [79, 88], [47, 88], [33, 72]];
  const ARM_PIVOTS = {
    goblinW: [18, 20], goblinA: [17, 22], goblinKing: [21, 24],
    skeletonW: [7, 22], skeletonA: [17, 24], skeletonM: [24, 28], lich: [40, 32]
  };
  const BOW_ANGLE = -1.05;
  const BOWS = { goblinA: [27, 40, BOW_ANGLE], skeletonA: [26, 41, -0.65] };
  const STAFFS = { skeletonM: [45, 18, 0.24], lich: [62, 11, 0.25] };
  // Время позы, углы плеча, предплечья, клинка и наклона корпуса.
  const WARRIOR_POSES = [
    [0, 1.79, 0.90, 0.26, 0],
    [0.24, 2.42, -1.33, -2.30, -0.045],
    [DWR.CONFIG.battle.warriorContact, 0.75, -0.08, -0.12, 0.070],
    [0.69, 1.19, 0.51, 0.59, 0.045],
    [1, 1.79, 0.90, 0.26, 0]
  ];
  const WARRIOR_SHOULDER = [70.5, 64.5];
  const OUTLINE_OFFSETS = [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [-3, 3], [3, -3], [3, 3]];
  const smooth = t => t * t * (3 - 2 * t);
  const clamp = t => Math.max(0, Math.min(1, t));
  const facing = unit => unit.facing === -1 ? -1 : 1;
  let outlineBuffers, frameMixer;

  function armPoint(kind, x, y, angle) {
    const [px, py] = ARM_PIVOTS[kind], dx = x - px, dy = y - py;
    return [px + dx * Math.cos(angle) - dy * Math.sin(angle),
      py + dx * Math.sin(angle) + dy * Math.cos(angle)];
  }

  function rigPoint(unit, x, y, angle) {
    const body = DWR.Assets.enemyLayers?.[unit.kind]?.body;
    if (!body?.naturalWidth) return null;
    const point = armPoint(unit.kind, x, y, angle);
    const scale = unit.h / body.naturalHeight;
    return { x: unit.x + (point[0] - body.naturalWidth / 2) * scale * facing(unit),
      y: (point[1] - body.naturalHeight) * scale };
  }

  function enemyBowRelease(unit) {
    const bow = BOWS[unit.kind];
    return DWR.ForgeMotion.bowRelease(unit) ?? (bow ? rigPoint(unit, ...bow) : null);
  }

  function staffPoint(unit, attack = unit.attack) {
    const staff = STAFFS[unit.kind];
    return DWR.ForgeMotion.staffPoint(unit, attack) ??
      (staff ? rigPoint(unit, staff[0], staff[1], attack ? enemyMotion(unit.kind, attack).arm : 0) : null);
  }

  function enemyMotion(kind, attack) {
    const { t, windup, recovery, hit, heavy, ritual } = attack;
    const prep = clamp(t / windup);
    const after = hit ? clamp((t - windup) / recovery) : 0;
    const follow = 1 - smooth(after);
    if (BOWS[kind]) {
      const recoil = 0.10 * Math.sin(after * Math.PI) * follow;
      return { arm: BOWS[kind][2] * smooth(prep) * follow - recoil, lean: 0, shift: 0,
        pull: hit ? 0 : smooth(prep), showArrow: !hit && prep > 0.28 };
    }
    if (STAFFS[kind]) {
      const lift = ritual ? Math.sin(prep * Math.PI) * 0.43
        : smooth(prep) * follow * (attack.freezing ? 0.56 : attack.buffing ? 0.37 : STAFFS[kind][2]);
      return { arm: -lift, lean: 0, shift: 0 };
    }
    const king = kind === "goblinKing";
    const turn = heavy ? 0.75 : 0.62;
    const raised = heavy ? -1.63 : king ? -0.85 : -0.99;
    const finish = heavy ? 0.63 : king ? 0.36 : 0.52;
    const winding = prep < turn;
    const phase = smooth(winding ? prep / turn : (prep - turn) / (1 - turn));
    const arm = winding ? raised * phase : raised + (finish - raised) * phase;
    const thrust = winding ? -0.52 * phase : -0.52 + 1.52 * phase;
    const recoil = Math.sin(after * Math.PI) * follow;
    return { arm: arm * follow + recoil * 0.12,
      lean: thrust * follow * (heavy ? 0.15 : 0.14),
      shift: thrust * follow * (heavy ? 0.071 : 0.045) };
  }

  function drawEnemyBow(ctx, kind, motion) {
    const [x, y] = armPoint(kind, 27, 40, motion.arm);
    const pullX = -5 - 11 * motion.pull;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.84 * (1 - motion.arm / BOW_ANGLE));
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-5, -14); ctx.lineTo(pullX, 0); ctx.lineTo(-5, 14);
    ctx.strokeStyle = "#c5b99a"; ctx.lineWidth = 0.65; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -14); ctx.lineTo(-3, -10); ctx.lineTo(0, -5);
    ctx.lineTo(0, 5); ctx.lineTo(-3, 10); ctx.lineTo(-5, 14);
    ctx.strokeStyle = "#4d2c20"; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = "#c28b53"; ctx.lineWidth = 1.1; ctx.stroke();
    if (motion.showArrow) {
      ctx.fillStyle = "#bbaa84"; ctx.fillRect(pullX, -0.5, 22, 1);
      ctx.fillStyle = "#fff1c8"; ctx.fillRect(pullX + 20, -1, 3, 2);
    }
    ctx.restore();
  }

  function hitFlash(ctx, unit) {
    if (unit.flash > 0) ctx.filter = "brightness(" + (1 + unit.flash * 0.6) + ")";
  }

  function walkProgress(unit) {
    return (unit.walkDistance / (unit.h * (WALK_CYCLE[unit.kind] ?? 0.6))) % 1;
  }

  function walkFrame(unit) {
    return Math.min(WALK_FRAMES - 1, Math.floor(clamp(unit.poseT || 0) * WALK_FRAMES));
  }

  function drawEnemyWalk(ctx, unit, atlas, img) {
    const width = atlas.naturalWidth / WALK_FRAMES, height = atlas.naturalHeight;
    const scale = unit.h / img.naturalHeight;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.scale(facing(unit) * scale, scale);
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    ctx.drawImage(atlas, walkFrame(unit) * width, 0, width, height, -width / 2, -height, width, height);
    ctx.restore();
  }

  function drawEnemyFall(ctx, unit, atlas, img) {
    const t = clamp(unit.poseT || 0);
    const width = atlas.naturalWidth / FALL_FRAMES, height = atlas.naturalHeight / 2;
    const frame = Math.min(FALL_FRAMES - 1, Math.floor(t * FALL_FRAMES));
    const sign = facing(unit), direction = unit.fallForward ? 1 : -1;
    const scale = unit.h / img.naturalHeight;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + 0.32 * t + ")";
    ctx.beginPath();
    ctx.ellipse(unit.x + sign * direction * t * unit.h * 0.36, unit.y + 4,
      unit.h * (0.17 + t * 0.26), 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(unit.x, unit.y);
    ctx.scale(sign * scale, scale);
    ctx.globalAlpha *= 1 - 0.22 * t;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, frame * width, unit.fallForward ? height : 0, width, height,
      -width / 2, 2 - height, width, height);
    ctx.restore();
  }

  function drawEnemyAttack(ctx, unit, layers) {
    const { body, arm } = layers;
    const [px, py] = ARM_PIVOTS[unit.kind];
    const scale = unit.h / body.naturalHeight, sign = facing(unit);
    const motion = enemyMotion(unit.kind, unit.attack);
    ctx.save();
    ctx.translate(unit.x + motion.shift * unit.h * sign, unit.y);
    ctx.scale(scale * sign, scale);
    ctx.rotate(motion.lean);
    ctx.translate(-body.naturalWidth / 2, -body.naturalHeight);
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    ctx.drawImage(body, 0, 0);
    if (unit.kind === "goblinA") drawEnemyBow(ctx, unit.kind, motion);
    else if (unit.kind === "skeletonA" && motion.showArrow) {
      const [x, y] = armPoint(unit.kind, ...BOWS.skeletonA.slice(0, 2), motion.arm);
      ctx.fillStyle = "#cab799"; ctx.fillRect(x - 12, y - 1, 27, 1);
      ctx.fillStyle = "#eaf4e7"; ctx.fillRect(x + 13, y - 2, 3, 3);
    }
    ctx.translate(px, py);
    ctx.rotate(motion.arm);
    ctx.drawImage(arm, -px, -py);
    ctx.restore();
  }

  function drawFallen(ctx, unit, img, scale, w, base, progress, density) {
    const bounds = FALLEN_BOUNDS[unit.kind];
    const [left, right, bottom] = bounds ? bounds.map(value => value * density) : [0, img.naturalWidth, img.naturalHeight];
    const king = unit.kind === "goblinKing";
    const land = DWR.CONFIG.enemies[unit.kind]?.death?.land;
    const fall = smooth(king ? clamp((progress - 0.16) / (land - 0.16)) : progress);
    const recoil = king ? Math.sin(Math.PI * clamp((progress - land) / 0.19)) * 0.09 : 0;
    const stagger = king ? Math.sin(Math.PI * clamp(progress / 0.31)) * 0.14 : 0;
    const angle = fall * (king ? -109 * Math.PI / 180 : (unit.fallForward ? 1 : -1) * Math.PI / 2) + recoil + stagger;
    const depth = 1 - (king ? 0.22 : 0.34) * fall;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const edge = unit.fallForward ? right : left;
    let x = unit.x, lift = ((edge * scale - w / 2) * sin + (bottom * scale - base) * cos) * depth;
    if (king) {
      let left = Infinity, right = -Infinity, lowest = -Infinity;
      const sign = facing(unit);
      for (const [px, py] of KING_HULL) {
        const dx = px * scale - w / 2, dy = py * scale - base;
        const sx = (dx * cos - dy * sin) * sign;
        left = Math.min(left, sx);
        right = Math.max(right, sx);
        lowest = Math.max(lowest, dx * sin + dy * cos);
      }
      x = Math.max(8 - left, Math.min(unit.x, DWR.CONFIG.canvas.w - 8 - right));
      lift = lowest * depth;
      ctx.fillStyle = "rgba(0,0,0," + (0.3 * fall) + ")";
      ctx.beginPath();
      ctx.ellipse(x + (left + right) / 2, unit.y + 5, (right - left) * 0.44, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, unit.y - lift);
    ctx.scale(facing(unit), depth);
    ctx.rotate(angle);
    ctx.globalAlpha *= 1 - 0.27 * fall;
    ctx.imageSmoothingEnabled = false;
    if (king) hitFlash(ctx, unit);
    ctx.drawImage(img, -w / 2, -base, w, img.naturalHeight * scale);
    ctx.restore();
  }

  function drawLycanPitch(ctx, atlas, width, height, pitch) {
    // Перспектива сильнее меняет плечи и голову. Нижний край спрайта остаётся на полу.
    const projectY = y => y + pitch * 0.11 * y * y / height;
    for (let row = 0; row < height; row += 2) {
      const band = Math.min(2, height - row);
      const upper = 1 - (row + band / 2) / height;
      const bandWidth = width * (1 + pitch * 0.21 * upper * upper);
      const top = projectY(row - height), bottom = projectY(row + band - height);
      ctx.drawImage(atlas, 0, row, width, band, -bandWidth / 2, top, bandWidth, bottom - top);
    }
  }

  function drawLycanFall(ctx, unit, atlas) {
    const t = clamp(unit.poseT || 0);
    const { land } = DWR.CONFIG.enemies.lycan.death;
    const swayEnd = 0.28;
    const sway = t < swayEnd ? t / swayEnd : 0;
    const pitch = Math.sin(2 * Math.PI * sway) * Math.sin(Math.PI * sway);
    const drop = smooth(clamp((t - swayEnd) / (land - 0.04 - swayEnd)));
    const settle = smooth(clamp((t - (land - 0.13)) / 0.13));
    const angle = -0.50 * drop, stretch = 1 - 0.56 * drop, spread = 1 + 0.36 * drop;
    const width = atlas.naturalWidth / 4, height = atlas.naturalHeight;
    const scale = unit.h / height, sign = -facing(unit);
    const x = Math.max(57 * scale, Math.min(unit.x - sign * 11 * scale * drop, DWR.CONFIG.canvas.w - 57 * scale));
    // Опора берётся по контуру падающего тела и остаётся на полу в каждый момент.
    const lift = Math.max(...LYCAN_HULL.map(([px, py]) =>
      (px - width / 2) * Math.sin(angle) + (py - height) * stretch * Math.cos(angle)));
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + (0.30 + 0.14 * drop) + ")";
    ctx.beginPath(); ctx.ellipse(x, unit.y + 5, (24 + 29 * drop) * scale, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, unit.y);
    ctx.scale(sign * scale, scale);
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    const seam = -61 + 122 * settle;
    if (settle < 1) {
      ctx.save();
      if (settle > 0) {
        ctx.beginPath(); ctx.rect(seam, -2 * height, width, 2 * height + 2); ctx.clip();
      }
      ctx.translate(18 * drop, -lift);
      ctx.scale(spread, 1);
      ctx.rotate(angle);
      ctx.scale(1, stretch);
      if (pitch) drawLycanPitch(ctx, atlas, width, height, pitch);
      else ctx.drawImage(atlas, 0, 0, width, height, -width / 2, -height, width, height);
      ctx.restore();
    }
    if (settle > 0) {
      if (settle < 1) {
        ctx.beginPath(); ctx.rect(-width, -height, seam + width, height + 2); ctx.clip();
      }
      ctx.drawImage(atlas, 3 * width, 0, width, height, -width / 2, -height, width, height);
    }
    ctx.restore();
  }

  function mixFrames(current, next, mix) {
    if (!frameMixer) frameMixer = document.createElement("canvas").getContext("2d");
    const { canvas } = frameMixer, width = current.naturalWidth, height = current.naturalHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    } else frameMixer.clearRect(0, 0, width, height);
    frameMixer.save();
    frameMixer.globalAlpha = 1 - mix;
    frameMixer.drawImage(current, 0, 0);
    // Складываем альфу в буфере, чтобы общие пиксели не мерцали и не просвечивали.
    frameMixer.globalCompositeOperation = "lighter";
    frameMixer.globalAlpha = mix;
    frameMixer.drawImage(next, 0, 0);
    frameMixer.restore();
    return canvas;
  }

  function warriorPose(progress) {
    let i = 1;
    while (progress > WARRIOR_POSES[i][0]) i++;
    const [start, ...from] = WARRIOR_POSES[i - 1];
    const [end, ...to] = WARRIOR_POSES[i];
    const t = smooth((progress - start) / (end - start));
    return from.map((angle, j) => angle + (to[j] - angle) * t);
  }

  function limbEnd(x, y, length, angle) {
    return [x + length * Math.cos(angle), y + length * Math.sin(angle)];
  }

  function warriorGrip(arm, fore) {
    const elbow = limbEnd(...WARRIOR_SHOULDER, 8.8, arm);
    return { elbow, hand: limbEnd(...elbow, 10.9, fore) };
  }

  function drawWarrior(ctx, unit, pose) {
    const body = DWR.Assets.img["warrior-body"];
    const upper = DWR.Assets.img["warrior-upper"], fore = DWR.Assets.img["warrior-fore"];
    const blade = DWR.Assets.img["warrior-blade"];
    if (![body, upper, fore, blade].every(part => part?.naturalWidth)) return false;
    const swinging = pose === "attack" || pose === "powerStrike";
    const progress = clamp(unit.poseT || 0);
    const atlas = DWR.Assets.walk.warrior;
    const walking = pose === "walk" && atlas?.naturalWidth;
    const step = walking ? walkFrame(unit) : 0;
    const stride = Math.sin(step / WALK_FRAMES * Math.PI * 2);
    const [baseArm, baseForearm, baseSword, lean] = warriorPose(swinging ? progress : 0);
    const arm = baseArm + stride * 0.16, forearm = baseForearm + stride * 0.10, sword = baseSword + stride * 0.095;
    const { elbow, hand } = warriorGrip(arm, forearm);
    const scale = unit.h / WARRIOR_RIG_BODY_PX;
    // Геометрия анимации остаётся в исходных координатах, растр вдвое плотнее.
    const w = body.naturalWidth, h = body.naturalHeight;
    const logicalW = w / HERO_COMBAT_DENSITY, logicalH = h / HERO_COMBAT_DENSITY;

    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.scale(facing(unit) * scale, scale);
    if (lean) ctx.rotate(lean);
    ctx.translate(-logicalW / 2, -(logicalH - BOTTOM_PAD));
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    if (walking) {
      const column = step % WARRIOR_WALK_COLUMNS, row = Math.floor(step / WARRIOR_WALK_COLUMNS);
      ctx.drawImage(atlas, column * w, row * h, w, h, 0, 0, logicalW, logicalH);
      ctx.translate(0, -Math.round(1.4 * Math.abs(stride)));
    } else ctx.drawImage(body, 0, 0, logicalW, logicalH);

    if (swinging && progress > 0.30 && progress < 0.61) {
      const [prevArm, prevFore, prevSword] = warriorPose(progress - 0.075);
      const [midArm, midFore, midSword] = warriorPose(progress - 0.038);
      const trail = warriorGrip(prevArm, prevFore).hand;
      const middle = warriorGrip(midArm, midFore).hand;
      const fade = smooth(clamp((progress - 0.30) / 0.07)) * smooth(clamp((0.61 - progress) / 0.09));
      ctx.fillStyle = pose === "powerStrike"
        ? "rgba(255,205,128," + 0.60 * fade + ")" : "rgba(237,243,255," + 0.45 * fade + ")";
      ctx.beginPath();
      ctx.moveTo(...limbEnd(...hand, 29, sword));
      ctx.quadraticCurveTo(...limbEnd(...middle, 31, midSword), ...limbEnd(...trail, 28, prevSword));
      ctx.lineTo(...limbEnd(...trail, 26, prevSword));
      ctx.quadraticCurveTo(...limbEnd(...middle, 23, midSword), ...limbEnd(...hand, 18, sword));
      ctx.fill();
    }

    function drawPart(image, x, y, angle, px, py) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(image, -px, -py, image.naturalWidth / HERO_COMBAT_DENSITY, image.naturalHeight / HERO_COMBAT_DENSITY);
      ctx.restore();
    }
    drawPart(upper, ...WARRIOR_SHOULDER, arm, 3, 6);
    drawPart(blade, ...hand, sword, 7, 5);
    drawPart(fore, ...elbow, forearm, 3, 6);
    ctx.restore();
    return true;
  }

  function drawCreature(ctx, unit, atlas, time) {
    if (!atlas?.naturalWidth) return;
    const { attack, pose, poseT } = unit;
    if (pose === "dead" && unit.kind === "lycan") {
      drawLycanFall(ctx, unit, atlas);
      return;
    }
    const fallAtlas = DWR.Assets.falls[unit.kind];
    const fall = pose === "dead" && fallAtlas?.naturalWidth ? DWR.CONFIG.enemies[unit.kind].fall : null;
    const image = fall ? fallAtlas : atlas;
    // Кадры имеют общую точку опоры на нижней границе.
    const frameWidth = image.naturalWidth / (fall?.shapes.length ?? 4), frameHeight = image.naturalHeight;
    const scale = unit.h / 88;
    const w = frameWidth * scale, h = frameHeight * scale;
    let frame = 0, stretch = 1, spread = 1, shift = 0;
    if (fall) {
      const last = fall.shapes.length - 1;
      const phase = smooth(clamp(poseT)) * last;
      const index = Math.floor(phase), next = Math.min(index + 1, last), t = phase - index;
      frame = Math.round(phase);
      const [startW, startH] = fall.shapes[index], [endW, endH] = fall.shapes[next];
      // Размер силуэта меняется плавно, а сами позы остаются непрозрачными.
      spread = (startW + (endW - startW) * t) / fall.shapes[frame][0];
      stretch = (startH + (endH - startH) * t) / fall.shapes[frame][1];
      shift = unit.h * 0.07 * phase / last;
    } else if (pose === "dead") {
      frame = poseT >= 0.60 ? 3 : 0;
      stretch = frame === 3 ? 1 : 1 - 0.62 * smooth(clamp(poseT / 0.60));
    } else if (attack) {
      const windup = clamp(attack.t / attack.windup);
      const recovery = attack.hit ? clamp((attack.t - attack.windup) / attack.recovery) : 0;
      const motion = attack.hit ? 1 - smooth(recovery) : smooth(clamp((windup - 0.42) / 0.58));
      frame = (attack.hit ? recovery < 0.68 : windup >= 0.82) ? 2 : 0;
      stretch = attack.howling ? 1 + motion * 0.10 : 1 - (1 - windup) * 0.03;
      shift = attack.howling ? -unit.h * 0.03 * motion : unit.h * 0.08 * motion;
    } else if (pose === "walk") {
      frame = Math.cos(poseT * Math.PI * 2) < 0 ? 1 : 0;
      stretch = 1 + Math.sin(poseT * Math.PI * 4) * 0.024;
    } else stretch = 1 + Math.sin(time * 3.3 + unit.x * 0.014) * 0.014;

    const shiftedX = unit.x + facing(unit) * shift;
    const frameW = w * spread;
    const x = pose === "dead" ? Math.max(frameW / 2, Math.min(shiftedX, DWR.CONFIG.canvas.w - frameW / 2)) : shiftedX;
    ctx.save();
    ctx.translate(x, unit.y);
    ctx.scale(-facing(unit), 1); // Новые спрайты в атласе смотрят влево.
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    const frameH = h * stretch;
    ctx.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, -frameW / 2, -frameH, frameW, frameH);
    ctx.restore();
  }

  function draw(ctx, unit, time = 0) {
    const A = DWR.Assets;
    if (!A.ready) return;
    const pose = unit.pose || "idle";
    if (unit.kind === "warrior" && pose !== "dead" && drawWarrior(ctx, unit, pose)) return;
    const baseImage = A.img[unit.kind];
    const enemy = DWR.CONFIG.enemies[unit.kind];
    if (enemy?.city) {
      ctx.save();
      hitFlash(ctx, unit);
      DWR.CityMotion.draw(ctx, A.img, unit, time);
      ctx.restore();
      return;
    }
    if (enemy?.rift) {
      ctx.save();
      hitFlash(ctx, unit);
      DWR.RiftMotion.draw(ctx, baseImage, unit);
      ctx.restore();
      return;
    }
    if (enemy?.motion) {
      const kind = enemy.motion[unit.enraged ? 1 : 0];
      const attack = pose !== "dead" && unit.attack;
      const motion = attack ? DWR.ForgeMotion.attackPose(attack) : { pose, poseT: unit.poseT };
      ctx.save();
      hitFlash(ctx, unit);
      DWR.ForgeMotion.draw(ctx, A.img[kind], { ...unit, kind, ...motion });
      ctx.restore();
      return;
    }
    if (enemy?.spritePoses) {
      drawCreature(ctx, unit, baseImage, time);
      return;
    }
    const walk = A.walk[unit.kind], fall = A.falls[unit.kind];
    if (pose === "walk" && walk?.naturalWidth && baseImage?.naturalWidth) {
      drawEnemyWalk(ctx, unit, walk, baseImage);
      return;
    }
    if (pose === "dead" && fall?.naturalWidth && baseImage?.naturalWidth) {
      drawEnemyFall(ctx, unit, fall, baseImage);
      return;
    }
    const layers = A.enemyLayers?.[unit.kind];
    if (pose !== "dead" && unit.attack && layers?.body.naturalWidth && layers.arm.naturalWidth) {
      drawEnemyAttack(ctx, unit, layers);
      return;
    }

    const hero = !!A.frames[unit.kind];
    const clipId = pose === "heal" ? "priest" : RANGER_CLIPS[pose] ||
      (pose === "attack" || pose === "powerStrike" ? (unit.kind === "priest" ? "priest-cast" : unit.kind) : null);
    const clip = A.frames[clipId];
    const progress = clamp(unit.poseT || 0);
    const frameT = progress * (clip?.length || 0);
    const index = clip ? Math.min(clip.length - 1, Math.floor(frameT)) : 0;
    const release = A.img["priest-release"];
    const fromClip = frame => clipId === "priest-cast" && frame === 3 && unit.castReleased && release?.naturalWidth
      ? release : clip?.[frame];
    const current = fromClip(index);
    const idle = A.frames[unit.kind]?.[0];
    const fallback = idle?.naturalWidth ? idle : baseImage;
    const img = current?.naturalWidth ? current : fallback;
    if (!img?.naturalWidth) return;
    const density = hero && img !== baseImage ? HERO_COMBAT_DENSITY : 1;
    const h = unit.h, scale = h / (hero ? BODY_PX * density : img.naturalHeight);
    const w = img.naturalWidth * scale;
    const base = (img.naturalHeight - (hero ? BOTTOM_PAD * density : 0)) * scale;
    if (pose === "dead") {
      drawFallen(ctx, unit, img, scale, w, base, progress, density);
      return;
    }

    let bob = 0, lean = 0;
    if (pose === "idle" && !hero) bob = Math.sin(time * 2 + unit.x * 0.013) * h * 0.008;
    else if (pose === "walk") {
      bob = Math.abs(Math.sin(progress * Math.PI * 2)) * h * 0.022;
      lean = 0.07;
    } else if (pose === "hit") lean = -0.15;
    else if (pose === "bomb") lean = 0.16 * Math.sin(progress * Math.PI * 2) * (1 - progress);

    ctx.save();
    ctx.translate(unit.x, unit.y + bob);
    ctx.scale(facing(unit), 1);
    if (lean) ctx.rotate(lean);
    ctx.imageSmoothingEnabled = false;
    hitFlash(ctx, unit);
    const next = clip && (index + 1 < clip.length ? fromClip(index + 1) : fallback);
    // Смешиваем только конец фазы. В момент спуска или удара заданный кадр уже виден целиком.
    const sameSize = next?.naturalWidth === img.naturalWidth && next.naturalHeight === img.naturalHeight;
    const mix = sameSize ? smooth(clamp((frameT - index - 0.52) / 0.48)) : 0;
    const frame = mix === 0 ? img : mix === 1 ? next : mixFrames(img, next, mix);
    ctx.drawImage(frame, -w / 2, -base, w, img.naturalHeight * scale);
    ctx.restore();
  }

  function drawOutlined(ctx, unit, time) {
    if (!outlineBuffers) {
      outlineBuffers = [document.createElement("canvas"), document.createElement("canvas")]
        .map(canvas => canvas.getContext("2d"));
    }
    const [mask, contour] = outlineBuffers;
    const padding = Math.ceil(unit.h * 1.3) + 8;
    const left = Math.floor(unit.x) - padding;
    const top = Math.floor(unit.y - unit.h * 1.55) - 8;
    const w = padding * 2, h = Math.ceil(unit.y - top) + 26;
    for (const buffer of outlineBuffers) {
      if (buffer.canvas.width !== w || buffer.canvas.height !== h) {
        buffer.canvas.width = w;
        buffer.canvas.height = h;
      } else buffer.clearRect(0, 0, w, h);
      buffer.imageSmoothingEnabled = false;
    }
    mask.save();
    mask.translate(-left, -top);
    draw(mask, { ...unit, flash: 0, outlineOnly: true }, time);
    mask.restore();
    // Контур строится из альфа-маски текущей позы, включая оружие.
    contour.save();
    for (const [x, y] of OUTLINE_OFFSETS) contour.drawImage(mask.canvas, x, y);
    contour.globalCompositeOperation = "source-in";
    contour.fillStyle = "#ffd07b"; contour.fillRect(0, 0, w, h);
    contour.globalCompositeOperation = "destination-out"; contour.drawImage(mask.canvas, 0, 0);
    contour.restore();
    ctx.drawImage(contour.canvas, left, top);
    draw(ctx, unit, time);
  }

  function releasePoint(unit, clipId, index, x, y) {
    const frame = DWR.Assets.frames[clipId]?.[index];
    if (!frame?.naturalWidth) return null;
    const scale = unit.h / BODY_PX;
    return { x: unit.x + (x - frame.naturalWidth / (2 * HERO_COMBAT_DENSITY)) * scale * facing(unit),
      y: (y - (frame.naturalHeight / HERO_COMBAT_DENSITY - BOTTOM_PAD)) * scale };
  }

  function bowRelease(unit, pose) {
    return releasePoint(unit, RANGER_CLIPS[pose] || "ranger", 4, 97, 58.5);
  }

  function fireRelease(unit) {
    return releasePoint(unit, "priest-cast", 3, 103, 32);
  }

  return { draw, drawOutlined, walkProgress, bowRelease, fireRelease, enemyBowRelease, staffPoint };
})();
