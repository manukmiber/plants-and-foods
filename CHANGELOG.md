# Changelog

Every Save and every Release the builder makes writes an entry here, newest
first. Entries are written at the moment of the change rather than
reconstructed afterwards, which is why the builder refuses to save without one.

## Unreleased

### VBS Companions v1.1.0

- **Model Kohane diganti seluruhnya.** Bentuk badan baru "detailed" di
  `addons/vbs_companions/`: rambut berlapis dengan poni yang benar-benar dipotong
  tembus supaya wajah kelihatan di baliknya, jurai samping, ekor rambut dua ruas
  yang ujungnya tertinggal sepersekian detik dari kepala, rok empat panel yang
  berayun sendiri-sendiri, sepatu tinggi, dan jepit rambut. 44 kubus, naik dari 16.
  Teksturnya tetap 1024x1024 — 8 texel per satuan model — dan sekarang benar-benar
  terpakai untuk detail sekecil helai poni dan tali sepatu.
- **Delapan ekspresi wajah.** Delapan bidang bertumpuk di tempat yang sama; satu
  baris Molang di `scripts.pre_animation` memilih indeksnya dan `part_visibility`
  di render controller menyembunyikan sisanya. Dia berkedip tiap ~4,6 detik,
  meringis saat kena pukul, waspada saat bertarung, nyengir saat berjalan, mangap
  saat berlari, dan mengantuk kalau lama diam. Semuanya jalan di klien: nol tick
  server, dan nol biaya saat tak ada yang melihat.
- **Rok dan ekor rambut bergerak sendiri.** Animasi `detail` baru menggerakkan
  keempat panel rok dan kedua ujung ekor rambut, sehingga rambut terasa punya
  berat alih-alih ikut kepala persis.
- Keempat karakter lain tidak berubah sedikit pun. Bentuk badan dipilih lewat
  `style.build` di `characters.json`, jadi ini kemampuan baru untuk semua, bukan
  perlakuan khusus untuk satu karakter.
- `uvmap.py` sekarang punya dua tabel UV yang boleh menempati koordinat sama,
  karena tiap karakter punya PNG sendiri dan hanya menggambar slot build-nya.
  `render_preview.py` akhirnya menghormati rotasi bone — tanpa itu preview
  menggambar rok yang lurus padahal di gim mengembang.
- `validate.py` naik ke 1241 pemeriksaan: tiap bone wajah harus punya barisnya di
  `part_visibility`, dan variabel yang dipakainya harus benar-benar dihitung di
  `pre_animation`.

### Preset inbox

- **`preset/kohane-companion.json`** — Kohane, a tameable companion. Tame her
  with a cookie, and she follows you, sits when you interact, defends you and
  heals from cake. She has eight facial expressions that react to what is
  happening to her, and she arrives with her skin and a painted spawn egg rather
  than as an untextured mannequin — the builder now lets a preset carry the
  artwork it ships with.

  Apply it from the **Preset inbox** panel. Needs a builder new enough to know
  the `companion` body preset and temperament; an older one applies the entity
  but falls back to a plain cube.
