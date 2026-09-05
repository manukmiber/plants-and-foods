"""Kuas dasar yang dipakai semua penggambar tekstur.

Satu Face = satu sisi kubus, dan semua koordinatnya pecahan 0..1 dari sisi itu —
bukan nomor piksel — supaya kodenya kebaca sebagai "poni menutupi 40% atas wajah"
dan tetap benar kalau RES di uvmap.py diubah.

Dipisah dari gen_textures.py karena ada dua penggambar sekarang: gaya classic di
gen_textures.py dan gaya detailed di detailed.py.
"""

import math
import random

from uvmap import RES, texel_faces


# Bayangan bentuk yang halus, bukan pencahayaan arah — kulit Minecraft asli juga
# tidak membakar arah cahaya ke tekstur.
FORM = {"up": 1.05, "north": 1.0, "east": 0.95, "west": 0.93, "south": 0.94, "down": 0.82}


# --- warna -----------------------------------------------------------------

def hexc(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def scale(c, f):
    return tuple(min(255, max(0, round(c[i] * f))) for i in range(3)) + (c[3],)


CLEAR = (0, 0, 0, 0)


class Face:
    """Satu sisi kubus. Semua koordinat pecahan 0..1 dari sisi itu."""

    def __init__(self, px, rect, tone=1.0, rng=None):
        self.px = px
        self.x, self.y, self.w, self.h = rect
        self.tone = tone
        self.rng = rng or random.Random(0)

    # -- dasar
    def _put(self, ix, iy, c):
        if 0 <= ix < self.w and 0 <= iy < self.h:
            self.px[self.x + ix, self.y + iy] = c if c[3] == 0 else scale(c, self.tone)

    def _range(self, x0, x1, n):
        return range(max(0, int(round(x0 * n))), min(n, int(round(x1 * n))))

    def box(self, x0, y0, x1, y1, c):
        for iy in self._range(y0, y1, self.h):
            for ix in self._range(x0, x1, self.w):
                self._put(ix, iy, c)

    def fill(self, c):
        self.box(0, 0, 1, 1, c)

    def cut(self, x0, y0, x1, y1):
        for iy in self._range(y0, y1, self.h):
            for ix in self._range(x0, x1, self.w):
                if 0 <= ix < self.w and 0 <= iy < self.h:
                    self.px[self.x + ix, self.y + iy] = CLEAR

    def grad(self, c0, c1, y0=0.0, y1=1.0, horizontal=False):
        n = self.w if horizontal else self.h
        lo, hi = int(round(y0 * n)), int(round(y1 * n))
        for i in range(max(0, lo), min(n, hi)):
            t = (i - lo) / max(1, hi - lo - 1)
            c = mix(c0, c1, t)
            if horizontal:
                for iy in range(self.h):
                    self._put(i, iy, c)
            else:
                for ix in range(self.w):
                    self._put(ix, i, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for iy in range(self.h):
            for ix in range(self.w):
                dx = (ix + 0.5) / self.w - cx
                dy = (iy + 0.5) / self.h - cy
                if (dx / rx) ** 2 + (dy / ry) ** 2 <= 1.0:
                    self._put(ix, iy, c)

    def hline(self, y, x0, x1, c, thick=1):
        self.box(x0, y, x1, y + thick / self.h, c)

    def vline(self, x, y0, y1, c, thick=1):
        self.box(x, y0, x + thick / self.w, y1, c)

    def dither(self, x0, y0, x1, y1, c, amount=0.5):
        for iy in self._range(y0, y1, self.h):
            for ix in self._range(x0, x1, self.w):
                if self.rng.random() < amount:
                    cur = self.px[self.x + ix, self.y + iy]
                    self._put(ix, iy, mix(cur, c, 0.5))

    def edges(self, c, t=0.35, top=False):
        """Gelapkan tepi supaya bentuk kubusnya terbaca."""
        for iy in range(self.h):
            for ix in range(self.w):
                near = min(ix, self.w - 1 - ix, iy if top else self.h, self.h - 1 - iy)
                if near == 0:
                    cur = self.px[self.x + ix, self.y + iy]
                    if cur[3]:
                        self.px[self.x + ix, self.y + iy] = mix(cur, c, t)

    def spiky_bottom(self, spikes, depth, jitter=0.4):
        """Potong tepi bawah jadi gerigi — inilah yang bikin ujung rambut runcing."""
        for ix in range(self.w):
            u = (ix + 0.5) / self.w * spikes
            saw = abs((u % 1.0) - 0.5) * 2.0
            d = depth * (saw + jitter * math.sin(u * 7.3))
            top = self.h - max(0, int(round(d * self.h)))
            for iy in range(top, self.h):
                self.px[self.x + ix, self.y + iy] = CLEAR


def faces_of(px, slot, size, rng, alpha_slots=()):
    """Enam Face satu kubus, sudah dibersihkan ke warna dasar."""
    rects = texel_faces(slot, size)
    return {name: Face(px, rects[name], FORM[name], rng) for name in rects}
