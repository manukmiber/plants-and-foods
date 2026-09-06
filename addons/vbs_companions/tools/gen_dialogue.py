"""Salin dialog JSON ke dalam behavior pack.

    python3 gen_dialogue.py        # dialogue/*.json -> scripts/dialogue.data.js

Alasannya sama persis dengan gen_blueprints.py: mesin skrip Bedrock tidak bisa
membaca berkas JSON saat dunia berjalan, jadi folder `dialogue/` adalah sumber
yang ditulis manusia (atau AI), dan berkas ini menyalinnya jadi modul JS.

Yang diperiksa — semuanya membuat generator keluar dengan kode 1:

  * karakter yang disebut benar-benar ada di characters.json (atau "*")
  * kunci suasana benar-benar dipakai lines.js; kunci karangan sendiri tidak
    akan pernah terucap, jadi lebih baik ditolak sekarang
  * mode yang disebut topik benar-benar ada
  * tiap kalimat berupa teks tidak kosong

Skema lengkapnya ada di dialogue/README.md.
"""

import json
import os
import re
import sys

import model

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "dialogue")
OUT = os.path.join(ROOT, "behavior_packs", "vbs_companions_bp", "scripts",
                   "dialogue.data.js")

# Harus sama persis dengan kunci FALLBACK di scripts/lines.js — validate.py
# memeriksa keduanya tidak melenceng.
KEYS = [
    "greet", "idle", "farm", "mine", "wander", "build", "crafter", "looter",
    "attack", "hurt", "tired", "rest", "village", "reply", "done", "sleepy",
    "wake", "bucket", "ask", "thanks", "morning", "night", "alone",
    "swim", "burn", "eat", "hail",
]

# Harus sama persis dengan MODES di scripts/config.js.
MODES = ["follow", "farm", "attack", "stay", "mine", "wander", "build",
         "crafter", "looter"]

ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,30}$")
MAX_TURNS = 8

HEADER = """// DIBUAT OTOMATIS oleh tools/gen_dialogue.py — jangan diubah dengan tangan.
//
// Sumbernya berkas JSON di addons/vbs_companions/dialogue/. Tambah satu berkas di
// sana, jalankan `python3 tools/gen_dialogue.py`, dan kalimatnya ikut terucap
// tanpa menyentuh kode. Skemanya: dialogue/README.md.
"""


class Bad(Exception):
    pass


def die(path, message):
    raise Bad(f"{os.path.basename(path)}: {message}")


def check_lines(path, doc, out_lines):
    lines = doc.get("lines") or {}
    if not isinstance(lines, dict):
        die(path, "lines harus berupa objek")
    for key, pool in lines.items():
        if key not in KEYS:
            die(path, f'kunci suasana "{key}" tidak dikenal, pilih dari '
                      f"{', '.join(KEYS)}")
        if not isinstance(pool, list) or not pool:
            die(path, f'lines.{key} harus daftar dan tidak boleh kosong')
        for i, text in enumerate(pool):
            if not isinstance(text, str) or not text.strip():
                die(path, f"lines.{key}[{i}] harus teks yang tidak kosong")
            if len(text) > 160:
                die(path, f"lines.{key}[{i}] terlalu panjang ({len(text)} "
                          "karakter, batasnya 160 supaya muat di gelembung teks)")
        out_lines[key] = [t.strip() for t in pool]
    return len(lines)


def check_topics(path, doc):
    topics = doc.get("topics") or []
    if not isinstance(topics, list):
        die(path, "topics harus berupa daftar")
    out = []
    for i, topic in enumerate(topics):
        if not isinstance(topic, dict):
            die(path, f"topics[{i}] harus objek")
        tag = topic.get("tag")
        if not isinstance(tag, str) or not tag.strip():
            die(path, f"topics[{i}].tag wajib ada")
        turns = topic.get("turns")
        if not isinstance(turns, list) or len(turns) < 2:
            die(path, f'topics[{i}] "{tag}" butuh minimal 2 kalimat di turns')
        if len(turns) > MAX_TURNS:
            die(path, f'topics[{i}] "{tag}" punya {len(turns)} kalimat, '
                      f"batasnya {MAX_TURNS}")
        for j, text in enumerate(turns):
            if not isinstance(text, str) or not text.strip():
                die(path, f"topics[{i}].turns[{j}] harus teks yang tidak kosong")
        modes = topic.get("modes") or []
        if not isinstance(modes, list):
            die(path, f'topics[{i}] "{tag}": modes harus daftar')
        for mode in modes:
            if mode not in MODES:
                die(path, f'topics[{i}] "{tag}": mode "{mode}" tidak dikenal, '
                          f"pilih dari {', '.join(MODES)}")
        out.append({
            "tag": tag.strip(),
            "modes": list(modes),
            "turns": [t.strip() for t in turns],
        })
    return out


def load(path, characters):
    with open(path, encoding="utf-8") as f:
        try:
            doc = json.load(f)
        except json.JSONDecodeError as exc:
            die(path, f"JSON rusak — {exc}")

    ident = doc.get("id")
    if not isinstance(ident, str) or not ID_RE.match(ident):
        die(path, f'id "{ident}" tidak sah: huruf kecil, angka dan garis bawah, '
                  "2–31 karakter")
    character = doc.get("character")
    if character != "*" and character not in characters:
        die(path, f'character "{character}" tidak dikenal, pilih dari '
                  f"{', '.join(characters)} atau \"*\"")
    mode = doc.get("mode", "append")
    if mode not in ("append", "replace"):
        die(path, f'mode "{mode}" harus "append" atau "replace"')

    lines = {}
    count = check_lines(path, doc, lines)
    topics = check_topics(path, doc)
    if not count and not topics:
        die(path, "isi minimal satu di antara lines atau topics")

    return {
        "id": ident,
        "character": character,
        "mode": mode,
        "lines": lines,
        "topics": topics,
        "source": os.path.basename(path),
    }


def render(docs):
    # Satu karakter bisa punya beberapa berkas; digabung di sini supaya runtime
    # tinggal membaca, tidak perlu menggabungkan apa pun.
    lines = {}
    replaced = {}
    topics = []
    for doc in docs:
        who = doc["character"]
        bucket = lines.setdefault(who, {})
        for key, pool in doc["lines"].items():
            if doc["mode"] == "replace":
                replaced.setdefault(who, set()).add(key)
                bucket[key] = list(pool)
            else:
                bucket.setdefault(key, []).extend(pool)
        for topic in doc["topics"]:
            topics.append({**topic, "source": doc["source"]})

    out = [HEADER]
    out.append("// Kalimat tambahan per karakter. \"*\" berlaku untuk semua karakter.")
    out.append("export const DATA_LINES = {")
    for who in sorted(lines):
        out.append(f"  {json.dumps(who)}: {{")
        for key in sorted(lines[who]):
            pool = json.dumps(lines[who][key], ensure_ascii=False)
            out.append(f"    {json.dumps(key)}: {pool},")
        out.append("  },")
    out.append("};")
    out.append("")
    out.append("// Kunci yang MENGGANTIKAN kalimat bawaan, bukan menambahinya.")
    out.append("export const DATA_REPLACES = {")
    for who in sorted(replaced):
        keys = json.dumps(sorted(replaced[who]), ensure_ascii=False)
        out.append(f"  {json.dumps(who)}: {keys},")
    out.append("};")
    out.append("")
    out.append("// Obrolan antar companion. modes kosong = topik bisa dipilih kapan saja.")
    out.append("export const DATA_TOPICS = [")
    for topic in sorted(topics, key=lambda t: (t["source"], t["tag"])):
        out.append("  {")
        out.append(f'    tag: {json.dumps(topic["tag"], ensure_ascii=False)},')
        out.append(f'    modes: {json.dumps(topic["modes"])},')
        out.append(f'    source: {json.dumps(topic["source"])},')
        out.append("    turns: [")
        for text in topic["turns"]:
            out.append(f"      {json.dumps(text, ensure_ascii=False)},")
        out.append("    ],")
        out.append("  },")
    out.append("];")
    out.append("")
    return "\n".join(out)


def build():
    """Balikan (teks modul, jumlah berkas, jumlah kalimat). Dipakai validate.py."""
    characters = [c["id"] for c in model.load_characters()]
    paths = sorted(
        os.path.join(SRC, n) for n in os.listdir(SRC) if n.endswith(".json")
    ) if os.path.isdir(SRC) else []
    docs = []
    seen = {}
    total = 0
    for path in paths:
        doc = load(path, characters)
        if doc["id"] in seen:
            die(path, f'id "{doc["id"]}" sudah dipakai {seen[doc["id"]]}')
        seen[doc["id"]] = os.path.basename(path)
        total += sum(len(v) for v in doc["lines"].values())
        total += sum(len(t["turns"]) for t in doc["topics"])
        docs.append(doc)
    docs.sort(key=lambda d: d["id"])
    return render(docs), len(docs), total


def main():
    try:
        text, count, total = build()
    except Bad as exc:
        print(f"dialog ditolak — {exc}")
        return 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"tulis {os.path.relpath(OUT, ROOT)} — {count} berkas, {total} kalimat "
          f"dari {os.path.relpath(SRC, ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
