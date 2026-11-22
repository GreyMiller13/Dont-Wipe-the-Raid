// DWR :: музыка экранов и мягкие игровые эффекты, с независимой громкостью.
"use strict";
window.DWR = window.DWR || {};

DWR.Audio = (function () {
  const tone = (from, to, duration, gain, delay = 0, color = "round") => [color, from, to, duration, gain, delay];
  const air = (from, to, duration, gain, delay = 0) => tone(from, to, duration, gain, delay, "air");
  const cues = {
    ui: [tone(620, 730, 0.12, 0.26)],
    coin: [tone(830, 920, 0.12, 0.21), tone(1080, 1100, 0.16, 0.15, 0.035, "glass")],
    potion: [tone(460, 620, 0.21, 0.23), tone(700, 840, 0.19, 0.20, 0.075)],
    chest: [air(640, 840, 0.22, 0.22), tone(470, 590, 0.34, 0.23, 0.09), tone(710, 940, 0.38, 0.18, 0.17, "glass")],
    door: [air(520, 820, 0.36, 0.22), tone(330, 420, 0.30, 0.11, 0.04)],
    victory: [tone(523, 523, 0.43, 0.17), tone(659, 659, 0.49, 0.18, 0.15), tone(784, 784, 0.60, 0.19, 0.30)],
    defeat: [tone(440, 410, 0.41, 0.17), tone(349, 329, 0.58, 0.16, 0.22)],
    swing: [air(1460, 750, 0.17, 0.32)],
    sword: [air(1580, 740, 0.12, 0.24), tone(1120, 780, 0.17, 0.18, 0.012, "glass")],
    power: [air(2070, 820, 0.25, 0.30), tone(740, 480, 0.31, 0.23, 0.025, "glass")],
    enemy: [air(1260, 520, 0.17, 0.29), tone(610, 370, 0.13, 0.18)],
    claw: [air(1810, 930, 0.19, 0.29), air(1310, 610, 0.14, 0.13, 0.065)],
    bite: [air(1340, 810, 0.11, 0.23), tone(470, 300, 0.15, 0.15)],
    smash: [air(1160, 510, 0.31, 0.25), tone(410, 230, 0.27, 0.30)],
    guard: [tone(960, 840, 0.28, 0.21, 0, "glass"), tone(540, 480, 0.18, 0.19)],
    arrow: [tone(800, 390, 0.14, 0.22), air(1410, 2180, 0.20, 0.24, 0.013)],
    enemyArrow: [tone(625, 340, 0.15, 0.19), air(1060, 1740, 0.17, 0.22, 0.012)],
    multi: [air(1040, 2200, 0.19, 0.20), tone(780, 360, 0.13, 0.18),
      air(920, 1880, 0.19, 0.15, 0.041), air(1540, 2100, 0.13, 0.19, 0.070)],
    precise: [tone(1120, 760, 0.20, 0.24), air(2250, 1180, 0.25, 0.25, 0.02)],
    arrowHit: [air(1080, 690, 0.11, 0.24), tone(640, 470, 0.11, 0.12)],
    fire: [air(960, 1630, 0.28, 0.23), tone(550, 410, 0.22, 0.17)],
    firebolt: [tone(590, 390, 0.15, 0.23), air(950, 1850, 0.21, 0.25, 0.014)],
    fireImpact: [air(1430, 520, 0.32, 0.26), tone(400, 245, 0.24, 0.23, 0.03)],
    necroticOrb: [tone(380, 548, 0.27, 0.24, 0, "reed"), air(570, 1120, 0.24, 0.17)],
    necroticImpact: [tone(650, 380, 0.30, 0.22, 0, "reed"), air(1030, 550, 0.22, 0.19)],
    frost: [air(1640, 2440, 0.23, 0.22), tone(880, 1280, 0.30, 0.17, 0.05, "glass")],
    freeze: [tone(960, 775, 0.39, 0.22, 0, "glass"), tone(1380, 1000, 0.27, 0.15, 0.08, "glass")],
    thaw: [air(1420, 780, 0.21, 0.17), tone(780, 990, 0.27, 0.15)],
    heal: [tone(587, 622, 0.38, 0.18), tone(880, 880, 0.43, 0.17, 0.10)],
    castLight: [tone(420, 600, 0.40, 0.16), tone(650, 840, 0.40, 0.13, 0.12)],
    castFire: [air(750, 1310, 0.37, 0.18), tone(360, 510, 0.35, 0.16, 0.06)],
    massHeal: [tone(523, 523, 0.52, 0.13), tone(659, 670, 0.52, 0.14, 0.075), tone(784, 784, 0.54, 0.17, 0.14)],
    dispel: [air(1620, 2300, 0.27, 0.17), tone(820, 1130, 0.33, 0.18, 0.035, "glass")],
    tornado: [air(630, 1500, 0.78, 0.23), air(1200, 710, 0.56, 0.16, 0.18), tone(430, 520, 0.62, 0.14, 0.09, "reed")],
    bombThrow: [air(930, 1670, 0.24, 0.22), tone(470, 415, 0.15, 0.14)],
    bombImpact: [air(1540, 620, 0.37, 0.34), tone(410, 240, 0.33, 0.25, 0.022)],
    noiseBombImpact: [air(1860, 980, 0.24, 0.26), tone(900, 630, 0.27, 0.16, 0.025, "glass")],
    howl: [tone(440, 570, 0.72, 0.25, 0, "reed"), tone(645, 405, 0.59, 0.15, 0.14, "reed"), air(810, 1140, 0.46, 0.13, 0.12)],
    warCry: [tone(550, 410, 0.36, 0.25, 0, "reed"), air(840, 1300, 0.33, 0.20, 0.045)],
    furnaceCharge: [air(600, 1290, 0.78, 0.2), tone(398, 570, 0.82, 0.19, 0.15, "reed")],
    furnaceWave: [air(1530, 610, 0.79, 0.32), tone(380, 235, 0.59, 0.21, 0.11)],
    armorBreak: [tone(940, 620, 0.33, 0.20, 0, "glass"), air(1300, 850, 0.29, 0.20, 0.05)],
    sacrifice: [tone(470, 640, 0.47, 0.20), tone(705, 900, 0.42, 0.15, 0.13)],
    summon: [tone(390, 475, 0.64, 0.20, 0, "reed"), tone(600, 545, 0.54, 0.16, 0.17, "glass")],
    teleport: [air(520, 1550, 1.12, 0.19), tone(415, 620, 0.76, 0.18, 0.1, "reed"),
      tone(930, 1450, 0.46, 0.19, 0.85, "glass"), air(970, 510, 0.35, 0.12, 1.28)],
    beam: [air(640, 1300, 0.44, 0.25), tone(420, 360, 0.44, 0.21, 0, "reed")],
    down: [air(920, 520, 0.24, 0.17), tone(310, 240, 0.23, 0.20)]
  };

  const musicFiles = {
    menu: "medieval-exploration.mp3",
    dungeon: "whispers-in-the-fog.mp3",
    crypt: "cathedral-in-the-forest.mp3",
    wilds: "forest-whisper-theme.mp3",
    forge: "determined-pursuit.mp3",
    rift: "evening-of-chaos.mp3"
  };
  const music = new Map(), samples = new Map(), played = new Map();
  const clamp = value => Math.min(1, Math.max(0, value));
  const fadeTime = 720;
  let context, effects, volumeMusic = 0.7, volumeSound = 0.8;
  let desired = "menu", starting = null, revision = 0, frame = 0, fadeStart = 0, unlocked = false;
  let voices = 0;

  function paintMusic(now) {
    frame = 0;
    const k = clamp((now - fadeStart) / fadeTime), progress = k * k * (3 - 2 * k);
    for (const track of music.values()) {
      track.level = track.from + (track.to - track.from) * progress;
      track.player.volume = volumeMusic * track.level;
      if (k === 1 && track.to === 0) track.player.pause();
    }
    if (k < 1 && !document.hidden) frame = requestAnimationFrame(paintMusic);
  }

  function startMusic() {
    if (!unlocked || document.hidden || desired === starting) return;
    const name = desired, request = ++revision;
    starting = name;
    if (!music.has(name)) {
      const player = new Audio("assets/out/music/" + musicFiles[name]);
      player.loop = true;
      player.volume = 0;
      music.set(name, { player, level: 0, from: 0, to: 0 });
    }
    const next = music.get(name);
    next.player.play().then(() => {
      if (request !== revision || document.hidden) {
        if (name !== desired && next.to === 0) next.player.pause();
        return;
      }
      for (const track of music.values()) {
        track.from = track.level;
        track.to = track === next ? 1 : 0;
      }
      fadeStart = performance.now();
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paintMusic);
    }).catch(() => {
      // После блокировки автозапуска повторяем на следующем действии игрока.
      if (request === revision) starting = null;
    });
  }

  function setTheme(name) {
    desired = Object.hasOwn(musicFiles, name) ? name : "menu";
    startMusic();
  }

  function applyVolumes() {
    for (const track of music.values()) track.player.volume = volumeMusic * track.level;
    if (effects) effects.gain.setTargetAtTime(document.hidden ? 0 : volumeSound * 0.72, context.currentTime, 0.018);
  }

  function setVolumes(settings) {
    volumeMusic = clamp(Number.isFinite(settings.music) ? settings.music : 0.7);
    volumeSound = clamp(Number.isFinite(settings.sound) ? settings.sound : 0.8);
    applyVolumes();
  }

  function connectEffects() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    context = new Context();
    effects = context.createGain();
    effects.gain.value = volumeSound * 0.72;
    const high = context.createBiquadFilter(), low = context.createBiquadFilter();
    high.type = "highpass"; high.frequency.value = 165; high.Q.value = 0.52;
    low.type = "lowpass"; low.frequency.value = 4900; low.Q.value = 0.52;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -17; compressor.knee.value = 17; compressor.ratio.value = 3;
    compressor.attack.value = 0.016; compressor.release.value = 0.16;
    effects.connect(high); high.connect(low); low.connect(compressor); compressor.connect(context.destination);
  }

  function unlock(event) {
    if (!event.isTrusted || document.hidden) return;
    unlocked = true;
    startMusic();
    if (!context) connectEffects();
    if (context?.state === "suspended") context.resume().catch(() => {});
  }

  function buildSample(parts) {
    const rate = 24000;
    const length = Math.ceil((0.01 + Math.max(...parts.map(([, , , duration, , delay]) => duration + delay))) * rate);
    const buffer = context.createBuffer(1, length, rate), data = buffer.getChannelData(0);
    let seed = 51737;
    for (const [color, from, to, duration, gain, delay] of parts) {
      const offset = Math.round(delay * rate), count = Math.round(duration * rate);
      let phase = 0, fast = 0, slow = 0;
      for (let i = 0; i < count; i++) {
        const t = i / count, hz = from * (to / from) ** t;
        const entry = Math.min(1, i / (rate * 0.019));
        const envelope = entry * entry * Math.exp(-2.05 * t) * (1 - t) ** 1.4;
        phase += Math.PI * 2 * hz / rate;
        let value;
        if (color === "air") {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const noise = seed / 2147483648 - 1;
          fast += (noise - fast) * Math.min(0.8, hz / 5000);
          slow += (noise - slow) * Math.min(0.41, hz / 13500);
          value = (fast - slow) * 2.35;
        } else {
          value = 0.74 * Math.sin(phase);
          if (color === "glass") value += 0.18 * Math.sin(phase * 2.27) + 0.065 * Math.sin(phase * 3.09);
          else if (color === "reed") value += 0.18 * Math.sin(phase * 2) + 0.078 * Math.sin(phase * 3);
          else value += 0.12 * Math.sin(phase * 2);
        }
        data[offset + i] += value * gain * envelope;
      }
    }
    return buffer;
  }

  function play(name, x = 640) {
    if (!context || context.state !== "running" || !volumeSound || document.hidden || voices >= 12 || !cues[name]) return;
    const now = context.currentTime;
    if (now - (played.get(name) ?? -Infinity) < (name === "coin" ? 0.22 : 0.09)) return;
    played.set(name, now);
    if (!samples.has(name)) samples.set(name, buildSample(cues[name]));
    const source = context.createBufferSource();
    source.buffer = samples.get(name);
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = (clamp(x / 1280) - 0.5) * 1.2;
      source.connect(pan); pan.connect(effects);
      source.onended = () => { source.disconnect(); pan.disconnect(); voices--; };
    } else {
      source.connect(effects);
      source.onended = () => { source.disconnect(); voices--; };
    }
    voices++;
    source.start();
  }

  function init(settings) {
    setVolumes(settings);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("click", event => {
      unlock(event);
      if (event.isTrusted && event.target.closest?.("button:not(:disabled)")) play("ui");
    }, true);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        revision++;
        starting = null;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const track of music.values()) {
          track.player.pause();
          track.level = track.from = track.to = 0;
        }
      } else startMusic();
      applyVolumes();
    });
  }

  return { init, setTheme, setVolumes, play };
})();
