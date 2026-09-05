"""Penggambar tekstur untuk build "detailed".

Bedanya dengan gen_textures.py bukan cuma jumlah slot. Di sini rambut adalah
cangkang yang bagian depannya DIPOTONG jadi poni — lubang itu yang bikin wajah
kelihatan di baliknya — dan wajah bukan satu gambar melainkan delapan, digambar
di petak terpisah dan dipilih render controller saat main.

Semua koordinat pecahan 0..1 di dalam satu sisi kubus, sama seperti gen_textures,
jadi resolusi boleh diubah tanpa menyentuh satu angka pun di berkas ini.
"""

from paint import faces_of, hexc, mix, scale
from uvmap import RES

# Urutan ini yang dipakai render controller sebagai indeks; jangan diacak.
FACES = ("neutral", "blink", "smile", "happy", "surprised", "hurt", "sleepy", "sing")


def _p(pal, key, fallback):
    """Ambil warna dari palet, mundur ke kunci lain kalau belum ada."""
    return hexc(pal.get(key, pal[fallback]))


def _thick(fraction, size):
    """Tebal garis dalam piksel, dari pecahan tinggi/lebar sisi."""
    return max(1, int(round(fraction * size)))


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
            c = mix(base, (255, 255, 255, 255) if k > 0 else (0, 0, 0, 255), abs(k) * 0.55)
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

EYE = {"x0": 0.120, "x1": 0.405, "y0": 0.420, "y1": 0.712}  # mata kiri (dilihat)
MOUTH_Y = 0.760


def _eye_box(side):
    """Kotak satu mata; sisi 1 adalah cerminan sisi 0."""
    if side == 0:
        return EYE["x0"], EYE["x1"]
    return 1.0 - EYE["x1"], 1.0 - EYE["x0"]


def draw_eye(f, side, shape, pal):
    lash, soft = hexc(pal["lash"]), mix(hexc(pal["lash"]), hexc(pal["skin_shade"]), 0.45)
    iris, iris_d, iris_l = hexc(pal["eye"]), hexc(pal["eye_dark"]), hexc(pal["eye_light"])
    pupil = scale(iris_d, 0.45)
    white = (252, 249, 244, 255)
    x0, x1 = _eye_box(side)
    y0, y1 = EYE["y0"], EYE["y1"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0

    if shape in ("closed", "arc", "squeeze"):
        # Lengkung bulu mata. Tiga bentuk berbagi kode karena bedanya cuma arah
        # lengkungnya: ke atas untuk senyum, ke bawah saat dipejamkan kuat.
        bend = -0.62 if shape == "arc" else (0.62 if shape == "squeeze" else 0.0)
        for i in range(17):
            t = i / 16
            u = t * 2 - 1
            curve = bend * (1 - u * u) * h
            x = x0 + t * w
            f.box(x - 0.016, cy + curve - 0.020, x + 0.016, cy + curve + 0.020, lash)
        outer = x0 - 0.012 if side == 0 else x1 - 0.024
        f.box(outer, cy - 0.055, outer + 0.036, cy - 0.015, lash)
        if shape != "squeeze":
            f.box(x0 + 0.03, cy + 0.062, x1 - 0.03, cy + 0.082, soft)
        return

    drop = 0.105 if shape == "half" else 0.0
    top = y0 + drop
    bot = y1 + (0.03 if shape == "wide" else 0.0)
    ch = bot - top
    lash_h = 0.055

    f.box(x0 + 0.018, top + 0.024, x1 - 0.018, bot - 0.05, white)

    irx, iry = w * 0.40, (ch - lash_h - 0.025) / 2
    icy = top + lash_h + iry
    f.ellipse(cx, icy, irx, iry, iris)
    f.ellipse(cx, icy - iry * 0.48, irx * 0.95, iry * 0.42, iris_d)
    f.ellipse(cx, icy + iry * 0.52, irx * 0.86, iry * 0.40, iris_l)
    f.ellipse(cx, icy + iry * 0.08, irx * 0.36, iry * 0.52, pupil)
    f.box(cx - irx * 0.90, icy - iry * 0.80, cx - irx * 0.42, icy - iry * 0.30, white)
    f.box(cx + irx * 0.30, icy + iry * 0.30, cx + irx * 0.58, icy + iry * 0.56, white)

    if shape == "half":
        # Kelopak berat: kulit menutupi bagian atas mata. Itu saja sebenarnya
        # yang bikin wajah terlihat mengantuk atau sedang tersenyum lembut.
        f.box(x0 - 0.012, y0 - 0.012, x1 + 0.012, top + 0.022, hexc(pal["skin"]))
        f.box(x0 - 0.012, top - 0.006, x1 + 0.012, top + 0.026, hexc(pal["skin_shade"]))

    f.box(x0, top, x1, top + lash_h, lash)
    outer = x0 - 0.018 if side == 0 else x1 - 0.030
    f.box(outer, top + 0.018, outer + 0.048, top + 0.078, lash)
    f.box(x0 + 0.036, bot - 0.032, x1 - 0.036, bot - 0.008, soft)


def draw_brow(f, side, shape, pal):
    x0, x1 = _eye_box(side)
    y = 0.368
    color = mix(hexc(pal["hair_dark"]), hexc(pal["lash"]), 0.15)
    tilt = {"raised": -0.045, "worried": 0.055, "happy": -0.02, "flat": 0.0}[shape]
    inner, outer = (x1 - 0.05, x0 + 0.02) if side == 0 else (x0 + 0.05, x1 - 0.02)
    n = 10
    for i in range(n + 1):
        t = i / n
        x = outer + (inner - outer) * t
        yy = y + tilt * t
        f.box(x - 0.016, yy, x + 0.016, yy + 0.018, color)


def draw_mouth(f, shape, pal):
    cx = 0.5
    lip = mix(hexc(pal["blush"]), hexc(pal["lash"]), 0.35)
    inner = scale(lip, 0.62)
    tongue = mix(lip, hexc(pal["blush"]), 0.55)

    def arc(half, depth, color, t=0.036):
        for i in range(11):
            u = (i / 10 - 0.5) * 2
            f.box(cx + u * half - t, MOUTH_Y + (1 - u * u) * depth,
                  cx + u * half + t, MOUTH_Y + (1 - u * u) * depth + t * 2, color)

    if shape == "neutral":
        f.box(cx - 0.044, MOUTH_Y + 0.02, cx + 0.044, MOUTH_Y + 0.052, lip)
        f.box(cx - 0.019, MOUTH_Y + 0.050, cx + 0.019, MOUTH_Y + 0.072, mix(lip, hexc(pal["skin"]), 0.45))
    elif shape == "small":
        f.box(cx - 0.035, MOUTH_Y + 0.026, cx + 0.035, MOUTH_Y + 0.058, lip)
    elif shape == "smile":
        arc(0.090, 0.052, lip, 0.032)
    elif shape == "grin":
        f.ellipse(cx, MOUTH_Y + 0.056, 0.090, 0.056, inner)
        f.ellipse(cx, MOUTH_Y + 0.078, 0.062, 0.030, tongue)
        f.box(cx - 0.090, MOUTH_Y + 0.014, cx + 0.090, MOUTH_Y + 0.042, lip)
    elif shape == "oh":
        f.ellipse(cx, MOUTH_Y + 0.056, 0.052, 0.068, inner)
        f.ellipse(cx, MOUTH_Y + 0.074, 0.030, 0.032, tongue)
    elif shape == "wave":
        for i in range(5):
            x = cx - 0.081 + i * 0.033
            y = MOUTH_Y + 0.026 + (0.0 if i % 2 == 0 else 0.026)
            f.box(x, y, x + 0.037, y + 0.032, lip)
    elif shape == "sing":
        f.ellipse(cx, MOUTH_Y + 0.062, 0.078, 0.098, inner)
        f.ellipse(cx, MOUTH_Y + 0.100, 0.046, 0.042, tongue)
        f.box(cx - 0.078, MOUTH_Y - 0.006, cx + 0.078, MOUTH_Y + 0.022, lip)


STYLES = {
    "neutral":   ("open", "neutral", "flat", 0.35, False),
    "blink":     ("closed", "neutral", "flat", 0.35, False),
    "smile":     ("half", "smile", "happy", 0.55, False),
    "happy":     ("arc", "grin", "happy", 0.85, False),
    "surprised": ("wide", "oh", "raised", 0.30, False),
    "hurt":      ("squeeze", "wave", "worried", 0.50, True),
    "sleepy":    ("half", "small", "worried", 0.25, False),
    "sing":      ("arc", "sing", "happy", 0.70, False),
}


def draw_expression(f, name, pal):
    eyes, mouth, brows, blush_amt, tear = STYLES[name]
    blush = hexc(pal["blush"])
    skin = hexc(pal["skin"])

    if blush_amt > 0:
        soft = mix(skin, blush, 0.42 * blush_amt + 0.18)
        hot = mix(skin, blush, 0.62 * blush_amt + 0.22)
        for cx in (0.180, 0.820):
            f.ellipse(cx, 0.722, 0.105, 0.050, soft)
            f.box(cx - 0.052, 0.700, cx - 0.026, 0.748, hot)
            f.box(cx + 0.010, 0.700, cx + 0.036, 0.748, hot)

    # Hidung: satu texel bayangan. Lebih dari itu berhenti terbaca sebagai anime.
    f.box(0.522, 0.672, 0.556, 0.702, mix(skin, hexc(pal["skin_shade"]), 0.55))

    for side in (0, 1):
        draw_brow(f, side, brows, pal)
    for side in (0, 1):
        draw_eye(f, side, eyes, pal)
    draw_mouth(f, mouth, pal)

    if tear:
        # Menggenang di sudut luar mata, bukan mengalir di pipi — di pipi
        # tertutup rambut samping.
        for side in (0, 1):
            x0, x1 = _eye_box(side)
            x = x0 + 0.045 if side == 0 else x1 - 0.083
            f.box(x, 0.578, x + 0.036, 0.660, (184, 220, 242, 255))
            f.box(x, 0.644, x + 0.036, 0.682, (124, 184, 228, 255))
            f.box(x - 0.013, 0.578, x + 0.004, 0.626, (255, 255, 255, 255))


# --- badan -----------------------------------------------------------------

def paint(px, ch, pal, rng, sizes):
    """Gambar seluruh lembar untuk satu karakter build detailed."""
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

    # kepala dan kulit
    hf = faces_of(px, "d_head", sizes["d_head"], rng)
    for name, f in hf.items():
        f.grad(skin_l, skin) if name != "down" else f.fill(mix(shade, skin, 0.4))
    hf["north"].box(0, 0.86, 1, 1, mix(skin, shade, 0.35))     # bayangan dagu
    hf["south"].grad(mix(skin, shade, 0.35), mix(skin, shade, 0.65))
    for slot in ("d_ear", "d_neck", "d_hand"):
        for name, f in faces_of(px, slot, sizes[slot], rng).items():
            f.grad(skin_l, skin) if name != "down" else f.fill(mix(shade, skin, 0.5))
    hnd = faces_of(px, "d_hand", sizes["d_hand"], rng)
    for name in ("north", "south", "east", "west"):
        f = hnd[name]
        f.vline(0.33, 0.45, 1.0, mix(skin, shade, 0.55))       # sela jari
        f.vline(0.66, 0.45, 1.0, mix(skin, shade, 0.55))

    # delapan wajah
    for name in FACES:
        slot = f"d_face_{name}"
        if slot not in sizes:
            continue
        fs = faces_of(px, slot, sizes[slot], rng)
        draw_expression(fs["north"], name, pal)

    # rambut: cangkang, volume belakang, tengkuk, jurai samping, antena, jepit
    cap = hair_part(px, "d_hair_cap", sizes["d_hair_cap"], pal, rng, gloss=True)
    front = cap["north"]

    def cut_at(u):
        """Kedalaman poni di posisi u (0..1 melintang wajah)."""
        c = (u - 0.5) * 2
        # Cangkang rambut lebih tinggi dari kepala (inflate), jadi 0.28 di sini
        # jatuh sedikit di atas alis; lebih dari 0.42 di pelipis mulai menutupi
        # sudut luar mata.
        depth = 0.28 + 0.13 * c * c
        if abs(c) < 0.22:
            depth += 0.06                           # belahan di tengah
        return depth + ((int(u * 8) * 53) % 7) / 7 * 0.035

    step = 1.0 / max(8, front.w // 2)
    u = 0.0
    while u < 1.0:
        d = cut_at(u)
        front.cut(u, d, u + step, 1.0)
        front.box(u, d - 0.07, u + step, d, scale(hexc(pal["hair_dark"]), 0.82))
        u += step

    hair_part(px, "d_hair_back", sizes["d_hair_back"], pal, rng,
              tip=mix(hexc(pal["hair"]), hexc(pal["hair_tip"]), 0.6))
    hair_part(px, "d_hair_nape", sizes["d_hair_nape"], pal, rng,
              tip=hexc(pal["hair_tip"]))
    hair_part(px, "d_hair_side", sizes["d_hair_side"], pal, rng,
              root=hexc(pal["hair_light"]), tip=hexc(pal["hair_tip"]))
    hair_part(px, "d_ahoge", sizes["d_ahoge"], pal, rng,
              root=hexc(pal["hair_light"]), tip=hexc(pal["hair_tip"]))
    hair_part(px, "d_tail_up", sizes["d_tail_up"], pal, rng, gloss=True)
    hair_part(px, "d_tail_low", sizes["d_tail_low"], pal, rng,
              root=hexc(pal["hair"]), tip=hexc(pal["hair_tip"]))

    # jepit rambut
    cf = faces_of(px, "d_clip", sizes["d_clip"], rng)
    for name, f in cf.items():
        f.fill(hot)
    cf["north"].box(0.06, 0.15, 0.30, 0.85, gold)
    cf["north"].box(0.40, 0.15, 0.64, 0.85, (255, 255, 255, 255))

    # pita ekor rambut
    rf = faces_of(px, "d_ribbon", sizes["d_ribbon"], rng)
    for name, f in rf.items():
        f.grad(hot, scale(hot, 0.72))
        f.box(0.40, 0.0, 0.60, 1.0, scale(hot, 0.6))          # simpul
        f.box(0.05, 0.10, 0.36, 0.30, mix(hot, (255, 255, 255, 255), 0.45))
        f.box(0.64, 0.10, 0.95, 0.30, mix(hot, (255, 255, 255, 255), 0.45))

    # kemeja putih, cuma terlihat di celah jaket dan di bawah kelim
    cloth(faces_of(px, "d_shirt", sizes["d_shirt"], rng), white,
          mix(white, (255, 255, 255, 255), 0.35), white_d, hem=white_d)

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
        f.hline(0.0, 0, 1, mix(tape, (255, 255, 255, 255), 0.65), thick=_thick(0.14, f.h))
        f.hline(0.86, 0, 1, scale(hot, 0.9), thick=_thick(0.14, f.h))
        for i in range(6):                                     # huruf-huruf samar
            f.box(0.07 + i * 0.155, 0.36, 0.13 + i * 0.155, 0.64, (154, 169, 204, 255))
    tf["north"].ellipse(0.5, 0.5, 0.075, 0.30, hot)

    # kerah kemeja + choker
    kf = faces_of(px, "d_collar", sizes["d_collar"], rng)
    for name, f in kf.items():
        f.grad(mix(white, (255, 255, 255, 255), 0.4), white)
        f.edges(white_d, 0.4)
        f.hline(0.72, 0, 1, hot, thick=_thick(0.18, f.h))      # choker
    kf["north"].box(0.455, 0.68, 0.545, 0.92, gold)

    # celana pendek di balik rok
    sh = faces_of(px, "d_shorts", sizes["d_shorts"], rng)
    for name, f in sh.items():
        f.grad(mix(dark, (255, 255, 255, 255), 0.12), dark)
        f.hline(0.0, 0, 1, mix(dark, (255, 255, 255, 255), 0.30), thick=_thick(0.16, f.h))
        f.hline(0.16, 0, 1, hot, thick=_thick(0.07, f.h))

    # rok berlipat: panel depan/belakang dan panel samping
    for slot in ("d_skirt_fb", "d_skirt_side"):
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
        f.grad(mix(white, (255, 255, 255, 255), 0.4), white)
        f.hline(0.80, 0, 1, white_d, thick=_thick(0.12, f.h))
        f.edges(white_d, 0.4)

    # kaus kaki selutut
    kk = faces_of(px, "d_sock", sizes["d_sock"], rng)
    for name, f in kk.items():
        f.grad(mix(white, (255, 255, 255, 255), 0.3), white)
        f.box(0, 0.0, 1, 0.10, dark)                           # karet atas
        f.box(0, 0.10, 1, 0.13, hot)
        f.edges(white_d, 0.45)
    kk["up"].fill(dark)          # di dalam celana pendek; gelap supaya tak bocor
    kk["down"].fill(white_d)

    # sepatu tinggi
    bf = faces_of(px, "d_boot", sizes["d_boot"], rng)
    for name, f in bf.items():
        f.grad(mix(white, (255, 255, 255, 255), 0.3), white)
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
