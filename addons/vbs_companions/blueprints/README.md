# Rancangan bangunan (blueprint) berbentuk JSON

Folder ini adalah **tempat menaruh rancangan bangunan baru**. Satu berkas `.json`
di sini = satu pilihan baru di menu **Rancangan Bangunan** di dalam game, tanpa
menyentuh satu baris kode pun.

Alurnya:

```
blueprints/*.json  --python3 tools/gen_blueprints.py-->  scripts/blueprints.data.js
                                                          (dibaca builder.js saat main)
```

Bedrock tidak bisa membaca berkas JSON dari dalam script saat dunia berjalan, jadi
generator itulah yang menyalin isi folder ini menjadi satu modul JavaScript di
dalam behavior pack. **Jalankan `python3 tools/gen_blueprints.py` setiap kali kamu
menambah atau mengubah berkas di sini**, lalu bungkus ulang packnya
(`python3 tools/build_mcaddon.py`). `tools/validate.py` akan menolak kalau berkas
JSON dan hasil generatornya tidak sinkron.

---

## Cara memakainya dengan bantuan AI

Kalau kamu menemukan skema bangunan Minecraft di internet (`.schematic`, `.nbt`,
`.litematic`, tangkapan layar, atau daftar blok apa pun), yang perlu kamu lakukan
cuma menyuruh AI mengubahnya ke format di bawah. Kalimat yang bisa langsung
dipakai:

> Ubah berkas bangunan Minecraft ini menjadi satu berkas JSON dengan skema
> blueprint VBS Companions (lihat `addons/vbs_companions/blueprints/README.md`).
> Pakai bentuk `layers`, batasi ukurannya maksimal 32×32×32, dan pakai peran
> (`role`) untuk blok umum supaya companion bisa memakai bahan apa pun yang ada
> di petinya.

Simpan hasilnya di folder ini, jalankan generatornya, selesai.

---

## Skema

```json
{
  "id": "menara_pengawas",
  "label": "Menara Pengawas",
  "hint": "Menara batu 5x5 setinggi 9 blok, berlampu di puncaknya",
  "origin": "center",
  "palette": {
    "#": { "role": "wall" },
    "O": { "role": "post" },
    "L": { "role": "light" },
    "K": { "block": "minecraft:oak_planks", "role": "floor" },
    ".": { "role": "air" },
    " ": { "skip": true }
  },
  "layers": [
    { "y": 0, "rows": ["#####", "#...#", "#...#", "#...#", "#####"] },
    { "y": 1, "rows": ["O   O", "     ", "     ", "     ", "O   O"] }
  ]
}
```

| Kolom | Wajib | Artinya |
|---|---|---|
| `id` | ya | Nama kunci, huruf kecil dan garis bawah. Harus unik dan tidak boleh sama dengan rancangan bawaan (`fence`, `wall`, `lamps`, `path`, `bridge`, `hut`, `shed`). |
| `label` | ya | Nama yang muncul di tombol menu. |
| `hint` | tidak | Satu baris keterangan di bawah tombol. |
| `origin` | tidak | `center` (bawaan) — companion berdiri di tengah denah; `corner` — companion berdiri di sudut (−X, −Z). |
| `palette` | ya | Arti tiap huruf di `layers` / `blocks`. |
| `layers` | salah satu | Denah per lapis, dari bawah ke atas. |
| `blocks` | salah satu | Bentuk jarang (sparse): daftar `{ "x": , "y": , "z": , "key": }`. Cocok untuk hasil konversi schematic. |

### `layers`

`y` adalah ketinggian relatif terhadap tanah (0 = permukaan tanah, 1 = satu blok
di atasnya). Boleh dilewati kalau lapisnya berurutan mulai 0.

Tiap `rows` adalah baris dari **utara ke selatan** (baris pertama = z terkecil),
dan tiap karakter di dalamnya dari **barat ke timur** (huruf pertama = x
terkecil). Semua baris dalam satu blueprint harus sama panjang.

### `palette`

Tiap entri memberi arti satu karakter:

| Kolom entri | Artinya |
|---|---|
| `role` | Peran bahan; companion memakai apa pun yang cocok dari petinya. |
| `block` | Blok tertentu, misal `minecraft:oak_planks`. Dipakai kalau ada di peti; kalau habis, `role` dipakai sebagai cadangan. |
| `skip` | `true` berarti karakter ini tidak dikerjakan sama sekali (biarkan apa adanya). Spasi otomatis dianggap `skip`. |

Peran yang dikenali — inilah yang membuat satu rancangan bisa jadi rumah kayu di
satu dunia dan rumah batu di dunia lain:

| Peran | Diambil dari peti |
|---|---|
| `floor` | papan, batu, kerikil |
| `wall` | papan, batu, kayu gelondongan |
| `post` | gelondongan, pagar, batu |
| `roof` | tangga, slab, papan, batu |
| `light` | lentera, obor, glowstone, sea lantern, shroomlight |
| `door` | pintu kayu atau besi |
| `glass` | kaca dan panel kaca |
| `fence` | pagar |
| `path` | kerikil, batu bulat, tanah, papan |
| `bed` | ranjang warna apa pun |
| `chest` | peti — kalau tidak ada, ditempa dulu dari delapan papan |
| `air` | dikosongkan (isi ruangan) |

Blok tertentu lewat `block` selalu boleh, tapi ingat companion **tidak pernah
memunculkan blok dari udara**: kalau blok itu tidak ada di peti stasiun dan tidak
ada `role` cadangannya, langkah itu dilewati dan alasannya muncul di baris
**Sekarang** di menu companion.

### Batas

- Maksimal **32 × 32 × 32** blok, dan **8000 langkah** per rancangan. Rancangan
  yang lebih besar ditolak generator — bukan karena tidak muat, tapi karena
  companion mengerjakannya dua blok per denyut dan bangunan sebesar itu tidak
  akan pernah selesai.
- Blok yang dilindungi (peti pemain, meja kerja, ranjang, bedrock, obsidian…)
  tidak pernah ditimpa, di rancangan mana pun.

---

## Contoh yang ada di sini

| Berkas | Isinya |
|---|---|
| `watchtower.json` | Menara pengawas 5×5 setinggi 9 blok, dengan tangga sudut dan lampu di puncak — contoh bentuk `layers`. |
| `well.json` | Sumur desa 3×3 — contoh kecil yang memakai `blocks` (bentuk jarang), persis seperti hasil konversi schematic. |
