"""Bungkus kedua pack jadi satu file .mcaddon yang tinggal dibuka di Minecraft.

    python3 build_mcaddon.py

Isi .mcaddon adalah kedua folder pack apa adanya — Minecraft yang memasangnya ke
tempatnya sendiri. Untuk dedicated server file ini tidak perlu; folder packnya
langsung disalin, lihat README.
"""

import os
import zipfile

import model

ROOT = os.path.abspath(os.path.join(model.HERE, ".."))
PACKS = [
    os.path.join(ROOT, "behavior_packs", "vbs_companions_bp"),
    os.path.join(ROOT, "resource_packs", "vbs_companions_rp"),
]
VERSION = "1.1.0"
OUT = os.path.join(ROOT, f"VBS-Companions-v{VERSION}.mcaddon")

SKIP = {".DS_Store", "Thumbs.db"}


def main():
    total = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for pack in PACKS:
            base = os.path.basename(pack)
            for dirpath, dirnames, names in os.walk(pack):
                dirnames.sort()
                for name in sorted(names):
                    if name in SKIP:
                        continue
                    path = os.path.join(dirpath, name)
                    arc = os.path.join(base, os.path.relpath(path, pack))
                    z.write(path, arc)
                    total += 1
    size = os.path.getsize(OUT) / 1024
    print(f"tulis {os.path.basename(OUT)} — {total} berkas, {size:.0f} KB")


if __name__ == "__main__":
    main()
