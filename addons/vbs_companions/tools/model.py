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


def build_bones(char):
    """Daftar bone -> kubus untuk satu karakter.

    Bone opsional (hair_tail, hair_tail_l/r, cape, headphones, waist) selalu ada
    walau kosong, supaya animasi tidak pernah menyebut bone yang tidak ada.
    """
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

    # --- bone headphone: kosong untuk kelima karakter, disiapkan buat nanti --
    bones.append({"name": "headphones", "parent": "head", "pivot": [0, 26, 0], "cubes": []})

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


def slot_sizes(char):
    """Slot UV apa saja yang dipakai karakter ini, dan ukuran kubusnya."""
    sizes = {}
    for bone in build_bones(char):
        for c in bone["cubes"]:
            sizes[c["slot"]] = tuple(c["size"])
    return sizes


def check_sizes():
    """Tidak ada kubus yang melebihi ruang yang dipesan slotnya di tekstur."""
    from uvmap import UV
    bad = []
    for ch in load_characters():
        for slot, size in slot_sizes(ch).items():
            _, _, w, h, d = UV[slot]
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
