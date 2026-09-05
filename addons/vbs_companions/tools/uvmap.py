"""Layout UV bersama untuk semua karakter VBS Companions.

Tekstur berukuran 1024x1024 dengan RES=8 texel per satuan model — delapan kali
lipat resolusi kulit Minecraft biasa, supaya helai rambut, mata, tali baju dan
sol sepatu benar-benar bisa digambar. Resolusi setinggi itu hanya bisa dipakai
lewat UV per-face (uv + uv_size di tiap sisi kubus), karena "box uv" bawaan
Bedrock selalu memakai ukuran kubus dalam satuan model sebagai ukuran texel.

Tabel di bawah ditulis dalam SATUAN MODEL supaya enak dibaca dan cocok dengan
angka di model.py; texel_faces() yang mengalikannya dengan RES.

Ada dua tabel. UV dipakai kelima karakter build "classic"; UV_DETAILED dipakai
build "detailed" (Kohane), yang punya rambut berlapis, rok empat panel dan
delapan wajah, jadi butuh jauh lebih banyak slot. Keduanya boleh menempati
koordinat yang sama: tiap karakter punya PNG sendiri dan hanya menggambar slot
milik build-nya, jadi yang harus bersih adalah tiap tabel terhadap dirinya
sendiri, bukan gabungannya.

Modul ini dipakai gen_geometry.py (menulis uv ke geometry), gen_textures.py
(menggambar) dan render_preview.py (membaca balik).
"""

RES = 8                       # texel per satuan model
TEX_W = 128 * RES             # 1024
TEX_H = 128 * RES             # 1024

# slot -> (u, v, w, h, d) dalam satuan model. w/h/d = ukuran TERBESAR yang
# dipesan; bagian yang panjangnya berbeda tiap karakter (rambut belakang,
# rambut samping, sepatu bot) boleh lebih pendek, tidak boleh lebih panjang.
UV = {
    # kepala dan rambut
    "head":         (0, 0, 8, 8, 8),
    "hair_top":     (0, 16, 9, 4, 9),
    "bangs":        (40, 16, 9, 4, 2),
    "bangs2":       (40, 24, 5, 3, 2),
    "side_hair":    (64, 16, 2, 9, 9),
    "side_hair_l":  (96, 16, 2, 9, 9),
    "ahoge":        (88, 16, 1, 3, 2),
    "hair_back":    (0, 64, 9, 16, 2),
    "tail":         (24, 64, 3, 14, 3),
    "tail2":        (40, 64, 3, 8, 3),
    # badan
    "body":         (0, 32, 8, 12, 4),
    "jacket":       (0, 48, 8, 12, 4),
    "arm_r":        (24, 32, 3, 12, 3),
    "arm_l":        (24, 48, 3, 12, 3),
    "leg_r":        (40, 32, 3, 12, 3),
    "leg_l":        (40, 48, 3, 12, 3),
    "skirt":        (56, 40, 10, 6, 6),
    "lapel":        (88, 40, 8, 8, 1),
    # aksesori
    "hp_cup":       (56, 64, 2, 4, 4),
    "hp_band":      (72, 64, 8, 1, 2),
    "hood":         (56, 72, 7, 4, 3),
    "cap":          (92, 72, 9, 2, 9),
    "brim":         (92, 84, 7, 1, 3),
    "shoe":         (0, 88, 3, 5, 4),
    "cape":         (16, 88, 8, 14, 1),
    "clip":         (40, 88, 2, 1, 1),
    "collar":       (56, 88, 9, 3, 5),
    "cuff":         (0, 100, 3, 3, 3),
    "belt":         (16, 104, 8, 2, 4),
}

# Build "detailed": lembar tersendiri, disusun rak demi rak mengikuti urutan
# daftar ini — kepala dan rambut, lalu pakaian, lalu anggota badan, lalu deretan
# wajah. Terpakai sampai baris 60 dari 128, jadi masih longgar.
UV_DETAILED = {
    # kepala dan rambut
    "d_head":           (0, 0, 8, 8, 8),
    "d_hair_cap":       (32, 0, 8, 8, 8),
    "d_hair_back":      (64, 0, 9, 10, 3),
    "d_hair_nape":      (88, 0, 6, 6, 2),
    "d_hair_side":      (104, 0, 2, 6, 3),
    "d_ahoge":          (114, 0, 1, 3, 1),
    "d_clip":           (118, 0, 3, 1, 1),
    "d_ribbon":         (0, 16, 3, 2, 2),
    "d_tail_up":        (10, 16, 3, 6, 3),
    "d_tail_low":       (22, 16, 2, 6, 2),
    # pakaian
    "d_shirt":          (30, 16, 7, 12, 4),
    "d_jacket":         (52, 16, 7, 9, 4),
    "d_tape":           (74, 16, 7, 1, 4),
    "d_collar":         (96, 16, 7, 2, 4),
    "d_shorts":         (0, 32, 7, 4, 3),
    "d_neck":           (20, 32, 3, 2, 3),
    # anggota badan
    "d_sleeve":         (32, 32, 3, 7, 3),
    "d_cuff":           (44, 32, 3, 2, 3),
    "d_hand":           (56, 32, 3, 2, 3),
    "d_ear":            (68, 32, 1, 2, 1),
    "d_skirt_fb":       (72, 32, 9, 5, 1),
    "d_skirt_side":     (92, 32, 1, 5, 5),
    "d_sock":           (104, 32, 3, 9, 3),
    "d_boot":           (0, 44, 4, 3, 5),
    # wajah: bidang setebal nol, jadi hanya sisi north yang punya luas — satu
    # petak 8x8 per ekspresi, berderet supaya mudah dibandingkan saat menggambar
    "d_face_neutral":   (18, 44, 8, 8, 0),
    "d_face_blink":     (34, 44, 8, 8, 0),
    "d_face_smile":     (50, 44, 8, 8, 0),
    "d_face_happy":     (66, 44, 8, 8, 0),
    "d_face_surprised": (82, 44, 8, 8, 0),
    "d_face_hurt":      (98, 44, 8, 8, 0),
    "d_face_sleepy":    (0, 52, 8, 8, 0),
    "d_face_sing":      (16, 52, 8, 8, 0),
}

# Pencarian slot tidak peduli build mana; nama sudah dibedakan awalan "d_".
UV_ALL = {**UV, **UV_DETAILED}

# Nama face memakai arah dunia Bedrock. Model menghadap -Z seperti model vanilla,
# jadi "north" adalah bagian DEPAN karakter (wajah, ritsleting) dan "south"
# punggung. "east" sisi -X, "west" sisi +X.
FACES = ("up", "down", "east", "north", "west", "south")


def faces(slot, size=None):
    """Kotak (x, y, w, h) tiap face dalam SATUAN MODEL.

    Tata letaknya meniru urutan buka-kotak Bedrock: sisi -X, depan, sisi +X,
    belakang berjajar ke kanan, dengan tutup atas dan bawah di baris di atasnya.
    """
    u, v, w, h, d = UV_ALL[slot]
    if size is not None:
        w, h, d = size
    return {
        "up":    (u + d,             v,     w, d),
        "down":  (u + d + w,         v,     w, d),
        "east":  (u,                 v + d, d, h),
        "north": (u + d,             v + d, w, h),
        "west":  (u + d + w,         v + d, d, h),
        "south": (u + d + w + d,     v + d, w, h),
    }


def texel_faces(slot, size=None):
    """Kotak (x, y, w, h) tiap face dalam TEXEL tekstur 1024x1024."""
    return {name: tuple(int(round(v * RES)) for v in rect)
            for name, rect in faces(slot, size).items()}


def extent(slot):
    """Kotak (x, y, w, h) satuan model yang dipesan seluruh slot."""
    u, v, w, h, d = UV_ALL[slot]
    return (u, v, 2 * (w + d), h + d)


def _check_table(name, table):
    """Slot dalam SATU tabel tidak boleh keluar tekstur atau saling menimpa."""
    problems = []
    boxes = {}
    for slot in table:
        x, y, w, h = extent(slot)
        if (x + w) * RES > TEX_W or (y + h) * RES > TEX_H:
            problems.append(f"{name}: {slot} keluar dari tekstur: {(x, y, w, h)}")
        boxes[slot] = (x, y, x + w, y + h)
    names = sorted(boxes)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            ax0, ay0, ax1, ay1 = boxes[a]
            bx0, by0, bx1, by1 = boxes[b]
            if ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1:
                problems.append(f"{name}: {a} dan {b} tumpang tindih di tekstur")
    return problems


def check_layout():
    # Sengaja per tabel: tiap karakter menggambar slot satu build saja, jadi
    # classic dan detailed boleh menempati koordinat yang sama.
    return _check_table("classic", UV) + _check_table("detailed", UV_DETAILED)


if __name__ == "__main__":
    issues = check_layout()
    if issues:
        print("\n".join(issues))
    else:
        for name, table in (("classic", UV), ("detailed", UV_DETAILED)):
            used = max((extent(s)[1] + extent(s)[3]) for s in table) * RES
            print(f"layout UV {name} bersih: {len(table)} slot, "
                  f"tekstur {TEX_W}x{TEX_H}, terpakai sampai baris {used}")
