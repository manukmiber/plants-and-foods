# Obrolan, teks dan dialog berbentuk JSON

Folder ini adalah **tempat menaruh kalimat baru untuk companion**. Sama seperti
`blueprints/` tapi untuk yang mereka ucapkan: celoteh saat bekerja, sapaan,
balasan, dan **obrolan antar companion**.

```
dialogue/*.json  --python3 tools/gen_dialogue.py-->  scripts/dialogue.data.js
                                                      (digabung lines.js saat main)
```

Jalankan `python3 tools/gen_dialogue.py` setiap kali menambah atau mengubah
berkas di sini, lalu bungkus ulang packnya. `tools/validate.py` menolak kalau
berkas JSON dan hasil generatornya tidak sinkron.

Kalimat dari sini **ditambahkan** ke kalimat bawaan di
`behavior_packs/.../scripts/lines.js`, jadi menambah satu berkas tidak pernah
menghapus suara yang sudah ada — kecuali kamu memang meminta lewat
`"mode": "replace"`.

---

## Cara memakainya dengan bantuan AI

> Buatkan berkas JSON dialog untuk add-on VBS Companions (skemanya di
> `addons/vbs_companions/dialogue/README.md`) untuk karakter Kohane, 6 kalimat
> per kunci, nada malu-malu dan sopan, bahasa Indonesia sehari-hari.

Simpan hasilnya di folder ini, jalankan generatornya, selesai.

---

## Skema

```json
{
  "id": "kohane_tambahan",
  "character": "kohane",
  "mode": "append",
  "lines": {
    "greet": ["A-ada apa?", "Halo, {owner}..."],
    "farm": ["Tanahnya sudah rata kok..."]
  },
  "topics": [
    {
      "tag": "hujan",
      "modes": ["farm", "wander"],
      "turns": ["Sepertinya mau hujan.", "Bagus, tanamannya kebagian air.", "Aku masuk dulu ya."]
    }
  ]
}
```

| Kolom | Wajib | Artinya |
|---|---|---|
| `id` | ya | Nama berkas di dalam data; huruf kecil, angka, garis bawah. Harus unik. |
| `character` | ya | `akito`, `kohane`, `an`, `toya`, `flins`, atau `*` untuk semua karakter. |
| `mode` | tidak | `append` (bawaan) menambah ke kalimat yang sudah ada; `replace` membuang kalimat bawaan untuk kunci yang disebut berkas ini saja. |
| `lines` | salah satu | Kalimat per kunci suasana. |
| `topics` | salah satu | Obrolan antar companion. |

Isi minimal satu di antara `lines` atau `topics`.

### Kunci suasana yang dikenali

| Kunci | Kapan diucapkan |
|---|---|
| `greet` | Disapa, ditatap, atau baru dijinakkan |
| `idle` | Menganggur — mode Ikuti Aku dan Diam di Tempat |
| `farm` `mine` `wander` `build` `crafter` `looter` `attack` | Celoteh saat menjalankan mode itu |
| `hurt` | Kena pukul |
| `tired` `rest` | Tenaga habis / sedang beristirahat |
| `sleepy` `wake` | Mengantuk / bangun tidur |
| `village` | Soal kampung dan rumah desa |
| `reply` | Balasan umum saat diajak bicara |
| `done` | Pekerjaan selesai |
| `bucket` | Ember selesai dibuat |
| `ask` `thanks` | Minta bahan / berterima kasih |
| `morning` `night` | Pergantian pagi dan malam |
| `alone` | Tidak ada companion lain di dekatnya |
| `swim` | Terjebak di air dalam, sedang berenang ke tepi |
| `burn` | Badannya terbakar dan sedang mencari air |
| `eat` | Baru makan untuk memulihkan nyawa |
| `hail` | Ditatap pemain lain yang BUKAN pemiliknya |

Kunci di luar daftar itu **ditolak generator** — kalau tidak, kalimatnya diam-diam
tidak akan pernah terpakai.

### Penanda di dalam kalimat

| Penanda | Diganti jadi |
|---|---|
| `{owner}` | Nama pemilik companion |
| `{aku}` | Nama companion yang bicara |
| `{kamu}` | Lawan bicaranya (companion lain), atau nama pemilik |

### `topics` — obrolan antar companion

Dua companion yang berdiri berdekatan cukup lama akan saling menghadap dan
bertukar kalimat. Satu topik = satu percakapan utuh, bergantian mulai dari
companion pertama.

| Kolom | Wajib | Artinya |
|---|---|---|
| `tag` | ya | Nama topik, dipakai di log. |
| `turns` | ya | 2–8 kalimat, bergantian. |
| `modes` | tidak | Topik hanya dipilih kalau salah satu dari kedua companion sedang menjalankan mode di daftar ini. Kosong = bisa kapan saja. |

Nama mode yang sah: `follow`, `farm`, `attack`, `stay`, `mine`, `wander`,
`build`, `crafter`, `looter`.

---

## Contoh yang ada di sini

| Berkas | Isinya |
|---|---|
| `cuaca.json` | Beberapa celoteh netral untuk semua karakter (`character: "*"`) dan dua topik obrolan tentang cuaca dan hasil kerja. |
