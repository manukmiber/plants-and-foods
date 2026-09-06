"""Gambar ikon 16x16 untuk Buku Panduan.

    python3 gen_book_texture.py     # -> resource_packs/.../textures/items/vbs_guide.png

Berkas ini sengaja TIDAK memakai Pillow, tidak seperti gen_textures.py: ikonnya
cuma 16x16 dan ditulis piksel demi piksel, jadi PNG-nya dirakit sendiri dengan
zlib dari pustaka standar. Artinya ikon buku tetap bisa dibuat ulang di mesin
yang tidak punya Pillow terpasang.

Gambarnya: buku bersampul gelap dengan halaman putih di sisi kanan dan setangkai
bunga merah di sampulnya — bunga karena bunga yang membuatnya, baik saat menempa
buku ini maupun saat menjinakkan companion.
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "resource_packs", "vbs_companions_rp",
                   "textures", "items", "vbs_guide.png")

# Satu huruf = satu warna. Titik = tembus pandang.
PALETTE = {
    ".": (0, 0, 0, 0),
    "K": (38, 26, 46, 255),      # sampul, sisi gelap
    "U": (86, 52, 104, 255),     # sampul, terang
    "T": (126, 86, 148, 255),    # kilap sampul
    "P": (238, 233, 220, 255),   # halaman
    "S": (196, 188, 170, 255),   # bayangan halaman
    "G": (198, 214, 224, 255),   # pita pembatas
    "M": (214, 64, 88, 255),     # kelopak bunga
    "N": (246, 206, 90, 255),    # putik bunga
    "H": (74, 138, 84, 255),     # tangkai
}

ART = [
    "................",
    "...KKKKKKKKKK...",
    "..KUUUUUUUUUUK..",
    "..KUTUUUUUUPPK..",
    "..KUUUMUUUUPSK..",
    "..KUUMNMUUUPPK..",
    "..KUUUMUUUUPSK..",
    "..KUUUHUUUUPPK..",
    "..KUUUHUUUUPSK..",
    "..KUUUUUUUUPPK..",
    "..KUUUUUUUUPSK..",
    "..KUUUUUUUUPPK..",
    "..KUUUUUUUUUUK..",
    "..KKGKKKKKKKKK..",
    "...GG...........",
    "................",
]


def png(rows):
    """Rakit PNG RGBA 8-bit dari daftar baris piksel."""
    height = len(rows)
    width = len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)                      # filter "None" per baris
        for pixel in row:
            raw.extend(pixel)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", header) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
            chunk(b"IEND", b""))


def main():
    for y, line in enumerate(ART):
        if len(line) != 16:
            raise SystemExit(f"baris {y} panjangnya {len(line)}, harus 16")
    rows = [[PALETTE[c] for c in line] for line in ART]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(png(rows))
    print(f"tulis {os.path.relpath(OUT, os.path.join(HERE, '..'))} — 16x16 RGBA")


if __name__ == "__main__":
    main()
