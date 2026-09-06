"""Bungkus tiap pack jadi berkas .mcaddon-nya sendiri.

    python3 build_mcaddon.py

Menghasilkan DUA berkas, bukan satu gabungan:

    VBS-Companions-v2.0.0-BP.mcaddon    behavior pack
    VBS-Companions-v2.0.0-RP.mcaddon    resource pack

Dipisah supaya tiap pack bisa diurus sendiri — di server, behavior pack dan
resource pack memang masuk ke folder yang berbeda dan didaftarkan di berkas yang
berbeda, dan pemain yang cuma butuh modelnya cukup diberi yang RP.

Keduanya tetap harus dipasang bersama: manifest keduanya saling menyebut sebagai
dependensi, jadi memasang salah satu saja akan membuat Minecraft mengeluh pack
pasangannya tidak ada. Urutan pemasangannya bebas.

Isi tiap berkas adalah folder packnya apa adanya — Minecraft yang memindahkannya
ke tempatnya sendiri. Untuk dedicated server kedua berkas ini tidak perlu; folder
packnya langsung disalin, lihat README.
"""

import os
import zipfile

import model

ROOT = os.path.abspath(os.path.join(model.HERE, ".."))
VERSION = "2.0.0"

PACKS = [
    ("BP", os.path.join(ROOT, "behavior_packs", "vbs_companions_bp")),
    ("RP", os.path.join(ROOT, "resource_packs", "vbs_companions_rp")),
]

SKIP = {".DS_Store", "Thumbs.db"}


def bundle(tag, pack):
    out = os.path.join(ROOT, f"VBS-Companions-v{VERSION}-{tag}.mcaddon")
    base = os.path.basename(pack)
    total = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dirpath, dirnames, names in os.walk(pack):
            dirnames.sort()
            for name in sorted(names):
                if name in SKIP:
                    continue
                path = os.path.join(dirpath, name)
                z.write(path, os.path.join(base, os.path.relpath(path, pack)))
                total += 1
    size = os.path.getsize(out) / 1024
    print(f"tulis {os.path.basename(out)} — {total} berkas, {size:.0f} KB")


def main():
    # Berkas gabungan versi lama dibersihkan supaya tidak ada dua cara memasang
    # add-on yang sama beredar berdampingan.
    old = os.path.join(ROOT, f"VBS-Companions-v{VERSION}.mcaddon")
    if os.path.exists(old):
        os.remove(old)
        print(f"hapus {os.path.basename(old)} (digantikan dua berkas terpisah)")
    for tag, pack in PACKS:
        bundle(tag, pack)


if __name__ == "__main__":
    main()
