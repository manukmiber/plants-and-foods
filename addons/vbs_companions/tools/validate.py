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

    # patok punya geometry dan berkas animasi sendiri; bone-nya (flag, head)
    # sengaja tidak ada di geometry companion, jadi diperiksa terpisah
    marker_geo = load(os.path.join(RP, "models", "entity", "vbs_marker.geo.json"))
    marker_bones = {b["name"] for b in marker_geo["minecraft:geometry"][0]["bones"]}
    marker_anims = load(os.path.join(
        RP, "animations", "vbs_marker.animation.json"))["animations"]
    for anim_name, anim in marker_anims.items():
        for bone in anim.get("bones", {}):
            check(bone in marker_bones,
                  f"animasi patok {anim_name} memakai bone '{bone}' yang tidak ada")

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

        # Bone yang disembunyikan render controller ada dua jenis, dan syaratnya
        # berbeda: bone WAJAH dipilih lewat variable.vbs_face, yang harus benar
        # -benar dihitung di pre_animation; bone PERLENGKAPAN dipilih lewat
        # entity property, yang harus benar-benar dideklarasikan di behavior
        # pack dengan client_sync. Kalau salah satunya putus, hasilnya bukan
        # galat melainkan semua bone tergambar sekaligus, dan itu baru kelihatan
        # setelah add-on dipasang.
        geom_bones = bones_per_geom[rp["geometry"]["default"]]
        faces = [b for b in geom_bones if b.startswith("face_")]
        gear = [b for b in geom_bones if b.startswith("gear_")]
        ctrl_name = rp["render_controllers"][0]
        ctrl = controllers.get(ctrl_name)
        check(ctrl is not None, f"{cid}: render controller {ctrl_name} tidak ada")
        if ctrl:
            shown = {k for entry in ctrl.get("part_visibility", []) for k in entry
                     if k != "*"}
            check(shown >= set(faces),
                  f"{cid}: part_visibility tidak menyebut semua bone wajah")
            check(shown >= set(gear),
                  f"{cid}: part_visibility tidak menyebut semua bone perlengkapan")
            for name in shown:
                check(name in geom_bones,
                      f"{cid}: part_visibility menyebut bone '{name}' yang tidak ada di geometry")
            pre = " ".join(rp["scripts"].get("pre_animation", []))
            declared = set(bp["description"].get("properties", {}))
            for entry in ctrl.get("part_visibility", []):
                for key, expr in entry.items():
                    if key == "*":
                        continue
                    text = str(expr)
                    for prop in re.findall(r"query\.property\('([^']+)'\)", text):
                        check(prop in declared,
                              f"{cid}: {key} memakai property {prop} yang tidak dideklarasikan")
                        row = bp["description"].get("properties", {}).get(prop, {})
                        check(row.get("client_sync") is True,
                              f"{cid}: property {prop} tidak client_sync, "
                              "resource pack tidak bisa membacanya")
                    if "query.property" not in text:
                        var = text.split(" ")[0]
                        check(var in pre,
                              f"{cid}: {key} memakai {var} yang tidak dihitung pre_animation")

        # Molang di pre_animation dan di daftar animate juga hanya boleh menyebut
        # property yang dideklarasikan
        declared = set(bp["description"].get("properties", {}))
        molang = " ".join(rp["scripts"].get("pre_animation", []))
        for entry in rp["scripts"]["animate"]:
            if isinstance(entry, dict):
                molang += " " + " ".join(str(v) for v in entry.values())
        for prop in set(re.findall(r"query\.property\('([^']+)'\)", molang)):
            check(prop in declared,
                  f"{cid}: Molang memakai property {prop} yang tidak dideklarasikan")

        # Priority tiap goal harus UNIK di seluruh daftar yang aktif bersamaan:
        # komponen dasar + satu grup mode + satu grup senjata. Priority kembar
        # membuat Bedrock memilih satu goal dan mengabaikan sisanya diam-diam,
        # dan itulah yang dulu bikin mode bertarung tidak melakukan apa pun.
        groups = bp["component_groups"]
        base_prio = [(k, v["priority"]) for k, v in bp["components"].items()
                     if k.startswith("minecraft:behavior.")]
        mode_groups = [g for g in groups if g.startswith("vbs:mode_")]
        weapon_groups = [g for g in groups if g.startswith("vbs:weapon_")]
        for mode in mode_groups:
            for weapon in weapon_groups:
                rows = list(base_prio)
                for g in (mode, weapon):
                    rows += [(f"{g}/{k}", v["priority"])
                             for k, v in groups[g].items()
                             if k.startswith("minecraft:behavior.")]
                seen = {}
                for name, prio in rows:
                    if prio in seen:
                        check(False, f"{cid}: {mode}+{weapon} memakai priority {prio} "
                                     f"dua kali ({seen[prio]} dan {name})")
                    seen[prio] = name

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

    # 7. render controller: satu per karakter, plus satu untuk patok
    rc = load(os.path.join(RP, "render_controllers",
                           "vbs_companion.render_controllers.json"))["render_controllers"]
    check("controller.render.vbs_marker" in rc, "render controller patok tidak ada")
    for cid in ids:
        check(f"controller.render.vbs_companion.{cid}" in rc,
              f"{cid}: render controller khusus karakter ini tidak ada")

    # 7b. patok: entity behavior, entity resource, geometry dan dua teksturnya
    mbp = load(os.path.join(BP, "entities", "marker.json"))["minecraft:entity"]
    mrp = load(os.path.join(RP, "entity", "marker.entity.json"))["minecraft:client_entity"]
    check(mbp["description"]["identifier"] == mrp["description"]["identifier"],
          "identifier patok di behavior dan resource tidak sama")
    check(mrp["description"]["geometry"]["default"] ==
          marker_geo["minecraft:geometry"][0]["description"]["identifier"],
          "geometry patok yang ditunjuk resource tidak ada")
    for key, path in mrp["description"]["textures"].items():
        full = os.path.join(RP, path + ".png")
        check(os.path.exists(full), f"tekstur patok '{key}' hilang: {rel(full)}")
    for name in ("vbs:set_free", "vbs:set_claimed"):
        check(name in mbp["events"], f"patok: event {name} tidak ada")

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
    # Varian yang di-commit HARUS memakai modul stabil: begitu manifestnya beta,
    # add-on tidak bisa dipasang tanpa menyalakan toggle eksperimen. Varian beta
    # dibuat sengaja dengan `gen_packs.py --beta` dan diperiksa dengan
    # `validate.py --beta`.
    want_beta = "--beta" in sys.argv
    for name, version in modules.items():
        if not name:
            continue
        is_beta = "beta" in str(version)
        if want_beta:
            check(is_beta, f"{name} versi {version} bukan beta, padahal "
                           "diperiksa dengan --beta")
        else:
            check(not is_beta,
                  f"{name} memakai versi beta — add-on jadi butuh eksperimen di "
                  "server. Jalankan `python3 gen_packs.py` tanpa --beta untuk "
                  "mengembalikannya.")

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

    # 10. config.js dan gen_packs.py harus sepakat soal mode dan pose
    import gen_packs
    listed_modes = set(re.findall(r'event:\s*"vbs:set_([a-z_]+)"', script))
    check(listed_modes == set(gen_packs.MODES),
          f"daftar mode di config.js {sorted(listed_modes)} tidak sama dengan "
          f"gen_packs.py {sorted(gen_packs.MODES)}")
    pose_block = re.search(r"export const POSE = \{(.*?)\};", script, re.S)
    check(pose_block is not None, "POSE tidak ditemukan di config.js")
    if pose_block:
        script_pose = {k: int(v) for k, v in
                       re.findall(r"(\w+):\s*(\d+)", pose_block.group(1))}
        check(script_pose == gen_packs.POSE,
              f"POSE di config.js {script_pose} tidak sama dengan "
              f"gen_packs.py {gen_packs.POSE}")
    # tiap pose yang punya animasi harus benar-benar ada animasinya
    for name, value in gen_packs.POSE_ANIMATIONS:
        check(f"animation.vbs_companion.{name}" in anims,
              f"pose {name} (nilai {value}) tidak punya animasi")

    # 11. ikon pack
    for pack in (BP, RP):
        check(os.path.exists(os.path.join(pack, "pack_icon.png")),
              f"pack_icon.png hilang di {os.path.basename(pack)}")

    # 12. rancangan bangunan JSON <-> modul hasil generator
    #
    # Yang paling gampang terlupa: menambah berkas di blueprints/ tapi lupa
    # menjalankan generatornya, jadi rancangannya tidak pernah ikut ke dalam
    # pack dan tidak muncul di menu — tanpa galat apa pun.
    import gen_blueprints
    try:
        bp_text, bp_count = gen_blueprints.build()
        on_disk = open(gen_blueprints.OUT, encoding="utf-8").read()
        check(bp_text == on_disk,
              "blueprints.data.js tidak sinkron dengan blueprints/*.json — "
              "jalankan `python3 tools/gen_blueprints.py`")
        check(bp_count == len([n for n in os.listdir(gen_blueprints.SRC)
                               if n.endswith(".json")]),
              "ada berkas di blueprints/ yang tidak ikut terbaca generator")
    except gen_blueprints.Bad as exc:
        check(False, f"rancangan JSON ditolak: {exc}")

    builder_src = open(os.path.join(BP, "scripts", "builder.js"), encoding="utf-8").read()
    mat_block = re.search(r"const MATERIALS = \{(.*?)\n\};", builder_src, re.S)
    check(mat_block is not None, "MATERIALS tidak ditemukan di builder.js")
    if mat_block:
        # Peran yang boleh dipakai berkas JSON harus benar-benar bisa dilayani
        # builder.js; "air" dan "chest" ditangani sebagai kasus khusus di sana.
        roles = set(re.findall(r"^\s{2}(\w+):", mat_block.group(1), re.M)) | {"air", "chest"}
        for role in gen_blueprints.ROLES:
            check(role in roles,
                  f"peran \"{role}\" diizinkan gen_blueprints.py tapi tidak "
                  "dilayani MATERIALS di builder.js")
    check("dataBlueprints()" in builder_src,
          "builder.js tidak lagi menggabungkan rancangan JSON ke BLUEPRINTS")

    # 13. dialog JSON <-> modul hasil generator
    import gen_dialogue
    try:
        dlg_text, dlg_count, dlg_lines = gen_dialogue.build()
        on_disk = open(gen_dialogue.OUT, encoding="utf-8").read()
        check(dlg_text == on_disk,
              "dialogue.data.js tidak sinkron dengan dialogue/*.json — "
              "jalankan `python3 tools/gen_dialogue.py`")
    except gen_dialogue.Bad as exc:
        check(False, f"dialog JSON ditolak: {exc}")
        dlg_count = dlg_lines = 0

    lines_src = open(os.path.join(BP, "scripts", "lines.js"), encoding="utf-8").read()
    fallback = re.search(r"export const FALLBACK = \{(.*?)\n\};", lines_src, re.S)
    check(fallback is not None, "FALLBACK tidak ditemukan di lines.js")
    if fallback:
        keys = set(re.findall(r"^\s{2}(\w+):", fallback.group(1), re.M))
        check(set(gen_dialogue.KEYS) == keys,
              f"kunci suasana di gen_dialogue.py {sorted(set(gen_dialogue.KEYS) - keys)} / "
              f"{sorted(keys - set(gen_dialogue.KEYS))} tidak sama dengan FALLBACK di lines.js")
    check(set(gen_dialogue.MODES) == listed_modes,
          "daftar mode di gen_dialogue.py tidak sama dengan config.js")

    # 14. buku panduan: item, resep, tekstur, teks, dan konstanta di script
    item_doc = load(os.path.join(BP, "items", "guide.json"))["minecraft:item"]
    check(item_doc["description"]["identifier"] == gen_packs.GUIDE_ITEM,
          "identifier item buku panduan tidak sama dengan gen_packs.py")
    icon = item_doc["components"]["minecraft:icon"]
    icon_key = icon if isinstance(icon, str) else icon["texture"]
    check(icon_key in itex, f"ikon buku '{icon_key}' belum terdaftar di item_texture.json")
    guide_png = os.path.join(RP, "textures", "items", f"{icon_key}.png")
    check(os.path.exists(guide_png), f"tekstur buku hilang: {rel(guide_png)}")
    if os.path.exists(guide_png):
        check(Image.open(guide_png).size == (16, 16),
              "tekstur buku bukan 16x16 — ikon item harus seukuran ikon vanilla")
    check(f"item.{gen_packs.GUIDE_ITEM}=" in lang,
          "nama buku panduan belum ada di en_US.lang")

    # Bunga yang dipakai resep harus benar-benar dianggap bunga oleh script,
    # kalau tidak pemain bisa menempa buku dengan bunga yang tidak bisa
    # menjinakkan companion — dua daftar yang diam-diam berbeda.
    flowers_block = re.search(r"export const FLOWERS = new Set\(\[(.*?)\]\);",
                              script, re.S)
    check(flowers_block is not None, "FLOWERS tidak ditemukan di config.js")
    script_flowers = set(re.findall(r'"minecraft:(\w+)"', flowers_block.group(1))) \
        if flowers_block else set()
    recipe_dir = os.path.join(BP, "recipes")
    recipe_files = sorted(n for n in os.listdir(recipe_dir) if n.endswith(".json"))
    check(len(recipe_files) == len(gen_packs.GUIDE_FLOWERS),
          f"ada {len(recipe_files)} resep buku, seharusnya "
          f"{len(gen_packs.GUIDE_FLOWERS)} — jalankan gen_packs.py")
    for name in recipe_files:
        doc = load(os.path.join(recipe_dir, name))["minecraft:recipe_shapeless"]
        items = [i["item"] for i in doc["ingredients"]]
        check("minecraft:book" in items, f"resep {name} tidak memakai buku vanilla")
        flower = next((i for i in items if i != "minecraft:book"), "")
        check(flower.replace("minecraft:", "") in script_flowers,
              f"resep {name} memakai {flower} yang tidak ada di FLOWERS config.js")
        check(doc["result"]["item"] == gen_packs.GUIDE_ITEM,
              f"resep {name} tidak menghasilkan {gen_packs.GUIDE_ITEM}")

    # 15. menjinakkan: entity, gen_packs.py dan config.js harus sepakat
    #
    # Ini bukan pemeriksaan hiasan. Sepanjang v1.5.0 tame_items ditulis kosong
    # dan seluruh taming diserahkan ke script, dan akibatnya companion tidak
    # pernah benar-benar jinak. Daftar yang melenceng di salah satu dari tiga
    # tempat ini menghidupkan lagi persis kegagalan itu, tanpa satu pun pesan
    # error yang terlihat pemain.
    for cid in ids:
        bp_path = os.path.join(BP, "entities", f"{cid}.json")
        if not os.path.exists(bp_path):
            continue
        doc = load(bp_path)["minecraft:entity"]
        tameable = doc["components"].get("minecraft:tameable", {})
        items = tameable.get("tame_items")
        check(items == gen_packs.TAME_ITEMS,
              f"{cid}: tame_items tidak sama dengan TAME_ITEMS di gen_packs.py — "
              "jalankan gen_packs.py")
        check(tameable.get("tame_event", {}).get("event") == "vbs:on_tamed",
              f"{cid}: tame_event harus menyalakan vbs:on_tamed")
        groups = doc.get("component_groups", {})
        check("minecraft:is_tamed" in groups.get("vbs:tamed", {}),
              f"{cid}: grup vbs:tamed harus memasang minecraft:is_tamed — tanpa itu "
              "script tidak punya cara tahu taming bawaan sudah terjadi")
        added = doc["events"]["vbs:on_tamed"].get("add", {}).get("component_groups", [])
        check("vbs:tamed" in added,
              f"{cid}: vbs:on_tamed harus memasang grup vbs:tamed")

    tame_block = re.search(r"export const TAME_ITEMS = new Set\(\[(.*?)\]\);", script, re.S)
    check(tame_block is not None, "TAME_ITEMS tidak ditemukan di config.js")
    if tame_block:
        script_tame = set(re.findall(r'"minecraft:(\w+)"', tame_block.group(1)))
        check(script_tame == set(gen_packs.TAME_ITEMS),
              "TAME_ITEMS di config.js tidak sama dengan gen_packs.py: "
              f"{sorted(script_tame ^ set(gen_packs.TAME_ITEMS))}")
        missing = script_tame - script_flowers
        check(not missing,
              f"bunga penjinak {sorted(missing)} tidak ada di FLOWERS config.js — "
              "script tidak akan mengenalinya sebagai bunga")

    book_src = open(os.path.join(BP, "scripts", "book.js"), encoding="utf-8").read()
    check(f'GUIDE_ID = "{gen_packs.GUIDE_ITEM}"' in book_src,
          "GUIDE_ID di book.js tidak sama dengan identifier item di gen_packs.py")

    if problems:
        print(f"{len(problems)} masalah dari {checks} pemeriksaan:\n")
        for p in problems:
            print("  ✗ " + p)
        return 1
    print(f"semua {checks} pemeriksaan lolos — {len(ids)} karakter, "
          f"{len(geoms)} geometry, {len(anims)} animasi, {bp_count} rancangan JSON, "
          f"{dlg_count} berkas dialog JSON, {len(recipe_files)} resep buku")
    return 0


if __name__ == "__main__":
    sys.exit(main())
