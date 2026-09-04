"""Tulis models/entity/vbs_companions.geo.json dari model.py + characters.json.

Memakai UV per-face (uv + uv_size di tiap sisi), bukan "box uv", karena hanya
begitu satu kubus berukuran 8 satuan model bisa memakai 64x64 texel tekstur.
"""

import json
import os

import model
from uvmap import FACES, TEX_H, TEX_W, texel_faces

OUT = os.path.join(
    model.HERE, "..", "resource_packs", "vbs_companions_rp",
    "models", "entity", "vbs_companions.geo.json",
)


def uv_block(slot, size):
    rects = texel_faces(slot, size)
    return {name: {"uv": [rects[name][0], rects[name][1]],
                   "uv_size": [rects[name][2], rects[name][3]]}
            for name in FACES}


def geometry_for(char):
    bones = []
    for b in model.build_bones(char):
        entry = {"name": b["name"]}
        if b["parent"]:
            entry["parent"] = b["parent"]
        entry["pivot"] = b["pivot"]
        cubes = []
        for c in b["cubes"]:
            cube = {"origin": c["origin"], "size": c["size"],
                    "uv": uv_block(c["slot"], c["size"])}
            if "inflate" in c:
                cube["inflate"] = c["inflate"]
            if "rotation" in c:
                cube["rotation"] = c["rotation"]
                cube["pivot"] = c["pivot"]
            cubes.append(cube)
        if cubes:
            entry["cubes"] = cubes
        bones.append(entry)

    return {
        "description": {
            "identifier": f"geometry.vbs_companion.{char['id']}",
            "texture_width": TEX_W,
            "texture_height": TEX_H,
            "visible_bounds_width": 2.5,
            "visible_bounds_height": 3.0,
            "visible_bounds_offset": [0, 1.4, 0],
        },
        "bones": bones,
    }


def main():
    chars = model.load_characters()
    doc = {"format_version": "1.12.0",
           "minecraft:geometry": [geometry_for(c) for c in chars]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    n_cubes = sum(len(b.get("cubes", []))
                  for g in doc["minecraft:geometry"] for b in g["bones"])
    print(f"tulis vbs_companions.geo.json — {len(chars)} geometry, {n_cubes} kubus, "
          f"tekstur {TEX_W}x{TEX_H}")


if __name__ == "__main__":
    main()
