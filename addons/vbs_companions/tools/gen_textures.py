"""Gambar semua PNG add-on: tekstur entity 1024x1024, ikon spawn egg, pack icon.

Semuanya digambar dari nol memakai palet di characters.json — tidak ada aset yang
diambil dari game mana pun; ini interpretasi pixel-art dari desain masing-masing
karakter.

Semua penggambaran memakai koordinat pecahan 0..1 di dalam satu face (kelas Face),
bukan nomor piksel, supaya kodenya kebaca sebagai "poni menutupi 40% atas wajah"
dan tetap benar kalau RES di uvmap.py diubah.

Bayangan arah TIDAK dibakar keras ke tekstur (kulit Minecraft asli juga tidak);
yang dibakar hanya bayangan bentuk yang halus — tepi gelap, gradasi atas-bawah —
lalu mesin gim yang menyinari sisanya.
"""

import os
import random

from PIL import Image

import detailed
import model
from paint import CLEAR, FORM, Face, faces_of, hexc, mix, scale
from uvmap import RES, TEX_H, TEX_W

RP = os.path.join(model.HERE, "..", "resource_packs", "vbs_companions_rp")
BP = os.path.join(model.HERE, "..", "behavior_packs", "vbs_companions_bp")
ENT_DIR = os.path.join(RP, "textures", "entity", "vbs_companions")
ITEM_DIR = os.path.join(RP, "textures", "items")

SHARP_EYES = {"akito", "toya", "flins"}      # mata cowok digambar lebih tajam


# --- rambut ----------------------------------------------------------------

def hair_strands(f, pal, rng, root=None, tip=None, gloss=False, streak=None):
    """Helai vertikal dengan gradasi akar->ujung, plus kilau ala rambut anime."""
    root = root or hexc(pal["hair_root"])
    tip = tip or hexc(pal["hair"])
    dark = hexc(pal["hair_dark"])
    light = hexc(pal["hair_light"])
    f.grad(root, tip)
    n = max(3, f.w // (RES // 2))
    for i in range(n):
        x0, x1 = i / n, (i + 1) / n
        k = rng.choice((-0.16, -0.07, 0.0, 0.09, 0.18))
        for iy in range(f.h):
            t = iy / max(1, f.h - 1)
            c = mix(mix(root, tip, t), light if k > 0 else dark, abs(k))
            for ix in f._range(x0, x1, f.w):
                f._put(ix, iy, c)
        if i % 3 == 1:                                   # garis pemisah helai
            f.vline(x1 - 0.5 / f.w, 0.0, 1.0, mix(dark, root, 0.35))
    if streak:                                           # highlight warna lain
        f.vline(0.30, 0.0, 0.62, streak, thick=max(2, f.w // 12))
    if gloss:                                            # pita kilau melintang
        for ix in range(f.w):
            if (ix // max(1, RES // 3)) % 3 == 2:
                continue
            for iy in f._range(0.30, 0.42, f.h):
                cur = f.px[f.x + ix, f.y + iy]
                f.px[f.x + ix, f.y + iy] = mix(cur, light, 0.55)


def paint_hair_part(px, slot, size, pal, rng, ch, spikes=0, depth=0.14, gloss=False,
                    two_tone=False, gradient=False):
    st_pal = pal
    root = hexc(st_pal["hair_root"])
    base = hexc(st_pal["hair"])
    tip = hexc(st_pal["hair_tip"]) if gradient else base
    faces = faces_of(px, slot, size, rng)
    for name, f in faces.items():
        if name == "up":
            hair_strands(f, st_pal, rng, root=mix(base, hexc(st_pal["hair_light"]), 0.3),
                         tip=root, gloss=gloss)
        elif name == "down":
            f.fill(mix(root, hexc(st_pal["hair_dark"]), 0.30))
        else:
            hair_strands(f, st_pal, rng, root=root, tip=tip,
                         streak=hexc(st_pal["hair_streak"]) if (
                             ch["id"] == "akito" and name == "north") else None)
    if two_tone:
        tint_left(faces, hexc(st_pal["hair_streak"]), 0.9)
    if spikes:
        for name in ("north", "south", "east", "west"):
            faces[name].spiky_bottom(spikes, depth)
    return faces


def tint_left(faces, color, t=0.9):
    """Warnai separuh sisi +X (kiri karakter) — rambut dua warna ala Toya.

    Arah u tiap face berbeda: di sisi depan u searah +X, di sisi belakang -X,
    jadi separuh yang dicat pun berbeda supaya batas warnanya nyambung.
    """
    spans = {"north": (0.52, 1.0), "south": (0.0, 0.48), "up": (0.52, 1.0),
             "down": (0.52, 1.0), "west": (0.0, 1.0)}
    for name, span in spans.items():
        f = faces.get(name)
        if not f:
            continue
        for ix in f._range(span[0], span[1], f.w):
            for iy in range(f.h):
                cur = f.px[f.x + ix, f.y + iy]
                if cur[3]:
                    f.px[f.x + ix, f.y + iy] = mix(cur, color, t)


# --- wajah -----------------------------------------------------------------

def draw_face(f, ch, pal):
    skin, light = hexc(pal["skin"]), hexc(pal["skin_light"])
    shade, blush = hexc(pal["skin_shade"]), hexc(pal["blush"])
    lash, iris = hexc(pal["lash"]), hexc(pal["eye"])
    iris_d, iris_l = hexc(pal["eye_dark"]), hexc(pal["eye_light"])
    white = (250, 250, 253, 255)
    sharp = ch["id"] in SHARP_EYES

    f.grad(light, skin, 0.0, 0.72)
    f.grad(skin, mix(skin, shade, 0.55), 0.72, 1.0)
    f.box(0.0, 0.0, 0.10, 1.0, mix(skin, shade, 0.35))    # pipi kiri
    f.box(0.90, 0.0, 1.0, 1.0, mix(skin, shade, 0.35))    # pipi kanan

    top = 0.42 if not sharp else 0.45
    bot = 0.72 if not sharp else 0.67
    for side, (ex0, ex1) in enumerate(((0.13, 0.40), (0.60, 0.87))):
        cx = (ex0 + ex1) / 2
        rx = (ex1 - ex0) / 2
        cy = (top + bot) / 2
        ry = (bot - top) / 2
        f.ellipse(cx, cy, rx, ry, white)                  # bola mata
        f.ellipse(cx, cy + ry * 0.04, rx * 0.94, ry * 0.96, mix(iris_d, lash, 0.35))
        f.ellipse(cx, cy + ry * 0.06, rx * 0.84, ry * 0.88, iris_d)
        f.ellipse(cx, cy + ry * 0.16, rx * 0.78, ry * 0.76, iris)
        f.ellipse(cx, cy + ry * 0.42, rx * 0.62, ry * 0.38, iris_l)
        f.ellipse(cx, cy + ry * 0.10, rx * 0.26, ry * 0.42, mix(lash, iris_d, 0.30))
        hx = cx + (-rx * 0.38 if side == 0 else rx * 0.38)
        f.ellipse(hx, cy - ry * 0.38, rx * 0.34, ry * 0.30, white)
        f.ellipse(cx + (rx * 0.34 if side == 0 else -rx * 0.34), cy + ry * 0.50,
                  rx * 0.15, ry * 0.13, mix(white, iris_l, 0.25))
        # bulu mata atas, menebal ke sudut luar
        for ix in f._range(ex0 - 0.02, ex1 + 0.02, f.w):
            u = (ix / f.w - ex0) / (ex1 - ex0)
            thick = 0.055 + 0.045 * (1 - u if side == 0 else u)
            for iy in f._range(top - 0.03, top - 0.03 + thick, f.h):
                f._put(ix, iy, lash)
        f.hline(bot - 0.01, ex0 + 0.03, ex1 - 0.03, mix(lash, shade, 0.45),
                thick=max(1, RES // 4))
        # alis
        for i, ix in enumerate(f._range(ex0, ex1, f.w)):
            drop = 0.035 * ((i / max(1, (ex1 - ex0) * f.w)) if side == 0 else
                            (1 - i / max(1, (ex1 - ex0) * f.w)))
            for iy in f._range(0.27 + drop, 0.33 + drop, f.h):
                f._put(ix, iy, mix(hexc(pal["hair_dark"]), skin, 0.15))

    f.ellipse(0.155, 0.80, 0.075, 0.045, mix(skin, blush, 0.45))
    f.ellipse(0.845, 0.80, 0.075, 0.045, mix(skin, blush, 0.45))
    f.dither(0.10, 0.76, 0.22, 0.85, blush, 0.35)
    f.dither(0.78, 0.76, 0.90, 0.85, blush, 0.35)
    f.box(0.49, 0.76, 0.53, 0.79, mix(skin, shade, 0.5))          # bayangan hidung
    f.box(0.455, 0.875, 0.545, 0.90, mix(shade, blush, 0.6))      # mulut
    f.box(0.47, 0.90, 0.53, 0.915, mix(skin, blush, 0.35))


# --- badan -----------------------------------------------------------------

def paint_body(px, ch, pal, rng, sizes):
    st = ch["style"]
    skin, skin_l, shade = hexc(pal["skin"]), hexc(pal["skin_light"]), hexc(pal["skin_shade"])
    top, top_l, top_d = hexc(pal["top"]), hexc(pal["top_light"]), hexc(pal["top_dark"])
    inner, inner_d = hexc(pal["inner"]), hexc(pal["inner_dark"])
    sleeve, sleeve_d = hexc(pal["sleeve"]), hexc(pal["sleeve_dark"])
    accent, trim, strap = hexc(pal["accent"]), hexc(pal["trim"]), hexc(pal["strap"])
    leg, leg_d = hexc(pal["legwear"]), hexc(pal["legwear_dark"])
    socks = hexc(pal["socks"])
    shoe, sole, shoe_a = hexc(pal["shoe"]), hexc(pal["shoe_sole"]), hexc(pal["shoe_accent"])

    # kepala
    hf = faces_of(px, "head", sizes["head"], rng)
    for name, f in hf.items():
        f.grad(skin_l, skin) if name != "down" else f.fill(mix(shade, skin, 0.4))
    hf["south"].grad(mix(skin, shade, 0.4), mix(skin, shade, 0.7))
    draw_face(hf["north"], ch, pal)

    # lapisan dalam: hoodie / kemeja / turtleneck / crop top
    bf = faces_of(px, "body", sizes["body"], rng)
    for name, f in bf.items():
        f.grad(mix(inner, (255, 255, 255, 255), 0.10), inner)
        f.edges(inner_d, 0.4)
    if st["midriff"]:                                    # An: crop top + perut
        for name in ("north", "south", "east", "west"):
            f = bf[name]
            f.box(0, 0, 1, 0.52, hexc(pal["top"]))       # atasan hitam
            f.hline(0.50, 0, 1, hexc(pal["inner"]), thick=RES)
            f.grad(skin, mix(skin, shade, 0.45), 0.55, 0.76)
            f.box(0, 0.76, 1, 1, leg)                    # pinggang celana
            f.hline(0.76, 0, 1, mix(leg_d, trim, 0.4), thick=max(1, RES // 2))
    if ch["id"] == "toya":                               # turtleneck + kemeja diikat
        for name in ("north", "south", "east", "west"):
            bf[name].box(0, 0.86, 1, 1, hexc(pal["trim"]))
    if ch["id"] == "kohane":                             # kerah kemeja biru
        bf["north"].box(0.30, 0.0, 0.70, 0.16, inner)
        for name in ("north", "south", "east", "west"):
            bf[name].box(0, 0.72, 1, 1, hexc(pal["legwear"]))   # rok mulai di sini

    # lapisan luar: jaket / blazer / mantel
    jf = faces_of(px, "jacket", sizes["jacket"], rng)
    if not st["outer"]:
        for f in jf.values():
            f.cut(0, 0, 1, 1)                            # tanpa lapisan luar
        jf = None
    else:
        for name, f in jf.items():
            f.grad(top_l, top)
            f.edges(top_d, 0.45)
        jf["up"].fill(mix(top_l, top, 0.4))
    open_w = st["jacket_open"] if jf else 0
    if open_w > 0:
        n = jf["north"]
        n.cut(0.5 - open_w / 2, 0.06, 0.5 + open_w / 2, 1.0)     # jaket terbuka
        n.vline(0.5 - open_w / 2 - 0.03, 0.06, 1.0, top_d, thick=max(1, RES // 2))
        n.vline(0.5 + open_w / 2 + 0.01, 0.06, 1.0, top_d, thick=max(1, RES // 2))
    if jf and st["midriff"]:                             # jaket melorot di bahu
        for name in ("north", "south", "east", "west"):
            jf[name].cut(0.0, 0.34, 1.0, 1.0)
    if jf:
        for name in ("north", "south"):
            jf[name].hline(0.90, 0.0, 1.0, top_d, thick=max(2, RES // 2))

    # lengan
    for slot in ("arm_r", "arm_l"):
        af = faces_of(px, slot, sizes[slot], rng)
        for name, f in af.items():
            f.grad(mix(sleeve, top_l, 0.25), sleeve, 0.0, 0.82)
            f.box(0, 0.82, 1, 1, skin)                   # tangan
            f.hline(0.80, 0, 1, sleeve_d, thick=max(2, RES // 3))
            f.edges(sleeve_d, 0.35)
        af["up"].fill(mix(sleeve, top_l, 0.35))
        af["down"].fill(mix(skin, shade, 0.5))

    # kaki
    for slot in ("leg_r", "leg_l"):
        lf = faces_of(px, slot, sizes[slot], rng)
        for name, f in lf.items():
            if st["legs"] == "socks":
                f.grad(skin_l, mix(skin, shade, 0.35), 0.0, 0.34)
                f.box(0, 0.34, 1, 1, socks)
                f.hline(0.35, 0, 1, hexc(pal["legwear_stripe"]), thick=max(2, RES // 3))
                f.hline(0.40, 0, 1, hexc(pal["legwear_stripe"]), thick=max(1, RES // 4))
            else:
                f.grad(mix(leg, (255, 255, 255, 255), 0.08), leg)
                f.hline(0.86, 0, 1, leg_d, thick=max(2, RES // 3))   # manset celana
            f.edges(leg_d, 0.30)
        lf["up"].fill(leg_d)
        lf["down"].fill(mix(leg_d, (0, 0, 0, 255), 0.4))

    # sepatu / bot
    sf = faces_of(px, "shoe", sizes["shoe"], rng)
    tall = sizes["shoe"][1] >= 5
    for name, f in sf.items():
        f.grad(mix(shoe, (255, 255, 255, 255), 0.10), shoe)
        f.box(0, 0.78, 1, 1, sole)
        f.hline(0.74, 0, 1, shoe_a, thick=max(2, RES // 3))
        f.edges(mix(shoe, (0, 0, 0, 255), 0.5), 0.35)
    sf["down"].fill(mix(sole, (0, 0, 0, 255), 0.35))
    sf["up"].fill(mix(shoe, (0, 0, 0, 255), 0.3))
    n = sf["north"]
    if tall:                                             # bot tinggi: pelat perak
        n.box(0.1, 0.18, 0.9, 0.28, trim)
        n.box(0.2, 0.40, 0.8, 0.47, mix(trim, shoe, 0.4))
    else:                                                # sneaker: tali menyilang
        for i in range(3):
            y = 0.24 + i * 0.14
            n.box(0.22, y, 0.78, y + 0.045, mix(sole, shoe, 0.25))
        n.box(0.36, 0.10, 0.64, 0.22, mix(sole, shoe, 0.15))

    # rok / ekor mantel
    if "skirt" in sizes:
        kf = faces_of(px, "skirt", sizes["skirt"], rng)
        base = hexc(pal["legwear"]) if ch["id"] == "kohane" else top
        for name, f in kf.items():
            f.grad(mix(base, top_l, 0.2), base)
            n_p = 6
            for i in range(n_p):                          # lipatan
                f.vline(i / n_p, 0.0, 1.0, scale(base, 0.78), thick=max(1, RES // 3))
            f.hline(0.86, 0, 1, scale(base, 0.62), thick=max(2, RES // 2))
            f.edges(scale(base, 0.6), 0.35)
        kf["up"].fill(scale(base, 0.8))
        kf["down"].fill(scale(base, 0.55))

    # jubah
    if "cape" in sizes:
        cf = faces_of(px, "cape", sizes["cape"], rng)
        for name, f in cf.items():
            f.grad(top_l, top_d)
        cf["north"].grad(hexc(pal["inner"]), inner_d)     # lapisan dalam ungu
        s = cf["south"]
        s.vline(0.02, 0, 1, trim, thick=max(2, RES // 2))
        s.vline(0.96, 0, 1, trim, thick=max(2, RES // 2))
        s.hline(0.94, 0, 1, trim, thick=max(2, RES // 2))
        for i in range(4):
            s.box(0.42, 0.12 + i * 0.2, 0.58, 0.16 + i * 0.2, mix(accent, trim, 0.4))
        cf["south"].spiky_bottom(5, 0.10)

    # kerah, kelepak jas, sabuk, manset, jepit rambut, topi, tudung
    if "collar" in sizes:
        cf = faces_of(px, "collar", sizes["collar"], rng)
        base = inner if ch["id"] in ("toya", "kohane") else top
        for name, f in cf.items():
            f.grad(mix(base, top_l, 0.3), base)
            f.edges(top_d, 0.4)
        if ch["id"] == "flins":
            cf["north"].hline(0.30, 0.05, 0.95, trim, thick=max(2, RES // 2))
            cf["north"].box(0.42, 0.45, 0.58, 0.80, accent)
        if ch["id"] == "an":
            cf["north"].hline(0.55, 0.2, 0.8, trim, thick=max(1, RES // 3))
    if "lapel" in sizes:
        lf = faces_of(px, "lapel", sizes["lapel"], rng)
        for name, f in lf.items():
            f.fill(top)
        n = lf["north"]
        n.fill(top)
        n.cut(0.34, 0.28, 0.66, 1.0)                      # celah dada
        for i in range(n.w):
            u = i / n.w
            if 0.22 < u < 0.36 or 0.64 < u < 0.78:
                for iy in n._range(0.0, 0.55, n.h):
                    n._put(i, iy, trim)                   # tepi putih kelepak
        n.hline(0.0, 0, 1, mix(top_l, trim, 0.3), thick=max(2, RES // 2))
    if "belt" in sizes:
        bf2 = faces_of(px, "belt", sizes["belt"], rng)
        base = accent if ch["id"] == "kohane" else mix(top_d, trim, 0.25)
        for name, f in bf2.items():
            f.grad(mix(base, trim, 0.25), base)
        n = bf2["north"]
        n.box(0.40, 0.15, 0.60, 0.85, trim)               # gesper
        n.box(0.45, 0.30, 0.55, 0.70, scale(base, 0.7))
        if ch["id"] == "an":
            for i in range(5):
                n.box(0.05 + i * 0.19, 0.35, 0.13 + i * 0.19, 0.65, trim)
    if "cuff" in sizes:
        uf = faces_of(px, "cuff", sizes["cuff"], rng)
        for name, f in uf.items():
            f.grad(mix(top_d, trim, 0.18), top_d)
            f.hline(0.10, 0, 1, mix(trim, top_d, 0.5), thick=max(1, RES // 3))
            f.edges(hexc(pal["top_dark"]), 0.4)
    if "clip" in sizes:
        pf = faces_of(px, "clip", sizes["clip"], rng)
        for name, f in pf.items():
            f.fill(hexc(pal["eye_dark"]))
        n = pf["north"]
        n.fill(hexc(pal["eye"]))
        n.box(0.42, 0.0, 0.58, 1.0, hexc(pal["eye_light"]))     # bintang kecil
        n.box(0.0, 0.35, 1.0, 0.65, hexc(pal["eye_light"]))
    if "cap" in sizes:
        pf = faces_of(px, "cap", sizes["cap"], rng)
        for name, f in pf.items():
            f.grad(mix(trim, (255, 255, 255, 255), 0.5), trim)
            f.edges(hexc(pal["top_dark"]), 0.25)
        pf["up"].ellipse(0.5, 0.5, 0.10, 0.10, hexc(pal["accent"]))
        pf["south"].box(0.36, 0.2, 0.64, 0.8, mix(hexc(pal["accent"]), trim, 0.35))
        bf3 = faces_of(px, "brim", sizes["brim"], rng)
        for name, f in bf3.items():
            f.fill(trim if name != "down" else mix(trim, top_d, 0.55))
    if "hood" in sizes:
        df = faces_of(px, "hood", sizes["hood"], rng)
        for name, f in df.items():
            f.grad(mix(inner, (255, 255, 255, 255), 0.12), inner)
            f.edges(inner_d, 0.45)
        df["north"].grad(inner_d, mix(inner_d, (0, 0, 0, 255), 0.45))   # mulut tudung
        df["up"].hline(0.5, 0.1, 0.9, inner_d, thick=max(1, RES // 3))


# --- per karakter ----------------------------------------------------------

def detail_akito(px, ch, pal, rng, sizes):
    """Pita tape hitam bertulisan di dada, tali pink dan pita biru di celana."""
    trim, accent, strap = hexc(pal["trim"]), hexc(pal["accent"]), hexc(pal["strap"])
    jf = faces_of(px, "jacket", sizes["jacket"], rng)
    for name in ("north", "south", "east", "west"):
        f = jf[name]
        f.hline(0.30, 0.0, 1.0, trim, thick=max(3, RES // 2))
        for i in range(6):                                # huruf-huruf samar
            f.box(0.06 + i * 0.15, 0.315, 0.12 + i * 0.15, 0.345, (238, 240, 246, 255))
    for slot in ("arm_r", "arm_l"):
        af = faces_of(px, slot, sizes[slot], rng)
        for name in ("north", "south", "east", "west"):
            af[name].hline(0.24, 0, 1, hexc(pal["top"]), thick=max(2, RES // 3))
    lf = faces_of(px, "leg_r", sizes["leg_r"], rng)
    for name in ("north", "south", "east", "west"):
        lf[name].hline(0.55, 0, 1, accent, thick=max(3, RES // 2))
    lf2 = faces_of(px, "leg_l", sizes["leg_l"], rng)
    lf2["north"].vline(0.62, 0.0, 0.5, strap, thick=max(2, RES // 3))
    lf2["north"].vline(0.70, 0.0, 0.5, (240, 242, 248, 255), thick=max(1, RES // 4))


def detail_kohane(px, ch, pal, rng, sizes):
    """Sash pink menyilang, tali bahu hitam, kancing rok."""
    accent, strap = hexc(pal["accent"]), hexc(pal["strap"])
    bf = faces_of(px, "body", sizes["body"], rng)
    n = bf["north"]
    for i in range(n.h):
        t = i / n.h
        x = 0.18 + t * 0.42
        n.box(x, t, x + 0.16, t + 1 / n.h, accent)        # sash miring
    for x in (0.24, 0.68):
        n.vline(x, 0.0, 0.72, strap, thick=max(2, RES // 3))
        bf["south"].vline(x, 0.0, 0.72, strap, thick=max(2, RES // 3))
    kf = faces_of(px, "skirt", sizes["skirt"], rng)
    kf["north"].box(0.40, 0.15, 0.60, 0.60, scale(hexc(pal["legwear"]), 0.75))
    kf["north"].box(0.44, 0.20, 0.56, 0.30, accent)


def detail_an(px, ch, pal, rng, sizes):
    """Kalung rantai, garis pink di sisi celana, manset motif di mata kaki."""
    trim, strap = hexc(pal["trim"]), hexc(pal["strap"])
    bf = faces_of(px, "body", sizes["body"], rng)
    n = bf["north"]
    for i in range(6):                                    # rantai berbentuk V
        y = 0.04 + i * 0.028
        n.box(0.38 + i * 0.018, y, 0.41 + i * 0.018, y + 0.018, trim)
        n.box(0.59 - i * 0.018, y, 0.62 - i * 0.018, y + 0.018, trim)
    n.box(0.47, 0.20, 0.53, 0.28, trim)                   # bandul
    n.box(0.485, 0.28, 0.515, 0.33, mix(trim, hexc(pal["top"]), 0.4))
    for slot in ("leg_r", "leg_l"):
        lf = faces_of(px, slot, sizes[slot], rng)
        for name in ("east", "west"):
            lf[name].vline(0.42, 0.0, 0.86, strap, thick=max(2, RES // 3))
        for name in ("north", "south", "east", "west"):
            f = lf[name]
            f.box(0, 0.86, 1, 1, hexc(pal["top"]))
            for i in range(4):
                f.box(0.06 + i * 0.24, 0.89, 0.16 + i * 0.24, 0.96,
                      hexc(pal["legwear"]))


def detail_toya(px, ch, pal, rng, sizes):
    """Rantai leher, jeans abu sobek."""
    strap = hexc(pal["strap"])
    bf = faces_of(px, "body", sizes["body"], rng)
    for i in range(6):
        bf["north"].box(0.44, 0.05 + i * 0.025, 0.50, 0.07 + i * 0.025, strap)
    for slot, y in (("leg_r", 0.34), ("leg_l", 0.48)):
        f = faces_of(px, slot, sizes[slot], rng)["north"]
        f.box(0.26, y, 0.74, y + 0.022, mix(hexc(pal["legwear"]),
                                            hexc(pal["legwear_stripe"]), 0.5))
        f.dither(0.26, y + 0.022, 0.74, y + 0.04, hexc(pal["legwear_dark"]), 0.25)


def detail_flins(px, ch, pal, rng, sizes):
    """Trim perak di mantel, kilau Electro ungu, sabuk berlapis."""
    trim, accent = hexc(pal["trim"]), hexc(pal["accent"])
    jf = faces_of(px, "jacket", sizes["jacket"], rng)
    for name in ("north", "south", "east", "west"):
        f = jf[name]
        f.vline(0.06, 0.0, 0.92, trim, thick=max(2, RES // 3))
        f.vline(0.90, 0.0, 0.92, trim, thick=max(2, RES // 3))
        f.hline(0.90, 0.0, 1.0, trim, thick=max(2, RES // 3))
    n = jf["north"]
    n.ellipse(0.5, 0.36, 0.09, 0.07, accent)              # permata dada
    n.ellipse(0.5, 0.36, 0.05, 0.04, mix(accent, (255, 255, 255, 255), 0.55))
    for i in range(3):
        n.box(0.30 + i * 0.14, 0.50, 0.36 + i * 0.14, 0.54, trim)
    kf = faces_of(px, "skirt", sizes["skirt"], rng)
    for name in ("north", "south", "east", "west"):
        kf[name].hline(0.10, 0, 1, trim, thick=max(2, RES // 3))
        kf[name].spiky_bottom(4, 0.18)


DETAILS = {"akito": detail_akito, "kohane": detail_kohane, "an": detail_an,
           "toya": detail_toya, "flins": detail_flins}


def character_texture(ch):
    img = Image.new("RGBA", (TEX_W, TEX_H), CLEAR)
    px = img.load()
    pal, st = ch["palette"], ch["style"]
    rng = random.Random(ch["id"])
    sizes = model.slot_sizes(ch)

    if st.get("build") == "detailed":
        detailed.paint(px, ch, pal, rng, sizes)
        return img

    paint_body(px, ch, pal, rng, sizes)

    gradient = ch["id"] in ("an", "flins")                # ujung rambut beda warna
    two_tone = ch["id"] == "toya"
    paint_hair_part(px, "hair_top", sizes["hair_top"], pal, rng, ch, gloss=True,
                    two_tone=two_tone)
    paint_hair_part(px, "bangs", sizes["bangs"], pal, rng, ch,
                    spikes=9 if st["bangs"] == "spiky" else 6,
                    depth=0.34 if st["bangs"] == "spiky" else 0.24, two_tone=two_tone)
    if "bangs2" in sizes:
        paint_hair_part(px, "bangs2", sizes["bangs2"], pal, rng, ch, spikes=4, depth=0.40)
    paint_hair_part(px, "side_hair", sizes["side_hair"], pal, rng, ch,
                    spikes=5, depth=0.11, gradient=gradient)
    paint_hair_part(px, "side_hair_l", sizes["side_hair_l"], pal, rng, ch,
                    spikes=5, depth=0.11, gradient=gradient)
    if two_tone:                                          # sisi kiri Toya gelap
        f = faces_of(px, "side_hair_l", sizes["side_hair_l"], rng)
        for name in ("north", "south", "east", "west", "up"):
            for ix in range(f[name].w):
                for iy in range(f[name].h):
                    cur = f[name].px[f[name].x + ix, f[name].y + iy]
                    if cur[3]:
                        f[name].px[f[name].x + ix, f[name].y + iy] = mix(
                            cur, hexc(pal["hair_streak"]), 0.8)
    paint_hair_part(px, "hair_back", sizes["hair_back"], pal, rng, ch,
                    spikes=6, depth=0.10, gradient=gradient, two_tone=two_tone)
    for slot in ("tail", "tail2", "ahoge"):
        if slot in sizes:
            paint_hair_part(px, slot, sizes[slot], pal, rng, ch, spikes=3,
                            depth=0.16, gradient=gradient)

    DETAILS[ch["id"]](px, ch, pal, rng, sizes)
    # Perlengkapan role digambar penggambar yang sama dengan build detailed —
    # topi jerami harus kelihatan identik di karakter mana pun yang memakainya.
    detailed.paint_gear(px, pal, rng, sizes, prefix="")
    return img


# --- ikon ------------------------------------------------------------------

def spawn_egg(ch, size=64):
    pal = ch["palette"]
    base, spot = hexc(pal["hair"]), hexc(pal["accent"])
    light, dark = hexc(pal["hair_light"]), scale(hexc(pal["hair_dark"]), 0.7)
    img = Image.new("RGBA", (size, size), CLEAR)
    px = img.load()
    rng = random.Random(ch["id"] + "egg")
    cx, cy = size / 2, size * 0.54
    for y in range(size):
        ry = (y - cy) / (size * 0.46)
        rx = size * (0.19 + 0.09 * max(0.0, (y - size * 0.12) / size))
        for x in range(size):
            if ((x - cx) / rx) ** 2 + ry ** 2 <= 1.0:
                t = y / size
                px[x, y] = mix(mix(light, base, min(1.0, t * 1.6)), dark, max(0.0, t - 0.6))
    for _ in range(size // 5):
        sx, sy = rng.randint(int(size * 0.25), int(size * 0.75)), rng.randint(int(size * 0.3), int(size * 0.85))
        r = rng.randint(size // 20, size // 12)
        for y in range(sy - r, sy + r + 1):
            for x in range(sx - r, sx + r + 1):
                if 0 <= x < size and 0 <= y < size and px[x, y][3] and (x - sx) ** 2 + (y - sy) ** 2 <= r * r:
                    px[x, y] = spot if (x + y) % 7 else scale(spot, 0.8)
    for y in range(size):                                  # garis tepi
        for x in range(size):
            if px[x, y][3] and any(
                    not (0 <= x + dx < size and 0 <= y + dy < size and px[x + dx, y + dy][3])
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = dark
    for y in range(int(size * 0.18), int(size * 0.30)):    # kilau
        for x in range(int(size * 0.33), int(size * 0.45)):
            if px[x, y][3]:
                px[x, y] = mix(px[x, y], (255, 255, 255, 255), 0.55)
    return img


def pack_icon(chars, size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size) * 0.45 + (y / size) * 0.55
            px[x, y] = mix((20, 22, 36, 255), (52, 32, 74, 255), t)
    heights = (0.44, 0.70, 0.92, 0.62, 0.80)
    bw, gap = size // 8, size // 22
    total = len(chars) * bw + (len(chars) - 1) * gap
    x0 = (size - total) // 2
    for i, ch in enumerate(chars):
        c = hexc(ch["palette"]["accent"])
        h = int(size * 0.55 * heights[i % len(heights)])
        bx, by = x0 + i * (bw + gap), int(size * 0.74) - h
        for y in range(by, by + h):
            f = 0.70 + 0.5 * (1 - (y - by) / max(1, h))
            for x in range(bx, bx + bw):
                px[x, y] = scale(c, f)
        for y in range(by + h + 3, min(size, by + h + int(size * 0.08))):
            for x in range(bx, bx + bw):
                a = 1 - (y - by - h) / (size * 0.08)
                px[x, y] = mix(px[x, y], c, 0.20 * a)
    for x in range(x0, x0 + total):
        for y in range(int(size * 0.78), int(size * 0.79)):
            px[x, y] = (236, 236, 246, 255)
    return img



# --- patok chunk ------------------------------------------------------------

def marker_texture(claimed, size=32):
    """Tekstur patok 32x32, memakai box-uv seperti model vanilla.

    Dua warna, satu bentuk: merah untuk chunk yang belum dipakai bertani, hijau
    untuk yang sudah dipatok. Warnanya dipilih render controller lewat
    query.variant, jadi mengganti status patok tidak perlu mengganti entity.
    """
    img = Image.new("RGBA", (size, size), CLEAR)
    px = img.load()
    wood = (122, 88, 52, 255)
    wood_d = (84, 58, 32, 255)
    head = (58, 178, 74, 255) if claimed else (206, 62, 58, 255)
    head_l = (110, 224, 122, 255) if claimed else (246, 118, 108, 255)
    head_d = (28, 116, 42, 255) if claimed else (140, 30, 30, 255)
    white = (240, 242, 246, 255)

    def rect(x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(size, y1)):
            for x in range(max(0, x0), min(size, x1)):
                px[x, y] = c

    # tiang: kotak uv (0,0) ukuran 2x14x2 -> memakai 8x16 texel
    rect(0, 0, 8, 16, wood)
    for y in range(0, 16, 3):                      # serat kayu
        rect(0, y, 8, y + 1, wood_d)
    rect(0, 0, 8, 2, wood_d)                       # tutup atas dan bawah

    # kepala: kotak uv (0,18) ukuran 5x4x5 -> 20x9 texel
    rect(0, 18, 20, 27, head)
    rect(0, 18, 20, 23, head_l)                    # tutup atas lebih terang
    rect(0, 25, 20, 26, head_d)

    # bendera: kotak uv (0,27) ukuran 7x4x1 -> 16x5 texel
    rect(0, 27, 16, 32, head)
    rect(0, 29, 16, 30, white)
    rect(14, 27, 16, 32, head_d)
    return img


def main():
    chars = model.load_characters()
    os.makedirs(ENT_DIR, exist_ok=True)
    os.makedirs(ITEM_DIR, exist_ok=True)
    for ch in chars:
        character_texture(ch).save(os.path.join(ENT_DIR, f"{ch['id']}.png"))
        spawn_egg(ch).save(os.path.join(ITEM_DIR, f"vbs_spawn_egg_{ch['id']}.png"))
        print(f"  {ch['id']:8s} tekstur {TEX_W}x{TEX_H} + spawn egg 64x64")
    marker_texture(False).save(os.path.join(ENT_DIR, "marker_free.png"))
    marker_texture(True).save(os.path.join(ENT_DIR, "marker_claimed.png"))
    print("  patok ladang: marker_free.png + marker_claimed.png 32x32")
    icon = pack_icon(chars)
    icon.save(os.path.join(RP, "pack_icon.png"))
    icon.save(os.path.join(BP, "pack_icon.png"))
    print("  pack_icon.png 256x256 untuk kedua pack")


if __name__ == "__main__":
    main()
