"""Layout UV bersama untuk semua karakter VBS Companions.

Tekstur berukuran 1024x1024 dengan RES=8 texel per satuan model — delapan kali
lipat resolusi kulit Minecraft biasa, supaya helai rambut, mata, tali baju dan
sol sepatu benar-benar bisa digambar. Resolusi setinggi itu hanya bisa dipakai
lewat UV per-face (uv + uv_size di tiap sisi kubus), karena "box uv" bawaan
Bedrock selalu memakai ukuran kubus dalam satuan model sebagai ukuran texel.

Tabel di bawah hanya menyebut UKURAN tiap slot dalam satuan model; koordinatnya
dihitung _pack() dengan menyusun rak dari kiri ke kanan, turun satu rak begitu
lembar penuh. Dulu koordinatnya ditulis tangan, dan tiap kali ada bagian baru
seluruh tabel harus dihitung ulang supaya tidak bertabrakan — sekarang cukup
menambah satu baris di tempat yang masuk akal untuk dibaca.

Ada dua tabel. UV dipakai karakter build "classic"; UV_DETAILED dipakai build
"detailed", yang punya rambut berlapis, delapan wajah, dan dua perawakan.
Keduanya boleh menempati koordinat yang sama: tiap karakter punya PNG sendiri
dan hanya menggambar slot milik build-nya, jadi yang harus bersih adalah tiap
tabel terhadap dirinya sendiri, bukan gabungannya.

Modul ini dipakai gen_geometry.py (menulis uv ke geometry), gen_textures.py
(menggambar) dan render_preview.py (membaca balik).
"""

RES = 8                       # texel per satuan model
TEX_W = 128 * RES             # 1024
TEX_H = 128 * RES             # 1024
SHEET = 128                   # lebar lembar dalam satuan model
GUTTER = 1                    # jarak antar slot, supaya mipmap tidak membaur


# slot -> (w, h, d) dalam satuan model: ukuran TERBESAR yang dipesan. Bagian
# yang panjangnya berbeda tiap karakter (rambut belakang, rambut samping, sepatu
# bot) boleh lebih pendek, tidak boleh lebih panjang.
UV_SIZES = {
    # kepala dan rambut
    "head":         (8, 8, 8),
    "hair_top":     (9, 4, 9),
    "bangs":        (9, 4, 2),
    "bangs2":       (5, 3, 2),
    "side_hair":    (2, 9, 9),
    "side_hair_l":  (2, 9, 9),
    "ahoge":        (1, 3, 2),
    "hair_back":    (9, 16, 2),
    "tail":         (3, 14, 3),
    "tail2":        (3, 8, 3),
    # badan
    "body":         (8, 12, 4),
    "jacket":       (8, 12, 4),
    "arm_r":        (3, 12, 3),
    "arm_l":        (3, 12, 3),
    "leg_r":        (3, 12, 3),
    "leg_l":        (3, 12, 3),
    "skirt":        (10, 6, 6),
    "lapel":        (8, 8, 1),
    # aksesori
    "hp_cup":       (2, 4, 4),
    "hp_band":      (8, 1, 2),
    "hood":         (7, 4, 3),
    "cap":          (9, 2, 9),
    "brim":         (7, 1, 3),
    "shoe":         (3, 5, 4),
    "cape":         (8, 14, 1),
    "clip":         (2, 1, 1),
    "collar":       (9, 3, 5),
    "cuff":         (3, 3, 3),
    "belt":         (8, 2, 4),
    # perlengkapan role: ada di semua karakter, disembunyikan render controller
    # kalau role yang sedang dijalankan tidak memakainya
    "hat_crown":    (7, 3, 7),
    "hat_brim":     (11, 1, 11),
    "helm":         (9, 3, 9),
    "lamp":         (2, 2, 1),
    "pack":         (6, 7, 3),
}

# Build "detailed": lembar tersendiri. Dua perawakan memakai tabel yang sama —
# yang perempuan memakai rok, kaus kaki dan sepatu tinggi, yang laki-laki memakai
# celana panjang, sepatu rendah dan tudung hoodie — jadi ada slot yang hanya
# terpakai salah satunya. Itu tidak masalah: yang tidak digambar tetap kosong di
# PNG karakter yang tidak memakainya.
UV_DETAILED_SIZES = {
    # kepala dan rambut
    "d_head":           (8, 8, 8),
    "d_hair_cap":       (8, 8, 8),
    "d_hair_back":      (9, 10, 3),
    "d_hair_nape":      (6, 6, 2),
    "d_hair_side":      (2, 6, 3),
    "d_spike":          (6, 3, 2),
    "d_ahoge":          (1, 3, 1),
    "d_clip":           (3, 1, 1),
    "d_ribbon":         (3, 2, 2),
    "d_tail_up":        (3, 6, 3),
    "d_tail_low":       (2, 6, 2),
    # pakaian
    "d_shirt":          (8, 12, 4),
    "d_jacket":         (8, 10, 4),
    "d_tape":           (8, 1, 4),
    "d_collar":         (8, 2, 4),
    "d_belt":           (8, 2, 4),
    "d_shorts":         (7, 4, 3),
    "d_hood":           (7, 5, 4),
    "d_neck":           (3, 2, 3),
    # anggota badan
    "d_sleeve":         (4, 8, 4),
    "d_cuff":           (4, 2, 4),
    "d_glove":          (4, 3, 4),
    "d_hand":           (4, 2, 4),
    "d_ear":            (1, 2, 1),
    "d_skirt_fb":       (9, 5, 1),
    "d_skirt_side":     (1, 5, 5),
    "d_sock":           (3, 9, 3),
    "d_pants":          (4, 10, 4),
    "d_boot":           (4, 3, 5),
    "d_shoe":           (4, 3, 4),
    # wajah: bidang setebal nol, jadi hanya sisi north yang punya luas — satu
    # petak 8x8 per ekspresi, berderet supaya mudah dibandingkan saat menggambar
    "d_face_neutral":   (8, 8, 0),
    "d_face_blink":     (8, 8, 0),
    "d_face_smile":     (8, 8, 0),
    "d_face_happy":     (8, 8, 0),
    "d_face_surprised": (8, 8, 0),
    "d_face_hurt":      (8, 8, 0),
    "d_face_sleepy":    (8, 8, 0),
    "d_face_sing":      (8, 8, 0),
    # perlengkapan role, kembarannya di tabel classic
    "d_hat_crown":      (7, 3, 7),
    "d_hat_brim":       (11, 1, 11),
    "d_helm":           (9, 3, 9),
    "d_lamp":           (2, 2, 1),
    "d_pack":           (6, 7, 3),
}


def _pack(sizes):
    """slot -> (u, v, w, h, d): susun rak dari kiri ke kanan, turun kalau penuh.

    Urutannya urutan penulisan tabel, bukan urutan terbaik — hasilnya sedikit
    lebih boros daripada pengepakan optimal, tapi tata letaknya jadi bisa ditebak
    dari membaca tabel, dan itu yang menolong waktu menggambar.
    """
    placed, x, y, shelf = {}, 0, 0, 0
    for slot, (w, h, d) in sizes.items():
        ew, eh = 2 * (w + d), h + d
        if x + ew > SHEET:
            x, y, shelf = 0, y + shelf + GUTTER, 0
        placed[slot] = (x, y, w, h, d)
        x += ew + GUTTER
        shelf = max(shelf, eh)
    return placed


UV = _pack(UV_SIZES)
UV_DETAILED = _pack(UV_DETAILED_SIZES)

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
            used = max((extent(s)[1] + extent(s)[3]) for s in table)
            print(f"layout UV {name} bersih: {len(table)} slot, "
                  f"terpakai sampai baris {used} dari {SHEET}")
