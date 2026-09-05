"""Tulis manifest, file entity behavior pack, dan file entity resource pack.

Semua karakter memakai kerangka yang sama persis dan hanya berbeda di identifier,
statistik dan tekstur, jadi filenya dibuat dari satu cetakan di sini. Menambah
karakter keenam cukup dengan menambah satu entri di characters.json.

Tiga hal yang perlu dipahami sebelum mengubah berkas ini:

1. PRIORITY GOAL HARUS UNIK di seluruh daftar satu entity — komponen dasar dan
   component group yang sedang aktif dihitung bersama. Dua goal dengan angka
   sama membuat Bedrock memilih salah satu dan mengabaikan sisanya diam-diam,
   dan itulah sebab mode bertarung versi lama tidak melakukan apa pun. Tabel
   PRIORITY di bawah satu-satunya tempat angka itu ditulis.

2. Yang menggerakkan badan dan wajah saat bekerja adalah ENTITY PROPERTY, bukan
   query bawaan. vbs:pose, vbs:face dan vbs:hat disetel script lewat
   setProperty(), dan resource pack membacanya lewat query.property(). Karena
   nilai bawaannya 0 dan 0 berarti "otomatis", add-on tetap tampil benar kalau
   properti gagal disetel.

3. Senjata memilih GRUP, bukan cabang di dalam satu grup: vbs:weapon_melee
   memasang behavior.melee_attack, vbs:weapon_bow memasang minecraft:shooter dan
   behavior.ranged_attack. Keduanya memakai priority yang sama karena tidak
   pernah aktif bersamaan.
"""

import json
import os

import model

BP = os.path.join(model.HERE, "..", "behavior_packs", "vbs_companions_bp")
RP = os.path.join(model.HERE, "..", "resource_packs", "vbs_companions_rp")

VERSION = [1, 3, 0]
MIN_ENGINE = [1, 21, 0]

# UUID ini adalah identitas pack di mata Minecraft. JANGAN diubah setelah dirilis:
# dunia yang sudah memakai add-on ini mencarinya lewat UUID, bukan lewat nama.
UUID = {
    "bp_header": "e980994d-a9a6-469e-af1b-a31c3e9f7838",
    "bp_data": "af3c1db7-aa03-4fc3-9498-e89d6498c07c",
    "bp_script": "cb1e953f-fc5c-43c5-bab9-a0b7e845c632",
    "rp_header": "b5872873-2873-40c9-8d5b-424bc5592785",
    "rp_res": "7306a655-02d7-42bb-9774-3656d90404da",
}

# Modul script versi stabil — sengaja bukan beta, supaya add-on ini bisa dipasang
# di server tanpa menyalakan eksperimen apa pun.
SERVER_MODULE = "1.11.0"
SERVER_UI_MODULE = "1.2.0"

CROP_BLOCKS = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes",
               "minecraft:beetroot", "minecraft:nether_wart"]

ORE_BLOCKS = [
    "minecraft:coal_ore", "minecraft:deepslate_coal_ore",
    "minecraft:iron_ore", "minecraft:deepslate_iron_ore",
    "minecraft:copper_ore", "minecraft:deepslate_copper_ore",
    "minecraft:gold_ore", "minecraft:deepslate_gold_ore",
    "minecraft:redstone_ore", "minecraft:lit_redstone_ore",
    "minecraft:deepslate_redstone_ore",
    "minecraft:lapis_ore", "minecraft:deepslate_lapis_ore",
    "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore",
    "minecraft:emerald_ore", "minecraft:deepslate_emerald_ore",
    "minecraft:quartz_ore", "minecraft:ancient_debris",
]

# Sembilan perintah yang bisa dipilih pemain. Urutannya sama dengan MODES di
# config.js; validate.py yang memeriksa keduanya tidak melenceng.
MODES = ["follow", "farm", "attack", "stay", "mine", "wander", "build",
         "crafter", "looter"]
MODE_GROUPS = [f"vbs:mode_{m}" for m in MODES]
WEAPON_GROUPS = ["vbs:weapon_melee", "vbs:weapon_bow"]

# Satu-satunya tempat angka priority ditulis. Angka kecil = lebih mendesak.
# Semuanya unik supaya tidak ada goal yang ditelan diam-diam.
PRIORITY = {
    "float": 0,
    "hurt_by_target": 1,
    "owner_hurt_by_target": 2,
    "owner_hurt_target": 3,
    "nearest_attackable_target": 4,
    "attack": 5,                 # melee ATAU ranged, tidak pernah dua-duanya
    "move_to_block": 6,
    "follow_owner": 7,
    "stroll": 9,
    "look_at_player": 11,
    "random_look_around": 12,
}

# Entity property: nilai 0 selalu berarti "biarkan bawaan". Kalau setProperty
# gagal (versi gim lama), semuanya tetap 0 dan add-on jalan seperti sebelum ada
# fitur ini — itu sebabnya 0 dipilih sebagai "otomatis", bukan sebagai salah satu
# pose sungguhan.
PROPERTIES = {
    # 0 = wajah dipilih otomatis oleh Molang, 1..8 = paksa ekspresi indeks-1
    "vbs:face": {"type": "int", "range": [0, 8], "default": 0, "client_sync": True},
    # 0 normal, 1 memanen, 2 menyapa, 3 menambang, 4 membangun,
    # 5 kuda-kuda pedang, 6 membidik busur, 7 mengobrol
    "vbs:pose": {"type": "int", "range": [0, 7], "default": 0, "client_sync": True},
    # 0 tanpa perlengkapan, 1 topi jerami, 2 helm penambang, 3 ransel
    "vbs:hat": {"type": "int", "range": [0, 3], "default": 0, "client_sync": True},
}

POSE = {"normal": 0, "harvest": 1, "greet": 2, "mine": 3, "build": 4,
        "guard": 5, "aim": 6, "talk": 7}


def write(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")


# --- manifest --------------------------------------------------------------

def manifests():
    write(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {
            "name": "VBS Companions §7[Behavior]",
            "description": "Karakter pendamping yang mengikuti, bertani, bertarung, "
                           "menambang, mengembara, membangun, merajin dan mencari "
                           "barang sesuai perintah.",
            "uuid": UUID["bp_header"],
            "version": VERSION,
            "min_engine_version": MIN_ENGINE,
        },
        "modules": [
            {"type": "data", "uuid": UUID["bp_data"], "version": VERSION},
            {"type": "script", "language": "javascript", "uuid": UUID["bp_script"],
             "version": VERSION, "entry": "scripts/main.js"},
        ],
        "dependencies": [
            {"uuid": UUID["rp_header"], "version": VERSION},
            {"module_name": "@minecraft/server", "version": SERVER_MODULE},
            {"module_name": "@minecraft/server-ui", "version": SERVER_UI_MODULE},
        ],
    })
    write(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {
            "name": "VBS Companions §7[Resource]",
            "description": "Model 3D, tekstur 1024x1024 dan animasi untuk kelima karakter.",
            "uuid": UUID["rp_header"],
            "version": VERSION,
            "min_engine_version": MIN_ENGINE,
        },
        "modules": [
            {"type": "resources", "uuid": UUID["rp_res"], "version": VERSION},
        ],
        "dependencies": [
            {"uuid": UUID["bp_header"], "version": VERSION},
        ],
    })


# --- behavior pack: entity companion ---------------------------------------

def follow_owner(speed, start, stop):
    return {"priority": PRIORITY["follow_owner"], "speed_multiplier": speed,
            "start_distance": start, "stop_distance": stop}


def stroll(speed, xz=10, y=7, interval=120):
    return {"priority": PRIORITY["stroll"], "speed_multiplier": speed,
            "xz_dist": xz, "y_dist": y, "interval": interval}


def move_to_block(blocks, search_range=12, height=4, stay=1.5):
    return {
        "priority": PRIORITY["move_to_block"],
        "tick_interval": 20,
        "start_chance": 1.0,
        "search_range": search_range,
        "search_height": height,
        "goal_radius": 1.5,
        "stay_duration": stay,
        "target_offset": [0.0, 1.0, 0.0],
        "target_selection_method": "nearest",
        "target_blocks": blocks,
    }


def entity_doc(char):
    ident = f"vbs:{char['id']}"
    st = char["stats"]

    components = {
        "minecraft:type_family": {"family": ["vbs_companion", "mob"]},
        "minecraft:collision_box": {"width": 0.6, "height": 1.9},
        "minecraft:health": {"value": st["health"], "max": st["health"]},
        "minecraft:attack": {"damage": st["damage"]},
        "minecraft:movement": {"value": st["speed"]},
        "minecraft:follow_range": {"value": 48, "max": 64},
        "minecraft:knockback_resistance": {"value": 0.4},
        "minecraft:navigation.walk": {
            "can_path_over_water": True,
            "avoid_water": True,
            "can_open_doors": True,
            "can_pass_doors": True,
            "avoid_damage_blocks": True,
        },
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0},
        "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": True},
        # Daftar slot sengaja kosong: yang dipakai script adalah
        # EntityEquippableComponent, dan itu memetakan ke slot bawaan mob, bukan
        # ke daftar di sini. Mengisi daftarnya justru mengubah arti komponen
        # menjadi "apa yang boleh dipasangkan pemain lewat interaksi".
        "minecraft:equippable": {"slots": []},
        "minecraft:conditional_bandwidth_optimization": {},
        # Tanpa minecraft:despawn — companion tidak boleh hilang sendiri.
        "minecraft:healable": {
            "force_use": True,
            "items": [
                {"item": "bread", "heal_amount": 6},
                {"item": "apple", "heal_amount": 4},
                {"item": "cooked_beef", "heal_amount": 8},
                {"item": "cookie", "heal_amount": 3},
            ],
        },
        # Kepemilikan sisi mesin gim: yang membuat behavior.follow_owner punya
        # tuan. tame_items sengaja kosong — companion liar (untamed) begitu
        # muncul, dan taming SEPENUHNYA dikendalikan script lewat pemberian
        # satu bunga (lihat main.js: tryFeedFlower -> tameable.tame(player)),
        # supaya kita yang menentukan siapa pemiliknya, bukan mesin taming
        # bawaan yang mengambil pemain terdekat secara acak.
        "minecraft:tameable": {
            "probability": 1.0,
            "tame_items": [],
            "tame_event": {"event": "vbs:on_tamed", "target": "self"},
        },
        # Memunculkan tombol interact di layar sentuh; UI-nya sendiri dari script.
        "minecraft:interact": {
            "interactions": [{
                "cooldown": 0.25,
                "use_item": False,
                "swing": False,
                "interact_text": "action.interact.vbs_menu",
                "on_interact": {
                    "filters": {"all_of": [
                        {"test": "is_family", "subject": "other", "value": "player"},
                        {"test": "is_sneaking", "subject": "other", "value": True},
                    ]},
                    "event": "vbs:menu_opened",
                    "target": "self",
                },
            }],
        },
        # Companion tidak bisa dilukai pemain — supaya tidak mati kena pukulan nyasar.
        "minecraft:damage_sensor": {
            "triggers": [
                {"cause": "entity_attack", "deals_damage": False,
                 "on_damage": {"filters": {"test": "is_family", "subject": "other",
                                           "value": "player"}}},
                {"cause": "fall", "deals_damage": False},
            ],
        },
        "minecraft:behavior.float": {"priority": PRIORITY["float"]},
        # Membalas siapa pun yang memukulnya, mode apa pun. Ada di komponen dasar,
        # bukan di grup mode, supaya petani pun tidak berdiri diam saat digigit.
        "minecraft:behavior.hurt_by_target": {"priority": PRIORITY["hurt_by_target"]},
        "minecraft:behavior.look_at_player": {"priority": PRIORITY["look_at_player"],
                                              "look_distance": 8.0, "probability": 0.3},
        "minecraft:behavior.random_look_around": {"priority": PRIORITY["random_look_around"]},
    }

    component_groups = {
        "vbs:mode_follow": {
            "minecraft:behavior.follow_owner": follow_owner(1.15, 4.0, 2.0),
            "minecraft:behavior.random_stroll": stroll(0.7, xz=6, y=4),
        },
        "vbs:mode_farm": {
            "minecraft:behavior.move_to_block": move_to_block(CROP_BLOCKS),
            "minecraft:behavior.follow_owner": follow_owner(1.0, 18.0, 10.0),
            "minecraft:behavior.random_stroll": stroll(0.6, xz=8, y=3),
        },
        "vbs:mode_attack": {
            # Tiga pemilih sasaran, tiga priority berbeda: dibalas duluan yang
            # menyerang pemiliknya, lalu yang dipukul pemiliknya, baru monster
            # terdekat. Versi lama menaruh ketiganya di priority 1 dan hasilnya
            # cuma satu yang jalan.
            "minecraft:behavior.owner_hurt_by_target": {
                "priority": PRIORITY["owner_hurt_by_target"]},
            "minecraft:behavior.owner_hurt_target": {
                "priority": PRIORITY["owner_hurt_target"]},
            "minecraft:behavior.nearest_attackable_target": {
                "priority": PRIORITY["nearest_attackable_target"],
                "must_see": True,
                "must_see_forget_duration": 12.0,
                "reselect_targets": True,
                "scan_interval": 10,
                "within_radius": 20.0,
                "entity_types": [
                    {"filters": {"test": "is_family", "subject": "other",
                                 "value": "monster"}, "max_dist": 20},
                    {"filters": {"test": "is_family", "subject": "other",
                                 "value": "slime"}, "max_dist": 20},
                ],
            },
            "minecraft:behavior.follow_owner": follow_owner(1.2, 10.0, 4.0),
            "minecraft:behavior.random_stroll": stroll(0.7, xz=5, y=3),
        },
        # Diam di tempat = tidak ada satu pun goal gerak.
        "vbs:mode_stay": {},
        "vbs:mode_mine": {
            "minecraft:behavior.move_to_block": move_to_block(ORE_BLOCKS, 14, 6, 2.5),
            "minecraft:behavior.follow_owner": follow_owner(1.0, 24.0, 12.0),
            "minecraft:behavior.random_stroll": stroll(0.7, xz=8, y=6, interval=60),
        },
        "vbs:mode_wander": {
            # Pengembara sengaja tidak punya follow_owner: tugasnya menjauh.
            # Yang menariknya pulang adalah script, bukan goal.
            "minecraft:behavior.random_stroll": stroll(1.0, xz=16, y=8, interval=40),
        },
        "vbs:mode_build": {
            "minecraft:behavior.follow_owner": follow_owner(1.0, 16.0, 8.0),
            "minecraft:behavior.random_stroll": stroll(0.6, xz=6, y=3),
        },
        "vbs:mode_crafter": {
            # Perajin menempa di dekat stasiunnya sendiri; tidak perlu jauh-jauh.
            "minecraft:behavior.follow_owner": follow_owner(1.0, 16.0, 8.0),
            "minecraft:behavior.random_stroll": stroll(0.6, xz=6, y=3),
        },
        "vbs:mode_looter": {
            # Sengaja tidak punya follow_owner, sama seperti pengembara — tapi
            # radius stroll-nya jauh lebih kecil karena tugasnya di sekitar
            # markas, bukan menjelajah jauh.
            "minecraft:behavior.random_stroll": stroll(0.8, xz=10, y=5, interval=50),
        },
        # --- senjata: dipilih script dari isi tangan companion ---------------
        "vbs:weapon_melee": {
            "minecraft:behavior.melee_attack": {
                "priority": PRIORITY["attack"],
                "speed_multiplier": 1.25,
                "track_target": True,
                "reach_multiplier": 1.6,
            },
        },
        "vbs:weapon_bow": {
            "minecraft:shooter": {"def": "minecraft:arrow"},
            "minecraft:behavior.ranged_attack": {
                "priority": PRIORITY["attack"],
                "attack_interval_min": 1.0,
                "attack_interval_max": 2.0,
                "attack_radius": 16.0,
                "speed_multiplier": 1.1,
                "target_in_sight_time": 0.2,
                "ranged_fov": 90.0,
            },
        },
    }

    def switch(group):
        return {"remove": {"component_groups": MODE_GROUPS},
                "add": {"component_groups": [group]}}

    events = {
        "minecraft:entity_spawned": {
            "add": {"component_groups": ["vbs:mode_follow", "vbs:weapon_melee"]}},
        "vbs:on_tamed": {"add": {"component_groups": ["vbs:mode_follow"]}},
        "vbs:menu_opened": {},          # dipakai tombol interact layar sentuh
        "vbs:use_melee": {"remove": {"component_groups": WEAPON_GROUPS},
                          "add": {"component_groups": ["vbs:weapon_melee"]}},
        "vbs:use_bow": {"remove": {"component_groups": WEAPON_GROUPS},
                        "add": {"component_groups": ["vbs:weapon_bow"]}},
    }
    for mode in MODES:
        events[f"vbs:set_{mode}"] = switch(f"vbs:mode_{mode}")

    return {
        "format_version": "1.20.0",
        "minecraft:entity": {
            "description": {
                "identifier": ident,
                "is_spawnable": True,
                "is_summonable": True,
                "is_experimental": False,
                "properties": PROPERTIES,
            },
            "component_groups": component_groups,
            "components": components,
            "events": events,
        },
    }


# --- behavior pack: patok chunk --------------------------------------------

MARKER = "vbs:marker"


def marker_entity_doc():
    """Patok yang menandai satu chunk ladang.

    Tidak punya AI, tidak bisa dipukul, tidak jatuh, tidak hilang sendiri. Semua
    yang dilakukannya — beam warna dan tulisan koordinat — dikerjakan script;
    entity ini cuma badan yang bisa diberi nameTag dan bisa ditemukan kembali
    lewat getEntities().
    """
    return {
        "format_version": "1.20.0",
        "minecraft:entity": {
            "description": {
                "identifier": MARKER,
                "is_spawnable": False,
                "is_summonable": True,
                "is_experimental": False,
            },
            "component_groups": {
                "vbs:mark_free": {"minecraft:variant": {"value": 0}},
                "vbs:mark_claimed": {"minecraft:variant": {"value": 1}},
            },
            "components": {
                "minecraft:type_family": {"family": ["vbs_marker", "inanimate"]},
                "minecraft:collision_box": {"width": 0.4, "height": 1.0},
                "minecraft:health": {"value": 1, "max": 1},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:nameable": {"always_show": True,
                                       "allow_name_tag_renaming": False},
                "minecraft:damage_sensor": {"triggers": [{"deals_damage": False}]},
                "minecraft:conditional_bandwidth_optimization": {},
            },
            "events": {
                "minecraft:entity_spawned": {"add": {"component_groups": ["vbs:mark_free"]}},
                "vbs:set_free": {"remove": {"component_groups": ["vbs:mark_claimed"]},
                                 "add": {"component_groups": ["vbs:mark_free"]}},
                "vbs:set_claimed": {"remove": {"component_groups": ["vbs:mark_free"]},
                                    "add": {"component_groups": ["vbs:mark_claimed"]}},
            },
        },
    }


def marker_geometry_doc():
    """Patok kayu bertopi: satu tiang, satu kepala berwarna, satu bendera kecil.

    Ditulis tangan dan memakai box-uv 32x32, bukan lewat model.py — bentuknya
    tidak ada hubungannya dengan karakter dan tidak ikut berubah kalau palet
    karakter berubah.
    """
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.vbs_marker",
                "texture_width": 32,
                "texture_height": 32,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2.5,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0], "cubes": [
                    {"origin": [-1, 0, -1], "size": [2, 14, 2], "uv": [0, 0]},
                ]},
                {"name": "head", "parent": "root", "pivot": [0, 14, 0], "cubes": [
                    {"origin": [-2.5, 14, -2.5], "size": [5, 4, 5], "uv": [0, 18]},
                ]},
                {"name": "flag", "parent": "head", "pivot": [1, 16, 0], "cubes": [
                    {"origin": [1, 12, -0.5], "size": [7, 4, 1], "uv": [0, 27]},
                ]},
            ],
        }],
    }


def marker_client_doc():
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": MARKER,
                "min_engine_version": "1.21.0",
                "materials": {"default": "entity_alphatest"},
                "textures": {
                    "free": "textures/entity/vbs_companions/marker_free",
                    "claimed": "textures/entity/vbs_companions/marker_claimed",
                },
                "geometry": {"default": "geometry.vbs_marker"},
                "animations": {"spin": "animation.vbs_marker.spin"},
                "scripts": {"animate": ["spin"]},
                "render_controllers": ["controller.render.vbs_marker"],
            },
        },
    }


# --- resource pack: entity, tekstur item, teks -----------------------------

FACE_VAR = "variable.vbs_face"
PROP_FACE = "query.property('vbs:face')"
PROP_POSE = "query.property('vbs:pose')"
PROP_HAT = "query.property('vbs:hat')"

# Wajah dipilih tiap frame dari apa yang sedang terjadi pada karakter, urut dari
# yang paling mendesak. Semuanya jalan di klien: tidak ada satu pun tick server
# yang dipakai untuk ini, dan tidak ada apa pun yang jalan saat tak ada yang
# melihat. Nama ekspresi harus ada di model.FACES; yang tidak ada dilewati.
FACE_RULES = (
    ("query.hurt_time > 0", "hurt", "baru kena pukul"),
    (f"{PROP_POSE} == {POSE['guard']} || {PROP_POSE} == {POSE['aim']}",
     "surprised", "sedang bertarung"),
    ("!query.is_on_ground", "surprised", "sedang di udara"),
    (f"{PROP_POSE} == {POSE['harvest']} || {PROP_POSE} == {POSE['mine']} "
     f"|| {PROP_POSE} == {POSE['build']}", "happy", "sedang bekerja"),
    ("math.mod(query.life_time, 4.6) < 0.16", "blink", "pewaktu kedip"),
    ("query.modified_move_speed > 0.86", "sing", "berlari"),
    ("query.modified_move_speed > 0.08", "happy", "berjalan"),
    ("math.mod(query.life_time, 37) < 2.4 && query.modified_move_speed < 0.02",
     "sleepy", "diam lama"),
    ("math.mod(query.life_time, 13) < 2.2", "smile", "diam, sesekali"),
)

# Pose -> animasi yang dipasang di atas idle/walk. Urutannya penting: Bedrock
# menjumlahkan animasi yang aktif bersamaan, dan yang belakangan yang menang
# untuk bone yang sama.
POSE_ANIMATIONS = (
    ("harvest", POSE["harvest"]),
    ("mine", POSE["mine"]),
    ("build", POSE["build"]),
    ("combat", POSE["guard"]),
    ("aim", POSE["aim"]),
    ("talk", POSE["talk"]),
    ("greet", POSE["greet"]),
)


def face_expression(faces):
    """Rantai ternary Molang yang memilih indeks wajah.

    Dibungkus pemeriksaan vbs:face: kalau script memaksa satu ekspresi (nilai
    1..8), itu yang menang; kalau nilainya 0 — termasuk kalau setProperty tidak
    tersedia sama sekali — rantai otomatis yang jalan seperti sebelumnya.
    """
    expr = "0"
    for when, name, _why in reversed(FACE_RULES):
        if name not in faces:
            continue
        index = faces.index(name)
        expr = f"({when}) ? {index} : 0" if expr == "0" else f"({when}) ? {index} : ({expr})"
    return f"({PROP_FACE} > 0) ? ({PROP_FACE} - 1) : ({expr})"


def face_list(char):
    """Ekspresi yang dideklarasikan badan karakter ini, urut."""
    return [b["name"][len("face_"):] for b in model.build_bones(char)
            if b["name"].startswith("face_")]


def render_controller_doc(chars):
    """Satu controller per karakter: perlengkapan role selalu ada, wajah kalau punya."""
    controllers = {
        "controller.render.vbs_marker": {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Array.skins[query.variant]"],
            "arrays": {"textures": {"Array.skins": ["Texture.free", "Texture.claimed"]}},
        },
    }
    for char in chars:
        faces = face_list(char)
        visibility = [{"*": True}]
        # Semua bidang wajah bertumpuk di tempat yang sama, jadi tepat satu
        # boleh terlihat; sisanya disembunyikan di sini.
        visibility += [{f"face_{name}": f"{FACE_VAR} == {i}"} for i, name in enumerate(faces)]
        # Perlengkapan role: satu nilai vbs:hat, satu perlengkapan.
        visibility += [
            {"gear_hat": f"{PROP_HAT} == 1"},
            {"gear_helm": f"{PROP_HAT} == 2"},
            {"gear_lamp": f"{PROP_HAT} == 2"},
            {"gear_pack": f"{PROP_HAT} == 3"},
        ]
        controllers[f"controller.render.vbs_companion.{char['id']}"] = {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Texture.default"],
            "part_visibility": visibility,
        }
    return {"format_version": "1.10.0", "render_controllers": controllers}


def client_entity_doc(char):
    ident = f"vbs:{char['id']}"
    faces = face_list(char)
    detailed = char["style"].get("build") == "detailed"

    animations = {
        "look_at_target": "animation.vbs_companion.look_at_target",
        "idle": "animation.vbs_companion.idle",
        "walk": "animation.vbs_companion.walk",
        "hair": "animation.vbs_companion.hair",
    }
    animate = ["look_at_target", "idle", "walk", "hair"]
    if detailed:
        animations["detail"] = "animation.vbs_companion.detail"
        animate.append("detail")
    for name, value in POSE_ANIMATIONS:
        animations[name] = f"animation.vbs_companion.{name}"
        animate.append({name: f"{PROP_POSE} == {value}"})

    scripts = {"animate": animate}
    if faces:
        # pre_animation adalah satu-satunya tempat resource pack bisa menghitung
        # ulang variabel Molang tiap frame tanpa script apa pun.
        scripts["initialize"] = [f"{FACE_VAR} = 0;"]
        scripts["pre_animation"] = [f"{FACE_VAR} = {face_expression(faces)};"]

    # Selalu controller milik karakter ini, bukan yang polos: kelima karakter
    # sekarang punya bone perlengkapan role yang harus disembunyikan menurut
    # vbs:hat, jadi tidak ada lagi karakter yang cukup dengan controller tanpa
    # part_visibility.
    controller = f"controller.render.vbs_companion.{char['id']}"

    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": ident,
                "min_engine_version": "1.21.0",
                "materials": {"default": "entity_alphatest"},
                "textures": {"default": f"textures/entity/vbs_companions/{char['id']}"},
                "geometry": {"default": f"geometry.vbs_companion.{char['id']}"},
                "animations": animations,
                "scripts": scripts,
                "render_controllers": [controller],
                "spawn_egg": {"texture": f"vbs_spawn_egg_{char['id']}", "texture_index": 0},
                "enable_attachables": False,
            },
        },
    }


def item_texture_doc(chars):
    return {
        "resource_pack_name": "vbs_companions",
        "texture_name": "atlas.items",
        "texture_data": {
            f"vbs_spawn_egg_{c['id']}": {
                "textures": f"textures/items/vbs_spawn_egg_{c['id']}"
            } for c in chars
        },
    }


def lang_lines(chars):
    lines = [
        "## VBS Companions",
        "action.interact.vbs_menu=Buka Menu",
        f"entity.{MARKER}.name=Patok Ladang",
        "",
    ]
    for c in chars:
        ident = f"vbs:{c['id']}"
        lines.append(f"entity.{ident}.name={c['name']}")
        lines.append(f"item.spawn_egg.entity.{ident}.name=Panggil {c['name']}")
    lines.append("")
    return "\n".join(lines)


def main():
    chars = model.load_characters()
    manifests()
    for c in chars:
        write(os.path.join(BP, "entities", f"{c['id']}.json"), entity_doc(c))
        write(os.path.join(RP, "entity", f"{c['id']}.entity.json"), client_entity_doc(c))
    write(os.path.join(BP, "entities", "marker.json"), marker_entity_doc())
    write(os.path.join(RP, "entity", "marker.entity.json"), marker_client_doc())
    write(os.path.join(RP, "models", "entity", "vbs_marker.geo.json"), marker_geometry_doc())
    write(os.path.join(RP, "render_controllers", "vbs_companion.render_controllers.json"),
          render_controller_doc(chars))
    write(os.path.join(RP, "textures", "item_texture.json"), item_texture_doc(chars))
    path = os.path.join(RP, "texts", "en_US.lang")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(lang_lines(chars))
    print(f"tulis 2 manifest, {len(chars)} entity behavior + patok, "
          f"{len(chars)} entity resource, geometry patok, render controller, "
          f"item_texture.json, en_US.lang")


if __name__ == "__main__":
    main()
