"""Собирает оригинальные зацикленные темы игры. Нужны numpy и imageio-ffmpeg."""

from dataclasses import dataclass
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np


RATE = 32000
OUTPUT = Path(__file__).resolve().parents[1] / "prototype" / "assets" / "out" / "music"
DORIAN = (0, 2, 3, 5, 7, 9, 10)
MINOR = (0, 2, 3, 5, 7, 8, 10)
LYDIAN = (0, 2, 4, 6, 7, 9, 11)
MIXOLYDIAN = (0, 2, 4, 5, 7, 9, 10)


@dataclass(frozen=True)
class Theme:
    bpm: int
    tonic: int
    scale: tuple[int, ...]
    chords: tuple[int, ...]
    melody: str  # Четыре доли на такт. Точка — пауза, степень гаммы отсчитывается от нуля.
    lead: str
    strings: str
    rhythm: tuple[float, ...]


THEMES = {
    "menu": Theme(67, 62, DORIAN, (0, 3, 5, 4, 0, 6, 3, 4),
                  "4 . 2 1 / 2 . 4 . / 5 4 2 . / 1 . . . / 2 . 4 5 / 7 . 5 . / 4 2 1 . / 1 . . 2",
                  "lute", "harp", (0, 1.5, 2.5, 3.25)),
    "raid": Theme(76, 60, LYDIAN, (0, 1, 5, 4, 0, 5, 1, 4),
                  "2 . 4 5 / 7 6 4 . / 5 . 2 4 / 1 . . . / 4 6 7 . / 9 . 7 6 / 5 4 2 . / 1 . 4 .",
                  "flute", "lute", (0, 0.75, 1.75, 2.5, 3.25)),
    "loadout": Theme(83, 57, DORIAN, (0, 5, 2, 3, 0, 6, 5, 4),
                     "4 6 7 . / 5 . 2 . / 4 5 7 9 / 7 . 5 . / 4 . 6 7 / 8 6 4 . / 5 4 2 . / 1 . . .",
                     "dulcimer", "harp", (0.5, 1, 2.25, 3, 3.5)),
    "tree": Theme(61, 55, DORIAN, (0, 3, 1, 5, 0, 6, 3, 1),
                  "7 . . 6 / 4 . 5 . / 8 . . . / 7 6 4 . / 6 . 7 . / 9 . . 7 / 5 . 4 . / 3 . . 1",
                  "bell", "lute", (0, 1.25, 2.75)),
    "dungeon": Theme(66, 52, MINOR, (0, 1, 0, 5, 3, 1, 6, 4),
                     "2 . . 1 / 0 . 1 . / . 2 . 4 / 5 . 4 . / 2 . 4 2 / 1 . . 0 / 3 . 1 . / 0 . . .",
                     "bow", "lute", (0, 0.75, 2, 2.75, 3.5)),
    "crypt": Theme(58, 61, MINOR, (0, 5, 2, 1, 0, 3, 5, 6),
                   "4 . . 2 / 0 . . . / 7 . 4 . / 2 . . 1 / 4 . 2 . / 5 . . 4 / 2 . 0 . / 1 . . .",
                   "bell", "bow", (0, 2.5, 3.5)),
    "wilds": Theme(78, 55, DORIAN, (0, 3, 6, 0, 2, 5, 3, 4),
                    "4 5 6 . / 9 . 7 5 / 6 4 2 . / 4 . . 5 / 7 6 4 . / 5 . 7 8 / 7 5 4 2 / 1 . 4 .",
                    "flute", "harp", (0, 0.75, 1.5, 2.5, 3.25)),
    "forge": Theme(86, 57, MINOR, (0, 2, 5, 1, 0, 3, 5, 4),
                    "4 . 4 2 / 7 6 4 . / 5 . 7 5 / 3 1 . . / 4 2 4 . / 6 . 5 3 / 7 5 4 . / 1 . 2 .",
                    "dulcimer", "lute", (0, 0.5, 1.5, 2, 2.75, 3.5)),
    "rest": Theme(64, 57, MIXOLYDIAN, (0, 3, 1, 4, 0, 5, 3, 0),
                  "2 . 1 0 / 4 . . 2 / 5 4 2 . / 1 . . . / 2 4 5 . / 7 . 5 4 / 3 2 1 . / 0 . . .",
                  "lute", "harp", (0, 1, 2.5, 3.5)),
}


def voice(name, midi, duration, shape):
    t = np.arange(round(duration * RATE)) / RATE
    phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
    breath = phase + 0.23 * np.sin(2 * np.pi * (3.7 + shape) * t)
    oscillation = np.sin(phase)
    if name == "bow":
        body = 0.70 * np.sin(breath) + 0.19 * np.sin(2 * breath) + 0.06 * np.sin(3 * breath)
        return body * np.minimum(1, t / 0.26) ** 2 * np.clip((duration - t) / 0.45, 0, 1) ** 2
    if name == "flute":
        body = np.sin(breath) + 0.18 * np.sin(2 * breath) + 0.048 * np.sin(3 * breath + 0.6)
        return body * np.minimum(1, t / 0.13) ** 2 * np.clip((duration - t) / 0.24, 0, 1) ** 2
    if name == "bell":
        body = 0.82 * oscillation + 0.17 * np.sin(phase * 2.008) * np.exp(-t * 2) + 0.05 * np.sin(phase * 3.018) * np.exp(-t * 3.8)
        decay, attack = 1.45, 0.045
    elif name == "dulcimer":
        body = 0.78 * oscillation + 0.20 * np.sin(phase * 2.002) + 0.10 * np.sin(phase * 3.01) * np.exp(-t * 4)
        decay, attack = 3.0, 0.028
    else:
        harp = name == "harp"
        body = 0.70 * oscillation + (0.21 if harp else 0.28) * np.sin(phase * 2) * np.exp(-t * 1.4)
        body += 0.085 * np.sin(phase * 3) * np.exp(-t * 4) + 0.035 * np.sin(phase * 4) * np.exp(-t * 7)
        decay, attack = (2.25, 0.032) if harp else (3.2, 0.018)
    return body * np.exp(-t * decay) * np.minimum(1, t / attack) ** 2 * np.clip((duration - t) / 0.20, 0, 1) ** 2


def render(theme):
    seconds = 60 / theme.bpm
    frames = round(64 * seconds * RATE)
    mix = np.zeros((frames, 2), dtype=np.float32)
    motif = [part.split() for part in theme.melody.split("/")]

    def degree(value):
        octave, note = divmod(value, len(theme.scale))
        return theme.tonic + octave * 12 + theme.scale[note]

    def note(instrument, pitch, beat, duration, volume, pan):
        wave = voice(instrument, pitch, duration * seconds, (pitch % 7) * 0.07)
        start = round(beat * seconds * RATE) % frames
        signal = wave[:, None] * np.sqrt([1 - pan, pan]) * volume
        split = min(len(wave), frames - start)
        mix[start:start + split] += signal[:split]
        mix[:len(wave) - split] += signal[split:]

    for i in range(16):
        bar, verse = i % 8, i // 8
        root = theme.chords[bar]
        chord = [degree(root + step) for step in (0, 2, 4, 6)]
        bass = chord[0] - 12 if chord[0] >= 64 else chord[0]
        note("lute", bass, i * 4, 3.0, 0.10, 0.44)
        for j, pitch in enumerate(chord[1:3]):
            pitch = pitch - 12 if pitch > 72 else pitch
            note("bow", pitch, i * 4 - 0.19 + j * 0.05, 4.53, 0.042, 0.29 + j * 0.44)
        for j, beat in enumerate(theme.rhythm):
            pitch = chord[(j * 3 + verse) % len(chord)]
            if pitch < 57:
                pitch += 12
            note(theme.strings, pitch, i * 4 + beat + 0.012 * (j % 3), 1.68, 0.066 if j % 2 else 0.082,
                 0.32 if j % 2 else 0.68)
        for beat, value in enumerate(motif[bar]):
            if value == "." or (verse == 1 and (bar + beat) % 7 == 4):
                continue
            pitch = degree(int(value))
            if pitch < 67:
                pitch += 12
            duration = 1.52 if beat < 3 and motif[bar][beat + 1] == "." else 0.9
            if verse and bar in (3, 7) and beat == 0:
                duration = 2.18
            note(theme.lead, pitch, i * 4 + beat + 0.045 * (beat % 2), duration, 0.109, 0.49)

    dry = mix.copy()
    for delay, gain in [(0.091, 0.106), (0.166, 0.075), (0.287, 0.041)]:
        mix += gain * np.roll(dry[:, ::-1], round(delay * RATE), axis=0)
    # Циклический фильтр сохраняет стык лупа и ослабляет гул и яркие верхние частоты.
    frequencies = np.fft.rfftfreq(frames, 1 / RATE)
    band = frequencies**4 / (frequencies**4 + 148**4) / (1 + (frequencies / 5500)**4)
    mix = np.fft.irfft(np.fft.rfft(mix, axis=0) * band[:, None], n=frames, axis=0)
    rms = np.sqrt(np.mean(mix**2))
    mix *= min(0.061 / rms, 0.31 / np.max(np.abs(mix)))
    edge = round(RATE * 0.012)
    fade = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, edge)))[:, None]
    mix[:edge] *= fade
    mix[-edge:] *= fade[::-1]
    return (mix * 32767).astype("<i2").tobytes()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    for name, theme in THEMES.items():
        target = OUTPUT / f"{name}.mp3"
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(RATE),
                        "-ac", "2", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "96k",
                        "-map_metadata", "-1", str(target)], input=render(theme), check=True)
        print(target.name, target.stat().st_size)


if __name__ == "__main__":
    main()
