"""Render preview karakter dari geometry + tekstur yang persis dipakai game.

Bukan mockup: file ini membaca vbs_companions.geo.json dan PNG 1024x1024 yang
sama dengan yang dibaca Minecraft, lalu memproyeksikan tiap face kubus secara
ortografis, merasterisasinya dengan pemetaan affine (eksak untuk proyeksi
ortografis) dan z-buffer per piksel, jadi tumpang tindih rambut/jaket dan
potongan alpha di ujung poni persis seperti yang akan tampil di gim.

    python3 render_preview.py
"""

import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

import model

RP = os.path.join(model.HERE, "..", "resource_packs", "vbs_companions_rp")
GEO = os.path.join(RP, "models", "entity", "vbs_companions.geo.json")
TEX = os.path.join(RP, "textures", "entity", "vbs_companions")
OUT = os.path.join(model.HERE, "..", "docs", "preview")

SS = 2                       # supersampling sebelum diperkecil
SCALE = 10.6                 # piksel layar per satuan model
VIEW_W, VIEW_H = 220, 430
VIEWS = (("Depan", 0, 0), ("3/4", 34, 8), ("Samping", 90, 0), ("Belakang", 180, 0))

# Cahaya arah yang lembut; tekstur sengaja tidak membakar bayangan arah.
LIGHT = {"up": 1.08, "north": 1.0, "south": 0.90, "east": 0.87, "west": 0.83, "down": 0.72}

BG_TOP = (86, 94, 116)
BG_BOTTOM = (38, 41, 56)


def rot_y(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)


def rot_x(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c)


def rot_z(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2])


def cube_faces(cube):
    """(nama, A, U, V, kotak_uv) tiap face: A titik texel (0,0), U arah +u, V arah +v."""
    o, sz = cube["origin"], cube["size"]
    inf = cube.get("inflate", 0.0)
    x0, y0, z0 = (o[i] - inf for i in range(3))
    x1, y1, z1 = (o[i] + sz[i] + inf for i in range(3))
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0

    out = [
        ("east",  (x0, y1, z1), (0, 0, -dz), (0, -dy, 0)),
        ("north", (x0, y1, z0), (dx, 0, 0),  (0, -dy, 0)),
        ("west",  (x1, y1, z0), (0, 0, dz),  (0, -dy, 0)),
        ("south", (x1, y1, z1), (-dx, 0, 0), (0, -dy, 0)),
        ("up",    (x0, y1, z0), (dx, 0, 0),  (0, 0, dz)),
        ("down",  (x0, y0, z1), (dx, 0, 0),  (0, 0, -dz)),
    ]
    rot, piv = cube.get("rotation"), cube.get("pivot")
    if rot:
        def turn(p):
            q = tuple(p[i] - piv[i] for i in range(3))
            q = rot_z(rot_y(rot_x(q, rot[0]), rot[1]), rot[2])
            return tuple(q[i] + piv[i] for i in range(3))

        out = [(n,
                turn(a),
                tuple(turn(tuple(a[i] + u[i] for i in range(3)))[i] - turn(a)[i] for i in range(3)),
                tuple(turn(tuple(a[i] + v[i] for i in range(3)))[i] - turn(a)[i] for i in range(3)))
               for n, a, u, v in out]

    uv = cube["uv"]
    return [(n, a, u, v, (uv[n]["uv"][0], uv[n]["uv"][1],
                          uv[n]["uv_size"][0], uv[n]["uv_size"][1]))
            for n, a, u, v in out]


def render(geo, tex, yaw, pitch, w, h, scale, focus=None):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    tpx = tex.load()
    tw, th = tex.size
    zbuf = [[1e9] * w for _ in range(h)]
    if focus is None:
        cx, cy = w / 2, h - 2.0 * scale          # kaki menempel di dasar
    else:
        cx, cy = w / 2 - focus[0] * scale, h / 2 + focus[1] * scale

    def project(p):
        q = rot_x(rot_y(p, yaw), pitch)
        return (cx + q[0] * scale, cy - q[1] * scale, q[2])

    for bone in geo["bones"]:
        for cube in bone.get("cubes", []):
            for name, a, u, v, (tx, ty, tuw, tvh) in cube_faces(cube):
                if tuw <= 0 or tvh <= 0:
                    continue
                pa = project(a)
                pb = project(tuple(a[i] + u[i] for i in range(3)))
                pd = project(tuple(a[i] + v[i] for i in range(3)))
                ex, ey = pb[0] - pa[0], pb[1] - pa[1]
                fx, fy = pd[0] - pa[0], pd[1] - pa[1]
                det = ex * fy - ey * fx
                if abs(det) < 1e-9:
                    continue                     # face menghadap tepi
                xs = (pa[0], pb[0], pd[0], pa[0] + ex + fx)
                ys = (pa[1], pb[1], pd[1], pa[1] + ey + fy)
                x_lo, x_hi = max(0, int(min(xs))), min(w - 1, int(max(xs)) + 1)
                y_lo, y_hi = max(0, int(min(ys))), min(h - 1, int(max(ys)) + 1)
                za, zb, zd = pa[2], pb[2], pd[2]
                light = LIGHT[name]
                for y in range(y_lo, y_hi + 1):
                    for x in range(x_lo, x_hi + 1):
                        rx, ry = x + 0.5 - pa[0], y + 0.5 - pa[1]
                        s = (rx * fy - ry * fx) / det
                        t = (ex * ry - ey * rx) / det
                        if not (0.0 <= s < 1.0 and 0.0 <= t < 1.0):
                            continue
                        z = za + (zb - za) * s + (zd - za) * t
                        if z >= zbuf[y][x]:
                            continue
                        sx = min(tw - 1, tx + int(s * tuw))
                        sy = min(th - 1, ty + int(t * tvh))
                        c = tpx[sx, sy]
                        if c[3] < 8:
                            continue             # potongan alpha: tembus pandang
                        zbuf[y][x] = z
                        px[x, y] = (min(255, int(c[0] * light)),
                                    min(255, int(c[1] * light)),
                                    min(255, int(c[2] * light)), 255)
    return img


def backdrop(w, h):
    bg = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(bg)
    for y in range(h):
        t = (y / max(1, h - 1)) ** 0.85
        d.line([(0, y), (w, y)],
               fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t)
                          for i in range(3)) + (255,))
    return bg


def add_shadow(img, cx, cy, rx, ry):
    """Bayangan lantai. Digambar di lapisan terpisah lalu ditumpuk, karena
    ImageDraw mode RGBA menimpa alpha alih-alih membaurkannya."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(7, 0, -1):
        f = i / 7
        d.ellipse([cx - rx * f, cy - ry * f, cx + rx * f, cy + ry * f],
                  fill=(4, 5, 9, int(20 * (1.15 - f))))
    img.alpha_composite(layer)


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def accent_of(ch):
    h = ch["palette"]["accent"].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def view(geo, tex, yaw, pitch, w, h, scale, focus=None):
    img = render(geo, tex, yaw, pitch, w * SS, h * SS, scale * SS, focus)
    return img.resize((w, h), Image.LANCZOS)


def sheet(char, geo, tex):
    head_w = 300
    w, h = VIEW_W * len(VIEWS) + head_w, VIEW_H + 60
    out = backdrop(w, h)
    d = ImageDraw.Draw(out)
    for i, (label, yaw, pitch) in enumerate(VIEWS):
        vx = i * VIEW_W
        add_shadow(out, vx + VIEW_W / 2, VIEW_H - 22, 54, 13)
        out.alpha_composite(view(geo, tex, yaw, pitch, VIEW_W, VIEW_H, SCALE), (vx, 0))
        d.text((vx + VIEW_W / 2, VIEW_H + 6), label, fill=(196, 202, 220, 255),
               font=font(16), anchor="ma")
        if i:
            d.line([(vx, 16), (vx, VIEW_H - 16)], fill=(255, 255, 255, 26))
    hx = VIEW_W * len(VIEWS)
    d.line([(hx, 16), (hx, VIEW_H - 16)], fill=(255, 255, 255, 26))
    out.alpha_composite(view(geo, tex, 16, 4, head_w, VIEW_H, 30, focus=(0, 28.6, 0)), (hx, 0))
    d.text((hx + head_w / 2, VIEW_H + 6), "Wajah (perbesaran)", fill=(196, 202, 220, 255),
           font=font(16), anchor="ma")

    d.rectangle([0, h - 32, w, h], fill=(12, 13, 20, 255))
    d.text((16, h - 25), char["name"].upper(), fill=accent_of(char), font=font(20))
    d.text((16 + 13 * len(char["name"]) + 18, h - 23),
           f"{char['full_name']}  ·  {char['group']}  ·  {char['tagline']}",
           fill=(150, 156, 176, 255), font=font(13))
    return out


def lineup(chars, geos, texs):
    w, h = VIEW_W * len(chars), VIEW_H + 42
    out = backdrop(w, h)
    d = ImageDraw.Draw(out)
    for i, ch in enumerate(chars):
        vx = i * VIEW_W
        add_shadow(out, vx + VIEW_W / 2, VIEW_H - 22, 54, 13)
        out.alpha_composite(view(geos[ch["id"]], texs[ch["id"]], 28, 7,
                                 VIEW_W, VIEW_H, SCALE), (vx, 0))
        d.text((vx + VIEW_W / 2, VIEW_H + 10), ch["name"].upper(),
               fill=accent_of(ch), font=font(18), anchor="ma")
    return out


def main():
    chars = model.load_characters()
    with open(GEO, encoding="utf-8") as f:
        geos = {g["description"]["identifier"].split(".")[-1]: g
                for g in json.load(f)["minecraft:geometry"]}
    texs = {c["id"]: Image.open(os.path.join(TEX, f"{c['id']}.png")).convert("RGBA")
            for c in chars}
    os.makedirs(OUT, exist_ok=True)
    for ch in chars:
        path = os.path.join(OUT, f"{ch['id']}.png")
        sheet(ch, geos[ch["id"]], texs[ch["id"]]).save(path)
        print("  " + os.path.relpath(path, model.HERE))
    path = os.path.join(OUT, "lineup.png")
    lineup(chars, geos, texs).save(path)
    print("  " + os.path.relpath(path, model.HERE))


if __name__ == "__main__":
    main()
