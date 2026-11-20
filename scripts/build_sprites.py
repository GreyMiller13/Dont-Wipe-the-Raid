# DWR :: build_sprites.py — производственная сборка ассетов прототипа.
# Вырезка спрайтов заливкой фона от краёв (лечит полупрозрачность тёмных тканей),
# нарезка листов по контурам и выравнивание кадров по точке опоры,
# обработка фонов комнат (пол -> FLOOR на канвасе 1280x720).
# Выход: prototype/assets/out/ + manifest.json. Запуск: python scripts/build_sprites.py
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, "prototype", "assets", "sprites")
BG = os.path.join(ROOT, "prototype", "assets", "backgrounds")
OUT = os.path.join(ROOT, "prototype", "assets", "out")
os.makedirs(OUT, exist_ok=True)

CANVAS_W, CANVAS_H, FLOOR_OUT = 1280, 720, 540  # линия пола сцены на канвасе

# --- Связные компоненты: union-find по прогонам строк (без scipy) --------------------------


def label_runs(mask):
    """Метка связных компонент 4-связности. mask: HxW bool -> (labels int32, count)."""
    H, W = mask.shape
    labels = np.zeros((H, W), np.int32)
    parent = [0]

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:      # сжатие пути
            parent[x], x = root, parent[x]
        return root

    prev = {}                          # прогон предыдущей строки: (x0, x1, метка)
    nxt = 1
    for y in range(H):
        row = mask[y]
        if not row.any():
            prev = {}
            continue
        diff = np.flatnonzero(np.diff(np.concatenate(([0], row.view(np.int8), [0]))))
        runs = diff.reshape(-1, 2)     # пары [старт, конец)
        cur = {}
        for x0, x1 in runs:
            lbl = 0
            for px0, px1, plbl in [(a, b, c) for (a, b), c in prev.items() if a < x1 and x0 < b]:
                r = find(plbl)
                if lbl == 0 or r < lbl:
                    if lbl:
                        parent[lbl] = r
                    lbl = r
            if lbl == 0:
                parent.append(nxt)
                parent[nxt] = nxt
                lbl = nxt
                nxt += 1
            cur[(x0, x1)] = lbl
            labels[y, x0:x1] = lbl
        prev = cur
    # переприсвоение меток компактно
    for i in range(1, nxt):
        find(i)
    roots = np.array([find(i) for i in range(nxt)])
    uniq = {r: i + 1 for i, r in enumerate(sorted(set(roots[1:])))}
    table = np.zeros(nxt, np.int32)
    for i in range(1, nxt):
        table[i] = uniq[roots[i]]
    return table[labels], len(uniq)


def bg_median(a):
    h, w = a.shape[:2]
    m = min(40, h // 10, w // 10)
    corners = np.concatenate([
        a[:m, :m].reshape(-1, 3), a[:m, -m:].reshape(-1, 3),
        a[-m:, :m].reshape(-1, 3), a[-m:, -m:].reshape(-1, 3)])
    return np.median(corners, axis=0)


# --- Вырезка: фон = связная с краями область, близкая к цвету фона ---------------------------
# Решает полупрозрачность тёмных персонажей: пиксели тела НИЗКОГО контраста с фоном
# остаются непрозрачными, пока они внутри силуэта (не соединены с краем кадра).

def alpha_mask(a, thr_lo=14):
    # thr_lo = «точно фон»: однотонный тёмно-серый ± JPEG-шум. Больше нельзя:
    # тёмная ткань (плащ лучника) связана с фоном низкоконтрастной кромкой,
    # и заливка при высоком пороге ПРОТЕКАЕТ внутрь фигуры (прозрачность, развал на куски).
    bg_color = bg_median(a)
    near_bg = np.abs(a.astype(int) - bg_color).max(axis=2) <= thr_lo
    lab, n = label_runs(near_bg)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    is_bg = np.isin(lab, border)       # фон и только фон — прозрачен
    f = np.where(is_bg, 0, 255)
    # мягкий край 1px: внутренность остаётся 255, снаружи — приглушённое перо
    blur = (np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1) + f) // 5
    return np.maximum(f, np.minimum(blur, 128)).astype(np.uint8)


def cutout(a):
    alpha = alpha_mask(a)
    out = np.dstack([a, alpha])
    ys, xs = np.where(alpha > 80)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


# --- Спрайты-одиночки ----------------------------------------------------------------------

SINGLES = {  # имя -> (файл-источник, зеркалить; все выходы смотрят ВПРАВО)
    "goblinW": ("goblin-warrior-v1.jpg", False),
    "goblinA": ("goblin-archer-v1.jpg", False),
    "goblinK": ("goblin-king-v1.jpg", False),
}

manifest = {"floor": FLOOR_OUT, "sprites": {}, "frames": {}, "bgs": {}}

# Контуры рук на спрайтах высотой 64px. Под подвижной рукой восстанавливаем
# закрытую часть корпуса, чтобы замах не оставлял прозрачную дыру.
ENEMY_LAYERS = {
    "goblinW": (
        [(16, 14), (24, 14), (26, 20), (22, 26), (23, 30), (28, 32), (31, 31),
         (35, 32), (53, 23), (56, 24), (56, 35), (38, 37), (34, 41), (23, 42),
         (18, 39), (14, 35), (11, 28), (11, 22)],
        [("#335622", [(15, 18), (25, 15), (30, 19), (28, 24), (25, 30), (27, 34),
                      (23, 37), (13, 35), (10, 29), (11, 23)]),
         ("#446c27", [(13, 21), (24, 16), (26, 20), (21, 27), (16, 30), (12, 28)])]
    ),
    "goblinA": (
        [(12, 17), (19, 17), (23, 23), (24, 31), (27, 35), (29, 39), (28, 43),
         (22, 45), (17, 39), (14, 34), (12, 28)],
        [("#38472a", [(13, 17), (22, 16), (25, 22), (24, 31), (23, 37), (22, 44),
                      (15, 44), (12, 37), (11, 23)]),
         ("#576837", [(13, 19), (20, 17), (22, 23), (19, 36), (14, 34)])]
    ),
    "goblinK": (
        [(19, 19), (26, 20), (27, 26), (24, 30), (26, 34), (30, 36), (39, 35),
         (44, 31), (49, 32), (55, 27), (67, 25), (68, 40), (56, 40), (47, 41),
         (40, 41), (32, 43), (24, 44), (20, 40), (16, 36), (14, 30)],
        [("#47301e", [(18, 21), (38, 20), (43, 24), (41, 35), (38, 47), (19, 44), (15, 33)]),
         ("#6b4927", [(21, 22), (38, 21), (39, 29), (33, 37), (29, 39), (23, 34)]),
         ("#91663d", [(26, 23), (35, 22), (37, 27), (31, 30), (27, 29)])]
    ),
}


def save_enemy_layers(name, sprite):
    outline, patches = ENEMY_LAYERS[name]
    cut = Image.new("L", sprite.size)
    ImageDraw.Draw(cut).polygon(outline, fill=255)
    removed = cut.copy()
    if name == "goblinA":
        # Лук и тетива меняют форму при натяжении: их дорисовывает chars.js.
        brush = ImageDraw.Draw(removed)
        brush.line([(0, 46), (15, 46), (22, 44), (33, 36), (37, 30), (40, 22)], fill=255, width=4)
        brush.line([(0, 45), (40, 22)], fill=255, width=3)
    arm = Image.new("RGBA", sprite.size)
    arm.paste(sprite, mask=cut)
    body = Image.new("RGBA", sprite.size)
    body.paste(sprite, mask=removed.point(lambda x: 255 - x))
    repair = Image.new("RGBA", sprite.size)
    painter = ImageDraw.Draw(repair)
    for color, polygon in patches:
        painter.polygon(polygon, fill=color)
    if name == "goblinK":
        # Под дубиной видны кожаные пояса. Берём фактуру с исходного нагрудника.
        painter.line([(18, 34), (23, 37), (28, 40), (33, 39), (39, 35)], fill="#92673c", width=2)
        painter.line([(20, 39), (25, 42), (31, 43), (37, 40)], fill="#35231b", width=1)
        leather = np.asarray(sprite)[22:34, 29:40, :3].mean(axis=2)
        y, x = np.indices((sprite.height, sprite.width))
        grain = (leather[y % leather.shape[0], x % leather.shape[1]] - np.median(leather)) * 0.68
        pixels = np.array(repair)
        pixels[:, :, :3] = np.clip(pixels[:, :, :3] + grain[:, :, None], 0, 255)
        repair = Image.fromarray(pixels)
    repair.putalpha(Image.fromarray(np.minimum(np.asarray(repair.getchannel("A")), np.asarray(removed))))
    body.alpha_composite(repair)
    body.save(os.path.join(OUT, name + "-body.png"))
    arm.save(os.path.join(OUT, name + "-arm.png"))


for name, (fn, mirror) in SINGLES.items():
    im = np.asarray(Image.open(os.path.join(SPR, fn)).convert("RGB"))
    if mirror:
        im = im[:, ::-1]
    rgba = cutout(im)
    h, w = rgba.shape[:2]
    sprite = Image.fromarray(rgba, "RGBA").resize((round(w * 64 / h), 64), Image.Resampling.BOX)
    sprite.save(os.path.join(OUT, name + ".png"))
    save_enemy_layers(name, sprite)
    manifest["sprites"][name] = dict(zip(("w", "h"), sprite.size))


# Лист нежити от ImageGen. После вырезки остановочные кадры имеют высоту
# 74px (лич — 92px). Рука с оружием хранится отдельно и вращается вокруг плеча.
UNDEAD = {
    "skeletonW": (0, 570, 74,
        [(6, 20), (10, 21), (10, 28), (10, 34), (10, 39), (14, 39), (15, 36), (17, 36),
         (18, 41), (45, 48), (45, 52), (31, 51), (15, 47), (13, 49), (10, 49), (9, 45),
         (0, 43), (0, 38), (4, 38), (3, 32), (3, 26)],
        [(5, 21), (13, 18), (19, 23), (18, 40), (21, 48), (20, 50), (6, 51), (6, 44)],
        "#46352f", (13, 24, 19, 36)),
    "skeletonA": (570, 1090, 74,
        [(15, 22), (20, 22), (21, 26), (21, 30), (23, 34), (28, 38), (30, 42), (28, 45),
         (21, 44), (17, 38), (14, 31), (14, 25)],
        [(13, 22), (22, 19), (29, 26), (29, 46), (27, 55), (11, 56), (9, 49), (10, 41)],
        "#3d392d", (14, 47, 22, 57)),
    "skeletonM": (1090, 1590, 74,
        [(22, 28), (26, 28), (29, 31), (31, 32), (40, 22), (39, 19), (40, 16), (43, 14),
         (48, 14), (49, 17), (49, 22), (44, 25), (40, 25), (34, 34), (34, 38), (29, 42),
         (25, 45), (24, 40), (26, 37), (25, 33), (22, 32)],
        [(20, 27), (25, 27), (29, 31), (28, 42), (29, 53), (21, 48), (19, 33)],
        "#503738", (11, 48, 17, 58)),
    "lich": (1590, 2172, 92,
        [(38, 31), (42, 33), (45, 37), (49, 38), (53, 24), (54, 20), (53, 13),
         (57, 9), (60, 7), (64, 2), (67, 2), (67, 24), (60, 25), (55, 30),
         (50, 43), (45, 49), (42, 59), (39, 65), (37, 62), (39, 52), (41, 45), (41, 39), (38, 37)],
        [(37, 27), (42, 30), (43, 36), (43, 52), (45, 66), (37, 70), (34, 63), (34, 47)],
        "#423346", (25, 52, 32, 61)),
}


def save_undead_rigs():
    atlas = Image.open(os.path.join(SPR, "undead-roster.png")).convert("RGBA")
    for name, (x0, x1, height, arm_outline, patch, color, texture_bounds) in UNDEAD.items():
        tile = atlas.crop((x0, 0, x1, atlas.height))
        # Слабые остатки цвета за пределами силуэта исчезают при пороге альфы.
        tile.putalpha(tile.getchannel("A").point(lambda value: value if value >= 200 else 0))
        tile = tile.crop(tile.getbbox())
        width = round(tile.width * height / tile.height)
        sprite = tile.resize((width, height), Image.Resampling.BOX)
        removed = Image.new("L", sprite.size)
        painter = ImageDraw.Draw(removed)
        painter.polygon(arm_outline, fill=255)
        if name == "skeletonA":
            painter.line([(0, 48), (5, 46), (12, 46), (19, 45), (26, 41), (33, 38),
                          (40, 32), (43, 25), (47, 20)], fill=255, width=4)
            painter.line([(0, 48), (46, 20)], fill=255, width=3)
        arm = Image.new("RGBA", sprite.size)
        arm.paste(sprite, mask=removed)
        body = Image.new("RGBA", sprite.size)
        body.paste(sprite, mask=removed.point(lambda value: 255 - value))

        repair = Image.new("RGBA", sprite.size)
        ImageDraw.Draw(repair).polygon(patch, fill=color)
        texture = np.asarray(sprite.crop(texture_bounds))[:, :, :3].mean(axis=2)
        y, x = np.indices((height, width))
        grain = (texture[y % texture.shape[0], x % texture.shape[1]] - np.median(texture)) * 0.48
        pixels = np.array(repair)
        pixels[:, :, :3] = np.clip(pixels[:, :, :3] + grain[:, :, None], 0, 255)
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], np.asarray(removed))
        body.alpha_composite(Image.fromarray(pixels))

        for suffix, image in [("", sprite), ("-body", body), ("-arm", arm)]:
            image.save(os.path.join(OUT, name + suffix + ".png"))
        manifest["sprites"][name] = dict(zip(("w", "h"), sprite.size))


save_undead_rigs()

# --- Стрела: вырезка + автоповорот остриём вправо -------------------------------------------

im = np.asarray(Image.open(os.path.join(SPR, "arrow-v1.png")).convert("RGB"))
rgba = cutout(im)
h, w = rgba.shape[:2]
hsv = np.array(Image.fromarray(rgba[:, :, :3], "RGB").convert("HSV"), dtype=int)
lsat = hsv[:, : w // 8, 1].mean()
rsat = hsv[:, -w // 8:, 1].mean()
if lsat < rsat:  # оперение насыщеннее острия; если слева насыщеннее — остриё уже вправо
    pass
else:
    rgba = rgba[:, ::-1]
Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "arrow.png"))
print(f"arrow: {w}x{h}, остриё вправо")

# --- Листы анимации -------------------------------------------------------------------------
# Координаты в пикселях исходников. Контуры обходят оружие и свечение, выходящие
# за условные ячейки. Точка опоры задаётся по корпусу и подошвам каждого кадра.
SHEETS = {
    "warrior": ("warrior-attack-sheet-v1.jpg", 1075, [
        ((290, 1219), [(90, 135), (405, 135), (400, 630), (711, 908), (492, 948), (491, 1220), (109, 1220)]),
        ((950, 1219), [(400, 92), (1210, 92), (1210, 1220), (714, 1220), (717, 950), (690, 861), (570, 755), (616, 458)]),
        ((1514, 1219), [(1270, 240), (1740, 240), (1740, 508), (2054, 493), (2033, 526), (1795, 616), (1775, 1220), (1270, 1220)]),
        ((2131, 1219), [(1890, 242), (2410, 242), (2410, 826), (2620, 988), (2567, 1003), (2368, 926), (2368, 1220), (1890, 1220), (1890, 596), (2032, 528), (2024, 494), (1890, 524)]),
        ((2745, 1219), None),  # повтор первого кадра: у правого края исходника клинок обрезан
    ]),
    "ranger": ("ranger-attack-sheet.jpg", 747, [
        ((290, 1164), [(55, 398), (405, 398), (403, 667), (571, 563), (575, 614), (565, 1172), (58, 1172)]),
        ((775, 1164), [(565, 410), (898, 410), (907, 693), (1036, 579), (1042, 953), (979, 977), (980, 1172), (565, 1172)]),
        ((1230, 1164), [(1050, 436), (1351, 436), (1364, 631), (1441, 761), (1444, 852), (1427, 1172), (1045, 1172)]),
        ((1627, 1164), [(1425, 426), (1635, 429), (1714, 312), (1816, 370), (1880, 526), (1890, 705), (1825, 873), (1814, 1172), (1433, 1172), (1448, 702), (1423, 660), (1404, 527)]),
        ((2046, 1164), [(1880, 422), (2119, 419), (2129, 302), (2258, 452), (2288, 605), (2261, 783), (2213, 905), (2213, 1172), (1850, 1172), (1850, 903), (1873, 745)]),
        ((2470, 1164), [(2284, 420), (2530, 402), (2600, 500), (2574, 658), (2718, 558), (2728, 1172), (2294, 1172), (2296, 915), (2230, 930), (2250, 883), (2313, 851)]),
    ]),
    "priest": ("priest-heal-sheet.jpg", 695, [
        ((314, 1164), [(95, 400), (516, 400), (516, 1172), (95, 1172)]),
        ((738, 1164), [(542, 378), (1047, 378), (1045, 567), (929, 610), (891, 1172), (542, 1172)]),
        ((1168, 1164), [(1010, 518), (1280, 480), (1312, 263), (1540, 263), (1552, 476), (1410, 521), (1325, 722), (1325, 1172), (979, 1172)]),
        ((1614, 1164), [(1433, 542), (1624, 440), (1596, 249), (1710, 169), (2010, 169), (2076, 380), (2000, 482), (1946, 550), (1780, 658), (1775, 1172), (1423, 1172)]),
        ((2058, 1164), [(1980, 470), (2153, 453), (2360, 478), (2355, 632), (2196, 775), (2202, 1172), (1850, 1172), (1850, 1080), (1981, 790)]),
        ((2495, 1164), [(2381, 438), (2677, 414), (2698, 1172), (2286, 1172), (2286, 1103), (2396, 798), (2378, 660)]),
    ]),
    "priest-cast": ("priest-attack-sheet.jpg", 545, [
        ((264, 697), [(102, 98), (448, 98), (448, 706), (102, 706)]),
        ((721, 697), [(548, 75), (964, 75), (964, 492), (835, 706), (548, 706)]),
        ((1165, 697), [(1010, 221), (1222, 135), (1224, 12), (1415, 12), (1415, 213), (1288, 331), (1296, 706), (1010, 706)]),
        ((1599, 697), [(1462, 54), (1843, 15), (1883, 107), (1816, 198), (1806, 706), (1451, 706)]),
        ((2044, 697), [(1890, 141), (2190, 140), (2386, 180), (2418, 368), (2186, 455), (2186, 706), (1890, 706)]),
        ((2509, 697), [(2442, 123), (2676, 105), (2680, 706), (2346, 706), (2346, 665), (2440, 405)]),
    ]),
}

# Формат кадров для chars.js: рост в стойке 72px, опора по центру и 3px от нижнего края.
FRAME_SIZE = (152, 116)
BODY_HEIGHT = 72
FRAME_BASE = FRAME_SIZE[1] - 3
COMBAT_EFFECTS_SCALE = 0.135


def magic_alpha(rgb):
    # Полупрозрачное свечение уходит в фон, сердцевина сохраняет цвет.
    delta = np.abs(rgb.astype(int) - bg_median(rgb)).max(axis=2)
    return np.clip((delta - 8) * 255 / 72, 0, 255).astype(np.uint8)


def save_effect_clip(rgb, alpha, name, size, origin, cuts):
    files = []
    for i, ((left, top, right, bottom), (x, y)) in enumerate(cuts, 1):
        rgba = np.dstack([rgb[top:bottom, left:right], alpha[top:bottom, left:right]])
        piece = Image.fromarray(rgba).resize(
            (round((right - left) * COMBAT_EFFECTS_SCALE), round((bottom - top) * COMBAT_EFFECTS_SCALE)),
            Image.Resampling.BOX
        )
        frame = Image.new("RGBA", size)
        frame.paste(piece, (origin[0] + round((left - x) * COMBAT_EFFECTS_SCALE),
                            origin[1] + round((top - y) * COMBAT_EFFECTS_SCALE)))
        fn = f"{name}-f{i}.png"
        frame.save(os.path.join(OUT, fn))
        files.append(fn)
    manifest["frames"][name] = files


def save_fireball_effects(rgb, alpha):
    # Вторая строка исходника — полёт, третья — вспышка, пламя и дым.
    save_effect_clip(rgb, alpha, "fireball-flight", (84, 36), (70, 18), [
        ((567, 780, 995, 974), (930, 873)),
        ((1168, 779, 1662, 980), (1580, 878)),
        ((1771, 765, 2250, 978), (2138, 878)),
    ])
    save_effect_clip(rgb, alpha, "fireball-impact", (90, 82), (45, 41), [
        ((249, 1172, 449, 1390), (349, 1278)),
        ((645, 1080, 1058, 1500), (849, 1279)),
        ((1110, 1035, 1650, 1500), (1410, 1268)),
        ((1720, 1035, 2190, 1490), (1950, 1275)),
        ((2240, 1035, 2660, 1490), (2450, 1275)),
    ])


def save_priest_release(frame):
    # В момент вылета оставляем горячий наконечник, сам шар рисуется как снаряд.
    release = frame.copy()
    painter = ImageDraw.Draw(release)
    painter.polygon([(54, 17), (118, 17), (118, 46), (103, 45), (102, 39),
                     (97, 39), (94, 46), (86, 45), (85, 39), (72, 40),
                     (69, 44), (65, 48), (54, 53)], fill=(0, 0, 0, 0))
    painter.rectangle((98, 38, 100, 40), fill="#ed854e")
    painter.point((99, 38), fill="#ffe5ab")
    release.save(os.path.join(OUT, "priest-release.png"))
    manifest["sprites"]["priest-release"] = dict(zip(("w", "h"), release.size))


def bow_flash(draw, x, y, width, height, color):
    draw.polygon([(x - width, y), (x - 2, y - 2), (x, y - height), (x + 2, y - 2),
                  (x + width, y), (x + 2, y + 2), (x, y + height), (x - 2, y + 2)], fill=color)
    draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill="#fff9db")


def save_ranger_skills():
    # Отдельные листы используют тот же масштаб и линию подошв, что и автоатака.
    for name, order in [("ranger-multishot", (1, 2, 3, 4, 5, 6)), ("ranger-precise", (1, 2, 4, 4, 5, 6))]:
        multi = name == "ranger-multishot"
        color = "#b4e583" if multi else "#77ddff"
        files = []
        for i, base in enumerate(order, 1):
            frame = Image.open(os.path.join(OUT, f"ranger-f{base}.png")).convert("RGBA")
            brush = ImageDraw.Draw(frame)
            if i in (3, 4):
                if multi:
                    x, y = (88, 77) if i == 3 else (99, 59)
                    for spread in (-5, 0, 5):
                        brush.line([(x - 10, y), (x + 12, y + spread)], fill=color, width=1)
                        brush.point((x + 13, y + spread), fill="#fff9db")
                else:
                    brush.line([(76, 59), (108, 59)], fill=color, width=2)
                    bow_flash(brush, 99, 59, 7 if i == 3 else 11, 4 if i == 3 else 6, color)
            if i == 5:
                bow_flash(brush, 97, 59, 15 if multi else 22, 10 if multi else 6, color)
                for x, y in ([(112, 46), (117, 55), (113, 69), (123, 63)] if multi else
                             [(115, 56), (123, 59), (109, 66), (104, 50)]):
                    brush.point((x, y), fill="#fff9db")
            if i == 6:
                brush.point((112, 62), fill=color)
                brush.point((120, 65), fill=color)
            fn = f"{name}-f{i}.png"
            frame.save(os.path.join(OUT, fn))
            files.append(fn)
        manifest["frames"][name] = files

    for name, size, tint in [
        ("arrow-multishot", (48, 10), "#a6d97f"), ("arrow-precise", (68, 14), "#7cddff")
    ]:
        w, h = size
        cy = h // 2
        sprite = Image.new("RGBA", size)
        brush = ImageDraw.Draw(sprite)
        brush.polygon([(0, cy), (w - 12, cy - 2), (w - 12, 1), (w - 1, cy), (w - 12, h - 2),
                       (w - 12, cy + 2)], fill=tint)
        brush.line([(w // 5, cy), (w - 3, cy)], fill="#fff8da", width=1)
        brush.line([(4, cy), (14, cy - 4), (22, cy - 4)], fill=tint, width=1)
        brush.line([(4, cy), (14, cy + 4), (22, cy + 4)], fill=tint, width=1)
        sprite.save(os.path.join(OUT, name + ".png"))
        manifest["sprites"][name] = dict(zip(("w", "h"), size))

for name, (fn, source_height, poses) in SHEETS.items():
    source = Image.open(os.path.join(SPR, fn)).convert("RGB")
    rgb = np.asarray(source)
    alpha = alpha_mask(rgb)
    if name == "warrior":
        # На листе воина за фигурами есть серая линия пола и полосы от JPEG.
        neutral = np.ptp(rgb, axis=2) <= 7
        alpha[neutral & (rgb[:, :, 0] <= 57)] = 0
    elif name.startswith("priest"):
        alpha = magic_alpha(rgb)
    scale = BODY_HEIGHT / source_height
    files = []
    for i, ((anchor_x, anchor_y), outline) in enumerate(poses, 1):
        if outline is None:
            frame = first
        else:
            region = Image.new("L", source.size)
            ImageDraw.Draw(region).polygon(outline, fill=255)
            bounds = region.getbbox()
            x, y, right, bottom = bounds
            mask = np.asarray(region)[y:bottom, x:right]
            rgba = np.dstack([rgb[y:bottom, x:right], np.minimum(alpha[y:bottom, x:right], mask)])
            piece = Image.fromarray(rgba).resize(
                (round((right - x) * scale), round((bottom - y) * scale)), Image.Resampling.BOX
            )
            dx = FRAME_SIZE[0] // 2 + round((x - anchor_x) * scale)
            dy = FRAME_BASE + round((y - anchor_y) * scale)
            left, top, end_x, end_y = piece.getbbox()
            if not (0 < dx + left and dx + end_x < FRAME_SIZE[0] and
                    0 < dy + top and dy + end_y < FRAME_SIZE[1]):
                raise ValueError(f"{name}: кадр {i} выходит за канву")
            frame = Image.new("RGBA", FRAME_SIZE)
            frame.paste(piece, (dx, dy))
        if i == 1:
            first = frame
            if name in ("warrior", "ranger", "priest"):
                frame.save(os.path.join(OUT, name + ".png"))
                manifest["sprites"][name] = dict(zip(("w", "h"), FRAME_SIZE))
        if name == "priest-cast" and i == 4:
            save_priest_release(frame)
        f = f"{name}-f{i}.png"
        frame.save(os.path.join(OUT, f))
        files.append(f)
    manifest["frames"][name] = files
    print(f"{name}: {len(files)} кадров, опора y={FRAME_BASE}")
    if name == "priest-cast":
        save_fireball_effects(rgb, alpha)

save_ranger_skills()


def fill_warrior_pinholes(sprite):
    # Закрываем мелкие внутренние дефекты маски. Просветы в силуэте
    # между конечностями остаются частью позы.
    pixels = np.array(sprite)
    labels, _ = label_runs(pixels[:, :, 3] < 150)
    counts = np.bincount(labels.ravel())
    border = np.unique(np.r_[labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    holes = (labels > 0) & (counts[labels] <= 3) & ~np.isin(labels, border)
    for y, x in zip(*np.nonzero(holes)):
        window = pixels[y - 1:y + 2, x - 1:x + 2]
        opaque = window[window[:, :, 3] >= 150]
        if opaque.size:
            pixels[y, x, :3] = np.median(opaque[:, :3], axis=0)
            pixels[y, x, 3] = 255
    return Image.fromarray(pixels)


def warrior_limb(source, outline, start, end):
    mask = Image.new("L", source.size)
    ImageDraw.Draw(mask).polygon(outline, fill=255)
    cut = Image.new("RGBA", source.size)
    cut.paste(source, mask=mask)
    x, y = start
    angle = math.atan2(end[1] - y, end[0] - x)
    sin, cos = math.sin(angle), math.cos(angle)
    # Накладываем руку в горизонтальной системе координат с опорой (3, 6).
    return cut.transform((18, 12), Image.Transform.AFFINE,
                         (cos, -sin, x - 3 * cos + 6 * sin,
                          sin, cos, y - 3 * sin - 6 * cos),
                         Image.Resampling.BICUBIC)


def save_warrior_rig():
    # Выделяем части руки из оригинальных кадров, сохраняя свет и тени спрайта.
    source = Image.open(os.path.join(OUT, "warrior-f3.png")).convert("RGBA")
    idle = Image.open(os.path.join(OUT, "warrior-f1.png")).convert("RGBA")
    raised = Image.open(os.path.join(OUT, "warrior-f2.png")).convert("RGBA")
    body = source.copy()
    draw = ImageDraw.Draw(body)
    clear = (0, 0, 0, 0)
    draw.polygon([(67, 65), (74, 65), (76, 69), (81, 69), (86, 71), (86, 74),
                  (83, 76), (77, 75), (72, 74), (68, 72), (66, 70)], fill=clear)
    draw.rectangle((94, 63, 116, 71), fill=clear)
    for y in range(68, 75):
        for x in range(85, 94):
            body.putpixel((x, y), source.getpixel((x, 84)))
    # Восстанавливаем скрытую под рукой кожу доспеха из позы с поднятым мечом.
    armor = Image.new("RGBA", source.size, "#3b3134")
    # Берём центральную часть нагрудника, не захватывая кисть на щите.
    texture = raised.transform(source.size, Image.Transform.AFFINE,
                               (0.42, 0, 71 - 67 * 0.42, 0, 1, 0), Image.Resampling.BILINEAR)
    armor.alpha_composite(texture)
    repair = Image.new("L", source.size)
    ImageDraw.Draw(repair).polygon([(68, 62), (76, 62), (84, 68), (85, 74),
                                    (83, 77), (72, 76), (69, 73), (68, 69), (67, 66)], fill=255)
    armor.putalpha(repair)
    armor.alpha_composite(body)
    body = fill_warrior_pinholes(armor)

    upper = warrior_limb(idle, [(65, 61), (71, 60), (74, 62), (73, 66), (70, 68),
                                (70, 73), (68, 75), (65, 72), (64, 68)], (68.5, 63.5), (66.8, 72.4))
    fore = warrior_limb(source, [(69, 68), (72, 68), (75, 69), (78, 70), (81, 70),
                                 (83, 72), (83, 74), (82, 76), (77, 75), (71, 73),
                                 (68, 71)], (70.5, 70.2), (81.5, 73))

    blade = Image.new("RGBA", (36, 11))
    draw = ImageDraw.Draw(blade)
    draw.polygon([(9, 4), (29, 3), (35, 4), (30, 7), (9, 7)], fill="#4d4f5b")
    draw.polygon([(9, 4), (29, 3), (34, 4), (28, 5), (10, 5)], fill="#d3d0ce")
    draw.line((10, 6, 29, 5), fill="#9a9da6", width=1)
    draw.line((1, 5, 7, 5), fill="#584744", width=2)
    draw.line((6, 2, 8, 8), fill="#8b7880", width=2)
    draw.point((6, 2), fill="#c4bbc3")

    for name, sprite in [("warrior-body", body), ("warrior-upper", upper), ("warrior-fore", fore), ("warrior-blade", blade)]:
        sprite.save(os.path.join(OUT, name + ".png"))
        manifest["sprites"][name] = dict(zip(("w", "h"), sprite.size))


save_warrior_rig()

# --- Циклы шага: правка ног по опорным точкам исходных спрайтов ------------------------------

WALK_FRAMES = 16
WALK_RIGS = {
    # Длина шага, высота стопы в переносе и две ноги: контур, бедро, колено, лодыжка, подошва.
    "warrior": ("warrior-body", 12, 6, [
        ([(74, 86), (86, 85), (90, 92), (90, 99), (85, 107), (93, 109), (94, 114),
          (78, 114), (78, 101), (77, 94)], (81, 87), (87, 97), (82, 107), 113),
        ([(67, 85), (77, 85), (79, 91), (75, 98), (70, 103), (65, 108), (73, 111),
          (73, 114), (58, 114), (59, 104), (62, 96)], (73, 87), (68, 99), (63, 108), 113),
    ]),
    "goblinW": ("goblinW", 9, 5, [
        ([(17, 39), (27, 39), (31, 46), (29, 51), (26, 59), (34, 60), (35, 63),
          (20, 63), (19, 56), (21, 48)], (24, 41), (26, 49), (24, 59), 64),
        ([(4, 38), (13, 38), (16, 44), (15, 50), (10, 56), (8, 60), (13, 62),
          (13, 63), (0, 63), (0, 58), (3, 49)], (9, 41), (11, 49), (5, 60), 64),
    ]),
    "goblinKing": ("goblinK", 8, 4, [
        ([(27, 44), (40, 43), (42, 48), (37, 57), (46, 59), (46, 63),
          (27, 63), (27, 56)], (34, 46), (35, 52), (32, 59), 64),
        ([(14, 46), (25, 43), (29, 49), (23, 57), (27, 61), (27, 63),
          (12, 63), (12, 56), (13, 50)], (21, 46), (19, 53), (16, 59), 64),
    ]),
    "skeletonW": ("skeletonW", 10, 5, [
        ([(17, 51), (26, 48), (28, 52), (24, 60), (25, 67), (31, 71), (31, 73),
          (17, 73), (16, 66), (17, 59)], (22, 51), (21, 59), (20, 69), 74),
        ([(3, 51), (11, 49), (16, 54), (13, 61), (8, 68), (13, 71), (13, 73),
          (1, 73), (1, 65), (2, 58)], (9, 52), (8, 59), (6, 69), 74),
    ]),
}


def stride_leg(leg, joints, stride, lift, phase, bob):
    hip, knee, ankle, floor = joints
    if phase < 0.5:
        foot_x = hip[0] + stride * (1 - 4 * phase)
        foot_lift = 0
    else:
        transfer = (phase - 0.5) * 2
        foot_x = hip[0] + stride * (-1 + 2 * (transfer * transfer * (3 - 2 * transfer)))
        foot_lift = lift * math.sin(transfer * math.pi)

    source_y = [hip[1] - 6, hip[1], knee[1], ankle[1], floor]
    target_y = np.array(source_y, dtype=float) + [bob, bob, -foot_lift * 0.47, -foot_lift, -foot_lift]
    knee_x = hip[0] + (foot_x - hip[0]) * 0.50 + 1 + foot_lift * 0.45
    shifts = [0, 0, knee_x - knee[0], foot_x - ankle[0], foot_x - ankle[0]]

    pixels = np.asarray(leg)
    y, x = np.indices((leg.height, leg.width))
    source_row = np.rint(np.interp(y, target_y, source_y)).astype(int)
    source_col = np.rint(x - np.interp(y, target_y, shifts)).astype(int)
    valid = (y >= target_y[0]) & (y < target_y[-1]) & (source_col >= 0) & (source_col < leg.width)
    posed = np.zeros_like(pixels)
    posed[valid] = pixels[source_row[valid].clip(0, leg.height - 1), source_col[valid]]
    return Image.fromarray(posed)


def save_walk_clips():
    for name, (source, stride, lift, rig) in WALK_RIGS.items():
        base = Image.open(os.path.join(OUT, source + ".png")).convert("RGBA")
        pad_x, pad_y = (0, 0) if name == "warrior" else (17, 4)
        size = (base.width + pad_x * 2, base.height + pad_y)
        torso = Image.new("RGBA", size)
        torso.alpha_composite(base, (pad_x, pad_y))
        legs = []
        for outline, hip, knee, ankle, floor in rig:
            cut = Image.new("L", size)
            ImageDraw.Draw(cut).polygon([(x + pad_x, y + pad_y) for x, y in outline], fill=255)
            leg = Image.new("RGBA", size)
            leg.paste(torso, mask=cut)
            torso.paste((0, 0, 0, 0), mask=cut)
            joints = [tuple((x + pad_x, y + pad_y)) for x, y in (hip, knee, ankle)]
            legs.append((leg, (*joints, floor + pad_y)))
        atlas = Image.new("RGBA", (size[0] * WALK_FRAMES, size[1]))
        for i in range(WALK_FRAMES):
            phase = i / WALK_FRAMES
            bob = -round(1.4 * abs(math.sin(phase * math.pi * 2)))
            frame = Image.new("RGBA", size)
            for side, (leg, joints) in enumerate(legs):
                frame.alpha_composite(stride_leg(leg, joints, stride, lift, (phase + side * 0.5) % 1, bob))
            frame.alpha_composite(torso, (0, bob))
            if name == "warrior":
                frame = fill_warrior_pinholes(frame)
            atlas.alpha_composite(frame, (i * size[0], 0))
        atlas.save(os.path.join(OUT, name + "-walk.png"))


save_walk_clips()

# --- Падение монстров: опора по корпусу после выпуска оружия ---------------------------------

FALL_FRAMES = 12


def falling_body(source, armed):
    body = Image.open(os.path.join(OUT, source + "-body.png")).convert("RGBA")
    # Маска лука проходит вдоль пояса лучника. Возвращаем пояс и ноги из
    # оригинала, сохраняя отсечёнными древко и тетиву по бокам.
    if source == "goblinA":
        body.alpha_composite(armed.crop((12, 44, 26, 48)), (12, 44))
        body.alpha_composite(armed.crop((0, 48, armed.width, armed.height)), (0, 48))
    if source == "goblinW":
        body.alpha_composite(armed.crop((0, 22, 30, 44)), (0, 22))
    pixels = np.array(body)
    labels, _ = label_runs(pixels[:, :, 3] >= 96)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    pixels[labels != counts.argmax(), 3] = 0
    return Image.fromarray(pixels)


def landing_angle(points, height, direction):
    x, y = points
    # Подбираем наклон с опорой плеча и корпуса, иначе одна выступающая
    # точка (нос, локоть или край капюшона) оставит туловище над полом.
    zones = [(y >= height * lo) & (y < height * hi) for lo, hi in ((0.29, 0.46), (0.46, 0.66), (0.66, 0.82))]

    def gap(degrees):
        angle = math.radians(degrees * direction)
        levels = x * math.sin(angle) + y * math.cos(angle)
        lowest = levels.max()
        return sum(weight * (lowest - levels[zone].max()) for weight, zone in zip((1.3, 1.6, 0.5), zones)) + abs(degrees - 90) * 0.11

    return math.radians(min(range(70, 112), key=gap) * direction)


def save_fall_clips():
    for name in ("goblinW", "goblinA", "skeletonW", "skeletonA", "skeletonM", "lich"):
        armed = Image.open(os.path.join(OUT, name + ".png")).convert("RGBA")
        body = falling_body(name, armed)
        w, h = body.size
        tile_w, tile_h = w + h * 2, w + h
        center, floor = tile_w / 2, tile_h - 2
        y, x = np.nonzero(np.asarray(body.getchannel("A")) >= 96)
        local_x, local_y = x + 0.5 - w / 2, y + 0.5 - h
        atlas = Image.new("RGBA", (tile_w * FALL_FRAMES, tile_h * 2))
        for row, direction in enumerate((-1, 1)):
            target = landing_angle((x + 0.5, y + 0.5), h, direction)
            for i in range(FALL_FRAMES):
                t = i / (FALL_FRAMES - 1)
                angle, depth = target * (t ** 1.25), 1 - 0.19 * t
                sin, cos = math.sin(angle), math.cos(angle)
                support = (local_x * sin + local_y * cos).max() + (abs(sin) + abs(cos)) / 2
                move_y = support - floor / depth
                frame = Image.blend(armed, body, min(1, t * 4)).transform(
                    (tile_w, tile_h), Image.Transform.AFFINE,
                    (cos, sin / depth, w / 2 - center * cos + move_y * sin,
                     -sin, cos / depth, h + center * sin + move_y * cos),
                    Image.Resampling.NEAREST
                )
                frame.paste((0, 0, 0, 0), (0, floor, tile_w, tile_h))
                atlas.alpha_composite(frame, (i * tile_w, row * tile_h))
        atlas.save(os.path.join(OUT, name + "-fall.png"))


save_fall_clips()

# --- Метки легенды карты ----------------------------------------------------------------------


def save_map_icons():
    skull = Image.new("RGBA", (14, 14))
    draw = ImageDraw.Draw(skull)
    draw.polygon([(4, 1), (10, 1), (12, 3), (13, 7), (12, 9), (10, 9),
                  (10, 12), (4, 12), (4, 9), (2, 9), (1, 7), (2, 3)], fill="#e75860")
    draw.line([(3, 4), (5, 2), (9, 2)], fill="#ff9a91", width=1)
    draw.rectangle((3, 5, 5, 7), fill="#3d202c")
    draw.rectangle((8, 5, 10, 7), fill="#3d202c")
    draw.point((7, 8), fill="#622230")
    draw.line((6, 11, 6, 12), fill="#672637")
    draw.line((8, 11, 8, 12), fill="#672637")
    skull.save(os.path.join(OUT, "map-boss.png"))

    cup = Image.new("RGBA", (14, 14))
    draw = ImageDraw.Draw(cup)
    draw.line([(3, 4), (1, 4), (1, 6), (4, 8)], fill="#daa459")
    draw.line([(10, 4), (12, 4), (12, 6), (9, 8)], fill="#daa459")
    draw.polygon([(3, 2), (10, 2), (10, 6), (8, 9), (7, 9), (7, 11),
                  (10, 11), (10, 12), (3, 12), (3, 11), (6, 11), (6, 9), (5, 9), (3, 6)], fill="#edb765")
    draw.line([(4, 3), (9, 3)], fill="#fff2b6")
    draw.line([(4, 5), (5, 7)], fill="#ffdc83")
    cup.save(os.path.join(OUT, "map-chest.png"))


save_map_icons()

# --- Пиксельные иконки навыков и красный прицел -----------------------------------------------


def save_skill_icons():
    outline = "#211a29"
    icons = {
        "powerStrike": [
            (outline, [(2, 11), (4, 9), (5, 10), (10, 3), (15, 1), (13, 7), (7, 12),
                       (7, 14), (5, 15), (4, 13), (2, 15), (0, 13)]),
            ("#a77c6a", [(5, 10), (11, 3), (14, 2), (13, 6), (7, 12)]),
            ("#fff0c7", [(6, 10), (12, 3), (14, 2), (12, 5), (7, 11)]),
            ("#cf8549", [(2, 11), (4, 10), (8, 13), (6, 14)]),
            ("#7876a0", [(1, 13), (3, 11), (5, 13), (3, 15)]),
        ],
        "block": [
            (outline, [(1, 3), (7, 1), (14, 3), (14, 9), (12, 12), (8, 15), (4, 13), (1, 9)]),
            ("#9f653f", [(2, 4), (8, 2), (13, 4), (13, 9), (11, 12), (8, 14), (5, 12), (2, 9)]),
            ("#ffe1a3", [(2, 4), (8, 2), (13, 4), (12, 5), (8, 4), (3, 6), (3, 9), (2, 9)]),
            ("#556888", [(4, 6), (8, 4), (11, 6), (11, 9), (8, 12), (4, 9)]),
            ("#a1bad1", [(8, 5), (10, 7), (8, 11), (7, 8)]),
        ],
        "fireball": [
            (outline, [(0, 2), (9, 4), (12, 3), (15, 6), (15, 12), (12, 15), (6, 14),
                       (2, 11), (4, 10), (0, 7), (4, 6)]),
            ("#c94037", [(1, 3), (10, 5), (12, 4), (14, 6), (14, 12), (12, 14), (7, 13), (3, 11), (6, 10), (1, 7), (6, 7)]),
            ("#ff914a", [(4, 5), (9, 7), (12, 5), (14, 8), (12, 13), (8, 13), (5, 11), (7, 10), (4, 8), (8, 9)]),
            ("#ffe597", [(8, 9), (10, 7), (13, 8), (13, 11), (11, 13), (8, 12)]),
            ("#fff8d5", [(10, 9), (12, 9), (12, 11), (10, 11)]),
        ],
        "heal": [
            (outline, [(5, 0), (10, 0), (10, 5), (15, 5), (15, 10), (10, 10), (10, 15),
                       (5, 15), (5, 10), (0, 10), (0, 5), (5, 5)]),
            ("#4e9b73", [(6, 1), (9, 1), (9, 6), (14, 6), (14, 9), (9, 9), (9, 14),
                         (6, 14), (6, 9), (1, 9), (1, 6), (6, 6)]),
            ("#a6e7a8", [(6, 2), (8, 2), (8, 6), (13, 6), (13, 8), (8, 8), (8, 13),
                         (6, 13), (6, 8), (2, 8), (2, 6), (6, 6)]),
            ("#fff3ce", [(6, 5), (8, 5), (8, 6), (10, 6), (10, 7), (8, 7), (8, 9),
                         (7, 9), (7, 7), (5, 7), (5, 6), (6, 6)]),
        ],
        "multishot": [
            (outline, [(0, 7), (10, 0), (15, 0), (15, 4), (13, 5), (15, 5),
                       (15, 10), (13, 10), (15, 12), (15, 15), (10, 15), (0, 10)]),
            ("#77b77e", [(1, 8), (10, 2), (9, 1), (14, 1), (13, 5), (12, 4), (2, 9)]),
            ("#9fda87", [(1, 8), (11, 7), (10, 6), (15, 8), (10, 10), (11, 9), (1, 10)]),
            ("#77b77e", [(1, 9), (12, 12), (13, 11), (14, 14), (9, 14), (10, 13), (1, 10)]),
            ("#ecfac7", [(3, 8), (12, 2), (13, 2), (4, 8)]),
            ("#ecfac7", [(2, 8), (13, 8), (10, 9), (2, 9)]),
        ],
        "preciseShot": [
            (outline, [(0, 5), (3, 1), (10, 1), (13, 4), (14, 5), (15, 8), (13, 12), (10, 14),
                       (3, 14), (0, 10)]),
            ("#528ec0", [(1, 5), (4, 2), (9, 2), (12, 5), (12, 10), (9, 13), (4, 13), (1, 10)]),
            (outline, [(3, 6), (5, 4), (8, 4), (10, 6), (10, 9), (8, 11), (5, 11), (3, 9)]),
            ("#93e0ef", [(1, 7), (12, 7), (11, 5), (15, 7), (15, 8), (11, 10), (12, 8), (1, 8)]),
            ("#fff7db", [(6, 5), (7, 5), (7, 10), (6, 10)]),
        ],
        "potion": [
            (outline, [(5, 0), (10, 0), (11, 1), (11, 4), (10, 5), (10, 6), (14, 9),
                       (14, 13), (12, 15), (3, 15), (1, 13), (1, 9), (5, 6), (5, 5), (4, 4), (4, 1)]),
            ("#ad6c4f", [(5, 1), (10, 1), (10, 4), (5, 4)]),
            ("#f6c08f", [(5, 1), (8, 1), (8, 2), (5, 2)]),
            ("#e3b5b7", [(6, 4), (9, 4), (9, 7), (12, 9), (13, 12), (11, 14),
                         (4, 14), (2, 12), (3, 9), (6, 7)]),
            ("#ad2946", [(3, 10), (7, 8), (12, 10), (12, 12), (10, 14), (5, 14), (3, 12)]),
            ("#ee4d53", [(3, 10), (6, 9), (9, 10), (9, 12), (7, 13), (4, 12)]),
            ("#ffe0ca", [(4, 9), (5, 9), (5, 11), (4, 11)]),
        ],
    }
    for skill, layers in icons.items():
        sprite = Image.new("RGBA", (16, 16))
        paint = ImageDraw.Draw(sprite)
        for color, points in layers:
            paint.polygon(points, fill=color)
        sprite.save(os.path.join(OUT, f"icon-{skill}.png"))

    cursor = Image.new("RGBA", (32, 32))
    paint = ImageDraw.Draw(cursor)
    marks = [(16, 2, 16, 8), (16, 24, 16, 30), (2, 16, 8, 16), (24, 16, 30, 16)]
    for color, width in [(outline, 4), ("#ff6469", 2)]:
        paint.ellipse((6, 6, 26, 26), outline=color, width=width)
        for mark in marks:
            paint.line(mark, fill=color, width=width)
    paint.ellipse((14, 14, 18, 18), fill=outline)
    paint.point((16, 16), fill="#ffd3c3")
    cursor.save(os.path.join(OUT, "cursor-target.png"))

    fury = Image.new("RGBA", (16, 16))
    paint = ImageDraw.Draw(fury)
    paint.polygon([(1, 12), (5, 8), (8, 2), (12, 0), (11, 5), (10, 8), (15, 6),
                   (14, 11), (8, 12), (4, 15)], fill="#693fa1")
    paint.polygon([(2, 12), (8, 6), (10, 2), (10, 7), (7, 11), (5, 14)], fill="#e5c2ff")
    paint.polygon([(9, 12), (12, 8), (11, 7), (15, 6), (14, 11), (13, 10), (10, 13)], fill="#ffcb89")
    fury.save(os.path.join(OUT, "status-bone-fury.png"))


save_skill_icons()


def save_menu_icons():
    gold = "#ffe0a2"
    light = "#fff4da"

    def save(icon, name):
        icon.resize((32, 32), Image.Resampling.NEAREST).save(os.path.join(OUT, f"menu-{name}.png"))

    sword = [(12, 1), (15, 0), (14, 3), (7, 10), (9, 12), (8, 13),
             (5, 11), (2, 15), (0, 13), (4, 9), (2, 7), (3, 6), (5, 8)]
    crossed = Image.new("RGBA", (16, 16))
    draw = ImageDraw.Draw(crossed)
    draw.polygon([(15 - x, y) for x, y in sword], fill="#caaa79")
    draw.polygon(sword, fill=gold)
    draw.line((5, 8, 12, 1), fill=light)
    draw.line((3, 1, 6, 4), fill=gold)
    save(crossed, "new")

    book = Image.new("RGBA", (16, 16))
    draw = ImageDraw.Draw(book)
    draw.polygon([(7, 3), (4, 1), (0, 1), (0, 12), (4, 12), (7, 14), (8, 14),
                  (11, 12), (15, 12), (15, 1), (11, 1), (8, 3)], fill=gold)
    draw.line((7, 4, 7, 12), fill="#81603b")
    draw.line([(2, 5), (4, 5), (5, 6)], fill="#74583b")
    draw.line([(2, 8), (4, 8), (5, 9)], fill="#74583b")
    draw.polygon([(10, 3), (13, 2), (13, 8), (12, 6), (10, 8)], fill="#a8553c")
    save(book, "continue")

    gear = Image.new("RGBA", (16, 16))
    draw = ImageDraw.Draw(gear)
    draw.polygon([(6, 0), (9, 0), (9, 2), (11, 3), (13, 1), (14, 3), (12, 5),
                  (13, 6), (15, 6), (15, 9), (13, 9), (12, 11), (14, 13), (12, 14),
                  (10, 12), (9, 13), (9, 15), (6, 15), (6, 13), (4, 12), (2, 14),
                  (1, 12), (3, 10), (2, 9), (0, 9), (0, 6), (2, 6), (3, 4), (1, 2),
                  (3, 1), (5, 3), (6, 2)], fill=gold)
    draw.ellipse((5, 5, 10, 10), fill=(0, 0, 0, 0))
    draw.arc((3, 3, 12, 12), 190, 315, fill=light, width=1)
    save(gear, "settings")


save_menu_icons()

# --- Предметы: сундук анфас с общей опорой для обеих поз и монета ----------------------------


def save_chest(opened):
    im = Image.new("RGBA", (68, 53))
    d = ImageDraw.Draw(im)
    edge = "#1e1319"
    gold, light, shade = "#b1773b", "#eeb873", "#65412f"

    if opened:
        d.polygon([(6, 30), (7, 10), (12, 5), (56, 5), (61, 10), (62, 30)], fill=edge)
        d.polygon([(9, 28), (10, 11), (14, 8), (54, 8), (58, 11), (59, 28)], fill=shade)
        d.rectangle((14, 11, 54, 24), fill="#382126")
        d.line([(12, 26), (12, 13), (16, 10), (52, 10), (56, 13), (56, 26)], fill=gold, width=2)
        d.polygon([(9, 30), (16, 23), (52, 23), (59, 30), (58, 35), (10, 35)], fill="#301c22")
        for x, y in [(17, 28), (22, 31), (26, 27), (30, 31), (36, 26), (40, 31), (46, 28), (51, 31)]:
            d.ellipse((x, y, x + 6, y + 3), fill="#d99448", outline="#ffcd70")
        d.polygon([(32, 28), (35, 21), (38, 28), (35, 31)], fill="#f6ca71")
    else:
        d.polygon([(5, 34), (5, 25), (10, 19), (15, 17), (53, 17), (58, 19), (63, 25), (63, 34)], fill=edge)
        d.polygon([(8, 31), (8, 26), (12, 22), (16, 20), (52, 20), (56, 22), (60, 26), (60, 31)], fill="#79412c")
        d.line([(13, 22), (55, 22)], fill="#c47e48", width=2)
        d.line([(10, 27), (58, 27)], fill="#9e5c37", width=2)
        for x in (13, 51):
            d.polygon([(x, 21), (x + 4, 19), (x + 6, 26), (x + 6, 32), (x, 32)], fill=gold)
            d.line([(x + 1, 22), (x + 1, 29)], fill=light)

    d.rounded_rectangle((5, 31, 62, 52), radius=3, fill=edge)
    d.rectangle((8, 32, 59, 49), fill="#74402e")
    d.line([(9, 34), (58, 34)], fill="#bd7747", width=2)
    d.line([(9, 40), (58, 40)], fill="#5b2c29", width=2)
    d.line([(9, 46), (58, 46)], fill="#9d5b39")
    d.line([(10, 49), (57, 49)], fill="#48262a", width=2)
    for x in (11, 51):
        d.rectangle((x, 32, x + 5, 49), fill=shade)
        d.rectangle((x, 32, x + 3, 48), fill=gold)
        d.point((x + 1, 35), fill=light)
        d.point((x + 1, 46), fill=light)
    d.rectangle((30, 31, 37, 40), fill=edge)
    d.rectangle((31, 32, 36, 38), fill=gold)
    d.point((32, 33), fill=light)
    d.rectangle((33, 35, 34, 37), fill=edge)

    name = "chest-open" if opened else "chest-closed"
    im.save(os.path.join(OUT, name + ".png"))
    manifest["sprites"][name] = dict(zip(("w", "h"), im.size))


def slice_items():
    save_chest(False)
    save_chest(True)
    fn = os.path.join(SPR, "coin-v1.jpg")
    if os.path.exists(fn):
        rgba = cutout(np.asarray(Image.open(fn).convert("RGB")))
        Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "coin.png"))
        print(f"coin: {rgba.shape[1]}x{rgba.shape[0]}")


slice_items()

# --- Фоны: замер линии пола, масштаб и кроп 1280x720 с полом на FLOOR_OUT -------------------

ROOM_BG = [1, 2, 3, 4, 5, 6, 6]  # комната -> слайд: 1 вход, 2-5 боевые, 6 босс, 7 сундук (арена)
bg_floor = {}
for i in range(1, 7):
    im = np.asarray(Image.open(os.path.join(BG, f"S{i}.jpg")).convert("RGB")).astype(int)
    H, W = im.shape[:2]
    prof = im.mean(axis=(1, 2))
    ybest, dbest = None, 0
    for y in range(int(H * 0.62), int(H * 0.88)):
        d = abs(prof[y + 4] - prof[y - 4])
        if d > dbest:
            dbest, ybest = d, y
    bg_floor[i] = ybest

for room, slide in enumerate(ROOM_BG, start=1):
    im = Image.open(os.path.join(BG, f"S{slide}.jpg")).convert("RGB")
    W, H = im.size
    f = bg_floor[slide]
    s = max(CANVAS_H / H, FLOOR_OUT / f, CANVAS_W / W)
    nw, nh = round(W * s), round(H * s)
    top = round(f * s) - FLOOR_OUT
    left = (nw - CANVAS_W) // 2
    im = im.resize((nw, nh), Image.LANCZOS)
    im = im.crop((left, top, left + CANVAS_W, top + CANVAS_H))
    fn = f"room{room}.jpg"
    im.save(os.path.join(OUT, fn), quality=88)
    manifest["bgs"][str(room)] = fn
    print(f"room{room} <- S{slide}: пол y={f}/{H} ({f / H:.0%}), масштаб {s:.3f}")

for room, light in [(8, 0.91), (9, 0.83), (10, 0.74), (11, 0.86), (12, 0.87)]:
    source = {11: "crypt-altar.png", 12: "crypt-ossuary.png"}.get(room, "crypt.png")
    src = Image.open(os.path.join(BG, source)).convert("RGB")
    im = src.resize((CANVAS_W, CANVAS_H), Image.Resampling.LANCZOS)
    if room == 9:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im = ImageEnhance.Brightness(im).enhance(light)
    fn = f"room{room}.jpg"
    im.save(os.path.join(OUT, fn), quality=89)
    manifest["bgs"][str(room)] = fn

with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fp:
    json.dump(manifest, fp, ensure_ascii=False, indent=1)
print("manifest.json записан; FLOOR =", FLOOR_OUT)
