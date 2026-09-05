"""Penggambar tekstur untuk build "detailed".

Bedanya dengan gen_textures.py bukan cuma jumlah slot. Di sini rambut adalah
cangkang yang bagian depannya DIPOTONG jadi poni — lubang itu yang bikin wajah
kelihatan di baliknya — dan wajah bukan satu gambar melainkan delapan, digambar
di petak terpisah dan dipilih render controller saat main.

Ada dua perawakan. Yang membedakan bukan hanya potongan bajunya: mata perawakan
"male" lebih pendek dan sudutnya lebih tajam, alisnya lebih tebal dan lebih
datar, dan rona pipinya jauh lebih tipis. Tiga hal itu yang bikin wajah terbaca
berbeda; potongan baju hanya menegaskan.

Semua koordinat pecahan 0..1 di dalam satu sisi kubus, sama seperti gen_textures,
jadi resolusi boleh diubah tanpa menyentuh satu angka pun di berkas ini.
"""

from paint import faces_of, hexc, mix, scale
from uvmap import RES

# Urutan ini yang dipakai render controller sebagai indeks; jangan diacak.
FACES = ("neutral", "blink", "smile", "happy", "surprised", "hurt", "sleepy", "sing")

WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)

# --- palet perlengkapan role ------------------------------------------------
# Sengaja TIDAK diambil dari palet karakter. Di server, topi jerami harus
# terbaca sebagai "ini yang bertani" dari jarak jauh, siapa pun yang memakainya;
# kalau warnanya ikut karakter, penanda itu hilang.
STRAW = (216, 178, 96, 255)
STRAW_L = (240, 210, 138, 255)
STRAW_D = (148, 116, 52, 255)
STRAW_BAND = (156, 62, 54, 255)
HELM = (232, 172, 34, 255)
HELM_L = (255, 208, 88, 255)
HELM_D = (158, 110, 12, 255)
LENS = (255, 250, 202, 255)
METAL = (170, 176, 188, 255)
METAL_D = (96, 102, 114, 255)
LEATHER = (124, 84, 48, 255)
LEATHER_L = (158, 112, 68, 255)
LEATHER_D = (76, 48, 26, 255)
CANVAS = (98, 108, 80, 255)
CANVAS_D = (62, 70, 50, 255)


def _p(pal, key, fallback):
    """Ambil warna dari palet, mundur ke kunci lain kalau belum ada."""
    return hexc(pal.get(key, pal[fallback]))


def _thick(fraction, size):
    """Tebal garis dalam piksel, dari pecahan tinggi/lebar sisi."""
    return max(1, int(round(fraction * size)))


def _figure(ch):
    return ch["style"].get("figure", "female")


# --- helai rambut ----------------------------------------------------------

def strands(f, root, tip, seed, density=0.55):
    """Helai vertikal: gradasi akar->ujung plus garis pemisah antar helai."""
    f.grad(root, tip)
    n = max(3, f.w // (RES // 2))
    for i in range(n):
        x0, x1 = i / n, (i + 1) / n
        k = ((i * 37 + seed * 11) % 5 - 2) * 0.08
        for iy in range(f.h):
            t = iy / max(1, f.h - 1)
            base = mix(root, tip, t)
            c = mix(base, WHITE if k > 0 else BLACK, abs(k) * 0.55)
            for ix in f._range(x0, x1, f.w):
                f._put(ix, iy, c)
        if i % 3 == 1:
            f.vline(x1 - 0.5 / f.w, 0.0, 1.0, scale(root, 0.82))


def hair_part(px, slot, size, pal, rng, root=None, tip=None, gloss=False):
    root = root or hexc(pal["hair_root"])
    tip = tip or hexc(pal["hair"])
    fs = faces_of(px, slot, size, rng)
    for name, f in fs.items():
        if name == "up":
            strands(f, mix(tip, hexc(pal["hair_light"]), 0.35), root, 3)
        elif name == "down":
            f.fill(scale(root, 0.72))
        else:
            strands(f, root, tip, {"north": 5, "south": 7, "east": 11, "west": 13}[name])
        if gloss and name in ("north", "south", "east", "west"):
            for ix in range(f.w):
                if (ix // max(1, RES // 3)) % 3 == 2:
                    continue
                for iy in f._range(0.28, 0.38, f.h):
                    cur = f.px[f.x + ix, f.y + iy]
                    if cur[3]:
                        f.px[f.x + ix, f.y + iy] = mix(cur, hexc(pal["hair_light"]), 0.5)
    return fs


# --- wajah -----------------------------------------------------------------

# Kotak satu mata (yang kiri dilihat dari depan) sebagai pecahan sisi kepala.
# Perawakan male memakai kotak yang lebih pendek: itulah satu-satunya perubahan
# yang benar-benar mengubah kesan umur dan jenis kelamin wajahnya.
EYE = {
    "female": {"x0": 0.116, "x1": 0.404, "y0": 0.428, "y1": 0.702, "lash": 0.030,
               "brow_h": 0.022, "brow_y": 0.366, "mouth_y": 0.762, "blush": 1.0},
    # Mata male lebih pendek dan sudut luarnya lebih naik, tapi TIDAK lebih
    # rendah di wajah: menurunkannya bikin dahi terbaca terlalu tinggi di kepala
    # sekotak ini.
    "male": {"x0": 0.100, "x1": 0.406, "y0": 0.446, "y1": 0.664, "lash": 0.040,
             "brow_h": 0.024, "brow_y": 0.374, "mouth_y": 0.760, "blush": 0.30},
}


def _eye_box(side, geo):
    """Kotak satu mata; sisi 1 adalah cerminan sisi 0."""
    if side == 0:
        return geo["x0"], geo["x1"]
    return 1.0 - geo["x1"], 1.0 - geo["x0"]


def draw_eye(f, side, shape, pal, geo):
    lash = hexc(pal["lash"])
    soft = mix(lash, hexc(pal["skin_shade"]), 0.55)
    iris, iris_d, iris_l = hexc(pal["eye"]), hexc(pal["eye_dark"]), hexc(pal["eye_light"])
    pupil = scale(iris_d, 0.32)
    white = (252, 250, 246, 255)
    x0, x1 = _eye_box(side, geo)
    y0, y1 = geo["y0"], geo["y1"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    lash_h = geo["lash"]

    if shape in ("closed", "arc", "squeeze"):
        # Lengkung bulu mata. Tiga bentuk berbagi kode karena bedanya cuma arah
        # lengkungnya: ke atas untuk senyum, ke bawah saat dipejamkan kuat.
        bend = -0.58 if shape == "arc" else (0.56 if shape == "squeeze" else 0.0)
        t = lash_h * 0.62
        for i in range(21):
            u = i / 20 * 2 - 1
            curve = bend * (1 - u * u) * h
            x = x0 + (i / 20) * w
            f.box(x - t, cy + curve - t, x + t, cy + curve + t, lash)
        # sudut luar sedikit menebal, supaya lengkungnya tidak terbaca sebagai garis
        outer = x0 - 0.010 if side == 0 else x1 - 0.026
        f.box(outer, cy - lash_h * 1.6, outer + 0.036, cy - lash_h * 0.2, lash)
        if shape != "squeeze":
            f.box(x0 + 0.03, cy + 0.070, x1 - 0.03, cy + 0.086, soft)
        return

    # Kelopak turun untuk "half", mata melebar untuk "wide". Kelopaknya sengaja
    # turun sedikit saja: begitu iris ikut terpotong, semua ekspresi jadi terbaca
    # mengantuk — itu yang salah di versi sebelumnya.
    drop = 0.055 if shape == "half" else 0.0
    top = y0 + drop
    bot = y1 + (0.030 if shape == "wide" else 0.0)
    ch = bot - top

    f.ellipse(cx, (top + bot) / 2 + 0.006, w * 0.50, ch / 2, white)

    irx = w * 0.415
    iry = (ch - lash_h) * 0.50
    icy = top + lash_h + iry * 0.94
    f.ellipse(cx, icy, irx, iry, iris_d)                       # cincin luar
    f.ellipse(cx, icy, irx * 0.84, iry * 0.86, iris)           # iris
    f.ellipse(cx, icy + iry * 0.44, irx * 0.70, iry * 0.42, iris_l)   # pantulan bawah
    f.ellipse(cx, icy - iry * 0.04, irx * 0.34, iry * 0.54, pupil)    # pupil
    f.box(cx - irx * 0.88, icy - iry * 0.74, cx - irx * 0.32, icy - iry * 0.16, white)
    f.box(cx + irx * 0.30, icy + iry * 0.22, cx + irx * 0.62, icy + iry * 0.52,
          mix(white, iris_l, 0.35))

    if shape == "half":
        skin = hexc(pal["skin"])
        f.box(x0 - 0.014, y0 - 0.020, x1 + 0.014, top - 0.004, skin)
        f.box(x0 - 0.014, top - 0.014, x1 + 0.014, top + 0.006,
              mix(skin, hexc(pal["skin_shade"]), 0.6))

    # bulu mata atas: satu garis tipis, plus baji di sudut luar
    f.box(x0, top, x1, top + lash_h, lash)
    outer = x0 - 0.020 if side == 0 else x1 - 0.028
    f.box(outer, top + 0.010, outer + 0.048, top + lash_h + 0.038, lash)
    # garis kelopak bawah: sangat tipis, kalau tebal mata langsung jadi sipit
    f.box(x0 + 0.044, bot - 0.024, x1 - 0.044, bot - 0.008, soft)


def draw_brow(f, side, shape, pal, geo):
    x0, x1 = _eye_box(side, geo)
    y = geo["brow_y"]
    thick = geo["brow_h"]
    color = mix(hexc(pal["hair_dark"]), hexc(pal["lash"]), 0.62)
    tilt = {"raised": -0.050, "worried": 0.058, "happy": -0.024, "flat": 0.0}[shape]
    if shape == "flat" and geo["blush"] < 0.5:
        tilt = -0.014                    # perawakan male: sedikit naik ke luar
    inner, outer = (x1 - 0.04, x0 + 0.01) if side == 0 else (x0 + 0.04, x1 - 0.01)
    n = 12
    for i in range(n + 1):
        t = i / n
        x = outer + (inner - outer) * t
        yy = y + tilt * t
        # alis menipis ke arah dalam, seperti alis sungguhan
        tp = thick * (1.0 - 0.35 * t)
        f.box(x - 0.016, yy, x + 0.016, yy + tp, color)


def draw_mouth(f, shape, pal, geo):
    cx = 0.5
    my = geo["mouth_y"]
    # Bibirnya sengaja tidak digelapkan sampai mendekati warna bulu mata: mulut
    # sekecil ini kalau terlalu gelap terbaca sebagai lubang, bukan mulut.
    lip = mix(hexc(pal["blush"]), hexc(pal["lash"]), 0.22)
    line = mix(lip, hexc(pal["lash"]), 0.35)
    inner = scale(line, 0.66)
    tongue = mix(hexc(pal["blush"]), WHITE, 0.18)

    def arc(half, depth, color, t=0.032):
        for i in range(15):
            u = (i / 14 - 0.5) * 2
            f.box(cx + u * half - t, my + (1 - u * u) * depth,
                  cx + u * half + t, my + (1 - u * u) * depth + t * 1.9, color)

    if shape == "neutral":
        f.box(cx - 0.058, my + 0.014, cx + 0.058, my + 0.040, line)
        f.box(cx - 0.030, my + 0.038, cx + 0.030, my + 0.062, lip)
    elif shape == "small":
        f.box(cx - 0.040, my + 0.020, cx + 0.040, my + 0.046, line)
    elif shape == "smile":
        arc(0.096, 0.048, line, 0.030)
        f.box(cx - 0.052, my + 0.062, cx + 0.052, my + 0.080, lip)
    elif shape == "grin":
        f.ellipse(cx, my + 0.056, 0.098, 0.058, inner)
        f.ellipse(cx, my + 0.080, 0.066, 0.032, tongue)
        f.box(cx - 0.098, my + 0.012, cx + 0.098, my + 0.038, line)
    elif shape == "oh":
        f.ellipse(cx, my + 0.056, 0.054, 0.070, inner)
        f.ellipse(cx, my + 0.078, 0.032, 0.034, tongue)
    elif shape == "wave":
        for i in range(5):
            x = cx - 0.086 + i * 0.035
            y = my + 0.022 + (0.0 if i % 2 == 0 else 0.026)
            f.box(x, y, x + 0.039, y + 0.030, line)
    elif shape == "sing":
        f.ellipse(cx, my + 0.062, 0.082, 0.100, inner)
        f.ellipse(cx, my + 0.102, 0.048, 0.044, tongue)
        f.box(cx - 0.082, my - 0.006, cx + 0.082, my + 0.020, line)
    elif shape == "flat":
        f.box(cx - 0.052, my + 0.018, cx + 0.052, my + 0.038, line)
        f.box(cx - 0.026, my + 0.036, cx + 0.026, my + 0.052, lip)
    elif shape == "smirk":
        # Senyum miring: satu sudut naik. Harus pendek dan tipis — dibuat
        # selebar mulut biasa, garis miring itu langsung terbaca sebagai luka.
        for i in range(9):
            t = i / 8
            x = cx - 0.048 + t * 0.100
            y = my + 0.036 - t * 0.026
            f.box(x, y, x + 0.024, y + 0.018, line)
        f.box(cx - 0.048, my + 0.052, cx + 0.006, my + 0.066, lip)


# Ekspresi -> (bentuk mata, bentuk mulut, bentuk alis, kadar rona, air mata)
STYLES = {
    "female": {
        "neutral":   ("open", "neutral", "flat", 0.35, False),
        "blink":     ("closed", "neutral", "flat", 0.35, False),
        "smile":     ("half", "smile", "happy", 0.55, False),
        "happy":     ("arc", "grin", "happy", 0.85, False),
        "surprised": ("wide", "oh", "raised", 0.30, False),
        "hurt":      ("squeeze", "wave", "worried", 0.50, True),
        "sleepy":    ("half", "small", "worried", 0.25, False),
        "sing":      ("arc", "sing", "happy", 0.70, False),
    },
    "male": {
        "neutral":   ("open", "flat", "flat", 0.30, False),
        "blink":     ("closed", "flat", "flat", 0.30, False),
        "smile":     ("open", "smirk", "raised", 0.40, False),
        "happy":     ("arc", "grin", "happy", 0.70, False),
        "surprised": ("wide", "oh", "raised", 0.25, False),
        "hurt":      ("squeeze", "wave", "worried", 0.45, True),
        "sleepy":    ("half", "small", "flat", 0.20, False),
        "sing":      ("arc", "sing", "happy", 0.60, False),
    },
}


def draw_expression(f, name, pal, figure="female"):
    geo = EYE[figure]
    eyes, mouth, brows, blush_amt, tear = STYLES[figure][name]
    blush_amt *= geo["blush"]
    blush = hexc(pal["blush"])
    skin = hexc(pal["skin"])

    if blush_amt > 0.02:
        soft = mix(skin, blush, 0.42 * blush_amt + 0.10)
        hot = mix(skin, blush, 0.62 * blush_amt + 0.14)
        for cx in (0.180, 0.820):
            f.ellipse(cx, geo["mouth_y"] - 0.046, 0.105, 0.048, soft)
            f.box(cx - 0.052, geo["mouth_y"] - 0.068, cx - 0.026, geo["mouth_y"] - 0.020, hot)
            f.box(cx + 0.010, geo["mouth_y"] - 0.068, cx + 0.036, geo["mouth_y"] - 0.020, hot)

    # Hidung: satu texel bayangan. Lebih dari itu berhenti terbaca sebagai anime.
    ny = geo["mouth_y"] - 0.094
    f.box(0.522, ny, 0.556, ny + 0.030, mix(skin, hexc(pal["skin_shade"]), 0.55))

    for side in (0, 1):
        draw_brow(f, side, brows, pal, geo)
    for side in (0, 1):
        draw_eye(f, side, eyes, pal, geo)
    draw_mouth(f, mouth, pal, geo)

    if tear:
        # Menggenang di sudut luar mata, bukan mengalir di pipi — di pipi
        # tertutup rambut samping.
        for side in (0, 1):
            x0, x1 = _eye_box(side, geo)
            x = x0 + 0.045 if side == 0 else x1 - 0.083
            y = geo["y0"] + 0.14
            f.box(x, y, x + 0.036, y + 0.082, (184, 220, 242, 255))
            f.box(x, y + 0.066, x + 0.036, y + 0.104, (124, 184, 228, 255))
            f.box(x - 0.013, y, x + 0.004, y + 0.048, WHITE)


# --- perlengkapan role ------------------------------------------------------

def paint_gear(px, pal, rng, sizes, prefix=""):
    """Topi jerami, helm penambang, lampu kening, ransel.

    Dipanggil kedua build. `prefix` "d_" untuk build detailed, "" untuk classic —
    slotnya kembar, isinya sama persis, supaya perlengkapan role kelihatan sama
    di karakter mana pun.
    """
    def slot(name):
        return f"{prefix}{name}"

    # --- topi jerami: anyaman melingkar, pita kain di pangkal mahkota -------
    if slot("hat_crown") in sizes:
        cf = faces_of(px, slot("hat_crown"), sizes[slot("hat_crown")], rng)
        for name, f in cf.items():
            f.grad(STRAW_L, STRAW)
            if name in ("north", "south", "east", "west"):
                for i in range(max(2, f.h // max(1, RES // 3))):     # baris anyaman
                    f.hline(i / max(2, f.h // max(1, RES // 3)), 0, 1, STRAW_D,
                            thick=_thick(0.05, f.h))
                f.box(0, 0.62, 1, 0.92, STRAW_BAND)                  # pita kain
                f.box(0, 0.62, 1, 0.70, mix(STRAW_BAND, WHITE, 0.28))
            f.edges(STRAW_D, 0.4)
        cf["up"].ellipse(0.5, 0.5, 0.30, 0.30, mix(STRAW_L, WHITE, 0.25))
        cf["down"].fill(STRAW_D)

    if slot("hat_brim") in sizes:
        bf = faces_of(px, slot("hat_brim"), sizes[slot("hat_brim")], rng)
        for name, f in bf.items():
            f.fill(STRAW if name != "down" else scale(STRAW_D, 0.85))
        up = bf["up"]
        # cincin anyaman sepusat: yang bikin tepi topi terbaca bundar walau
        # kubusnya persegi
        for i in range(6):
            r = 0.50 - i * 0.075
            up.ellipse(0.5, 0.5, r, r, STRAW_L if i % 2 == 0 else STRAW)
        up.ellipse(0.5, 0.5, 0.20, 0.20, STRAW_D)
        for name in ("north", "south", "east", "west"):
            bf[name].fill(STRAW_D)

    # --- helm penambang ----------------------------------------------------
    if slot("helm") in sizes:
        hf = faces_of(px, slot("helm"), sizes[slot("helm")], rng)
        for name, f in hf.items():
            f.grad(HELM_L, HELM)
            f.edges(HELM_D, 0.45)
        hf["up"].hline(0.46, 0.0, 1.0, HELM_D, thick=_thick(0.08, hf["up"].h))
        hf["down"].fill(scale(HELM_D, 0.7))
        n = hf["north"]
        n.box(0.0, 0.72, 1.0, 1.0, HELM_D)                # bibir depan helm
        n.box(0.34, 0.10, 0.66, 0.60, METAL)              # dudukan lampu
        n.box(0.38, 0.16, 0.62, 0.54, METAL_D)
        for name in ("east", "west"):
            hf[name].box(0.0, 0.74, 1.0, 1.0, HELM_D)

    if slot("lamp") in sizes:
        lf = faces_of(px, slot("lamp"), sizes[slot("lamp")], rng)
        for name, f in lf.items():
            f.grad(METAL, METAL_D)
            f.edges(scale(METAL_D, 0.7), 0.4)
        n = lf["north"]
        n.fill(METAL_D)
        n.ellipse(0.5, 0.5, 0.40, 0.40, LENS)
        n.ellipse(0.5, 0.5, 0.24, 0.24, WHITE)

    # --- ransel pengembara -------------------------------------------------
    if slot("pack") in sizes:
        pf = faces_of(px, slot("pack"), sizes[slot("pack")], rng)
        for name, f in pf.items():
            f.grad(CANVAS, CANVAS_D)
            f.edges(LEATHER_D, 0.5)
        s = pf["south"]                                   # sisi yang menghadap keluar
        s.box(0.06, 0.10, 0.94, 0.52, LEATHER)            # tutup kulit
        s.box(0.06, 0.46, 0.94, 0.54, LEATHER_D)
        s.box(0.42, 0.44, 0.58, 0.66, LEATHER_L)          # tali pengikat
        s.box(0.44, 0.54, 0.56, 0.60, METAL)              # gesper
        s.box(0.14, 0.70, 0.42, 0.92, LEATHER_D)          # dua saku bawah
        s.box(0.58, 0.70, 0.86, 0.92, LEATHER_D)
        pf["up"].box(0.10, 0.10, 0.90, 0.90, LEATHER)
        for name in ("east", "west"):
            pf[name].vline(0.44, 0.0, 1.0, LEATHER, thick=_thick(0.16, pf[name].w))
        pf["north"].fill(LEATHER_D)                       # menempel di punggung


# --- badan: perawakan perempuan --------------------------------------------

def _paint_female(px, ch, pal, rng, sizes):
    skin, skin_l = hexc(pal["skin"]), hexc(pal["skin_light"])
    shade = hexc(pal["skin_shade"])
    white, white_d = hexc(pal["top"]), hexc(pal["top_dark"])
    denim = _p(pal, "denim", "inner")
    denim_l = _p(pal, "denim_light", "inner")
    denim_d = _p(pal, "denim_dark", "inner_dark")
    tape = _p(pal, "tape", "blush")
    hot = hexc(pal["accent"])
    dark = hexc(pal["strap"])
    grey = _p(pal, "boot_sole", "top_dark")
    gold = hexc(pal["eye_light"])

    def cloth(fs, base, light, dark_, hem=None):
        for name, f in fs.items():
            f.grad(light, base) if name != "down" else f.fill(scale(dark_, 0.8))
            f.edges(dark_, 0.4)
        if hem is not None:
            for name in ("north", "south", "east", "west"):
                fs[name].hline(0.90, 0, 1, hem, thick=_thick(0.06, fs[name].h))

    _skin_parts(px, ch, pal, rng, sizes, ("d_ear", "d_neck", "d_hand"))

    # rambut: cangkang, volume belakang, tengkuk, jurai samping, antena, jepit
    cap = hair_part(px, "d_hair_cap", sizes["d_hair_cap"], pal, rng, gloss=True)
    _cut_bangs(cap["north"], pal)

    hair_part(px, "d_hair_back", sizes["d_hair_back"], pal, rng,
              tip=mix(hexc(pal["hair"]), hexc(pal["hair_tip"]), 0.6))
    if "d_hair_nape" in sizes:
        hair_part(px, "d_hair_nape", sizes["d_hair_nape"], pal, rng,
                  tip=hexc(pal["hair_tip"]))
    hair_part(px, "d_hair_side", sizes["d_hair_side"], pal, rng,
              root=hexc(pal["hair_light"]), tip=hexc(pal["hair_tip"]))
    if "d_ahoge" in sizes:
        hair_part(px, "d_ahoge", sizes["d_ahoge"], pal, rng,
                  root=hexc(pal["hair_light"]), tip=hexc(pal["hair_tip"]))
    if "d_tail_up" in sizes:
        hair_part(px, "d_tail_up", sizes["d_tail_up"], pal, rng, gloss=True)
        hair_part(px, "d_tail_low", sizes["d_tail_low"], pal, rng,
                  root=hexc(pal["hair"]), tip=hexc(pal["hair_tip"]))

    # jepit rambut
    if "d_clip" in sizes:
        cf = faces_of(px, "d_clip", sizes["d_clip"], rng)
        for name, f in cf.items():
            f.fill(hot)
        cf["north"].box(0.06, 0.15, 0.30, 0.85, gold)
        cf["north"].box(0.40, 0.15, 0.64, 0.85, WHITE)

    # pita ekor rambut
    if "d_ribbon" in sizes:
        rf = faces_of(px, "d_ribbon", sizes["d_ribbon"], rng)
        for name, f in rf.items():
            f.grad(hot, scale(hot, 0.72))
            f.box(0.40, 0.0, 0.60, 1.0, scale(hot, 0.6))          # simpul
            f.box(0.05, 0.10, 0.36, 0.30, mix(hot, WHITE, 0.45))
            f.box(0.64, 0.10, 0.95, 0.30, mix(hot, WHITE, 0.45))

    # kemeja putih, cuma terlihat di celah jaket dan di bawah kelim
    cloth(faces_of(px, "d_shirt", sizes["d_shirt"], rng), white,
          mix(white, WHITE, 0.35), white_d, hem=white_d)

    # jaket denim terbuka
    jf = faces_of(px, "d_jacket", sizes["d_jacket"], rng)
    cloth(jf, denim, denim_l, denim_d)
    n = jf["north"]
    n.box(0.395, 0.0, 0.605, 1.0, mix(white, denim_d, 0.12))   # kemeja di celah
    n.box(0.350, 0.0, 0.410, 1.0, denim_d)                     # plaket
    n.box(0.590, 0.0, 0.650, 1.0, denim_d)
    for x in (0.305, 0.672):                                   # jahitan
        for i in range(9):
            n.box(x, 0.04 + i * 0.105, x + 0.030, 0.10 + i * 0.105, denim_l)
    for x in (0.09, 0.73):                                     # saku dada
        n.box(x, 0.47, x + 0.17, 0.62, scale(denim, 0.90))
        n.box(x, 0.47, x + 0.17, 0.50, scale(denim_l, 0.92))

    # pita cetak melintang dada
    tf = faces_of(px, "d_tape", sizes["d_tape"], rng)
    for name, f in tf.items():
        f.grad(tape, scale(tape, 0.82))
        f.hline(0.0, 0, 1, mix(tape, WHITE, 0.65), thick=_thick(0.14, f.h))
        f.hline(0.86, 0, 1, scale(hot, 0.9), thick=_thick(0.14, f.h))
        for i in range(6):                                     # huruf-huruf samar
            f.box(0.07 + i * 0.155, 0.36, 0.13 + i * 0.155, 0.64, (154, 169, 204, 255))
    tf["north"].ellipse(0.5, 0.5, 0.075, 0.30, hot)

    # kerah kemeja + choker
    kf = faces_of(px, "d_collar", sizes["d_collar"], rng)
    for name, f in kf.items():
        f.grad(mix(white, WHITE, 0.4), white)
        f.edges(white_d, 0.4)
        f.hline(0.72, 0, 1, hot, thick=_thick(0.18, f.h))      # choker
    kf["north"].box(0.455, 0.68, 0.545, 0.92, gold)

    # celana pendek di balik rok
    sh = faces_of(px, "d_shorts", sizes["d_shorts"], rng)
    for name, f in sh.items():
        f.grad(mix(dark, WHITE, 0.12), dark)
        f.hline(0.0, 0, 1, mix(dark, WHITE, 0.30), thick=_thick(0.16, f.h))
        f.hline(0.16, 0, 1, hot, thick=_thick(0.07, f.h))

    # rok berlipat: panel depan/belakang dan panel samping
    for slot in ("d_skirt_fb", "d_skirt_side"):
        if slot not in sizes:
            continue
        kf = faces_of(px, slot, sizes[slot], rng)
        for name, f in kf.items():
            f.grad(denim_l, denim) if name != "down" else f.fill(scale(denim_d, 0.8))
            n_p = max(3, int(f.w / max(1, RES * 1.5)))
            for i in range(n_p):                               # lipatan
                f.vline(i / n_p, 0.0, 1.0, scale(denim, 0.76), thick=_thick(0.035, f.w))
            f.hline(0.80, 0, 1, white, thick=_thick(0.09, f.h))
            f.hline(0.89, 0, 1, hot, thick=_thick(0.09, f.h))
            f.edges(denim_d, 0.35)

    # lengan jaket, manset putih
    sl = faces_of(px, "d_sleeve", sizes["d_sleeve"], rng)
    cloth(sl, denim, denim_l, denim_d)
    for name in ("north", "south", "east", "west"):
        sl[name].hline(0.80, 0, 1, tape, thick=_thick(0.07, sl[name].h))
    cf2 = faces_of(px, "d_cuff", sizes["d_cuff"], rng)
    for name, f in cf2.items():
        f.grad(mix(white, WHITE, 0.4), white)
        f.hline(0.80, 0, 1, white_d, thick=_thick(0.12, f.h))
        f.edges(white_d, 0.4)

    # kaus kaki selutut
    kk = faces_of(px, "d_sock", sizes["d_sock"], rng)
    for name, f in kk.items():
        f.grad(mix(white, WHITE, 0.3), white)
        f.box(0, 0.0, 1, 0.10, dark)                           # karet atas
        f.box(0, 0.10, 1, 0.13, hot)
        f.edges(white_d, 0.45)
    kk["up"].fill(dark)          # di dalam celana pendek; gelap supaya tak bocor
    kk["down"].fill(white_d)

    # sepatu tinggi
    bf = faces_of(px, "d_boot", sizes["d_boot"], rng)
    for name, f in bf.items():
        f.grad(mix(white, WHITE, 0.3), white)
        f.box(0, 0.66, 1, 1.0, grey)                           # sol
        f.box(0, 0.58, 1, 0.66, hot)                           # garis midsole
        f.box(0, 0.0, 1, 0.18, dark)                           # kerah pergelangan
        f.edges(scale(white_d, 0.7), 0.35)
    bf["north"].box(0.30, 0.20, 0.70, 0.52, white_d)           # lidah sepatu
    bf["north"].box(0.30, 0.36, 0.70, 0.44, hot)               # tali
    for name in ("east", "west"):
        bf[name].box(0.20, 0.36, 0.76, 0.46, hot)              # garis samping
    bf["up"].fill(dark)
    bf["down"].fill(scale(grey, 0.65))


# --- badan: perawakan laki-laki --------------------------------------------

def _paint_male(px, ch, pal, rng, sizes):
    """Hoodie di dalam, jaket terbuka di luar, celana panjang, sepatu rendah."""
    skin, shade = hexc(pal["skin"]), hexc(pal["skin_shade"])
    hoodie, hoodie_l = hexc(pal["inner"]), mix(hexc(pal["inner"]), WHITE, 0.35)
    hoodie_d = hexc(pal["inner_dark"])
    coat = _p(pal, "denim", "top")
    coat_l = _p(pal, "denim_light", "top_light")
    coat_d = _p(pal, "denim_dark", "top_dark")
    sleeve, sleeve_d = hexc(pal["sleeve"]), hexc(pal["sleeve_dark"])
    tape = _p(pal, "tape", "trim")
    hot = hexc(pal["accent"])
    leg, leg_d = hexc(pal["legwear"]), hexc(pal["legwear_dark"])
    shoe, sole = hexc(pal["shoe"]), hexc(pal["shoe_sole"])
    shoe_a = hexc(pal["shoe_accent"])
    trim = hexc(pal["trim"])

    _skin_parts(px, ch, pal, rng, sizes, ("d_ear", "d_neck", "d_hand"))

    # --- rambut: cangkang dengan poni runcing ------------------------------
    cap = hair_part(px, "d_hair_cap", sizes["d_hair_cap"], pal, rng, gloss=True)
    _cut_spiky(cap["north"], pal)
    # Sisi dan belakang cangkang ikut dipotong bergerigi. Tanpa ini siluetnya
    # terbaca sebagai helm dari samping walau depannya sudah runcing — dan dari
    # samping itulah companion paling sering dilihat pemain saat mengikuti.
    for name in ("east", "west", "south"):
        cap[name].spiky_bottom(6, 0.30, jitter=0.45)
    hb = hair_part(px, "d_hair_back", sizes["d_hair_back"], pal, rng,
                   tip=mix(hexc(pal["hair"]), hexc(pal["hair_tip"]), 0.5))
    for name in ("east", "west", "south", "north"):
        hb[name].spiky_bottom(5, 0.42, jitter=0.5)
    hair_part(px, "d_hair_side", sizes["d_hair_side"], pal, rng,
              root=hexc(pal["hair_root"]), tip=hexc(pal["hair_tip"]))
    if "d_spike" in sizes:
        sp = hair_part(px, "d_spike", sizes["d_spike"], pal, rng,
                       root=hexc(pal["hair"]), tip=hexc(pal["hair_tip"]))
        # rumbai poni: ujung bawahnya digerigi tembus, dan satu helai diwarnai
        # hair_streak — itu jambul hijau kekuningan yang jadi ciri Akito
        for name in ("north", "south", "east", "west"):
            sp[name].spiky_bottom(5, 0.52, jitter=0.5)
        sp["north"].vline(0.30, 0.0, 0.55, hexc(pal["hair_streak"]),
                          thick=_thick(0.10, sp["north"].w))
    if "d_ahoge" in sizes:
        hair_part(px, "d_ahoge", sizes["d_ahoge"], pal, rng,
                  root=hexc(pal["hair"]), tip=hexc(pal["hair_tip"]))
    # satu helai berwarna lain di poni cangkang, menyambung dengan yang di rumbai
    cap["north"].vline(0.30, 0.0, 0.34, hexc(pal["hair_streak"]),
                       thick=_thick(0.055, cap["north"].w))

    # --- hoodie -------------------------------------------------------------
    sf = faces_of(px, "d_shirt", sizes["d_shirt"], rng)
    for name, f in sf.items():
        f.grad(hoodie_l, hoodie) if name != "down" else f.fill(scale(hoodie_d, 0.8))
        f.edges(hoodie_d, 0.4)
        if name in ("north", "south", "east", "west"):
            f.hline(0.90, 0, 1, hoodie_d, thick=_thick(0.07, f.h))   # kelim bawah
    sf["north"].vline(0.48, 0.10, 0.52, hoodie_d, thick=_thick(0.025, sf["north"].w))
    for x in (0.44, 0.52):                                    # tali hoodie
        sf["north"].vline(x, 0.06, 0.30, trim, thick=_thick(0.030, sf["north"].w))

    # --- jaket luar, terbuka di depan --------------------------------------
    jf = faces_of(px, "d_jacket", sizes["d_jacket"], rng)
    for name, f in jf.items():
        f.grad(coat_l, coat) if name != "down" else f.fill(scale(coat_d, 0.8))
        f.edges(coat_d, 0.45)
    n = jf["north"]
    open_w = ch["style"].get("jacket_open", 0.34)
    n.box(0.5 - open_w / 2, 0.0, 0.5 + open_w / 2, 1.0, hoodie)      # hoodie tembus
    n.box(0.5 - open_w / 2, 0.0, 0.5 + open_w / 2, 0.06, hoodie_d)
    for s in (-1, 1):                                                # tepi ritsleting
        x = 0.5 + s * open_w / 2
        n.box(x - 0.035 if s > 0 else x - 0.025, 0.0,
              x + 0.035 if s > 0 else x + 0.025, 1.0, coat_d)
    for x in (0.10, 0.74):                                           # saku miring
        n.box(x, 0.60, x + 0.16, 0.68, coat_d)
        n.box(x, 0.60, x + 0.16, 0.63, coat_l)
    jf["south"].hline(0.90, 0, 1, coat_d, thick=_thick(0.08, jf["south"].h))

    # --- pita cetak melintang dada -----------------------------------------
    tf = faces_of(px, "d_tape", sizes["d_tape"], rng)
    for name, f in tf.items():
        f.grad(tape, scale(tape, 0.78))
        f.hline(0.0, 0, 1, mix(tape, WHITE, 0.40), thick=_thick(0.18, f.h))
    for name in ("east", "west", "south"):
        tf[name].box(0.08, 0.34, 0.30, 0.66, mix(trim, WHITE, 0.35))
    tf["north"].box(0.10, 0.32, 0.34, 0.68, mix(trim, WHITE, 0.35))
    tf["north"].box(0.66, 0.32, 0.90, 0.68, hot)

    # --- kerah tegak --------------------------------------------------------
    kf = faces_of(px, "d_collar", sizes["d_collar"], rng)
    for name, f in kf.items():
        f.grad(coat_l, coat)
        f.edges(coat_d, 0.45)
    kf["south"].hline(0.55, 0, 1, hoodie, thick=_thick(0.45, kf["south"].h))
    kf["north"].box(0.42, 0.0, 0.58, 0.72, hoodie)             # tudung di celah

    # --- sabuk --------------------------------------------------------------
    if "d_belt" in sizes:
        bf = faces_of(px, "d_belt", sizes["d_belt"], rng)
        for name, f in bf.items():
            f.grad(mix(leg_d, trim, 0.20), leg_d)
        bf["north"].box(0.42, 0.10, 0.58, 0.90, trim)
        bf["north"].box(0.46, 0.28, 0.54, 0.72, scale(leg_d, 0.7))
        bf["north"].box(0.10, 0.30, 0.22, 0.70, hot)           # tali gantung pink

    # --- tudung hoodie di punggung -----------------------------------------
    if "d_hood" in sizes:
        hf = faces_of(px, "d_hood", sizes["d_hood"], rng)
        for name, f in hf.items():
            f.grad(hoodie_l, hoodie) if name != "down" else f.fill(scale(hoodie_d, 0.75))
            f.edges(hoodie_d, 0.45)
        hf["north"].grad(hoodie_d, scale(hoodie_d, 0.6))       # mulut tudung, gelap
        hf["up"].hline(0.5, 0.08, 0.92, hoodie_d, thick=_thick(0.10, hf["up"].h))
        hf["south"].box(0.42, 0.10, 0.58, 0.94, mix(hoodie, WHITE, 0.2))

    # --- lengan jaket berwarna kontras + manset ----------------------------
    sl = faces_of(px, "d_sleeve", sizes["d_sleeve"], rng)
    for name, f in sl.items():
        f.grad(mix(sleeve, WHITE, 0.16), sleeve) if name != "down" else f.fill(sleeve_d)
        f.edges(sleeve_d, 0.4)
        if name in ("north", "south", "east", "west"):
            f.hline(0.16, 0, 1, coat, thick=_thick(0.16, f.h))       # bahu jaket
            f.hline(0.30, 0, 1, tape, thick=_thick(0.05, f.h))
    cf = faces_of(px, "d_cuff", sizes["d_cuff"], rng)
    for name, f in cf.items():
        f.grad(mix(coat_d, trim, 0.20), coat_d)
        f.hline(0.15, 0, 1, mix(trim, coat_d, 0.5), thick=_thick(0.12, f.h))
        f.edges(scale(coat_d, 0.7), 0.4)

    # --- sarung tangan ------------------------------------------------------
    if "d_glove" in sizes:
        gf = faces_of(px, "d_glove", sizes["d_glove"], rng)
        for name, f in gf.items():
            f.grad(mix(leg, WHITE, 0.14), leg) if name != "down" else f.fill(leg_d)
            f.edges(leg_d, 0.45)
            if name in ("north", "south", "east", "west"):
                f.hline(0.0, 0, 1, hot, thick=_thick(0.14, f.h))     # karet lengan
        for name in ("north", "south"):
            gf[name].vline(0.33, 0.45, 1.0, leg_d, thick=_thick(0.05, gf[name].w))
            gf[name].vline(0.66, 0.45, 1.0, leg_d, thick=_thick(0.05, gf[name].w))

    # --- celana panjang -----------------------------------------------------
    pf = faces_of(px, "d_pants", sizes["d_pants"], rng)
    for name, f in pf.items():
        f.grad(mix(leg, WHITE, 0.10), leg) if name != "down" else f.fill(scale(leg_d, 0.7))
        f.edges(leg_d, 0.35)
        if name in ("north", "south", "east", "west"):
            f.hline(0.88, 0, 1, leg_d, thick=_thick(0.06, f.h))      # manset bawah
    pf["north"].hline(0.52, 0, 1, hot, thick=_thick(0.05, pf["north"].h))
    pf["north"].vline(0.62, 0.0, 0.46, hexc(pal["strap"]),
                      thick=_thick(0.07, pf["north"].w))
    pf["up"].fill(leg_d)

    # --- sepatu -------------------------------------------------------------
    hf = faces_of(px, "d_shoe", sizes["d_shoe"], rng)
    for name, f in hf.items():
        f.grad(mix(shoe, WHITE, 0.10), shoe)
        f.box(0, 0.70, 1, 1.0, sole)                                 # sol putih
        f.box(0, 0.62, 1, 0.70, shoe_a)                              # garis midsole
        f.edges(scale(shoe, 0.55), 0.35)
    n = hf["north"]
    n.box(0.28, 0.10, 0.72, 0.46, mix(shoe, WHITE, 0.25))            # lidah
    for i in range(3):                                               # tali
        n.box(0.24, 0.16 + i * 0.14, 0.76, 0.20 + i * 0.14, sole)
    hf["up"].fill(scale(shoe, 0.6))
    hf["down"].fill(scale(sole, 0.6))


# --- bagian bersama --------------------------------------------------------

def _skin_parts(px, ch, pal, rng, sizes, extra):
    """Kepala, delapan wajah, dan potongan kulit lain."""
    skin, skin_l = hexc(pal["skin"]), hexc(pal["skin_light"])
    shade = hexc(pal["skin_shade"])
    figure = _figure(ch)

    hf = faces_of(px, "d_head", sizes["d_head"], rng)
    for name, f in hf.items():
        f.grad(skin_l, skin) if name != "down" else f.fill(mix(shade, skin, 0.4))
    hf["north"].grad(skin, mix(skin, shade, 0.42), 0.86, 1.0)  # bayangan dagu
    hf["south"].grad(mix(skin, shade, 0.35), mix(skin, shade, 0.65))

    for slot in extra:
        if slot not in sizes:
            continue
        for name, f in faces_of(px, slot, sizes[slot], rng).items():
            f.grad(skin_l, skin) if name != "down" else f.fill(mix(shade, skin, 0.5))
    if "d_hand" in sizes:
        hnd = faces_of(px, "d_hand", sizes["d_hand"], rng)
        for name in ("north", "south", "east", "west"):
            f = hnd[name]
            f.vline(0.33, 0.45, 1.0, mix(skin, shade, 0.55))       # sela jari
            f.vline(0.66, 0.45, 1.0, mix(skin, shade, 0.55))

    for name in FACES:
        slot = f"d_face_{name}"
        if slot not in sizes:
            continue
        fs = faces_of(px, slot, sizes[slot], rng)
        draw_expression(fs["north"], name, pal, figure)


def _cut_bangs(front, pal):
    """Poni lurus: potong tembus bagian bawah cangkang rambut sisi depan."""
    def cut_at(u):
        c = (u - 0.5) * 2
        # Cangkang rambut lebih tinggi dari kepala (inflate), jadi 0.26 di sini
        # jatuh sedikit di atas alis; lebih dari 0.40 di pelipis mulai menutupi
        # sudut luar mata.
        depth = 0.245 + 0.085 * c * c
        if abs(c) < 0.22:
            depth += 0.055                          # belahan di tengah
        return depth + ((int(u * 8) * 53) % 7) / 7 * 0.030

    step = 1.0 / max(8, front.w // 2)
    u = 0.0
    while u < 1.0:
        d = cut_at(u)
        front.cut(u, d, u + step, 1.0)
        front.box(u, d - 0.045, u + step, d, scale(hexc(pal["hair_dark"]), 0.86))
        u += step


def _cut_spiky(front, pal):
    """Poni runcing: potongannya bergerigi, bukan mendatar.

    Gerigi inilah yang bikin siluet rambutnya terbaca runcing dari samping dan
    dari belakang juga, bukan cuma dari depan seperti kalau rumbainya saja yang
    ditambahkan.
    """
    import math

    def cut_at(u):
        c = (u - 0.5) * 2
        saw = abs(((u * 6.0) % 1.0) - 0.5) * 2.0
        depth = 0.235 + 0.055 * c * c + 0.115 * saw
        depth += 0.022 * math.sin(u * 17.0)
        return depth

    step = 1.0 / max(10, front.w // 2)
    u = 0.0
    while u < 1.0:
        d = cut_at(u)
        front.cut(u, d, u + step, 1.0)
        front.box(u, max(0.0, d - 0.035), u + step, d, scale(hexc(pal["hair_dark"]), 0.86))
        u += step


def paint(px, ch, pal, rng, sizes):
    """Gambar seluruh lembar untuk satu karakter build detailed."""
    if _figure(ch) == "male":
        _paint_male(px, ch, pal, rng, sizes)
    else:
        _paint_female(px, ch, pal, rng, sizes)
    paint_gear(px, pal, rng, sizes, prefix="d_")
