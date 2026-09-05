"""Bentuk model tiap karakter, dalam satu tempat.

gen_geometry.py mengubahnya jadi geometry Bedrock, gen_textures.py memakainya
untuk tahu kubus mana berukuran berapa di slot UV mana. Karena keduanya membaca
fungsi yang sama, tekstur dan model tidak mungkin melenceng.

Satuan = piksel model (16 = 1 blok). Model menghadap -Z seperti model vanilla,
jadi wajah dan ritsleting jaket ada di sisi -Z. Tinggi total ~2 blok supaya
karakter berdiri sejajar dengan pemain.

Kubus yang saling menembus itu wajar (rambut menembus kepala, jaket menembus
badan); yang dihindari adalah dua face persis sebidang, karena itu yang bikin
z-fighting. Karena itu banyak koordinat berakhiran .1 / .6 — bukan kebetulan.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def load_characters():
    with open(os.path.join(HERE, "characters.json"), encoding="utf-8") as f:
        return json.load(f)["characters"]


def cube(slot, origin, size, inflate=None, rotation=None, pivot=None):
    c = {"slot": slot, "origin": [float(v) for v in origin], "size": [float(v) for v in size]}
    if inflate:
        c["inflate"] = inflate
    if rotation:
        c["rotation"] = list(rotation)
        c["pivot"] = list(pivot)
    return c


# Bone yang harus ada di SEMUA karakter, walau kosong: animasi bersama boleh
# menyebutnya, dan validate.py menolak animasi yang menunjuk bone yang hilang.
ALWAYS = ("waist", "cape", "headphones", "cap",
          "hair_tail", "hair_tail_r", "hair_tail_l",
          "hair_tail_r_tip", "hair_tail_l_tip",
          "skirt_front", "skirt_back", "skirt_right", "skirt_left")

PARENT_OF = {"waist": "body", "cape": "body", "headphones": "head", "cap": "head",
             "hair_tail": "head", "hair_tail_r": "head", "hair_tail_l": "head",
             "hair_tail_r_tip": "hair_tail_r", "hair_tail_l_tip": "hair_tail_l",
             "skirt_front": "waist", "skirt_back": "waist",
             "skirt_right": "waist", "skirt_left": "waist"}


def build_bones(char):
    """Daftar bone -> kubus untuk satu karakter.

    Dua bentuk badan: "classic" (satu kubus per bagian) dan "detailed" (rambut
    berlapis, delapan wajah, dua perawakan). Keduanya memakai nama bone yang sama
    untuk bagian yang sama, jadi satu berkas animasi menggerakkan keduanya, dan
    keduanya diakhiri dengan bone perlengkapan role yang sama.
    """
    build = char["style"].get("build", "classic")
    bones = build_detailed(char) if build == "detailed" else build_classic(char)
    return _fill_optional(bones) + gear_bones(build)


def gear_bones(build):
    """Perlengkapan yang muncul menurut role, bukan menurut karakter.

    Keempatnya ada di SEMUA karakter dan selalu punya kubus; yang menyembunyikan
    adalah part_visibility di render controller, yang membacanya dari entity
    property vbs:hat. Dibuat begitu supaya berganti role tidak perlu mengganti
    geometry — cukup satu setProperty dari script.
    """
    p = "d_" if build == "detailed" else ""
    return [
        # topi jerami petani: mahkota di atas rambut, tepi lebar mengelilingi
        {"name": "gear_hat", "parent": "head", "pivot": [0, 32, 0], "cubes": [
            cube(f"{p}hat_brim", [-5.5, 32.6, -5.5], [11, 1, 11]),
            cube(f"{p}hat_crown", [-3.5, 33.0, -3.5], [7, 3, 7]),
        ]},
        # helm penambang
        {"name": "gear_helm", "parent": "head", "pivot": [0, 32, 0],
         "cubes": [cube(f"{p}helm", [-4.6, 31.6, -4.6], [9, 3, 9], inflate=0.2)]},
        # lampu di kening helm — bone sendiri supaya bisa diayun animasi menambang
        {"name": "gear_lamp", "parent": "head", "pivot": [0, 32.4, -4.4],
         "cubes": [cube(f"{p}lamp", [-1, 32.6, -5.6], [2, 2, 1])]},
        # ransel pengembara
        {"name": "gear_pack", "parent": "body", "pivot": [0, 20, 2],
         "cubes": [cube(f"{p}pack", [-3, 14, 2.1], [6, 7, 3])]},
    ]


def _fill_optional(bones):
    """Tambahkan bone wajib yang belum ada sebagai bone kosong."""
    have = {b["name"] for b in bones}
    by_name = {b["name"]: b for b in bones}
    for name in ALWAYS:
        if name in have:
            continue
        parent = PARENT_OF[name]
        pivot = by_name[parent]["pivot"] if parent in by_name else [0, 0, 0]
        bones.append({"name": name, "parent": parent, "pivot": list(pivot), "cubes": []})
        by_name[name] = bones[-1]
    return bones


def build_classic(char):
    st = char["style"]
    bones = []
    bones.append({"name": "root", "parent": None, "pivot": [0, 0, 0], "cubes": []})

    # --- badan -------------------------------------------------------------
    body = [
        cube("body", [-4, 12, -2], [8, 12, 4]),          # kaus / kulit
        cube("jacket", [-4, 12, -2], [8, 12, 4], inflate=0.3),   # lapisan luar
    ]
    if st["collar"]:
        h = 3 if st["cape"] else 2                        # kerah tinggi untuk mantel
        body.append(cube("collar", [-4.5, 24 - h, -2.5], [9, h, 5]))
    if st["lapel"]:
        body.append(cube("lapel", [-4, 15.6, -2.75], [8, 8, 1]))
    if st["belt"]:
        body.append(cube("belt", [-4, 11.6, -2], [8, 2, 4], inflate=0.3))
    if st["hood"]:
        body.append(cube("hood", [-3.5, 19.6, 1.9], [7, 4, 3]))
    bones.append({"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": body})

    # --- pinggang: rok / ekor mantel ---------------------------------------
    waist = []
    if st["skirt"]:
        waist.append(cube("skirt", [-5, 6.4, -3], [10, 6, 6]))
    bones.append({"name": "waist", "parent": "body", "pivot": [0, 12, 0], "cubes": waist})

    # --- jubah -------------------------------------------------------------
    cape = []
    if st["cape"]:
        cape.append(cube("cape", [-4, 8.5, 2.6], [8, 14, 1]))
    bones.append({"name": "cape", "parent": "body", "pivot": [0, 22.5, 2.6], "cubes": cape})

    # --- kepala ------------------------------------------------------------
    bones.append({"name": "head", "parent": "body", "pivot": [0, 24, 0],
                  "cubes": [cube("head", [-4, 24, -4], [8, 8, 8])]})

    # --- rambut ------------------------------------------------------------
    side, back = st["side_len"], st["back_len"]
    hair = [
        cube("hair_top", [-4.5, 28.4, -3.5], [9, 4, 9], inflate=0.1),
        cube("bangs", [-4.5, 28.8, -4.9], [9, 4, 2]),
        cube("side_hair", [-4.8, 32.4 - side, -3.6], [2, side, 9]),
        cube("side_hair_l", [2.8, 32.4 - side, -3.6], [2, side, 9]),
        cube("hair_back", [-4.5, 31.4 - back, 3.5], [9, back, 2]),
    ]
    if st["bangs"] == "spiky":
        hair.append(cube("bangs2", [-2.5, 29.6, -5.6], [5, 3, 2],
                         rotation=[10, 0, 0], pivot=[0, 29.6, -4.6]))
    if st["ahoge"]:
        hair.append(cube("ahoge", [-0.5, 32.2, -1.0], [1, 3, 2],
                         rotation=[-32, 0, 0], pivot=[0, 32.2, 0]))
    if st["clip"]:
        hair.append(cube("clip", [2.6, 30.4, -5.05], [2, 1, 1]))
    bones.append({"name": "hair", "parent": "head", "pivot": [0, 24, 0], "cubes": hair})

    # --- topi --------------------------------------------------------------
    cap = []
    if st["cap"]:
        cap.append(cube("cap", [-4.6, 30.6, -4.4], [9, 2, 9], inflate=0.3))
        cap.append(cube("brim", [-3.5, 30.8, 4.4], [7, 1, 3]))   # dipakai terbalik
    bones.append({"name": "cap", "parent": "head", "pivot": [0, 30.6, 0], "cubes": cap})

    # --- ekor rambut -------------------------------------------------------
    tail, tail_r, tail_l = [], [], []
    if st["tail"] == "side":
        tail.append(cube("tail", [2.5, 15, 1.5], [3, 14, 3]))
    if st["twintails"]:
        tail_r.append(cube("tail2", [-6.4, 21, 0.5], [3, 8, 3]))
        tail_l.append(cube("tail2", [3.4, 21, 0.5], [3, 8, 3]))
    bones.append({"name": "hair_tail", "parent": "head", "pivot": [4, 29, 3], "cubes": tail})
    bones.append({"name": "hair_tail_r", "parent": "head", "pivot": [-4.9, 29, 2], "cubes": tail_r})
    bones.append({"name": "hair_tail_l", "parent": "head", "pivot": [4.9, 29, 2], "cubes": tail_l})

    # --- lengan ------------------------------------------------------------
    for name, slot, x, pivot_x in (("rightArm", "arm_r", -7.0, -4.0),
                                   ("leftArm", "arm_l", 4.0, 4.0)):
        cubes = [cube(slot, [x, 10.5, -1.5], [3, 12, 3])]
        if st["gloves"]:
            cubes.append(cube("cuff", [x, 10.5, -1.5], [3, 3, 3], inflate=0.3))
        bones.append({"name": name, "parent": "body",
                      "pivot": [pivot_x, 22.5, 0], "cubes": cubes})

    # --- kaki --------------------------------------------------------------
    boot_h = 5 if st["boots"] else 3
    for name, slot, x, pivot_x in (("rightLeg", "leg_r", -3.2, -1.7),
                                   ("leftLeg", "leg_l", 0.2, 1.7)):
        bones.append({"name": name, "parent": "root", "pivot": [pivot_x, 12, 0], "cubes": [
            cube(slot, [x, 0, -1.5], [3, 12, 3]),
            cube("shoe", [x, 0, -2], [3, boot_h, 4], inflate=0.25),
        ]})

    return bones


# Ekspresi wajah build "detailed", urut sesuai prioritas render controller.
FACES = ("neutral", "blink", "smile", "happy", "surprised", "hurt", "sleepy", "sing")


def build_detailed(char):
    """Badan karakter yang detail, dalam dua perawakan.

    Bedanya dengan classic bukan sekadar jumlah kubus: rambut jadi cangkang
    berpotongan poni supaya wajah tembus di baliknya, ekor rambut dua ruas supaya
    ujungnya tertinggal sepersekian detik dari kepala, dan wajah jadi delapan
    bidang bertumpuk yang dipilih render controller.

    Dua perawakan memakai kerangka dan nama bone yang persis sama — kaki 0..12,
    badan 12..24, kepala 24..32 — jadi satu berkas animasi menggerakkan keduanya
    dan keduanya berdiri sejajar di lineup. Yang berbeda hanya potongannya:
    "female" memakai rok empat panel, kaus kaki selutut dan sepatu tinggi;
    "male" memakai bahu lebih lebar, celana panjang, sepatu rendah, tudung hoodie
    di punggung dan poni runcing.
    """
    st = char["style"]
    if st.get("figure", "female") == "male":
        return _detailed_male(st)
    return _detailed_female(st)


def _detailed_head(hair, spike_cut=False):
    """Kepala, delapan bidang wajah, dan bone rambut — sama untuk dua perawakan."""
    bones = [{"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [
        cube("d_head", [-4, 24, -4], [8, 8, 8]),
        cube("d_ear", [-4.6, 26, -1], [1, 2, 1]),
        cube("d_ear", [3.6, 26, -1], [1, 2, 1]),
    ]}]
    # Wajah: satu bidang per ekspresi, semuanya di tempat yang sama. Render
    # controller memilih satu; sisanya disembunyikan.
    for name in FACES:
        bones.append({"name": f"face_{name}", "parent": "head", "pivot": [0, 24, 0],
                      "cubes": [cube(f"d_face_{name}", [-4, 24, -4.15], [8, 8, 0])]})
    bones.append({"name": "hair", "parent": "head", "pivot": [0, 24, 0], "cubes": hair})
    bones.append({"name": "cap", "parent": "head", "pivot": [0, 30.6, 0], "cubes": []})
    return bones


def _detailed_female(st):
    bones = [{"name": "root", "parent": None, "pivot": [0, 0, 0], "cubes": []}]

    # --- badan: kemeja, jaket terbuka, pita dada, kerah, celana pendek ------
    bones.append({"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": [
        cube("d_shirt", [-3.5, 12, -2], [7, 12, 4]),
        cube("d_jacket", [-3.5, 14, -2], [7, 9, 4], inflate=0.45),
        cube("d_tape", [-3.5, 17, -2], [7, 1, 4], inflate=0.62),
        cube("d_collar", [-3.5, 22, -2], [7, 2, 4], inflate=0.9),
        cube("d_shorts", [-3.5, 9, -1.6], [7, 4, 3]),
        cube("d_neck", [-1.5, 23, -1.5], [3, 2, 3]),
    ]})

    # --- rok: empat panel, masing-masing bone sendiri ----------------------
    bones.append({"name": "waist", "parent": "body", "pivot": [0, 12, 0], "cubes": []})
    for name, pivot, rot, origin, size, slot in (
        ("skirt_front", [0, 13, -1.8], [-16, 0, 0], [-4.5, 8, -2.5], [9, 5, 1], "d_skirt_fb"),
        ("skirt_back", [0, 13, 1.8], [16, 0, 0], [-4.5, 8, 1.5], [9, 5, 1], "d_skirt_fb"),
        ("skirt_right", [-3, 13, 0], [0, 0, 16], [-4, 8, -2.5], [1, 5, 5], "d_skirt_side"),
        ("skirt_left", [3, 13, 0], [0, 0, -16], [3, 8, -2.5], [1, 5, 5], "d_skirt_side"),
    ):
        bones.append({"name": name, "parent": "waist", "pivot": pivot,
                      "rotation": rot, "cubes": [cube(slot, origin, size)]})

    hair = [
        # Cangkang di seluruh tempurung kepala. Sisi depannya digambar sebagai
        # poni dengan bagian bawah dipotong tembus — lubang itulah yang bikin ini
        # rambut, bukan helm.
        cube("d_hair_cap", [-4, 24, -4], [8, 8, 8], inflate=0.6),
        cube("d_hair_back", [-4.5, 22, 2.2], [9, 10, 3]),
        cube("d_hair_nape", [-3, 17, 2.6], [6, 6, 2]),
        cube("d_hair_side", [-5, 25, -4.6], [2, 6, 3]),
        cube("d_hair_side", [3, 25, -4.6], [2, 6, 3]),
    ]
    if st["ahoge"]:
        hair.append(cube("d_ahoge", [-0.5, 31.6, -1], [1, 3, 1],
                         rotation=[-28, 0, 14], pivot=[0, 31.6, -0.5]))
    # jepit rambut selalu ada di perawakan ini; bentuknya bagian dari desainnya
        hair.append(cube("d_clip", [1.4, 30.4, -4.75], [3, 1, 1]))
    bones += _detailed_head(hair)

    # --- ekor rambut: diikat di samping, sedikit mengembang keluar ----------
    if st["twintails"]:
        for side, sign in (("r", -1), ("l", 1)):
            x = -4.2 if sign < 0 else 4.2
            rib = -5.9 if sign < 0 else 2.9
            bones.append({"name": f"hair_tail_{side}", "parent": "head",
                          "pivot": [x, 27.5, 2.8], "rotation": [3, 0, -9 * sign], "cubes": [
                              cube("d_ribbon", [rib, 26.4, 1.8], [3, 2, 2]),
                              cube("d_tail_up", [rib, 21, 1.8], [3, 6, 3]),
                          ]})
            tip = -5.4 if sign < 0 else 3.4
            bones.append({"name": f"hair_tail_{side}_tip", "parent": f"hair_tail_{side}",
                          "pivot": [x - 0.2 * sign, 21.5, 3.3], "rotation": [3, 0, -6 * sign],
                          "cubes": [cube("d_tail_low", [tip, 15.5, 2.3], [2, 6, 2])]})

    # --- lengan ------------------------------------------------------------
    for name, x, pivot_x in (("rightArm", -7.0, -4.0), ("leftArm", 4.0, 4.0)):
        bones.append({"name": name, "parent": "body", "pivot": [pivot_x, 22.5, 0], "cubes": [
            cube("d_sleeve", [x, 15.5, -1.5], [3, 7, 3]),
            cube("d_cuff", [x, 14.5, -1.5], [3, 2, 3], inflate=0.3),
            cube("d_hand", [x + 0.1, 12.5, -1.4], [3, 2, 3]),
        ]})

    # --- kaki: kaus kaki selutut dan sepatu tinggi --------------------------
    for name, x, pivot_x in (("rightLeg", -3.3, -1.7), ("leftLeg", 0.3, 1.7)):
        bones.append({"name": name, "parent": "root", "pivot": [pivot_x, 12, 0], "cubes": [
            cube("d_sock", [x, 3, -1.5], [3, 9, 3]),
            cube("d_boot", [x - 0.3, 0, -2.6], [4, 3, 5]),
        ]})

    return bones


def _detailed_male(st):
    """Perawakan laki-laki: bahu selebar model vanilla, celana panjang, hoodie.

    Lengannya 4 satuan seperti pemain, bukan 3 seperti perawakan perempuan —
    itu satu-satunya hal yang bikin siluetnya langsung terbaca berbeda dari jarak
    jauh, lebih daripada potongan bajunya.
    """
    bones = [{"name": "root", "parent": None, "pivot": [0, 0, 0], "cubes": []}]

    # --- badan: hoodie, jaket terbuka, pita cetak melintang dada, kerah -----
    body = [
        cube("d_shirt", [-4, 12, -2], [8, 12, 4]),
        cube("d_jacket", [-4, 13.5, -2], [8, 10, 4], inflate=0.45),
        cube("d_tape", [-4, 17.4, -2], [8, 1, 4], inflate=0.5),
        cube("d_collar", [-4, 22, -2], [8, 2, 4], inflate=0.85),
        cube("d_neck", [-1.5, 23, -1.5], [3, 2, 3]),
    ]
    if st["belt"]:
        body.append(cube("d_belt", [-4, 12, -2], [8, 2, 4], inflate=0.32))
    bones.append({"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": body})
    bones.append({"name": "waist", "parent": "body", "pivot": [0, 12, 0], "cubes": []})

    # Tudung hoodie jatuh di punggung. Ditaruh di bone "cape" supaya ikut ayunan
    # yang sudah ada di animation.vbs_companion.hair — tidak perlu animasi baru.
    hood = [cube("d_hood", [-3.5, 17.4, 2.0], [7, 5, 4])] if st["hood"] else []
    bones.append({"name": "cape", "parent": "body", "pivot": [0, 22.4, 2.0], "cubes": hood})

    # --- rambut: cangkang dipotong runcing + rumbai poni yang menjorok -------
    hair = [
        cube("d_hair_cap", [-4, 24, -4], [8, 8, 8], inflate=0.7),
        cube("d_hair_back", [-4.5, 25.5, 2.5], [9, 5, 2]),
        cube("d_hair_side", [-5, 26.5, -4.6], [2, 4, 3]),
        cube("d_hair_side", [3, 26.5, -4.6], [2, 4, 3]),
    ]
    if st["bangs"] == "spiky":
        hair.append(cube("d_spike", [-3, 29.4, -5.6], [6, 3, 2],
                         rotation=[14, 0, 0], pivot=[0, 29.4, -4.6]))
    if st["ahoge"]:
        hair.append(cube("d_ahoge", [-0.5, 31.8, -1], [1, 3, 1],
                         rotation=[-30, 0, 12], pivot=[0, 31.8, -0.5]))
    bones += _detailed_head(hair)

    # --- lengan: 4 satuan, manset, sarung tangan ---------------------------
    for name, x, pivot_x in (("rightArm", -8.0, -4.0), ("leftArm", 4.0, 4.0)):
        arm = [
            cube("d_sleeve", [x, 15.5, -2], [4, 8, 4]),
            cube("d_cuff", [x, 14.2, -2], [4, 2, 4], inflate=0.25),
        ]
        if st["gloves"]:
            arm.append(cube("d_glove", [x, 11.8, -2], [4, 3, 4]))
        else:
            arm.append(cube("d_hand", [x, 12.4, -2], [4, 2, 4]))
        bones.append({"name": name, "parent": "body", "pivot": [pivot_x, 22.5, 0],
                      "cubes": arm})

    # --- kaki: celana panjang dan sepatu rendah ----------------------------
    for name, x, pivot_x in (("rightLeg", -4.05, -2.0), ("leftLeg", 0.05, 2.0)):
        bones.append({"name": name, "parent": "root", "pivot": [pivot_x, 12, 0], "cubes": [
            cube("d_pants", [x, 2.4, -2], [4, 10, 4]),
            cube("d_shoe", [x, 0, -2.6], [4, 3, 4]),
        ]})

    return bones


def slot_sizes(char):
    """Slot UV apa saja yang dipakai karakter ini, dan ukuran kubusnya."""
    sizes = {}
    for bone in build_bones(char):
        for c in bone["cubes"]:
            sizes[c["slot"]] = tuple(c["size"])
    return sizes


def check_sizes():
    """Tidak ada kubus yang melebihi ruang yang dipesan slotnya di tekstur."""
    from uvmap import UV_ALL
    bad = []
    for ch in load_characters():
        for slot, size in slot_sizes(ch).items():
            _, _, w, h, d = UV_ALL[slot]
            if size[0] > w or size[1] > h or size[2] > d:
                bad.append(f"{ch['id']}: {slot} {size} > pesanan {(w, h, d)}")
    return bad


if __name__ == "__main__":
    for ch in load_characters():
        bones = build_bones(ch)
        n = sum(len(b["cubes"]) for b in bones)
        print(f"{ch['id']:8s} {len(bones)} bone, {n} kubus, {len(slot_sizes(ch))} slot")
    issues = check_sizes()
    print("\n".join(issues) if issues else "semua kubus muat di slotnya")
