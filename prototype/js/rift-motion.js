// DWR :: визуальные клипы Разлома. Прогресс задаёт вызывающий код.
"use strict";
window.DWR = window.DWR || {};

DWR.RiftMotion = (function () {
  const cell = { w: 280, h: 166, x: 140, ground: 158, body: 132, columns: 4 };
  const models = {
    "earth-elemental": { family: "earth", h: 116 },
    "fire-elemental": { family: "fire", h: 108 },
    "earth-colossus": { family: "earth", h: 174, boss: true },
    "fire-colossus": { family: "fire", h: 162, boss: true },
    "fused-colossus": { family: "fused", h: 206, boss: true }
  };
  const clips = {
    idle: { label: "Стойка", duration: 1.7, loop: true },
    walk: { label: "Перемещение", duration: 0.86, loop: true },
    melee: { label: "Удар вблизи", duration: 0.67, contact: 0.49 },
    boulder: { label: "Бросок валуна", duration: 1.36, release: 0.49, contact: 0.82 },
    fireball: { label: "Огненный шар", duration: 1.21, release: 0.48, contact: 0.78 },
    burrow: { label: "Уход под землю", duration: 1.42 },
    petrify: { label: "Окаменение", duration: 0.88 },
    stone: { label: "Каменная форма", duration: 1.5, loop: true },
    unstone: { label: "Выход из камня", duration: 0.73 },
    spike: { label: "Земляной кол", duration: 2.1, contact: 0.49 },
    cloak: { label: "Огненный плащ", duration: 1.08, contact: 0.54 },
    burning: { label: "Действующий плащ", duration: 1.04, loop: true },
    merge: { label: "Слияние стихий", duration: 3.05 },
    dead: { label: "Гибель", duration: 1.38, bossDuration: 2.05 }
  };
  const byFamily = {
    earth: ["boulder", "petrify", "stone", "unstone"],
    fire: ["fireball", "burrow"],
    fused: ["fireball", "spike", "cloak", "burning", "merge"]
  };
  const palettes = {
    rock: ["#292731", "#4a4350", "#766b6a", "#b1a28c"],
    coal: ["#241e23", "#463035", "#76504c", "#aa7160"],
    fire: ["#882833", "#e24725", "#ffa542", "#ffe99b"]
  };
  // Поза, левая и правая опорные ноги, замах, удар, заряд, выпуск, каменная форма.
  const frames = { idle: 0, stepA: 1, stepB: 2, windup: 3, punch: 4, charge: 5, release: 6, stone: 7 };
  // У объединённого босса ячейка каменной формы занята промежуточной позой броска.
  const fusedCast = { cross: 7, raise: 8, aim: 9, release: 10, lower: 11 };
  const fusedPalms = {
    [fusedCast.cross]: [140, 74],
    [fusedCast.raise]: [185, 59],
    [fusedCast.aim]: [88, 57],
    [fusedCast.release]: [68, 56]
  };
  const clamp = value => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const phase = (t, start, end) => clamp((t - start) / (end - start));
  const smooth = t => t * t * (3 - 2 * t);
  const sine = t => Math.sin(Math.PI * clamp(t));
  const random = i => ((Math.imul(i + 31, 1103515245) >>> 8) % 997) / 997;
  const tau = Math.PI * 2;

  function polygon(ctx, color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  function shard(ctx, x, y, size, angle, palette) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(size, size);
    polygon(ctx, palette[0], [-1, .31, -.79, -.54, .28, -.72, 1, -.24, .79, .56, -.32, .69]);
    polygon(ctx, palette[1], [-.8, .26, -.65, -.44, .24, -.62, .72, -.18, .31, .43, -.29, .57]);
    polygon(ctx, palette[2], [-.65, -.44, .24, -.62, .72, -.18, -.33, .04]);
    polygon(ctx, palette[3], [-.63, -.43, .24, -.62, .41, -.45, -.32, -.12]);
    ctx.restore();
  }

  function frame(ctx, atlas, actor, id, { dx = 0, dy = 0, sx = 1, sy = 1, angle = 0, alpha = 1 } = {}) {
    const { x, y, h, facing } = actor;
    const scale = h / cell.body;
    const u = id % cell.columns * cell.w;
    const v = Math.floor(id / cell.columns) * cell.h;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x + facing * dx * h, y + dy * h);
    ctx.scale(-facing * scale * sx, scale * sy);
    ctx.rotate(angle);
    ctx.drawImage(atlas, u, v, cell.w, cell.h, -cell.x, -cell.ground, cell.w, cell.h);
    ctx.restore();
  }

  function groundClip(ctx, y) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-16384, y - 16384, 32768, 16384);
    ctx.clip();
  }

  function sparks(ctx, x, y, h, t, palette, count = 12) {
    if (t <= 0 || t >= 1) return;
    ctx.save();
    ctx.globalAlpha *= (1 - t) ** 1.35;
    for (let i = 0; i < count; i++) {
      const a = random(i * 4) * tau;
      const speed = h * (.14 + random(i * 4 + 1) * .37);
      const px = x + Math.cos(a) * speed * t;
      const py = y + Math.sin(a) * speed * t - h * .12 * sine(t);
      shard(ctx, px, py, h * (.012 + random(i * 4 + 2) * .034), a + t * 3, palette);
    }
    ctx.restore();
  }

  function fissure(ctx, x, y, width, strength, palette) {
    if (strength <= 0) return;
    ctx.save();
    ctx.globalAlpha *= strength;
    ctx.translate(x, y);
    ctx.scale(width, width);
    polygon(ctx, palette[0], [-1, -.01, -.59, -.037, -.29, -.014, -.14, -.053, .13, -.021, .48, -.039, 1, -.012,
      .48, .009, .17, .012, -.11, .039, -.54, .017]);
    polygon(ctx, palette[1], [-.86, -.013, -.61, -.024, -.24, -.008, -.13, -.035, .18, -.008,
      .49, -.021, .88, -.011, .35, .004, -.1, .014, -.61, .001]);
    polygon(ctx, palette[2], [-.6, -.017, -.22, -.007, -.11, -.025, .18, -.005, .58, -.015,
      .2, .003, -.12, -.014, -.23, .001]);
    ctx.restore();
  }

  function fusedCastFrame(t, release) {
    if (t < .08 || t >= .93) return frames.idle;
    if (t < .155 || t >= .81) return fusedCast.lower;
    if (t < .29) return fusedCast.raise;
    if (t < .38 || t >= .71) return fusedCast.cross;
    if (t < release || t >= .63) return fusedCast.aim;
    return fusedCast.release;
  }

  function fusedPalm(actor, id, offset) {
    const point = fusedPalms[id];
    if (!point) return null;
    const [px, py] = point;
    const scale = actor.h / cell.body;
    return {
      x: actor.x + actor.facing * (actor.h * offset + (cell.x - px) * scale),
      y: actor.y + (py - cell.ground) * scale
    };
  }

  function projectileOrigin(actor, pose) {
    if (actor.kind === "fused-colossus" && pose === "fireball") {
      const offset = .028 * sine(phase(clips.fireball.release, .27, .86));
      const palm = fusedPalm(actor, fusedCast.release, offset);
      return { x: palm.x + actor.facing * actor.h * .082, y: palm.y - actor.h * .012 };
    }
    return { x: actor.x + actor.facing * actor.h * .62, y: actor.y - actor.h * .64 };
  }

  function drawProjectile(ctx, { x, y, h, facing, progress, fire }) {
    const colors = fire ? palettes.fire : palettes.rock;
    const size = h * (fire ? .105 : .13);
    if (fire) {
      const tail = smooth(phase(progress, 0, .20));
      for (let i = 4; i > 0; i--) {
        shard(ctx, x - facing * size * i * .6 * tail, y + Math.sin(progress * 12 + i) * size * .22,
          size * tail * (.68 - i * .09), -i, colors);
      }
    }
    const growth = fire ? lerp(.66, 1, smooth(phase(progress, 0, .18))) : 1;
    shard(ctx, x, y, size * growth, progress * (fire ? 2 : 9), colors);
  }

  function strike(ctx, atlas, actor, t, name) {
    const melee = name === "melee";
    const fire = name === "fireball";
    const fused = fire && actor.kind === "fused-colossus";
    const { x, y, h, facing } = actor;
    const release = melee ? clips.melee.contact : clips[name].release;
    const id = fused ? fusedCastFrame(t, release) : t < .14 || t >= .91 ? frames.idle
      : t < release || t >= .71 ? (melee ? frames.windup : frames.charge)
        : (melee ? frames.punch : frames.release);
    const thrust = sine(phase(t, .27, .86));
    const dx = thrust * (melee ? .09 : .028);
    frame(ctx, atlas, actor, id, { dx });
    if (melee) {
      if (!actor.externalEffects) sparks(ctx, x + facing * h * .68, y - h * .62, h,
        phase(t, release, release + .26), models[actor.kind].family === "fire" ? palettes.fire : palettes.rock, 7);
      return;
    }
    const { target } = actor;
    const { contact } = clips[name];
    if (!target) return;
    const aimedY = target.y - (target.h ?? h * .67) * .48;
    const colors = fire ? palettes.fire : palettes.rock;
    const size = h * (fire ? .105 : .13);
    if (t >= .19 && t < contact) {
      const flight = phase(t, release, contact);
      const charging = t < release;
      if (charging) {
        const palm = fused ? fusedPalm(actor, id, dx) : null;
        const px = palm ? palm.x + facing * h * .02 : x - facing * h * .38;
        const py = palm ? palm.y - h * .012 : y - h * .76;
        shard(ctx, px, py, size * smooth(phase(t, .19, .35)) * (fused ? .4 : 1), 0, colors);
      } else {
        const origin = projectileOrigin(actor, name);
        const px = lerp(origin.x, target.x, flight);
        const py = lerp(origin.y, aimedY, flight) - sine(flight) * h * (fire ? .11 : .49);
        drawProjectile(ctx, { x: px, y: py, h, facing, progress: flight, fire });
      }
    }
    sparks(ctx, target.x, aimedY, h * (fire ? 1.44 : 1), phase(t, contact, 1), colors, fire ? 22 : 13);
  }

  function petrify(ctx, atlas, actor, t) {
    const { x, y, h } = actor;
    const change = smooth(phase(t, .2, .63));
    frame(ctx, atlas, actor, frames.idle, {
      sy: 1 - .3 * change, sx: 1 - .12 * change,
      alpha: 1 - smooth(phase(change, .46, 1))
    });
    frame(ctx, atlas, actor, frames.stone, { sy: .88 + .12 * change, alpha: smooth(phase(change, .05, .78)) });
    fissure(ctx, x, y - 1, h * .52, sine(phase(t, .1, .84)), palettes.rock);
    sparks(ctx, x, y - h * .33, h, phase(t, .38, .93), palettes.rock);
  }

  function burrow(ctx, atlas, actor, t) {
    const { x, y, h } = actor;
    const exit = actor.exitX ?? x;
    const sinking = smooth(phase(t, .05, .32));
    const rising = smooth(phase(t, .59, .94));
    fissure(ctx, x, y - 1, h * .63, sine(phase(t, 0, .48)), palettes.fire);
    fissure(ctx, exit, y - 1, h * .63, sine(phase(t, .45, .99)), palettes.fire);
    groundClip(ctx, y);
    if (t < .4) {
      frame(ctx, atlas, actor, t > .13 ? frames.windup : frames.idle, { dy: sinking, alpha: 1 - .6 * sinking });
    } else if (t > .53) {
      frame(ctx, atlas, { ...actor, x: exit }, t < .81 ? frames.charge : frames.idle,
        { dy: 1 - rising, alpha: .45 + .55 * rising });
    }
    sparks(ctx, x, y - h * .08, h, phase(t, .12, .45), palettes.fire);
    sparks(ctx, exit, y - h * .1, h, phase(t, .53, .96), palettes.fire);
    ctx.restore();
  }

  function spikeHeight(t, h) {
    const p = clips.spike.contact;
    return h * .94 * smooth(phase(t, p, p + .10)) * (1 - smooth(phase(t, .83, 1)));
  }

  function spike(ctx, atlas, actor, t) {
    const { h, target } = actor;
    const p = clips.spike.contact;
    frame(ctx, atlas, actor, t < .12 || t > .74 ? frames.idle : t < p ? frames.charge : frames.punch,
      { sy: 1 - sine(phase(t, .3, .72)) * .07 });
    if (!target) return;
    fissure(ctx, target.x, target.y, h * .28, sine(phase(t, .08, p + .03)), palettes.rock);
    const height = spikeHeight(t, h);
    if (!height) return;
    drawSpike(ctx, target.x, target.y, h, height);
    sparks(ctx, target.x, target.y - 8, h, phase(t, p, .81), palettes.rock, 18);
  }

  function drawSpike(ctx, x, y, h, height) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(h * .108, height);
    polygon(ctx, "#292630", [-1, 0, -.76, -.1, -.64, -.19, -.49, -.23, -.41, -.41, -.28, -.48,
      -.26, -.65, -.08, -.82, .13, -1, .2, -.86, .19, -.76, .34, -.6, .31, -.51, .46, -.34,
      .43, -.26, .65, -.18, .77, -.08, 1, 0]);
    polygon(ctx, "#6b6465", [-.88, -.03, -.63, -.17, -.44, -.25, -.38, -.41, -.25, -.49, -.22, -.64,
      -.05, -.82, .13, -1, .1, -.8, .02, -.67, .12, -.58, -.03, -.47, .04, -.38, -.16, -.23, -.42, -.03]);
    polygon(ctx, "#aa9986", [-.24, -.63, -.05, -.81, .13, -1, .08, -.84, .01, -.78, -.1, -.66, -.16, -.6]);
    polygon(ctx, "#3f3943", [.1, -.8, .13, -.98, .19, -.86, .17, -.76, .31, -.6, .27, -.5,
      .43, -.34, .38, -.24, .6, -.17, .77, -.04, .3, -.06, .24, -.24, .04, -.38, -.03, -.47, .12, -.58, .02, -.67]);
    polygon(ctx, "#938774", [-.41, -.41, -.26, -.48, -.15, -.48, -.05, -.45, -.26, -.38, -.32, -.31]);
    polygon(ctx, "#62575d", [.06, -.42, .25, -.49, .37, -.39, .42, -.33, .26, -.29, .15, -.33]);
    polygon(ctx, "#5a5055", [-.7, -.17, -.45, -.24, -.29, -.21, -.22, -.13, -.48, -.06, -.83, -.03]);
    polygon(ctx, "#6f6362", [.28, -.16, .48, -.22, .68, -.14, .77, -.06, .54, -.05]);
    ctx.restore();
  }

  function cloakLayer(ctx, actor, t, strength, front) {
    if (!strength) return;
    const { x, y, h } = actor;
    for (let i = 0; i < 17; i++) {
      const theta = i * tau / 17 + t * tau;
      const z = Math.sin(theta);
      if ((z >= 0) !== front) continue;
      const len = h * (.081 + .124 * random(i)) * (.88 + .12 * Math.cos(theta * 3 + i));
      const lift = y - h * (.35 - z * .13 + strength * .12);
      ctx.save();
      ctx.globalAlpha *= strength * (front ? .90 : .72);
      ctx.translate(x + Math.cos(theta) * h * .51, lift);
      ctx.scale(len * .66, len);
      const lean = Math.cos(theta) * .65;
      polygon(ctx, palettes.fire[0], [-.64, .31, -.65, -.14, -.29, -.55, -.42, -.91,
        lean, -1.44, lean + .17, -1.13, .19, -.65, .58, -.94, .51, -.55, .73, -.2, .56, .34, .04, .49]);
      polygon(ctx, palettes.fire[1], [-.51, .23, -.48, -.13, -.09, -.51, -.17, -.68, lean * .61, -1.14,
        .24, -.54, .38, -.5, .45, -.7, .59, -.19, .4, .32, -.09, .44]);
      polygon(ctx, palettes.fire[2], [-.36, .21, -.24, -.15, .13, -.55, .12, -.18,
        .37, -.36, .45, -.11, .31, .27, .02, .37]);
      polygon(ctx, palettes.fire[3], [-.27, .19, -.04, -.16, .04, .02, .24, -.15, .25, .18, .08, .28]);
      ctx.restore();
    }
  }

  function cloak(ctx, atlas, actor, t, active) {
    const strength = active ? 1 : smooth(phase(t, .45, .77));
    const body = active || t < .16 || t > .78 ? frames.idle : frames.charge;
    const rotation = active ? t : t * .62;
    cloakLayer(ctx, actor, rotation, strength, false);
    frame(ctx, atlas, actor, body);
    cloakLayer(ctx, actor, rotation, strength, true);
  }

  function remains(ctx, x, y, h, family, alpha = 1, widen = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    const ash = family === "fire";
    const colors = ash || family === "fused" ? palettes.coal : palettes.rock;
    for (let i = 0; i < 14; i++) {
      const u = random(i * 7);
      const px = x + (u - .5) * h * (ash ? 1 : 1.16) * widen;
      const size = h * (.035 + random(i * 7 + 1) * (ash ? .036 : .09));
      shard(ctx, px, y - size * .46, size, .32 - u * .64, colors);
      if (ash && i % 3 === 0) {
        ctx.fillStyle = "#934c40";
        ctx.fillRect(px, y - size * .54, Math.max(1, h * .009), Math.max(1, h * .008));
      }
    }
    ctx.restore();
  }

  function crumble(ctx, atlas, actor, t, family) {
    const { x, y, h } = actor;
    const ash = family === "fire";
    groundClip(ctx, y);
    const unstable = phase(t, 0, .25);
    const collapse = phase(t, .25, .72);
    const sx = 1 + smooth(collapse) * .12;
    if (t < .7) {
      ctx.save();
      if (ash && t > .13) {
        const ember = smooth(phase(t, .13, .66));
        ctx.filter = `saturate(${1 - .88 * ember}) brightness(${1 - .45 * ember})`;
      }
      frame(ctx, atlas, actor, t < .25 ? frames.idle : frames.windup, {
        dx: Math.sin(unstable * tau * 2) * .017 * (1 - collapse),
        sy: 1 - smooth(collapse) * .73, sx,
        alpha: 1 - smooth(phase(t, .28, .7)), angle: sine(collapse) * .08
      });
      ctx.restore();
    }
    const colors = ash || family === "fused" ? palettes.coal : palettes.rock;
    const count = models[actor.kind].boss ? 23 : 15;
    for (let i = 0; i < count; i++) {
      const salt = i * 6;
      const p = phase(t, .16 + random(salt) * .17, .64 + random(salt + 1) * .22);
      if (p <= 0 || p >= 1) continue;
      const u = random(salt + 2) - .5;
      const size = h * (.028 + random(salt + 3) * (ash ? .035 : .091));
      const height = h * (.2 + random(salt + 4) * .7);
      shard(ctx, x + u * h * lerp(.55, 1.7, p),
        y - height * (1 - p * p) - sine(p) * h * .1,
        size * (ash ? 1 - .7 * p : 1), u + p * (random(salt + 5) - .5) * 7, colors);
    }
    remains(ctx, x, y, h, family, smooth(phase(t, .38, .85)));
    if (family !== "earth") {
      const p = phase(t, .15, .87);
      sparks(ctx, x, y - lerp(.56, .1, p) * h, h, p, palettes.fire, count);
    }
    ctx.restore();
  }

  function merge(ctx, atlas, actor, t) {
    const { x, y, h, sources } = actor;
    const earth = sources?.earth ?? { x: x - h * 1.25, y, h: h * .84 };
    const fire = sources?.fire ?? { x: x + h * 1.17, y, h: h * .78 };
    const pull = smooth(phase(t, .17, .57));
    const reveal = smooth(phase(t, .5, .84));
    groundClip(ctx, y);
    remains(ctx, earth.x, earth.y, earth.h, "earth", 1 - pull, 1 - .25 * pull);
    remains(ctx, fire.x, fire.y, fire.h, "fire", 1 - pull, 1 - .25 * pull);
    fissure(ctx, x, y - 1, h * .94, sine(phase(t, .35, .98)), palettes.fire);
    if (t > .5) {
      frame(ctx, atlas, actor, frames.idle, { alpha: reveal, sy: lerp(.57, 1, reveal), sx: lerp(.79, 1, reveal) });
    }
    for (let i = 0; i < 24; i++) {
      const p = phase(t, .06 + random(i * 4) * .24, .61 + random(i * 4 + 1) * .21);
      if (p <= 0 || p >= 1) continue;
      const stone = i < 12;
      const s = stone ? earth : fire;
      const whirl = random(i * 4 + 2) * tau + p * tau;
      const radius = h * .27 * sine(p);
      ctx.save();
      ctx.globalAlpha *= 1 - smooth(phase(p, .72, 1));
      shard(ctx, lerp(s.x, x, smooth(p)) + Math.cos(whirl) * radius,
        lerp(s.y - 5, y - h * .53, smooth(p)) - sine(p) * h * .25 + Math.sin(whirl) * radius,
        h * (.032 + random(i * 4 + 3) * .055), whirl, stone ? palettes.rock : palettes.fire);
      ctx.restore();
    }
    sparks(ctx, x, y - h * .43, h * 1.25, phase(t, .59, .93), palettes.fire, 22);
    ctx.restore();
  }

  function draw(ctx, atlas, state) {
    const model = models[state.kind];
    if (!model || !atlas?.naturalWidth) return;
    const actor = { h: model.h, facing: -1, pose: "idle", poseT: 0, ...state };
    const t = clamp(actor.poseT);
    const cloaked = actor.cloakT !== undefined && !actor.outlineOnly;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (cloaked) cloakLayer(ctx, actor, actor.cloakT, 1, false);
    switch (actor.pose) {
      case "walk": {
        // Промежуточная стойка служит фазой переноса веса между двумя шагами.
        const step = Math.floor((t % 1) * 8);
        const sequence = [frames.idle, frames.stepA, frames.stepA, frames.idle, frames.idle, frames.stepB, frames.stepB, frames.idle];
        frame(ctx, atlas, actor, sequence[step], { sy: 1 - .025 * Math.sin(t * tau * 2) });
        break;
      }
      case "melee": case "boulder": case "fireball": strike(ctx, atlas, actor, t, actor.pose); break;
      case "petrify": petrify(ctx, atlas, actor, t); break;
      case "unstone": petrify(ctx, atlas, actor, 1 - t); break;
      case "stone": frame(ctx, atlas, actor, frames.stone); break;
      case "charge": frame(ctx, atlas, actor, frames.charge, { sy: 1 + sine(t) * .018 }); break;
      case "burrow": burrow(ctx, atlas, actor, t); break;
      case "spike": spike(ctx, atlas, actor, t); break;
      case "cloak": case "burning": cloak(ctx, atlas, actor, t, actor.pose === "burning"); break;
      case "dead": crumble(ctx, atlas, actor, t, model.family); break;
      case "merge": merge(ctx, atlas, actor, t); break;
      default: frame(ctx, atlas, actor, frames.idle, { sy: 1 + Math.sin(t * tau) * .008 });
    }
    if (cloaked) cloakLayer(ctx, actor, actor.cloakT, 1, true);
    ctx.restore();
  }

  function clipNames(kind) {
    return ["idle", "walk", "melee", ...byFamily[models[kind].family], "dead"];
  }

  return { models, clips, clipNames, draw, drawProjectile, projectileOrigin, drawSpike, spikeHeight,
    atlasFile: kind => `rift-${kind}.webp` };
})();
