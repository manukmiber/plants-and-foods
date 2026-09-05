"""Tulis manifest, file entity behavior pack, dan file entity resource pack.

Kelima karakter memakai kerangka yang sama persis dan hanya berbeda di identifier,
statistik dan tekstur, jadi filenya dibuat dari satu cetakan di sini. Menambah
karakter keenam cukup dengan menambah satu entri di characters.json.
"""

import json
import os

import model

BP = os.path.join(model.HERE, "..", "behavior_packs", "vbs_companions_bp")
RP = os.path.join(model.HERE, "..", "resource_packs", "vbs_companions_rp")

VERSION = [1, 1, 0]
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

MODE_GROUPS = ["vbs:mode_follow", "vbs:mode_farm", "vbs:mode_attack", "vbs:mode_stay"]


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
            "description": "Karakter pendamping yang mengikuti, bertani, dan bertarung "
                           "sesuai perintah yang dipilih pemain lewat UI.",
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


# --- behavior pack: entity -------------------------------------------------

def follow_owner(priority, speed, start, stop):
    return {"priority": priority, "speed_multiplier": speed,
            "start_distance": start, "stop_distance": stop}


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
        # Kepemilikan sisi mesin gim: yang membuat behavior.follow_owner punya tuan.
        # Script mencoba menjadikannya milik pemanggil begitu muncul; memberi roti
        # adalah jalan cadangan kalau versi gimnya tidak mengizinkan cara itu.
        "minecraft:tameable": {
            "probability": 1.0,
            "tame_items": ["bread", "apple", "cake", "cookie"],
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
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.look_at_player": {"priority": 9, "look_distance": 8.0,
                                              "probability": 0.3},
        "minecraft:behavior.random_look_around": {"priority": 10},
    }

    component_groups = {
        "vbs:mode_follow": {
            "minecraft:behavior.follow_owner": follow_owner(4, 1.15, 4.0, 2.0),
            "minecraft:behavior.random_stroll": {"priority": 7, "speed_multiplier": 0.7},
        },
        "vbs:mode_farm": {
            "minecraft:behavior.move_to_block": {
                "priority": 4,
                "tick_interval": 20,
                "start_chance": 1.0,
                "search_range": 12,
                "search_height": 4,
                "goal_radius": 1.5,
                "stay_duration": 1.5,
                "target_offset": [0.0, 1.0, 0.0],
                "target_selection_method": "nearest",
                "target_blocks": CROP_BLOCKS,
            },
            "minecraft:behavior.follow_owner": follow_owner(6, 1.0, 14.0, 8.0),
            "minecraft:behavior.random_stroll": {"priority": 8, "speed_multiplier": 0.6},
        },
        "vbs:mode_attack": {
            "minecraft:behavior.owner_hurt_by_target": {"priority": 1},
            "minecraft:behavior.owner_hurt_target": {"priority": 1},
            "minecraft:behavior.nearest_attackable_target": {
                "priority": 2,
                "must_see": True,
                "must_see_forget_duration": 12.0,
                "reselect_targets": True,
                "within_radius": 16.0,
                "entity_types": [{
                    "filters": {"test": "is_family", "subject": "other", "value": "monster"},
                    "max_dist": 16,
                }],
            },
            "minecraft:behavior.melee_attack": {"priority": 3, "speed_multiplier": 1.25,
                                                "track_target": True},
            "minecraft:behavior.follow_owner": follow_owner(6, 1.2, 8.0, 3.0),
            # Dipakai animasi kuda-kuda lewat query.is_angry.
            "minecraft:angry": {
                "duration": -1,
                "broadcast_anger": False,
                "calm_event": {"event": "vbs:set_follow", "target": "self"},
            },
        },
        # Diam di tempat = tidak ada satu pun goal gerak.
        "vbs:mode_stay": {},
    }

    def switch(group):
        return {"remove": {"component_groups": MODE_GROUPS},
                "add": {"component_groups": [group]}}

    events = {
        "minecraft:entity_spawned": {"add": {"component_groups": ["vbs:mode_follow"]}},
        "vbs:on_tamed": {"add": {"component_groups": ["vbs:mode_follow"]}},
        "vbs:menu_opened": {},          # dipakai tombol interact layar sentuh
        "vbs:set_follow": switch("vbs:mode_follow"),
        "vbs:set_farm": switch("vbs:mode_farm"),
        "vbs:set_attack": switch("vbs:mode_attack"),
        "vbs:set_stay": switch("vbs:mode_stay"),
    }

    return {
        "format_version": "1.20.0",
        "minecraft:entity": {
            "description": {
                "identifier": ident,
                "is_spawnable": True,
                "is_summonable": True,
                "is_experimental": False,
            },
            "component_groups": component_groups,
            "components": components,
            "events": events,
        },
    }


# --- resource pack: entity, tekstur item, teks -----------------------------

# Wajah dipilih tiap frame dari apa yang sedang terjadi pada karakter, urut dari
# yang paling mendesak. Semuanya jalan di klien: tidak ada satu pun tick server
# yang dipakai untuk ini, dan tidak ada apa pun yang jalan saat tak ada yang
# melihat. Nama ekspresi harus ada di model.FACES; yang tidak ada dilewati.
FACE_RULES = (
    ("query.hurt_time > 0", "hurt", "baru kena pukul"),
    ("query.is_angry", "surprised", "sedang bertarung"),
    ("!query.is_on_ground", "surprised", "sedang di udara"),
    ("math.mod(query.life_time, 4.6) < 0.16", "blink", "pewaktu kedip"),
    ("query.modified_move_speed > 0.86", "sing", "berlari"),
    ("query.modified_move_speed > 0.08", "happy", "berjalan"),
    ("math.mod(query.life_time, 37) < 2.4 && query.modified_move_speed < 0.02",
     "sleepy", "diam lama"),
    ("math.mod(query.life_time, 13) < 2.2", "smile", "diam, sesekali"),
)

FACE_VAR = "variable.vbs_face"


def face_expression(faces):
    """Rantai ternary Molang yang memilih indeks wajah; 0 kalau tak ada yang cocok."""
    expr = "0"
    for when, name, _why in reversed(FACE_RULES):
        if name not in faces:
            continue
        index = faces.index(name)
        expr = f"({when}) ? {index} : 0" if expr == "0" else f"({when}) ? {index} : ({expr})"
    return expr


def render_controller_doc(chars):
    """Satu controller polos, plus satu per karakter yang punya ekspresi."""
    controllers = {
        "controller.render.vbs_companion": {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Texture.default"],
        },
    }
    for char in chars:
        faces = face_list(char)
        if not faces:
            continue
        controllers[f"controller.render.vbs_companion.{char['id']}"] = {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Texture.default"],
            # Semua bidang wajah bertumpuk di tempat yang sama, jadi tepat satu
            # boleh terlihat; sisanya disembunyikan di sini.
            "part_visibility": [{"*": True}] + [
                {f"face_{name}": f"{FACE_VAR} == {i}"} for i, name in enumerate(faces)
            ],
        }
    return {"format_version": "1.10.0", "render_controllers": controllers}


def face_list(char):
    """Ekspresi yang dideklarasikan badan karakter ini, urut."""
    return [b["name"][len("face_"):] for b in model.build_bones(char)
            if b["name"].startswith("face_")]


def client_entity_doc(char):
    ident = f"vbs:{char['id']}"
    faces = face_list(char)
    detailed = char["style"].get("build") == "detailed"

    animations = {
        "look_at_target": "animation.vbs_companion.look_at_target",
        "idle": "animation.vbs_companion.idle",
        "walk": "animation.vbs_companion.walk",
        "hair": "animation.vbs_companion.hair",
        "combat": "animation.vbs_companion.combat",
    }
    animate = ["look_at_target", "idle", "walk", "hair", {"combat": "query.is_angry"}]
    if detailed:
        animations["detail"] = "animation.vbs_companion.detail"
        animate.append("detail")

    scripts = {"animate": animate}
    if faces:
        # pre_animation adalah satu-satunya tempat resource pack bisa menghitung
        # ulang variabel Molang tiap frame tanpa script apa pun.
        scripts["initialize"] = [f"{FACE_VAR} = 0;"]
        scripts["pre_animation"] = [f"{FACE_VAR} = {face_expression(faces)};"]

    controller = (f"controller.render.vbs_companion.{char['id']}" if faces
                  else "controller.render.vbs_companion")

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
    write(os.path.join(RP, "render_controllers", "vbs_companion.render_controllers.json"),
          render_controller_doc(chars))
    write(os.path.join(RP, "textures", "item_texture.json"), item_texture_doc(chars))
    path = os.path.join(RP, "texts", "en_US.lang")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(lang_lines(chars))
    print(f"tulis 2 manifest, {len(chars)} entity behavior, {len(chars)} entity resource, "
          f"item_texture.json, en_US.lang")


if __name__ == "__main__":
    main()
