"""Periksa add-on sebelum dipasang.

Minecraft tidak bisa dijalankan di sini, jadi yang bisa dilakukan adalah memeriksa
semua kaitan antar file: identifier entity behavior harus sama dengan resource dan
dengan daftar di script, bone yang disebut animasi harus ada di kelima geometry,
tekstur yang ditunjuk harus benar-benar ada, dan seterusnya. Sebagian besar
kesalahan add-on adalah kaitan yang putus seperti ini, bukan logika yang salah.

    python3 validate.py        # keluar dengan kode 1 kalau ada yang salah
"""

import json
import os
import re
import sys

from PIL import Image

import model
import uvmap

BP = os.path.join(model.HERE, "..", "behavior_packs", "vbs_companions_bp")
RP = os.path.join(model.HERE, "..", "resource_packs", "vbs_companions_rp")

problems = []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        problems.append(message)
    return condition


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def rel(path):
    return os.path.relpath(path, os.path.join(model.HERE, ".."))


def main():
    chars = model.load_characters()
    ids = [c["id"] for c in chars]

    # 1. semua JSON bisa dibaca
    for root in (BP, RP):
        for dirpath, _, names in os.walk(root):
            for name in names:
                if name.endswith(".json"):
                    path = os.path.join(dirpath, name)
                    try:
                        load(path)
                        check(True, "")
                    except Exception as exc:               # noqa: BLE001
                        check(False, f"JSON rusak: {rel(path)} — {exc}")

    # 2. tata letak tekstur
    for issue in uvmap.check_layout():
        check(False, f"layout UV: {issue}")
    for issue in model.check_sizes():
        check(False, f"ukuran kubus: {issue}")

    # 3. geometry
    geo = load(os.path.join(RP, "models", "entity", "vbs_companions.geo.json"))
    geoms = {g["description"]["identifier"]: g for g in geo["minecraft:geometry"]}
    check(len(geoms) == len(ids), f"geometry ada {len(geoms)}, karakter ada {len(ids)}")
    bones_per_geom = {}
    for ident, g in geoms.items():
        desc = g["description"]
        check(desc["texture_width"] == uvmap.TEX_W and desc["texture_height"] == uvmap.TEX_H,
              f"{ident}: ukuran tekstur di geometry tidak 1024x1024")
        bones_per_geom[ident] = {b["name"] for b in g["bones"]}
        for bone in g["bones"]:
            parent = bone.get("parent")
            check(parent is None or parent in bones_per_geom[ident],
                  f"{ident}: bone {bone['name']} menunjuk induk {parent} yang tidak ada")
            for cube in bone.get("cubes", []):
                for face, uv in cube["uv"].items():
                    x, y = uv["uv"]
                    w, h = uv["uv_size"]
                    check(0 <= x and 0 <= y and x + abs(w) <= uvmap.TEX_W
                          and y + abs(h) <= uvmap.TEX_H,
                          f"{ident}: uv {face} di {bone['name']} keluar tekstur: {uv}")

    # 4. animasi menyebut bone yang benar-benar ada
    anims = load(os.path.join(RP, "animations", "vbs_companion.animation.json"))["animations"]
    controllers = load(os.path.join(
        RP, "render_controllers", "vbs_companion.render_controllers.json"))["render_controllers"]
    for anim_name, anim in anims.items():
        for bone in anim.get("bones", {}):
            for ident, bones in bones_per_geom.items():
                check(bone in bones,
                      f"animasi {anim_name} memakai bone '{bone}' yang tidak ada di {ident}")

    # 5. entity behavior <-> resource <-> script <-> teks
    lang = open(os.path.join(RP, "texts", "en_US.lang"), encoding="utf-8").read()
    script = open(os.path.join(BP, "scripts", "config.js"), encoding="utf-8").read()
    events_wanted = set(re.findall(r'event:\s*"([^"]+)"', script))
    listed = set(re.findall(r'"(vbs:[a-z_]+)":\s*\{\s*name:', script))
    check(listed == {f"vbs:{i}" for i in ids},
          f"daftar COMPANIONS di config.js tidak sama dengan characters.json: {listed}")

    for cid in ids:
        ident = f"vbs:{cid}"
        bp_path = os.path.join(BP, "entities", f"{cid}.json")
        rp_path = os.path.join(RP, "entity", f"{cid}.entity.json")
        check(os.path.exists(bp_path), f"entity behavior hilang: {rel(bp_path)}")
        check(os.path.exists(rp_path), f"entity resource hilang: {rel(rp_path)}")
        if not (os.path.exists(bp_path) and os.path.exists(rp_path)):
            continue
        bp = load(bp_path)["minecraft:entity"]
        rp = load(rp_path)["minecraft:client_entity"]["description"]
        check(bp["description"]["identifier"] == ident, f"{cid}: identifier behavior salah")
        check(rp["identifier"] == ident, f"{cid}: identifier resource salah")
        check(rp["geometry"]["default"] in geoms,
              f"{cid}: geometry {rp['geometry']['default']} tidak ada")

        tex = os.path.join(RP, rp["textures"]["default"] + ".png")
        check(os.path.exists(tex), f"{cid}: tekstur hilang {rel(tex)}")
        if os.path.exists(tex):
            size = Image.open(tex).size
            check(size == (uvmap.TEX_W, uvmap.TEX_H),
                  f"{cid}: tekstur {size} seharusnya {(uvmap.TEX_W, uvmap.TEX_H)}")

        for key, anim in rp["animations"].items():
            check(anim in anims, f"{cid}: animasi {anim} tidak ada di file animasi")
        for entry in rp["scripts"]["animate"]:
            key = entry if isinstance(entry, str) else next(iter(entry))
            check(key in rp["animations"], f"{cid}: animate menyebut '{key}' yang tidak terdaftar")

        # wajah: tiap bone ekspresi harus punya barisnya sendiri di
        # part_visibility, dan variabel yang dipakainya harus benar-benar
        # dihitung di pre_animation — kalau tidak, semua wajah tergambar
        # sekaligus dan yang menang ditentukan z-buffer
        faces = [b for b in bones_per_geom[rp["geometry"]["default"]]
                 if b.startswith("face_")]
        if faces:
            ctrl_name = rp["render_controllers"][0]
            ctrl = controllers.get(ctrl_name)
            check(ctrl is not None, f"{cid}: render controller {ctrl_name} tidak ada")
            if ctrl:
                shown = {k for entry in ctrl.get("part_visibility", []) for k in entry
                         if k != "*"}
                check(shown == set(faces),
                      f"{cid}: part_visibility tidak menyebut persis semua bone wajah")
                pre = " ".join(rp["scripts"].get("pre_animation", []))
                for entry in ctrl.get("part_visibility", []):
                    for key, expr in entry.items():
                        if key == "*":
                            continue
                        var = str(expr).split(" ")[0]
                        check(var in pre,
                              f"{cid}: {key} memakai {var} yang tidak dihitung pre_animation")

        egg = rp["spawn_egg"]["texture"]
        egg_png = os.path.join(RP, "textures", "items", f"{egg}.png")
        check(os.path.exists(egg_png), f"{cid}: ikon spawn egg hilang {rel(egg_png)}")

        # mode: tiap event yang dipanggil script harus ada di entity, dan tiap
        # component group yang disebut event harus benar-benar didefinisikan
        groups = set(bp["component_groups"])
        for name, ev in bp["events"].items():
            for kind in ("add", "remove"):
                for grp in ev.get(kind, {}).get("component_groups", []):
                    check(grp in groups, f"{cid}: event {name} menyebut grup {grp} yang tidak ada")
        for want in events_wanted:
            check(want in bp["events"], f"{cid}: event {want} yang dipakai script tidak ada")

        check(f"entity.{ident}.name=" in lang, f"{cid}: nama entity belum ada di en_US.lang")
        check(f"item.spawn_egg.entity.{ident}.name=" in lang,
              f"{cid}: nama spawn egg belum ada di en_US.lang")

    # 6. item_texture.json memuat semua spawn egg
    itex = load(os.path.join(RP, "textures", "item_texture.json"))["texture_data"]
    for cid in ids:
        check(f"vbs_spawn_egg_{cid}" in itex,
              f"{cid}: spawn egg belum terdaftar di item_texture.json")

    # 7. render controller
    rc = load(os.path.join(RP, "render_controllers",
                           "vbs_companion.render_controllers.json"))["render_controllers"]
    check("controller.render.vbs_companion" in rc, "render controller tidak ditemukan")

    # 8. manifest
    bpm = load(os.path.join(BP, "manifest.json"))
    rpm = load(os.path.join(RP, "manifest.json"))
    uuids = [bpm["header"]["uuid"], rpm["header"]["uuid"]] + \
            [m["uuid"] for m in bpm["modules"] + rpm["modules"]]
    check(len(set(uuids)) == len(uuids), "ada UUID yang dipakai dua kali di manifest")
    deps = [d.get("uuid") for d in bpm["dependencies"]]
    check(rpm["header"]["uuid"] in deps, "behavior pack tidak menyebut resource pack sebagai dependensi")
    check(bpm["header"]["uuid"] in [d.get("uuid") for d in rpm["dependencies"]],
          "resource pack tidak menyebut behavior pack sebagai dependensi")
    modules = {d.get("module_name"): d.get("version") for d in bpm["dependencies"]}
    check("@minecraft/server" in modules, "dependensi @minecraft/server hilang")
    check("@minecraft/server-ui" in modules, "dependensi @minecraft/server-ui hilang")
    for name, version in modules.items():
        if name:
            check("beta" not in str(version),
                  f"{name} memakai versi beta — add-on jadi butuh eksperimen di server")

    # 9. script: entry ada, dan semua import relatif ketemu
    entry = next(m for m in bpm["modules"] if m["type"] == "script")["entry"]
    entry_path = os.path.join(BP, entry)
    check(os.path.exists(entry_path), f"entry script hilang: {entry}")
    script_dir = os.path.join(BP, "scripts")
    for name in os.listdir(script_dir):
        if not name.endswith(".js"):
            continue
        src = open(os.path.join(script_dir, name), encoding="utf-8").read()
        for imported in re.findall(r'from\s+"(\./[^"]+)"', src):
            target = os.path.join(script_dir, imported)
            check(os.path.exists(target), f"{name}: import {imported} tidak ada")

    # 10. ikon pack
    for pack in (BP, RP):
        check(os.path.exists(os.path.join(pack, "pack_icon.png")),
              f"pack_icon.png hilang di {os.path.basename(pack)}")

    if problems:
        print(f"{len(problems)} masalah dari {checks} pemeriksaan:\n")
        for p in problems:
            print("  ✗ " + p)
        return 1
    print(f"semua {checks} pemeriksaan lolos — {len(ids)} karakter, "
          f"{len(geoms)} geometry, {len(anims)} animasi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
