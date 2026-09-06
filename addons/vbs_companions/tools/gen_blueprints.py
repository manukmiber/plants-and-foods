"""Salin rancangan bangunan JSON ke dalam behavior pack.

    python3 gen_blueprints.py        # blueprints/*.json -> scripts/blueprints.data.js

Bedrock tidak bisa membaca berkas JSON dari dalam script saat dunia berjalan —
`import` di mesin skripnya hanya mengenal modul JavaScript. Jadi folder
`blueprints/` adalah sumber yang ditulis manusia (atau AI yang mengubah schematic
jadi JSON), dan berkas ini yang menyalinnya jadi satu modul JS di dalam pack.

Yang diperiksa di sini — semuanya membuat generator keluar dengan kode 1, karena
rancangan rusak jauh lebih baik ketahuan sekarang daripada berupa companion yang
berdiri diam di dalam dunia:

  * id unik, tidak bentrok dengan rancangan bawaan builder.js
  * tiap huruf di layers/blocks benar-benar ada di palette
  * peran (role) yang disebut benar-benar dikenal builder.js
  * ukuran dan jumlah langkah masih di dalam batas

Skema lengkapnya ada di blueprints/README.md.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "blueprints")
OUT = os.path.join(ROOT, "behavior_packs", "vbs_companions_bp", "scripts",
                   "blueprints.data.js")

# Peran yang benar-benar bisa dilayani builder.js. Daftar ini disalin di
# validate.py dan diperiksa supaya tidak melenceng dari MATERIALS di builder.js.
ROLES = ["floor", "wall", "post", "roof", "light", "door", "glass", "fence",
         "path", "bed", "chest", "air"]

# Rancangan bawaan yang sudah dihitung kode; id data tidak boleh menimpanya.
BUILTIN = ["fence", "wall", "lamps", "path", "bridge", "hut", "shed"]

MAX_SPAN = 32
MAX_STEPS = 8000
ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,30}$")

HEADER = """// DIBUAT OTOMATIS oleh tools/gen_blueprints.py — jangan diubah dengan tangan.
//
// Sumbernya berkas JSON di addons/vbs_companions/blueprints/. Tambah satu berkas
// di sana, jalankan `python3 tools/gen_blueprints.py`, dan rancangannya muncul di
// menu Rancangan Bangunan tanpa menyentuh kode. Skemanya: blueprints/README.md.
"""


class Bad(Exception):
    pass


def die(path, message):
    raise Bad(f"{os.path.basename(path)}: {message}")


def check_palette(path, doc):
    palette = doc.get("palette")
    if not isinstance(palette, dict) or not palette:
        die(path, "palette wajib ada dan tidak boleh kosong")
    out = {}
    for key, entry in palette.items():
        if len(key) != 1:
            die(path, f'kunci palette "{key}" harus tepat satu karakter')
        if not isinstance(entry, dict):
            die(path, f'palette "{key}" harus berupa objek')
        if entry.get("skip"):
            out[key] = {"skip": True}
            continue
        role = entry.get("role")
        block = entry.get("block")
        if role is None and block is None:
            die(path, f'palette "{key}" harus punya "role" atau "block"')
        if role is not None and role not in ROLES:
            die(path, f'palette "{key}": peran "{role}" tidak dikenal, '
                      f"pilih dari {', '.join(ROLES)}")
        if block is not None and (not isinstance(block, str) or ":" not in block):
            die(path, f'palette "{key}": block "{block}" bukan id lengkap '
                      '(contoh "minecraft:oak_planks")')
        cell = {}
        if role is not None:
            cell["role"] = role
        if block is not None:
            cell["block"] = block
        out[key] = cell
    if " " not in out:
        out[" "] = {"skip": True}
    return out


def cells_from_layers(path, doc, palette):
    layers = doc["layers"]
    if not isinstance(layers, list) or not layers:
        die(path, "layers kosong")
    cells = []
    width = None
    for i, layer in enumerate(layers):
        if not isinstance(layer, dict) or "rows" not in layer:
            die(path, f"layers[{i}] harus objek berisi rows")
        y = layer.get("y", i)
        if not isinstance(y, int):
            die(path, f"layers[{i}].y harus bilangan bulat")
        rows = layer["rows"]
        if not isinstance(rows, list) or not rows:
            die(path, f"layers[{i}].rows kosong")
        for z, row in enumerate(rows):
            if not isinstance(row, str):
                die(path, f"layers[{i}].rows[{z}] harus berupa teks")
            if width is None:
                width = len(row)
            elif len(row) != width:
                die(path, f"layers[{i}].rows[{z}] panjangnya {len(row)}, "
                          f"sedangkan baris lain {width} — semua baris harus sama")
            for x, key in enumerate(row):
                if key not in palette:
                    die(path, f'karakter "{key}" di layers[{i}].rows[{z}] '
                              "tidak ada di palette")
                if palette[key].get("skip"):
                    continue
                cells.append((x, y, z, key))
    return cells


def cells_from_blocks(path, doc, palette):
    blocks = doc["blocks"]
    if not isinstance(blocks, list) or not blocks:
        die(path, "blocks kosong")
    cells = []
    for i, b in enumerate(blocks):
        if not isinstance(b, dict):
            die(path, f"blocks[{i}] harus objek")
        for axis in ("x", "y", "z"):
            if not isinstance(b.get(axis), int):
                die(path, f"blocks[{i}].{axis} harus bilangan bulat")
        key = b.get("key")
        if key not in palette:
            die(path, f'blocks[{i}].key "{key}" tidak ada di palette')
        if palette[key].get("skip"):
            continue
        cells.append((b["x"], b["y"], b["z"], key))
    return cells


def load(path):
    with open(path, encoding="utf-8") as f:
        try:
            doc = json.load(f)
        except json.JSONDecodeError as exc:
            die(path, f"JSON rusak — {exc}")

    ident = doc.get("id")
    if not isinstance(ident, str) or not ID_RE.match(ident):
        die(path, f'id "{ident}" tidak sah: huruf kecil, angka dan garis bawah, '
                  "2–31 karakter")
    if ident in BUILTIN:
        die(path, f'id "{ident}" sudah dipakai rancangan bawaan')
    if not isinstance(doc.get("label"), str) or not doc["label"].strip():
        die(path, "label wajib ada")
    origin = doc.get("origin", "center")
    if origin not in ("center", "corner"):
        die(path, f'origin "{origin}" harus "center" atau "corner"')

    palette = check_palette(path, doc)
    has_layers = "layers" in doc
    has_blocks = "blocks" in doc
    if has_layers == has_blocks:
        die(path, 'isi tepat satu di antara "layers" atau "blocks"')
    cells = (cells_from_layers(path, doc, palette) if has_layers
             else cells_from_blocks(path, doc, palette))
    if not cells:
        die(path, "tidak ada satu pun blok yang dikerjakan")
    if len(cells) > MAX_STEPS:
        die(path, f"{len(cells)} langkah melebihi batas {MAX_STEPS}")

    for axis, index in (("x", 0), ("y", 1), ("z", 2)):
        span = max(c[index] for c in cells) - min(c[index] for c in cells) + 1
        if span > MAX_SPAN:
            die(path, f"rentang {axis} {span} blok melebihi batas {MAX_SPAN}")

    used = {c[3] for c in cells}
    for key in sorted(set(palette) - used - {" "}):
        print(f"  catatan: {os.path.basename(path)} — palette \"{key}\" "
              "tidak pernah dipakai")

    return {
        "id": ident,
        "label": doc["label"].strip(),
        "hint": (doc.get("hint") or "").strip(),
        "origin": origin,
        "palette": {k: v for k, v in palette.items() if not v.get("skip")},
        "cells": [[x, y, z, key] for (x, y, z, key) in cells],
        "source": os.path.basename(path),
    }


def render(docs):
    lines = [HEADER, "export const DATA_BLUEPRINTS = ["]
    for doc in docs:
        lines.append("  {")
        lines.append(f'    id: {json.dumps(doc["id"])},')
        lines.append(f'    label: {json.dumps(doc["label"], ensure_ascii=False)},')
        lines.append(f'    hint: {json.dumps(doc["hint"], ensure_ascii=False)},')
        lines.append(f'    origin: {json.dumps(doc["origin"])},')
        lines.append(f'    source: {json.dumps(doc["source"])},')
        lines.append("    palette: {")
        for key in sorted(doc["palette"]):
            cell = doc["palette"][key]
            lines.append(f'      {json.dumps(key)}: {json.dumps(cell, sort_keys=True)},')
        lines.append("    },")
        lines.append("    cells: [")
        for x, y, z, key in doc["cells"]:
            lines.append(f'      [{x}, {y}, {z}, {json.dumps(key)}],')
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def build():
    """Balikan (teks modul, jumlah rancangan). Dipakai juga oleh validate.py."""
    paths = sorted(
        os.path.join(SRC, n) for n in os.listdir(SRC)
        if n.endswith(".json")
    ) if os.path.isdir(SRC) else []
    docs = []
    seen = {}
    for path in paths:
        doc = load(path)
        if doc["id"] in seen:
            die(path, f'id "{doc["id"]}" sudah dipakai {seen[doc["id"]]}')
        seen[doc["id"]] = os.path.basename(path)
        docs.append(doc)
    docs.sort(key=lambda d: d["id"])
    return render(docs), len(docs)


def main():
    try:
        text, count = build()
    except Bad as exc:
        print(f"rancangan ditolak — {exc}")
        return 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"tulis {os.path.relpath(OUT, ROOT)} — {count} rancangan dari "
          f"{os.path.relpath(SRC, ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
